import {
  errorDiagnostic,
  warningDiagnostic,
  type Diagnostic,
} from "./diagnostics.js";
import {
  isSha256,
  isValidIdentifier,
  type ContextActivity,
} from "./package.js";

export const RESULT_FORMAT = "plan-package-result" as const;
export const RESULT_FORMAT_VERSION = "1" as const;

export type ResultStatementDisposition = "intended" | "observed" | "inferred" | "unverified";
export type ResultEvidenceKind = "command" | "test" | "file" | "url" | "screenshot" | "other";
export type ResultEvidenceAvailability = "current" | "stale" | "unavailable";
export type ResultEvidenceStatus = ResultEvidenceAvailability | "none";
export type ResultFindingSeverity = "blocking" | "consequential" | "informational";
export type ResultReviewStatus = "not-reviewed" | "pending" | "approved" | "changes-requested";
export type ResultIntegrationStatus = "not-integrated" | "integrated" | "unknown";

export interface ResultStatement {
  id: string;
  text_md: string;
  disposition: ResultStatementDisposition;
  related_item_ids: string[];
}

export interface ResultInterface {
  id: string;
  name: string;
  description_md: string;
  disposition: ResultStatementDisposition;
  related_item_ids: string[];
}

export interface ResultFinding {
  id: string;
  text_md: string;
  severity: ResultFindingSeverity;
  disposition: ResultStatementDisposition;
  related_item_ids: string[];
}

export interface ResultEvidence {
  id: string;
  kind: ResultEvidenceKind;
  label: string;
  locator: string;
  code_revision: string;
  statement_ids: string[];
  status: ResultEvidenceAvailability;
}

export interface ResultDeliveryFacts {
  review_status: ResultReviewStatus;
  integration_status: ResultIntegrationStatus;
  pr_url?: string;
  pr_number?: number;
  integrated_revision?: string;
  notes_md?: string;
}

export interface ResultRecord {
  format: typeof RESULT_FORMAT;
  format_version: typeof RESULT_FORMAT_VERSION;
  result_id: string;
  package_id: string;
  snapshot_id: string;
  phase_id: string;
  activity: ContextActivity;
  author: string;
  recorded_at: string;
  code_revision: string;
  environment: Record<string, string>;
  related_item_ids: string[];
  intended_work: ResultStatement[];
  observed_facts: ResultStatement[];
  inferences: ResultStatement[];
  unverified_claims: ResultStatement[];
  produced_interfaces: ResultInterface[];
  deviations: ResultStatement[];
  unresolved_findings: ResultFinding[];
  evidence: ResultEvidence[];
  delivery_facts: ResultDeliveryFacts;
  continuation_notes: ResultStatement[];
  supersedes: string[];
  illustrative: boolean;
}

export interface ResultValidationResult {
  valid: boolean;
  value: ResultRecord | null;
  diagnostics: Diagnostic[];
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: RecordValue, key: string, path: string, diagnostics: Diagnostic[]): string | null {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    diagnostics.push(errorDiagnostic("invalid-string", `${key} must be a non-empty string.`, `${path}.${key}`));
    return null;
  }
  return candidate;
}

function optionalString(value: RecordValue, key: string, path: string, diagnostics: Diagnostic[]): string | undefined {
  const candidate = value[key];
  if (candidate === undefined) return undefined;
  if (typeof candidate !== "string" || candidate.trim() === "") {
    diagnostics.push(errorDiagnostic("invalid-string", `${key} must be a non-empty string when provided.`, `${path}.${key}`));
    return undefined;
  }
  return candidate;
}

function requiredBoolean(value: RecordValue, key: string, path: string, diagnostics: Diagnostic[]): boolean | null {
  const candidate = value[key];
  if (typeof candidate !== "boolean") {
    diagnostics.push(errorDiagnostic("invalid-boolean", `${key} must be a boolean.`, `${path}.${key}`));
    return null;
  }
  return candidate;
}

function optionalPositiveInteger(value: RecordValue, key: string, path: string, diagnostics: Diagnostic[]): number | undefined {
  const candidate = value[key];
  if (candidate === undefined) return undefined;
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate <= 0) {
    diagnostics.push(errorDiagnostic("invalid-positive-integer", `${key} must be a positive integer when provided.`, `${path}.${key}`));
    return undefined;
  }
  return candidate;
}

function validRecordedAt(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && value === new Date(value).toISOString();
}

function parseStringArray(
  value: RecordValue,
  key: string,
  path: string,
  diagnostics: Diagnostic[],
  optional = false,
): string[] | null {
  const candidate = value[key];
  if (candidate === undefined && optional) return [];
  if (!Array.isArray(candidate) || candidate.some((item) => typeof item !== "string" || item.trim() === "")) {
    diagnostics.push(errorDiagnostic("invalid-string-array", `${key} must be an array of non-empty strings.`, `${path}.${key}`));
    return null;
  }
  return [...candidate];
}

function parseEnvironment(value: unknown, path: string, diagnostics: Diagnostic[]): Record<string, string> | null {
  if (!isRecord(value)) {
    diagnostics.push(errorDiagnostic("invalid-environment", "environment must be an object of string values.", path));
    return null;
  }
  const entries = Object.entries(value);
  if (entries.some(([key, item]) => key.trim() === "" || typeof item !== "string" || item.trim() === "")) {
    diagnostics.push(errorDiagnostic("invalid-environment", "environment keys and values must be non-empty strings.", path));
    return null;
  }
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right))) as Record<string, string>;
}

function parseDisposition(value: RecordValue, key: string, path: string, diagnostics: Diagnostic[]): ResultStatementDisposition | null {
  const candidate = requiredString(value, key, path, diagnostics);
  if (candidate !== "intended" && candidate !== "observed" && candidate !== "inferred" && candidate !== "unverified") {
    diagnostics.push(errorDiagnostic("invalid-statement-disposition", "Statement disposition must be intended, observed, inferred, or unverified.", `${path}.${key}`));
    return null;
  }
  return candidate;
}

function parseStatements(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
  expectedDisposition?: ResultStatementDisposition,
): ResultStatement[] | null {
  if (!Array.isArray(value)) {
    diagnostics.push(errorDiagnostic("invalid-array", "Result statements must be an array.", path));
    return null;
  }
  const statements: ResultStatement[] = [];
  for (const [index, entry] of value.entries()) {
    const statementPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(errorDiagnostic("invalid-object", "Result statement must be an object.", statementPath));
      continue;
    }
    const id = requiredString(entry, "id", statementPath, diagnostics);
    const text_md = requiredString(entry, "text_md", statementPath, diagnostics);
    const disposition = parseDisposition(entry, "disposition", statementPath, diagnostics);
    const related_item_ids = parseStringArray(entry, "related_item_ids", statementPath, diagnostics);
    if (expectedDisposition && disposition && disposition !== expectedDisposition) {
      diagnostics.push(errorDiagnostic(
        "statement-disposition-mismatch",
        `Statements in ${path} must have disposition '${expectedDisposition}'.`,
        `${statementPath}.disposition`,
        id ?? undefined,
      ));
    }
    if (id && !isValidIdentifier(id)) diagnostics.push(errorDiagnostic("invalid-result-item-id", `Result item ID '${id}' is invalid.`, `${statementPath}.id`, id));
    if (id && text_md && disposition && related_item_ids) statements.push({ id, text_md, disposition, related_item_ids });
  }
  return statements;
}

function parseInterfaces(value: unknown, path: string, diagnostics: Diagnostic[]): ResultInterface[] | null {
  if (!Array.isArray(value)) {
    diagnostics.push(errorDiagnostic("invalid-array", "produced_interfaces must be an array.", path));
    return null;
  }
  const interfaces: ResultInterface[] = [];
  for (const [index, entry] of value.entries()) {
    const interfacePath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(errorDiagnostic("invalid-object", "Produced interface must be an object.", interfacePath));
      continue;
    }
    const id = requiredString(entry, "id", interfacePath, diagnostics);
    const name = requiredString(entry, "name", interfacePath, diagnostics);
    const description_md = requiredString(entry, "description_md", interfacePath, diagnostics);
    const disposition = parseDisposition(entry, "disposition", interfacePath, diagnostics);
    const related_item_ids = parseStringArray(entry, "related_item_ids", interfacePath, diagnostics);
    if (id && !isValidIdentifier(id)) diagnostics.push(errorDiagnostic("invalid-result-item-id", `Result item ID '${id}' is invalid.`, `${interfacePath}.id`, id));
    if (id && name && description_md && disposition && related_item_ids) interfaces.push({ id, name, description_md, disposition, related_item_ids });
  }
  return interfaces;
}

function parseFindings(value: unknown, path: string, diagnostics: Diagnostic[]): ResultFinding[] | null {
  if (!Array.isArray(value)) {
    diagnostics.push(errorDiagnostic("invalid-array", "unresolved_findings must be an array.", path));
    return null;
  }
  const findings: ResultFinding[] = [];
  for (const [index, entry] of value.entries()) {
    const findingPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(errorDiagnostic("invalid-object", "Unresolved finding must be an object.", findingPath));
      continue;
    }
    const id = requiredString(entry, "id", findingPath, diagnostics);
    const text_md = requiredString(entry, "text_md", findingPath, diagnostics);
    const severity = requiredString(entry, "severity", findingPath, diagnostics);
    const disposition = parseDisposition(entry, "disposition", findingPath, diagnostics);
    const related_item_ids = parseStringArray(entry, "related_item_ids", findingPath, diagnostics);
    if (severity !== "blocking" && severity !== "consequential" && severity !== "informational") {
      diagnostics.push(errorDiagnostic("invalid-finding-severity", "Finding severity must be blocking, consequential, or informational.", `${findingPath}.severity`, id ?? undefined));
    }
    if (id && !isValidIdentifier(id)) diagnostics.push(errorDiagnostic("invalid-result-item-id", `Result item ID '${id}' is invalid.`, `${findingPath}.id`, id));
    if (id && text_md && (severity === "blocking" || severity === "consequential" || severity === "informational") && disposition && related_item_ids) {
      findings.push({ id, text_md, severity, disposition, related_item_ids });
    }
  }
  return findings;
}

function parseEvidence(
  value: unknown,
  path: string,
  codeRevision: string | null,
  diagnostics: Diagnostic[],
): ResultEvidence[] | null {
  if (!Array.isArray(value)) {
    diagnostics.push(errorDiagnostic("invalid-array", "evidence must be an array.", path));
    return null;
  }
  const evidence: ResultEvidence[] = [];
  for (const [index, entry] of value.entries()) {
    const evidencePath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      diagnostics.push(errorDiagnostic("invalid-object", "Evidence link must be an object.", evidencePath));
      continue;
    }
    const id = requiredString(entry, "id", evidencePath, diagnostics);
    const kind = requiredString(entry, "kind", evidencePath, diagnostics);
    const label = requiredString(entry, "label", evidencePath, diagnostics);
    const locator = requiredString(entry, "locator", evidencePath, diagnostics);
    const evidenceRevision = requiredString(entry, "code_revision", evidencePath, diagnostics);
    const statement_ids = parseStringArray(entry, "statement_ids", evidencePath, diagnostics);
    const statusValue = entry["status"] === undefined ? "current" : requiredString(entry, "status", evidencePath, diagnostics);
    const status = statusValue === "current" || statusValue === "stale" || statusValue === "unavailable" ? statusValue : null;
    if (kind !== "command" && kind !== "test" && kind !== "file" && kind !== "url" && kind !== "screenshot" && kind !== "other") {
      diagnostics.push(errorDiagnostic("invalid-evidence-kind", "Evidence kind must be command, test, file, url, screenshot, or other.", `${evidencePath}.kind`, id ?? undefined));
    }
    if (!status) diagnostics.push(errorDiagnostic("invalid-evidence-status", "Evidence status must be current, stale, or unavailable.", `${evidencePath}.status`, id ?? undefined));
    if (codeRevision && evidenceRevision && evidenceRevision !== codeRevision) {
      diagnostics.push(warningDiagnostic("stale-evidence", `Evidence '${id ?? ""}' was recorded against code revision '${evidenceRevision}', not '${codeRevision}'.`, `${evidencePath}.code_revision`, id ?? undefined));
    }
    if (status === "stale") diagnostics.push(warningDiagnostic("stale-evidence", `Evidence '${id ?? ""}' is marked stale and cannot establish a current claim.`, `${evidencePath}.status`, id ?? undefined));
    if (status === "unavailable") diagnostics.push(warningDiagnostic("unavailable-evidence", `Evidence '${id ?? ""}' is unavailable and cannot establish a current claim.`, `${evidencePath}.status`, id ?? undefined));
    if (id && !isValidIdentifier(id)) diagnostics.push(errorDiagnostic("invalid-result-item-id", `Result item ID '${id}' is invalid.`, `${evidencePath}.id`, id));
    if (id && label && locator && evidenceRevision && statement_ids && status && (kind === "command" || kind === "test" || kind === "file" || kind === "url" || kind === "screenshot" || kind === "other")) {
      evidence.push({ id, kind, label, locator, code_revision: evidenceRevision, statement_ids, status });
    }
  }
  return evidence;
}

function parseDeliveryFacts(value: unknown, path: string, diagnostics: Diagnostic[]): ResultDeliveryFacts | null {
  if (!isRecord(value)) {
    diagnostics.push(errorDiagnostic("invalid-delivery-facts", "delivery_facts must be an object.", path));
    return null;
  }
  const review_status = requiredString(value, "review_status", path, diagnostics);
  const integration_status = requiredString(value, "integration_status", path, diagnostics);
  const pr_url = optionalString(value, "pr_url", path, diagnostics);
  const pr_number = optionalPositiveInteger(value, "pr_number", path, diagnostics);
  const integrated_revision = optionalString(value, "integrated_revision", path, diagnostics);
  const notes_md = optionalString(value, "notes_md", path, diagnostics);
  if (review_status !== "not-reviewed" && review_status !== "pending" && review_status !== "approved" && review_status !== "changes-requested") {
    diagnostics.push(errorDiagnostic("invalid-review-status", "review_status must be not-reviewed, pending, approved, or changes-requested.", `${path}.review_status`));
  }
  if (integration_status !== "not-integrated" && integration_status !== "integrated" && integration_status !== "unknown") {
    diagnostics.push(errorDiagnostic("invalid-integration-status", "integration_status must be not-integrated, integrated, or unknown.", `${path}.integration_status`));
  }
  if (pr_url && !/^https?:\/\//.test(pr_url)) diagnostics.push(errorDiagnostic("invalid-pr-url", "pr_url must be an http(s) URL.", `${path}.pr_url`));
  if (integration_status === "integrated" && !integrated_revision) diagnostics.push(errorDiagnostic("missing-integrated-revision", "Integrated delivery facts must include integrated_revision.", `${path}.integrated_revision`));
  if ((review_status === "approved" || review_status === "changes-requested") && !pr_url && pr_number === undefined) {
    diagnostics.push(warningDiagnostic("review-provenance-missing", "A reviewed result has no PR URL or number; review provenance is limited.", path));
  }
  if (review_status && integration_status && (review_status === "not-reviewed" || review_status === "pending" || review_status === "approved" || review_status === "changes-requested") && (integration_status === "not-integrated" || integration_status === "integrated" || integration_status === "unknown")) {
    return {
      review_status,
      integration_status,
      ...(pr_url ? { pr_url } : {}),
      ...(pr_number === undefined ? {} : { pr_number }),
      ...(integrated_revision ? { integrated_revision } : {}),
      ...(notes_md ? { notes_md } : {}),
    };
  }
  return null;
}

function addLocalId(id: string, path: string, ids: Map<string, string>, diagnostics: Diagnostic[]): void {
  const previous = ids.get(id);
  if (previous) diagnostics.push(errorDiagnostic("duplicate-result-item-id", `Result item ID '${id}' is declared more than once.`, path, id));
  else ids.set(id, path);
}

function validateRelatedIds(
  ids: readonly string[],
  path: string,
  localIds: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): void {
  for (const [index, id] of ids.entries()) {
    if (!isValidIdentifier(id)) diagnostics.push(errorDiagnostic("invalid-result-item-id", `Result item ID '${id}' is invalid.`, `${path}[${index}]`, id));
    if (localIds.has(id)) diagnostics.push(errorDiagnostic("related-item-id-collides", `Related item ID '${id}' collides with a result-local item ID.`, `${path}[${index}]`, id));
  }
}

export function validateResultRecord(input: unknown): ResultValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(input)) return { valid: false, value: null, diagnostics: [errorDiagnostic("invalid-result-record", "Result record must be an object.", "$")] };

  const format = requiredString(input, "format", "$", diagnostics);
  const format_version = requiredString(input, "format_version", "$", diagnostics);
  const inputResultId = input["result_id"] ?? input["record_id"];
  const result_id = requiredString({ result_id: inputResultId }, "result_id", "$", diagnostics);
  const recordIdAlias = typeof input["record_id"] === "string" ? input["record_id"] : undefined;
  const package_id = requiredString(input, "package_id", "$", diagnostics);
  const snapshot_id = requiredString(input, "snapshot_id", "$", diagnostics);
  const phase_id = requiredString(input, "phase_id", "$", diagnostics);
  const activity = requiredString(input, "activity", "$", diagnostics);
  const author = requiredString(input, "author", "$", diagnostics);
  const recorded_at = requiredString(input, "recorded_at", "$", diagnostics);
  const code_revision = requiredString(input, "code_revision", "$", diagnostics);
  const environment = parseEnvironment(input["environment"], "$.environment", diagnostics);
  const related_item_ids = parseStringArray(input, "related_item_ids", "$", diagnostics);
  const intended_work = parseStatements(input["intended_work"], "$.intended_work", diagnostics, "intended");
  const observed_facts = parseStatements(input["observed_facts"], "$.observed_facts", diagnostics, "observed");
  const inferences = parseStatements(input["inferences"], "$.inferences", diagnostics, "inferred");
  const unverified_claims = parseStatements(input["unverified_claims"], "$.unverified_claims", diagnostics, "unverified");
  const produced_interfaces = parseInterfaces(input["produced_interfaces"], "$.produced_interfaces", diagnostics);
  const deviations = parseStatements(input["deviations"], "$.deviations", diagnostics);
  const unresolved_findings = parseFindings(input["unresolved_findings"], "$.unresolved_findings", diagnostics);
  const evidence = parseEvidence(input["evidence"], "$.evidence", code_revision, diagnostics);
  const delivery_facts = parseDeliveryFacts(input["delivery_facts"] ?? input["delivery"], "$.delivery_facts", diagnostics);
  const continuation_notes = parseStatements(input["continuation_notes"] ?? [], "$.continuation_notes", diagnostics);
  const supersedes = parseStringArray(input, "supersedes", "$", diagnostics, true);
  const illustrative = requiredBoolean(input, "illustrative", "$", diagnostics);

  if (format !== RESULT_FORMAT) diagnostics.push(errorDiagnostic("unsupported-result-format", `Result format must be '${RESULT_FORMAT}'.`, "$.format"));
  if (format_version !== RESULT_FORMAT_VERSION) diagnostics.push(errorDiagnostic("unsupported-result-version", `Result version '${format_version ?? ""}' is not supported.`, "$.format_version"));
  if (result_id && !isValidIdentifier(result_id)) diagnostics.push(errorDiagnostic("invalid-result-id", `Result ID '${result_id}' is invalid.`, "$.result_id", result_id));
  if (recordIdAlias && result_id && recordIdAlias !== result_id) diagnostics.push(errorDiagnostic("result-id-alias-mismatch", "record_id and result_id must identify the same result when both are provided.", "$.record_id", result_id));
  if (package_id && !isValidIdentifier(package_id)) diagnostics.push(errorDiagnostic("invalid-package-id", `Package ID '${package_id}' is invalid.`, "$.package_id", package_id));
  if (snapshot_id && !isSha256(snapshot_id)) diagnostics.push(errorDiagnostic("invalid-snapshot-id", "snapshot_id must be a full lowercase SHA-256 digest.", "$.snapshot_id"));
  if (phase_id && !isValidIdentifier(phase_id)) diagnostics.push(errorDiagnostic("invalid-phase-id", `Phase ID '${phase_id}' is invalid.`, "$.phase_id", phase_id));
  if (activity !== "implement" && activity !== "verify") diagnostics.push(errorDiagnostic("invalid-activity", "Result activity must be implement or verify.", "$.activity"));
  if (recorded_at && !validRecordedAt(recorded_at)) diagnostics.push(errorDiagnostic("invalid-recorded-at", "recorded_at must be a canonical ISO-8601 timestamp.", "$.recorded_at"));
  if (supersedes) {
    const seen = new Set<string>();
    for (const [index, id] of supersedes.entries()) {
      if (!isValidIdentifier(id)) diagnostics.push(errorDiagnostic("invalid-superseded-result-id", `Superseded result ID '${id}' is invalid.`, `$.supersedes[${index}]`, id));
      if (seen.has(id)) diagnostics.push(errorDiagnostic("duplicate-superseded-result-id", `Result '${id}' is superseded more than once.`, `$.supersedes[${index}]`, id));
      seen.add(id);
      if (result_id && id === result_id) diagnostics.push(errorDiagnostic("self-supersession", "A result cannot supersede itself.", `$.supersedes[${index}]`, result_id));
    }
  }

  const localIds = new Map<string, string>();
  const registerStatements = (statements: readonly ResultStatement[] | null, path: string): void => {
    for (const [index, statement] of (statements ?? []).entries()) addLocalId(statement.id, `${path}[${index}].id`, localIds, diagnostics);
  };
  registerStatements(intended_work, "$.intended_work");
  registerStatements(observed_facts, "$.observed_facts");
  registerStatements(inferences, "$.inferences");
  registerStatements(unverified_claims, "$.unverified_claims");
  registerStatements(deviations, "$.deviations");
  registerStatements(continuation_notes, "$.continuation_notes");
  for (const [index, item] of (produced_interfaces ?? []).entries()) addLocalId(item.id, `$.produced_interfaces[${index}].id`, localIds, diagnostics);
  for (const [index, item] of (unresolved_findings ?? []).entries()) addLocalId(item.id, `$.unresolved_findings[${index}].id`, localIds, diagnostics);
  for (const [index, item] of (evidence ?? []).entries()) addLocalId(item.id, `$.evidence[${index}].id`, localIds, diagnostics);
  const localIdSet = new Set(localIds.keys());
  for (const [index, statement] of [
    ...(intended_work ?? []),
    ...(observed_facts ?? []),
    ...(inferences ?? []),
    ...(unverified_claims ?? []),
    ...(deviations ?? []),
    ...(continuation_notes ?? []),
  ].entries()) validateRelatedIds(statement.related_item_ids, `$.statements[${index}].related_item_ids`, localIdSet, diagnostics);
  for (const [index, item] of (produced_interfaces ?? []).entries()) validateRelatedIds(item.related_item_ids, `$.produced_interfaces[${index}].related_item_ids`, localIdSet, diagnostics);
  for (const [index, item] of (unresolved_findings ?? []).entries()) validateRelatedIds(item.related_item_ids, `$.unresolved_findings[${index}].related_item_ids`, localIdSet, diagnostics);
  const statementIds = new Set([
    ...(intended_work ?? []).map((item) => item.id),
    ...(observed_facts ?? []).map((item) => item.id),
    ...(inferences ?? []).map((item) => item.id),
    ...(unverified_claims ?? []).map((item) => item.id),
    ...(deviations ?? []).map((item) => item.id),
    ...(continuation_notes ?? []).map((item) => item.id),
    ...(produced_interfaces ?? []).map((item) => item.id),
    ...(unresolved_findings ?? []).map((item) => item.id),
  ]);
  for (const [index, item] of (evidence ?? []).entries()) {
    for (const [statementIndex, statementId] of item.statement_ids.entries()) {
      if (!statementIds.has(statementId)) diagnostics.push(errorDiagnostic("unknown-evidence-statement", `Evidence '${item.id}' refers to undeclared result item '${statementId}'.`, `$.evidence[${index}].statement_ids[${statementIndex}]`, item.id));
    }
  }
  validateRelatedIds(related_item_ids ?? [], "$.related_item_ids", localIdSet, diagnostics);

  const value = format && format_version && result_id && package_id && snapshot_id && phase_id && activity && author && recorded_at && code_revision && environment && related_item_ids && intended_work && observed_facts && inferences && unverified_claims && produced_interfaces && deviations && unresolved_findings && evidence && delivery_facts && continuation_notes && supersedes && illustrative !== null && (activity === "implement" || activity === "verify")
    ? {
      format: format as typeof RESULT_FORMAT,
      format_version: format_version as typeof RESULT_FORMAT_VERSION,
      result_id,
      package_id,
      snapshot_id,
      phase_id,
      activity: activity as ContextActivity,
      author,
      recorded_at,
      code_revision,
      environment,
      related_item_ids,
      intended_work,
      observed_facts,
      inferences,
      unverified_claims,
      produced_interfaces,
      deviations,
      unresolved_findings,
      evidence,
      delivery_facts,
      continuation_notes,
      supersedes,
      illustrative,
    } satisfies ResultRecord
    : null;
  return { valid: !diagnostics.some((diagnostic) => diagnostic.severity === "error"), value, diagnostics };
}

export function resultRecordComparable(record: ResultRecord): string {
  const { recorded_at: _recordedAt, ...comparable } = record;
  return JSON.stringify(comparable);
}

export function resultEvidenceStatus(record: ResultRecord): ResultEvidenceStatus {
  if (record.evidence.length === 0) return "none";
  if (record.evidence.some((evidence) => evidence.status === "unavailable")) return "unavailable";
  if (record.evidence.some((evidence) => evidence.status === "stale" || evidence.code_revision !== record.code_revision)) return "stale";
  return "current";
}

export function resultHasCurrentEvidence(record: ResultRecord): boolean {
  return resultEvidenceStatus(record) === "current";
}
