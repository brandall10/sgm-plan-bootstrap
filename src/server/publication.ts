import { createHash, randomBytes } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { errorDiagnostic, hasErrors, isDiagnostic, type Diagnostic } from "../core/diagnostics.js";
import { validatePlanPackage, type PlanPackage } from "../core/package.js";
import { loadCandidate, type LoadedCandidate } from "./candidate-loader.js";
import { resolveDeclaredPath, type RuntimeRoots } from "./paths.js";

export interface PublishOptions extends RuntimeRoots {
  manifestPath?: string;
}

export interface PublishResult {
  published: boolean;
  manifestPath: string;
  revision: number | null;
  candidate: LoadedCandidate | null;
  diagnostics: Diagnostic[];
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJson(bytes: Uint8Array): unknown | Diagnostic {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return errorDiagnostic("malformed-json", "plan.json is not valid JSON.", "plan.json");
  }
}

function serializePlan(plan: PlanPackage): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(plan, null, 2)}\n`);
}

export async function publishPackage(options: PublishOptions): Promise<PublishResult> {
  const manifestPath = options.manifestPath ?? join(options.packageRoot, "plan.json");
  const diagnostics: Diagnostic[] = [];
  let sourceBytes: Uint8Array;
  try {
    sourceBytes = new Uint8Array(await readFile(manifestPath));
  } catch {
    return { published: false, manifestPath, revision: null, candidate: null, diagnostics: [errorDiagnostic("manifest-unavailable", `Package manifest '${manifestPath}' could not be read.`, "plan.json")] };
  }
  const parsed = parseJson(sourceBytes);
  if (isDiagnostic(parsed)) return { published: false, manifestPath, revision: null, candidate: null, diagnostics: [parsed] };
  const validation = validatePlanPackage(parsed);
  diagnostics.push(...validation.diagnostics);
  if (!validation.valid || !validation.value) return { published: false, manifestPath, revision: null, candidate: null, diagnostics };

  const nextPlan: PlanPackage = {
    ...validation.value,
    revision: validation.value.revision + 1,
    files: validation.value.files.map((file) => ({ ...file })),
  };
  for (const file of nextPlan.files) {
    const declaredPath = await resolveDeclaredPath(file, options);
    if ("code" in declaredPath) {
      diagnostics.push(declaredPath);
      continue;
    }
    try {
      const bytes = new Uint8Array(await readFile(declaredPath.realPath));
      file.sha256 = sha256(bytes);
    } catch {
      diagnostics.push(errorDiagnostic("file-read-failed", `Declared file '${file.path}' could not be read for publication.`, `files.${file.id}.path`, file.id));
    }
  }
  const nextValidation = validatePlanPackage(nextPlan);
  diagnostics.push(...nextValidation.diagnostics);
  if (hasErrors(diagnostics) || !nextValidation.valid) return { published: false, manifestPath, revision: null, candidate: null, diagnostics };

  const temporaryPath = `${manifestPath}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  const bytes = serializePlan(nextPlan);
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    const candidateResult = await loadCandidate({ ...options, manifestPath: temporaryPath });
    diagnostics.push(...candidateResult.diagnostics);
    if (!candidateResult.candidate) {
      await unlink(temporaryPath);
      return { published: false, manifestPath, revision: null, candidate: null, diagnostics };
    }
    await rename(temporaryPath, manifestPath);
    return { published: true, manifestPath, revision: nextPlan.revision, candidate: candidateResult.candidate, diagnostics };
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch {
      // The temporary path may not have been created or may already be gone.
    }
    diagnostics.push(errorDiagnostic("publication-failed", error instanceof Error ? error.message : "Publication failed.", "plan.json"));
    return { published: false, manifestPath, revision: null, candidate: null, diagnostics };
  }
}
