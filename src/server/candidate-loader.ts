import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { contentIdInput } from "../core/content-id.js";
import { errorDiagnostic, hasErrors, isDiagnostic, warningDiagnostic, type Diagnostic } from "../core/diagnostics.js";
import { type PlanPackage, validatePlanPackage } from "../core/package.js";
import { resolvePackageFiles, type ResolvedFile } from "../core/resolve.js";
import { snapshotFileInventory, type SnapshotFileEntry, type SnapshotOmission } from "../core/snapshot.js";
import { fileResolver, resolveDeclaredPath, type RuntimeRoots } from "./paths.js";
import type { SnapshotStore } from "./snapshot-store.js";

export interface CandidateLoadOptions extends RuntimeRoots {
  manifestPath?: string;
  /** Optional store seam; normal runtimes use packageRoot/.plan-package. */
  snapshotStore?: SnapshotStore;
  /** Test-only seam for demonstrating the reread generation fence. */
  onBeforeFinalManifestRead?: () => void | Promise<void>;
}

export interface LoadedCandidate {
  packageId: string;
  revision: number;
  contentId: string;
  manifestBytes: Uint8Array;
  plan: PlanPackage;
  diagnostics: Diagnostic[];
  planningBlockers: Diagnostic[];
  files: ReadonlyMap<string, ResolvedFile>;
  snapshotFiles: SnapshotFileEntry[];
  snapshotOmissions: SnapshotOmission[];
  snapshotId?: string;
  getFileBytes(fileId: string): Uint8Array | null;
}

export interface CandidateLoadResult {
  candidate: LoadedCandidate | null;
  diagnostics: Diagnostic[];
  planningBlockers: Diagnostic[];
  manifestPath: string;
}

async function readManifest(manifestPath: string): Promise<Uint8Array | Diagnostic> {
  try {
    return new Uint8Array(await readFile(manifestPath));
  } catch {
    return errorDiagnostic("manifest-unavailable", `Package manifest '${manifestPath}' could not be read.`, "plan.json");
  }
}

async function confinedManifestPath(options: CandidateLoadOptions, manifestPath: string): Promise<string | Diagnostic> {
  const manifestRelativePath = relative(options.packageRoot, manifestPath);
  const declared = await resolveDeclaredPath({
    id: "plan.manifest",
    root: "package",
    path: manifestRelativePath,
    sha256: "0".repeat(64),
    required: true,
  }, options);
  return "code" in declared ? declared : declared.realPath;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return left.every((byte, index) => byte === right[index]);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function displayedContentId(manifestBytes: Uint8Array, files: Iterable<ResolvedFile>): string {
  return `content-${sha256(contentIdInput(manifestBytes, files)).slice(0, 24)}`;
}

function parseManifest(manifestBytes: Uint8Array): unknown | Diagnostic {
  try {
    return JSON.parse(new TextDecoder().decode(manifestBytes)) as unknown;
  } catch {
    return errorDiagnostic("malformed-json", "plan.json is not valid JSON.", "plan.json");
  }
}

function omissionFromDiagnostic(fileId: string, diagnostic: Diagnostic): SnapshotOmission {
  return {
    kind: "file",
    id: fileId,
    code: diagnostic.code,
    message: diagnostic.message,
    path: diagnostic.path,
    ...(diagnostic.itemId ? { item_id: diagnostic.itemId } : { item_id: fileId }),
  };
}

function fallbackFileOmission(fileId: string, path: string): SnapshotOmission {
  return {
    kind: "file",
    id: fileId,
    code: "snapshot-file-omitted",
    message: `File '${path}' was not captured.`,
    path: `files.${fileId}.path`,
    item_id: fileId,
  };
}

function externalOmissions(plan: PlanPackage): SnapshotOmission[] {
  return plan.references.flatMap((reference) => reference.kind === "external" && !reference.local_file_id && !reference.required
    ? [{
      kind: "external-reference" as const,
      id: reference.id,
      code: "external-not-fetched",
      message: `External reference '${reference.url}' was not fetched by the local reader.`,
      path: `references.${reference.id}`,
      item_id: reference.id,
    }]
    : []);
}

export async function loadCandidate(options: CandidateLoadOptions): Promise<CandidateLoadResult> {
  const manifestPath = options.manifestPath ?? join(options.packageRoot, "plan.json");
  const emptyResult = (diagnostics: Diagnostic[], planningBlockers: Diagnostic[] = []): CandidateLoadResult => ({
    candidate: null,
    diagnostics,
    planningBlockers,
    manifestPath,
  });
  const confinedPath = await confinedManifestPath(options, manifestPath);
  if (isDiagnostic(confinedPath)) {
    const diagnostic = confinedPath.code === "missing-file" || confinedPath.code === "missing-declared-root"
      ? errorDiagnostic("manifest-unavailable", `Package manifest '${manifestPath}' could not be read.`, "plan.json")
      : confinedPath;
    return emptyResult([diagnostic]);
  }
  const initialManifest = await readManifest(confinedPath);
  if ("code" in initialManifest) return emptyResult([initialManifest]);

  const parsed = parseManifest(initialManifest);
  if (isDiagnostic(parsed)) return emptyResult([parsed]);
  const validation = validatePlanPackage(parsed);
  if (!validation.valid || !validation.value) return emptyResult(validation.diagnostics);

  const resolution = await resolvePackageFiles(validation.value, fileResolver({
    ...options,
    forbiddenRoots: [...(options.forbiddenRoots ?? []), join(options.packageRoot, ".plan-package")],
  }));
  const diagnostics = [...validation.diagnostics, ...resolution.diagnostics];
  if (validation.value.state === "accepted") {
    diagnostics.push(warningDiagnostic(
      "unverified-manifest-state",
      "Manifest state 'accepted' is legacy author metadata; only a durable acceptance record can establish acceptance.",
      "$.state",
    ));
  }
  await options.onBeforeFinalManifestRead?.();
  const finalManifest = await readManifest(confinedPath);
  if ("code" in finalManifest) {
    diagnostics.push(finalManifest);
    return emptyResult(diagnostics, resolution.planningBlockers);
  }
  if (!sameBytes(initialManifest, finalManifest)) {
    diagnostics.push(errorDiagnostic(
      "manifest-mutated-during-load",
      "plan.json changed while its candidate was being resolved; the candidate was discarded.",
      "plan.json",
    ));
  }
  if (hasErrors(diagnostics) || !resolution.complete || !sameBytes(initialManifest, finalManifest)) {
    return emptyResult(diagnostics, resolution.planningBlockers);
  }

  const contentId = displayedContentId(initialManifest, resolution.files.values());
  const files = new Map(resolution.files);
  const plan = validation.value;
  const omissions = [
    ...plan.files.flatMap((file) => {
      const diagnostic = resolution.fileDiagnostics.get(file.id);
      return files.has(file.id) ? [] : [diagnostic ? omissionFromDiagnostic(file.id, diagnostic) : fallbackFileOmission(file.id, file.path)];
    }),
    ...externalOmissions(plan),
  ];
  const snapshotFiles = snapshotFileInventory(plan, files, omissions);
  const candidate: LoadedCandidate = {
    packageId: plan.id,
    revision: plan.revision,
    contentId,
    manifestBytes: new Uint8Array(initialManifest),
    plan,
    diagnostics,
    planningBlockers: [...resolution.planningBlockers],
    files,
    snapshotFiles,
    snapshotOmissions: omissions.filter((omission) => omission.kind === "external-reference"),
    getFileBytes(fileId: string): Uint8Array | null {
      const resolved = files.get(fileId);
      return resolved ? new Uint8Array(resolved.bytes) : null;
    },
  };
  return { candidate, diagnostics, planningBlockers: [...resolution.planningBlockers], manifestPath };
}

export function diagnosticSummary(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => `${diagnostic.severity}: ${diagnostic.code} at ${diagnostic.path} — ${diagnostic.message}`);
}
