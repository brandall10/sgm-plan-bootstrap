import {
  type Diagnostic,
  errorDiagnostic,
  hasErrors,
} from "./diagnostics.js";

export const SUPPORTED_FORMAT = "plan-package" as const;
export const SUPPORTED_FORMAT_VERSION = "1.0" as const;

export const SUPPORTED_CAPABILITIES = new Set([
  "inline-phases.v1",
  "digest-manifest.v1",
  "local-reference-roots.v1",
  "candidate-assets.v1",
  "safe-markdown.v1",
  "sandboxed-html.v1",
]);

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const HISTORY_DIRECTORY = ".plan-package";
const ASSET_FORMATS = new Set([
  "css",
  "html",
  "jpeg",
  "json",
  "markdown",
  "png",
  "svg",
  "text",
  "webp",
]);
const ASSET_AUTHORITIES = new Set(["authoritative", "illustrative", "evidence"]);
const QUESTION_STATUSES = new Set(["open", "answered", "deferred"]);
const REFERENCE_KINDS = new Set(["local", "external"]);
const ROOT_KINDS = new Set(["package", "repository"]);

export type PackageRootKind = "package" | "repository";
export type AssetAuthority = "authoritative" | "illustrative" | "evidence";
export type AssetFormat =
  | "css"
  | "html"
  | "jpeg"
  | "json"
  | "markdown"
  | "png"
  | "svg"
  | "text"
  | string;

export interface PlanScope {
  included: string[];
  excluded: string[];
}

export interface Constraint {
  id: string;
  text_md: string;
}

export interface AcceptanceCriterion {
  id: string;
  text_md: string;
}

export interface Phase {
  id: string;
  title: string;
  depends_on: string[];
  objective_md: string;
  approach_md: string;
  acceptance_criteria: AcceptanceCriterion[];
}

export interface PackageFile {
  id: string;
  root: PackageRootKind;
  path: string;
  sha256: string;
  required: boolean;
  media_type?: string;
}

export interface LocalReference {
  id: string;
  kind: "local";
  file_id: string;
  purpose_md: string;
  required: boolean;
  applies_to: string[];
}

export interface ExternalReference {
  id: string;
  kind: "external";
  url: string;
  access: string;
  purpose_md: string;
  required: boolean;
  applies_to: string[];
  local_file_id?: string;
}

export type Reference = LocalReference | ExternalReference;

export interface PackageAsset {
  id: string;
  file_id: string;
  format: AssetFormat;
  authority: AssetAuthority;
  purpose_md: string;
  applies_to: string[];
  required: boolean;
  dependency_file_ids: string[];
  mock: boolean;
}

export interface Decision {
  id: string;
  title: string;
  decision_md: string;
  rationale_md?: string;
  applies_to: string[];
}

export interface Question {
  id: string;
  title: string;
  question_md: string;
  status: "open" | "answered" | "deferred";
  blocking: boolean;
  applies_to: string[];
}

export interface PlanPackage {
  format: typeof SUPPORTED_FORMAT;
  format_version: typeof SUPPORTED_FORMAT_VERSION;
  id: string;
  revision: number;
  title: string;
  goal_md: string;
  scope: PlanScope;
  constraints: Constraint[];
  phases: Phase[];
  references: Reference[];
  decisions: Decision[];
  questions: Question[];
  assets: PackageAsset[];
  files: PackageFile[];
  required_capabilities: string[];
  state: "draft" | "accepted";
  metadata?: Record<string, unknown>;
}

export interface PackageValidationResult {
  valid: boolean;
  value: PlanPackage | null;
  diagnostics: Diagnostic[];
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: RecordValue,
  key: string,
  path: string,
  diagnostics: Diagnostic[],
): string | null {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    diagnostics.push(errorDiagnostic("invalid-string", `${key} must be a non-empty string.`, `${path}.${key}`));
    return null;
  }
  return candidate;
}

function optionalString(value: RecordValue, key: string): string | undefined {
  return typeof value[key] === "string" ? value[key] : undefined;
}

function requiredBoolean(
  value: RecordValue,
  key: string,
  path: string,
  diagnostics: Diagnostic[],
): boolean | null {
  const candidate = value[key];
  if (typeof candidate !== "boolean") {
    diagnostics.push(errorDiagnostic("invalid-boolean", `${key} must be a boolean.`, `${path}.${key}`));
    return null;
  }
  return candidate;
}

function requiredStringArray(
  value: RecordValue,
  key: string,
  path: string,
  diagnostics: Diagnostic[],
): string[] | null {
  const candidate = value[key];
  if (!Array.isArray(candidate) || candidate.some((item) => typeof item !== "string" || item.trim() === "")) {
    diagnostics.push(errorDiagnostic("invalid-string-array", `${key} must be an array of non-empty strings.`, `${path}.${key}`));
    return null;
  }
  return candidate as string[];
}

function optionalStringArray(
  value: RecordValue,
  key: string,
  path: string,
  diagnostics: Diagnostic[],
): string[] {
  const candidate = value[key];
  if (candidate === undefined) return [];
  if (!Array.isArray(candidate) || candidate.some((item) => typeof item !== "string" || item.trim() === "")) {
    diagnostics.push(errorDiagnostic("invalid-string-array", `${key} must be an array of non-empty strings.`, `${path}.${key}`));
    return [];
  }
  return [...candidate];
}

function isSafeRelativePath(value: string): boolean {
  if (value.length === 0 || value.includes("\0") || value.includes("\\")) {
    return false;
  }
  if (value.startsWith("/") || /^[a-zA-Z]:/.test(value)) {
    return false;
  }
  const segments = value.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

export function isValidIdentifier(value: string): boolean {
  return ID_PATTERN.test(value);
}

export function isSha256(value: string): boolean {
  return SHA256_PATTERN.test(value);
}

export function isSafePackageRelativePath(value: string): boolean {
  return isSafeRelativePath(value);
}

function isHistoryPath(value: string): boolean {
  return value === HISTORY_DIRECTORY || value.startsWith(`${HISTORY_DIRECTORY}/`);
}

function addId(
  id: string | null,
  path: string,
  ids: Map<string, string>,
  diagnostics: Diagnostic[],
): void {
  if (!id) {
    return;
  }
  if (!ID_PATTERN.test(id)) {
    diagnostics.push(errorDiagnostic("invalid-id", `ID '${id}' must match ${ID_PATTERN.source}.`, path, id));
  }
  const previousPath = ids.get(id);
  if (previousPath) {
    diagnostics.push(errorDiagnostic("duplicate-id", `ID '${id}' is already declared at ${previousPath}.`, path, id));
  } else {
    ids.set(id, path);
  }
}

function parseScope(value: unknown, path: string, diagnostics: Diagnostic[]): PlanScope | null {
  if (!isRecord(value)) {
    diagnostics.push(errorDiagnostic("invalid-scope", "scope must be an object.", path));
    return null;
  }
  const included = requiredStringArray(value, "included", path, diagnostics);
  const excluded = requiredStringArray(value, "excluded", path, diagnostics);
  return included && excluded ? { included, excluded } : null;
}

function parseConstraints(
  value: unknown,
  ids: Map<string, string>,
  diagnostics: Diagnostic[],
): Constraint[] | null {
  if (!Array.isArray(value)) {
    diagnostics.push(errorDiagnostic("invalid-array", "constraints must be an array.", "constraints"));
    return null;
  }
  const constraints: Constraint[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `constraints[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(errorDiagnostic("invalid-object", "Constraint must be an object.", path));
      continue;
    }
    const id = requiredString(entry, "id", path, diagnostics);
    const text_md = requiredString(entry, "text_md", path, diagnostics);
    addId(id, `${path}.id`, ids, diagnostics);
    if (id && text_md) constraints.push({ id, text_md });
  }
  return constraints;
}

function parsePhases(
  value: unknown,
  ids: Map<string, string>,
  diagnostics: Diagnostic[],
): Phase[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(errorDiagnostic("invalid-phases", "phases must be a non-empty array.", "phases"));
    return null;
  }
  const phases: Phase[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `phases[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(errorDiagnostic("invalid-object", "Phase must be an object.", path));
      continue;
    }
    const id = requiredString(entry, "id", path, diagnostics);
    const title = requiredString(entry, "title", path, diagnostics);
    const depends_on = requiredStringArray(entry, "depends_on", path, diagnostics);
    const objective_md = requiredString(entry, "objective_md", path, diagnostics);
    const approach_md = requiredString(entry, "approach_md", path, diagnostics);
    const criteriaValue = entry["acceptance_criteria"];
    if (!Array.isArray(criteriaValue) || criteriaValue.length === 0) {
      diagnostics.push(errorDiagnostic("invalid-criteria", "acceptance_criteria must be a non-empty array.", `${path}.acceptance_criteria`, id ?? undefined));
    }
    const acceptance_criteria: AcceptanceCriterion[] = [];
    if (Array.isArray(criteriaValue)) {
      for (const [criterionIndex, criterionValue] of criteriaValue.entries()) {
        const criterionPath = `${path}.acceptance_criteria[${criterionIndex}]`;
        if (!isRecord(criterionValue)) {
          diagnostics.push(errorDiagnostic("invalid-object", "Acceptance criterion must be an object.", criterionPath));
          continue;
        }
        const criterionId = requiredString(criterionValue, "id", criterionPath, diagnostics);
        const text_md = requiredString(criterionValue, "text_md", criterionPath, diagnostics);
        addId(criterionId, `${criterionPath}.id`, ids, diagnostics);
        if (criterionId && text_md) acceptance_criteria.push({ id: criterionId, text_md });
      }
    }
    addId(id, `${path}.id`, ids, diagnostics);
    if (id && title && depends_on && objective_md && approach_md) {
      phases.push({ id, title, depends_on, objective_md, approach_md, acceptance_criteria });
    }
  }
  return phases;
}

function parseFiles(
  value: unknown,
  ids: Map<string, string>,
  diagnostics: Diagnostic[],
): PackageFile[] | null {
  if (!Array.isArray(value)) {
    diagnostics.push(errorDiagnostic("invalid-array", "files must be an array.", "files"));
    return null;
  }
  const files: PackageFile[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `files[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(errorDiagnostic("invalid-object", "File declaration must be an object.", path));
      continue;
    }
    const id = requiredString(entry, "id", path, diagnostics);
    const root = requiredString(entry, "root", path, diagnostics);
    const filePath = requiredString(entry, "path", path, diagnostics);
    const sha256 = requiredString(entry, "sha256", path, diagnostics);
    const required = entry["required"] === undefined ? true : requiredBoolean(entry, "required", path, diagnostics);
    const media_type = optionalString(entry, "media_type");
    addId(id, `${path}.id`, ids, diagnostics);
    if (root && !ROOT_KINDS.has(root)) {
      diagnostics.push(errorDiagnostic("invalid-root", `root must be package or repository, received '${root}'.`, `${path}.root`, id ?? undefined));
    }
    if (filePath && !isSafeRelativePath(filePath)) {
      diagnostics.push(errorDiagnostic("unsafe-path", `Path '${filePath}' must be a normalized relative path without traversal.`, `${path}.path`, id ?? undefined));
    }
    if (filePath && isHistoryPath(filePath)) {
      diagnostics.push(errorDiagnostic("reserved-history-path", `Path '${filePath}' is reserved for the local snapshot store.`, `${path}.path`, id ?? undefined));
    }
    if (sha256 && !SHA256_PATTERN.test(sha256)) {
      diagnostics.push(errorDiagnostic("invalid-digest", "sha256 must be a lowercase SHA-256 hex digest.", `${path}.sha256`, id ?? undefined));
    }
    if (id && root && ROOT_KINDS.has(root) && filePath && isSafeRelativePath(filePath) && sha256 && SHA256_PATTERN.test(sha256) && required !== null) {
      files.push({ id, root: root as PackageRootKind, path: filePath, sha256, required, ...(media_type ? { media_type } : {}) });
    }
  }
  return files;
}

function parseReferences(
  value: unknown,
  ids: Map<string, string>,
  diagnostics: Diagnostic[],
): Reference[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    diagnostics.push(errorDiagnostic("invalid-array", "references must be an array.", "references"));
    return null;
  }
  const references: Reference[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `references[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(errorDiagnostic("invalid-object", "Reference declaration must be an object.", path));
      continue;
    }
    const id = requiredString(entry, "id", path, diagnostics);
    const kind = requiredString(entry, "kind", path, diagnostics);
    const purpose_md = requiredString(entry, "purpose_md", path, diagnostics);
    const required = requiredBoolean(entry, "required", path, diagnostics);
    const applies_to = optionalStringArray(entry, "applies_to", path, diagnostics);
    addId(id, `${path}.id`, ids, diagnostics);
    if (kind && !REFERENCE_KINDS.has(kind)) {
      diagnostics.push(errorDiagnostic("invalid-reference-kind", `kind must be local or external, received '${kind}'.`, `${path}.kind`, id ?? undefined));
    }
    if (kind === "local") {
      const file_id = requiredString(entry, "file_id", path, diagnostics);
      if (id && file_id && purpose_md && required !== null) references.push({ id, kind, file_id, purpose_md, required, applies_to });
    } else if (kind === "external") {
      const url = requiredString(entry, "url", path, diagnostics);
      const access = requiredString(entry, "access", path, diagnostics);
      const local_file_id = optionalString(entry, "local_file_id");
      if (url) {
        try {
          const parsed = new URL(url);
          if (!parsed.protocol.startsWith("http")) throw new Error("unsupported protocol");
        } catch {
          diagnostics.push(errorDiagnostic("invalid-external-url", "External references must use an HTTP(S) URL.", `${path}.url`, id ?? undefined));
        }
      }
      if (id && url && access && purpose_md && required !== null) {
        references.push({ id, kind, url, access, purpose_md, required, applies_to, ...(local_file_id ? { local_file_id } : {}) });
      }
    }
  }
  return references;
}

function parseAssets(
  value: unknown,
  ids: Map<string, string>,
  diagnostics: Diagnostic[],
): PackageAsset[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    diagnostics.push(errorDiagnostic("invalid-array", "assets must be an array.", "assets"));
    return null;
  }
  const assets: PackageAsset[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `assets[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(errorDiagnostic("invalid-object", "Asset declaration must be an object.", path));
      continue;
    }
    const id = requiredString(entry, "id", path, diagnostics);
    const file_id = requiredString(entry, "file_id", path, diagnostics);
    const format = requiredString(entry, "format", path, diagnostics);
    const authority = requiredString(entry, "authority", path, diagnostics);
    const purpose_md = requiredString(entry, "purpose_md", path, diagnostics);
    const required = entry["required"] === undefined ? true : requiredBoolean(entry, "required", path, diagnostics);
    const mock = entry["mock"] === undefined ? false : requiredBoolean(entry, "mock", path, diagnostics);
    const dependency_file_ids = optionalStringArray(entry, "dependency_file_ids", path, diagnostics);
    const applies_to = optionalStringArray(entry, "applies_to", path, diagnostics);
    addId(id, `${path}.id`, ids, diagnostics);
    if (format && !ASSET_FORMATS.has(format)) {
      diagnostics.push(errorDiagnostic("unsupported-asset-format", `Asset format '${format}' is not supported by this package reader.`, `${path}.format`, id ?? undefined));
    }
    if (authority && !ASSET_AUTHORITIES.has(authority)) {
      diagnostics.push(errorDiagnostic("invalid-asset-authority", `authority must be authoritative, illustrative, or evidence.`, `${path}.authority`, id ?? undefined));
    }
    if (id && file_id && format && ASSET_FORMATS.has(format) && authority && ASSET_AUTHORITIES.has(authority) && purpose_md && required !== null && mock !== null) {
      assets.push({ id, file_id, format, authority: authority as AssetAuthority, purpose_md, applies_to, required, dependency_file_ids, mock });
    }
  }
  return assets;
}

function parseDecisions(
  value: unknown,
  ids: Map<string, string>,
  diagnostics: Diagnostic[],
): Decision[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    diagnostics.push(errorDiagnostic("invalid-array", "decisions must be an array.", "decisions"));
    return null;
  }
  const decisions: Decision[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `decisions[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(errorDiagnostic("invalid-object", "Decision declaration must be an object.", path));
      continue;
    }
    const id = requiredString(entry, "id", path, diagnostics);
    const title = requiredString(entry, "title", path, diagnostics);
    const decision_md = requiredString(entry, "decision_md", path, diagnostics);
    const rationale_md = optionalString(entry, "rationale_md");
    const applies_to = optionalStringArray(entry, "applies_to", path, diagnostics);
    addId(id, `${path}.id`, ids, diagnostics);
    if (id && title && decision_md) decisions.push({ id, title, decision_md, applies_to, ...(rationale_md ? { rationale_md } : {}) });
  }
  return decisions;
}

function parseQuestions(
  value: unknown,
  ids: Map<string, string>,
  diagnostics: Diagnostic[],
): Question[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    diagnostics.push(errorDiagnostic("invalid-array", "questions must be an array.", "questions"));
    return null;
  }
  const questions: Question[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `questions[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(errorDiagnostic("invalid-object", "Question declaration must be an object.", path));
      continue;
    }
    const id = requiredString(entry, "id", path, diagnostics);
    const title = requiredString(entry, "title", path, diagnostics);
    const question_md = requiredString(entry, "question_md", path, diagnostics);
    const status = requiredString(entry, "status", path, diagnostics);
    const blocking = requiredBoolean(entry, "blocking", path, diagnostics);
    const applies_to = optionalStringArray(entry, "applies_to", path, diagnostics);
    addId(id, `${path}.id`, ids, diagnostics);
    if (status && !QUESTION_STATUSES.has(status)) {
      diagnostics.push(errorDiagnostic("invalid-question-status", `status must be open, answered, or deferred.`, `${path}.status`, id ?? undefined));
    }
    if (id && title && question_md && status && QUESTION_STATUSES.has(status) && blocking !== null) {
      questions.push({ id, title, question_md, status: status as Question["status"], blocking, applies_to });
    }
  }
  return questions;
}

function validateRelationships(
  plan: Pick<PlanPackage, "phases" | "files" | "references" | "assets" | "decisions" | "questions">,
  diagnostics: Diagnostic[],
): void {
  const phaseIds = new Set(plan.phases.map((phase) => phase.id));
  const criterionIds = new Set(plan.phases.flatMap((phase) => phase.acceptance_criteria.map((criterion) => criterion.id)));
  const fileIds = new Set(plan.files.map((file) => file.id));
  const targetIds = new Set([...phaseIds, ...criterionIds]);

  for (const [index, phase] of plan.phases.entries()) {
    for (const [dependencyIndex, dependency] of phase.depends_on.entries()) {
      if (!phaseIds.has(dependency)) {
        diagnostics.push(errorDiagnostic("unknown-dependency", `Phase dependency '${dependency}' does not identify a declared phase.`, `phases[${index}].depends_on[${dependencyIndex}]`, phase.id));
      }
    }
  }

  for (const [index, reference] of plan.references.entries()) {
    if (reference.kind === "local" && !fileIds.has(reference.file_id)) {
      diagnostics.push(errorDiagnostic("unknown-file", `Reference points to undeclared file '${reference.file_id}'.`, `references[${index}].file_id`, reference.id));
    }
    if (reference.kind === "external" && reference.local_file_id && !fileIds.has(reference.local_file_id)) {
      diagnostics.push(errorDiagnostic("unknown-file", `External reference retained copy '${reference.local_file_id}' is undeclared.`, `references[${index}].local_file_id`, reference.id));
    }
    for (const [targetIndex, target] of reference.applies_to.entries()) {
      if (!targetIds.has(target)) diagnostics.push(errorDiagnostic("unknown-applicability-target", `Reference applicability target '${target}' is undeclared.`, `references[${index}].applies_to[${targetIndex}]`, reference.id));
    }
  }

  for (const [index, asset] of plan.assets.entries()) {
    if (!fileIds.has(asset.file_id)) diagnostics.push(errorDiagnostic("unknown-file", `Asset points to undeclared file '${asset.file_id}'.`, `assets[${index}].file_id`, asset.id));
    for (const [dependencyIndex, dependency] of asset.dependency_file_ids.entries()) {
      if (!fileIds.has(dependency)) diagnostics.push(errorDiagnostic("unknown-file", `Asset dependency '${dependency}' is undeclared.`, `assets[${index}].dependency_file_ids[${dependencyIndex}]`, asset.id));
    }
    for (const [targetIndex, target] of asset.applies_to.entries()) {
      if (!targetIds.has(target)) diagnostics.push(errorDiagnostic("unknown-applicability-target", `Asset applicability target '${target}' is undeclared.`, `assets[${index}].applies_to[${targetIndex}]`, asset.id));
    }
  }

  for (const [index, decision] of plan.decisions.entries()) {
    for (const [targetIndex, target] of decision.applies_to.entries()) {
      if (!targetIds.has(target)) diagnostics.push(errorDiagnostic("unknown-applicability-target", `Decision applicability target '${target}' is undeclared.`, `decisions[${index}].applies_to[${targetIndex}]`, decision.id));
    }
  }

  for (const [index, question] of plan.questions.entries()) {
    for (const [targetIndex, target] of question.applies_to.entries()) {
      if (!targetIds.has(target)) diagnostics.push(errorDiagnostic("unknown-applicability-target", `Question applicability target '${target}' is undeclared.`, `questions[${index}].applies_to[${targetIndex}]`, question.id));
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const phasesById = new Map(plan.phases.map((phase) => [phase.id, phase]));
  const visit = (phase: Phase, stack: string[]): void => {
    if (visiting.has(phase.id)) {
      const cycleStart = stack.indexOf(phase.id);
      const cycle = [...stack.slice(cycleStart), phase.id].join(" -> ");
      diagnostics.push(errorDiagnostic("dependency-cycle", `Phase dependency cycle detected: ${cycle}.`, `phases[${plan.phases.indexOf(phase)}].depends_on`, phase.id));
      return;
    }
    if (visited.has(phase.id)) return;
    visiting.add(phase.id);
    for (const dependency of phase.depends_on) {
      const dependencyPhase = phasesById.get(dependency);
      if (dependencyPhase) visit(dependencyPhase, [...stack, phase.id]);
    }
    visiting.delete(phase.id);
    visited.add(phase.id);
  };
  for (const phase of plan.phases) visit(phase, []);
}

export function validatePlanPackage(input: unknown): PackageValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(input)) {
    return { valid: false, value: null, diagnostics: [errorDiagnostic("invalid-package", "Plan package must be a JSON object.", "$")] };
  }

  const format = requiredString(input, "format", "$", diagnostics);
  const format_version = requiredString(input, "format_version", "$", diagnostics);
  const id = requiredString(input, "id", "$", diagnostics);
  const title = requiredString(input, "title", "$", diagnostics);
  const goal_md = requiredString(input, "goal_md", "$", diagnostics);
  const revisionValue = input["revision"];
  const revision = typeof revisionValue === "number" && Number.isInteger(revisionValue) && revisionValue > 0 ? revisionValue : null;
  if (revision === null) diagnostics.push(errorDiagnostic("invalid-revision", "revision must be a positive integer.", "$.revision"));
  if (format !== SUPPORTED_FORMAT) diagnostics.push(errorDiagnostic("unsupported-format", `format must be '${SUPPORTED_FORMAT}'.`, "$.format"));
  if (format_version !== SUPPORTED_FORMAT_VERSION) diagnostics.push(errorDiagnostic("unsupported-format-version", `format_version '${format_version ?? ""}' is not supported; expected '${SUPPORTED_FORMAT_VERSION}'.`, "$.format_version"));

  const scope = parseScope(input["scope"], "$.scope", diagnostics);
  const ids = new Map<string, string>();
  const constraints = parseConstraints(input["constraints"], ids, diagnostics);
  const phases = parsePhases(input["phases"], ids, diagnostics);
  const files = parseFiles(input["files"], ids, diagnostics);
  const references = parseReferences(input["references"], ids, diagnostics);
  const assets = parseAssets(input["assets"], ids, diagnostics);
  const decisions = parseDecisions(input["decisions"], ids, diagnostics);
  const questions = parseQuestions(input["questions"], ids, diagnostics);
  const required_capabilities = input["required_capabilities"] === undefined ? [] : requiredStringArray(input, "required_capabilities", "$", diagnostics);
  const stateValue = input["state"] === undefined ? "draft" : input["state"];
  const state = stateValue === "draft" || stateValue === "accepted" ? stateValue : null;
  if (state === null) diagnostics.push(errorDiagnostic("invalid-state", "state must be draft or accepted.", "$.state"));
  if (required_capabilities) {
    for (const [index, capability] of required_capabilities.entries()) {
      if (!SUPPORTED_CAPABILITIES.has(capability)) diagnostics.push(errorDiagnostic("unsupported-required-capability", `Required capability '${capability}' is not supported.`, `$.required_capabilities[${index}]`));
    }
  }

  if (format && format_version && id && title && goal_md && revision && scope && constraints && phases && files && references && assets && decisions && questions && required_capabilities && state) {
    const plan: PlanPackage = {
      format: format as typeof SUPPORTED_FORMAT,
      format_version: format_version as typeof SUPPORTED_FORMAT_VERSION,
      id,
      revision,
      title,
      goal_md,
      scope,
      constraints,
      phases,
      references,
      decisions,
      questions,
      assets,
      files,
      required_capabilities,
      state,
      ...(isRecord(input["metadata"]) ? { metadata: input["metadata"] } : {}),
    };
    validateRelationships(plan, diagnostics);
    return { valid: !hasErrors(diagnostics), value: plan, diagnostics };
  }
  return { valid: false, value: null, diagnostics };
}

export function collectAddressableIds(plan: PlanPackage): Set<string> {
  const ids = new Set<string>([
    plan.id,
    ...plan.constraints.map((constraint) => constraint.id),
    ...plan.phases.flatMap((phase) => [phase.id, ...phase.acceptance_criteria.map((criterion) => criterion.id)]),
    ...plan.files.map((file) => file.id),
    ...plan.references.map((reference) => reference.id),
    ...plan.assets.map((asset) => asset.id),
    ...plan.decisions.map((decision) => decision.id),
    ...plan.questions.map((question) => question.id),
  ]);
  return ids;
}
