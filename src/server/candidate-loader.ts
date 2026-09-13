import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

import { contentIdInput } from "../core/content-id.js";
import { errorDiagnostic, hasErrors, isDiagnostic, type Diagnostic } from "../core/diagnostics.js";
import { type PlanPackage, validatePlanPackage } from "../core/package.js";
import { resolvePackageFiles, type ResolvedFile } from "../core/resolve.js";
import { fileResolver, resolveDeclaredPath, type RuntimeRoots } from "./paths.js";

export interface CandidateLoadOptions extends RuntimeRoots {
  manifestPath?: string;
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
  files: ReadonlyMap<string, ResolvedFile>;
  getFileBytes(fileId: string): Uint8Array | null;
}

export interface CandidateLoadResult {
  candidate: LoadedCandidate | null;
  diagnostics: Diagnostic[];
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

export async function loadCandidate(options: CandidateLoadOptions): Promise<CandidateLoadResult> {
  const manifestPath = options.manifestPath ?? join(options.packageRoot, "plan.json");
  const confinedPath = await confinedManifestPath(options, manifestPath);
  if (isDiagnostic(confinedPath)) {
    const diagnostic = confinedPath.code === "missing-file" || confinedPath.code === "missing-declared-root"
      ? errorDiagnostic("manifest-unavailable", `Package manifest '${manifestPath}' could not be read.`, "plan.json")
      : confinedPath;
    return { candidate: null, diagnostics: [diagnostic], manifestPath };
  }
  const initialManifest = await readManifest(confinedPath);
  if ("code" in initialManifest) return { candidate: null, diagnostics: [initialManifest], manifestPath };

  const parsed = parseManifest(initialManifest);
  if (isDiagnostic(parsed)) return { candidate: null, diagnostics: [parsed], manifestPath };
  const validation = validatePlanPackage(parsed);
  if (!validation.valid || !validation.value) return { candidate: null, diagnostics: validation.diagnostics, manifestPath };

  const resolution = await resolvePackageFiles(validation.value, fileResolver(options));
  const diagnostics = [...validation.diagnostics, ...resolution.diagnostics];
  await options.onBeforeFinalManifestRead?.();
  const finalManifest = await readManifest(confinedPath);
  if ("code" in finalManifest) {
    diagnostics.push(finalManifest);
    return { candidate: null, diagnostics, manifestPath };
  }
  if (!sameBytes(initialManifest, finalManifest)) {
    diagnostics.push(errorDiagnostic(
      "manifest-mutated-during-load",
      "plan.json changed while its candidate was being resolved; the candidate was discarded.",
      "plan.json",
    ));
  }
  if (hasErrors(diagnostics) || !resolution.complete || !sameBytes(initialManifest, finalManifest)) {
    return { candidate: null, diagnostics, manifestPath };
  }

  const contentId = displayedContentId(initialManifest, resolution.files.values());
  const files = new Map(resolution.files);
  const plan = validation.value;
  const candidate: LoadedCandidate = {
    packageId: plan.id,
    revision: plan.revision,
    contentId,
    manifestBytes: new Uint8Array(initialManifest),
    plan,
    diagnostics,
    files,
    getFileBytes(fileId: string): Uint8Array | null {
      const resolved = files.get(fileId);
      return resolved ? new Uint8Array(resolved.bytes) : null;
    },
  };
  return { candidate, diagnostics, manifestPath };
}

export function diagnosticSummary(diagnostics: readonly Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => `${diagnostic.severity}: ${diagnostic.code} at ${diagnostic.path} — ${diagnostic.message}`);
}
