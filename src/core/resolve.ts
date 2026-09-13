import {
  type Diagnostic,
  errorDiagnostic,
  hasErrors,
  warningDiagnostic,
} from "./diagnostics.js";
import type { PackageFile, PlanPackage } from "./package.js";

export interface ResolvedFile {
  file: PackageFile;
  bytes: Uint8Array;
}

export interface FileResolver {
  resolve(file: PackageFile): Promise<ResolvedFile | Diagnostic>;
}

export interface PackageResolution {
  complete: boolean;
  files: Map<string, ResolvedFile>;
  diagnostics: Diagnostic[];
  planningBlockers: Diagnostic[];
  fileDiagnostics: Map<string, Diagnostic>;
}

function requiredFileIds(plan: PlanPackage): Set<string> {
  const required = new Set(plan.files.filter((file) => file.required).map((file) => file.id));
  for (const reference of plan.references) {
    if (reference.kind === "local" && reference.required) required.add(reference.file_id);
    if (reference.kind === "external" && reference.required && reference.local_file_id) required.add(reference.local_file_id);
  }
  for (const asset of plan.assets) {
    // A selected asset governs the proposal even when an older manifest
    // omitted `required`; retain its primary file and dependency closure.
    required.add(asset.file_id);
    for (const dependency of asset.dependency_file_ids) required.add(dependency);
  }
  return required;
}

export async function resolvePackageFiles(plan: PlanPackage, resolver: FileResolver): Promise<PackageResolution> {
  const diagnostics: Diagnostic[] = [];
  const planningBlockers: Diagnostic[] = [];
  const fileDiagnostics = new Map<string, Diagnostic>();
  const files = new Map<string, ResolvedFile>();
  const required = requiredFileIds(plan);
  const results = await Promise.all(plan.files.map(async (file) => ({ file, result: await resolver.resolve(file) })));

  for (const { file, result } of results) {
    if ("code" in result && "severity" in result) {
      const diagnostic = result.severity === "error"
        ? result
        : { ...result, severity: required.has(file.id) ? "error" : result.severity } satisfies Diagnostic;
      diagnostics.push({ ...diagnostic, itemId: diagnostic.itemId ?? file.id });
      fileDiagnostics.set(file.id, { ...diagnostic, itemId: diagnostic.itemId ?? file.id });
      continue;
    }
    if (result.bytes.byteLength === 0 && required.has(file.id)) {
      const diagnostic = errorDiagnostic("empty-required-file", `Required file '${file.path}' is empty.`, `files.${file.id}`, file.id);
      diagnostics.push(diagnostic);
      fileDiagnostics.set(file.id, diagnostic);
      continue;
    }
    const actualDigest = await resolverDigest(result.bytes);
    if (actualDigest !== file.sha256) {
      const diagnostic = errorDiagnostic("digest-mismatch", `Digest for '${file.path}' does not match the published manifest.`, `files.${file.id}.sha256`, file.id);
      diagnostics.push(diagnostic);
      fileDiagnostics.set(file.id, diagnostic);
      continue;
    }
    files.set(file.id, result);
  }

  for (const reference of plan.references) {
    if (reference.kind === "external" && reference.required && !reference.local_file_id) {
      diagnostics.push(errorDiagnostic("required-external-unresolved", `Required external reference '${reference.url}' has no retained local copy.`, `references.${reference.id}`, reference.id));
    } else if (reference.kind === "external" && !reference.local_file_id) {
      diagnostics.push(warningDiagnostic("external-not-fetched", `External reference '${reference.url}' was not fetched by the local reader.`, `references.${reference.id}`, reference.id));
    }
  }

  for (const question of plan.questions) {
    if (question.status === "open" && question.blocking) {
      planningBlockers.push(errorDiagnostic("blocking-question", `Blocking question '${question.title}' is unresolved.`, `questions.${question.id}`, question.id));
    } else if (question.status === "open") {
      diagnostics.push(warningDiagnostic("open-question", `Non-blocking question '${question.title}' remains open.`, `questions.${question.id}`, question.id));
    }
  }

  return { complete: !hasErrors(diagnostics), files, diagnostics, planningBlockers, fileDiagnostics };
}

async function resolverDigest(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
