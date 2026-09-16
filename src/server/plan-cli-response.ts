/**
 * The public response emitted by the package-local `plan` command.  It is
 * deliberately smaller than the selector's internal model: it carries only
 * resolved public facts, request/source identity, and operation-specific
 * data.  Additive fields are permitted so consumers can safely reject an
 * unsupported format version without becoming coupled to implementation
 * types.
 */

export const PLAN_CLI_RESPONSE_FORMAT = "plan-cli-response" as const;
export const PLAN_CLI_RESPONSE_VERSION = "1" as const;

export type PlanCliResponseFormat = "json" | "markdown";
export type PlanCliResponseOperation = "current" | "context" | "expand";
export type PlanCliOutcome = "ok" | "error";
export type PlanCliCoverage = "complete" | "limited" | "unavailable";
export type PlanCliCompleteness = "complete" | "incomplete" | "unavailable";
export type PlanCliReadinessState = "ready" | "blocked" | "not_evaluated";
export type PlanCliAcceptanceStatus = "accepted" | "illustrative" | "unverified" | "unavailable";
export type PlanCliSectionState = "not_requested" | "resolved" | "unavailable";

export interface PlanCliDiagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  path: string;
  item_id?: string;
}

/** A collection whose absence is distinct from an empty resolved collection. */
export type PlanCliSection<T> =
  | { state: "not_requested" }
  | { state: "resolved"; items: T[] }
  | { state: "unavailable"; diagnostics: PlanCliDiagnostic[] };

export interface PlanCliRequest {
  format: PlanCliResponseFormat;
  package_path: string | null;
  store_path: string | null;
  repository_path: string | null;
  snapshot_id: string | null;
  phase_id: string | null;
  activity: "implement" | "verify" | null;
  refs: string[];
  max_chars: number | null;
  compare_draft: boolean;
}

export interface PlanCliSource {
  package_id: string | null;
  snapshot_id: string | null;
  revision: number | null;
  acceptance_status: PlanCliAcceptanceStatus;
  selected_source_ids: string[];
  result_ids: string[];
  code_revisions: string[];
}

export interface PlanCliReadiness {
  state: PlanCliReadinessState;
  blockers: PlanCliDiagnostic[];
}

export interface PlanCliResponse {
  format: typeof PLAN_CLI_RESPONSE_FORMAT;
  format_version: typeof PLAN_CLI_RESPONSE_VERSION;
  operation: PlanCliResponseOperation | null;
  request: PlanCliRequest;
  source: PlanCliSource;
  outcome: PlanCliOutcome;
  diagnostics: PlanCliDiagnostic[];
  coverage: PlanCliCoverage;
  completeness: PlanCliCompleteness;
  readiness: PlanCliReadiness;
  /** Operation-specific public data. See docs/package/plan-cli-response.md. */
  data: Record<string, unknown>;
}

export interface PlanCliResponseValidationResult {
  valid: boolean;
  value: PlanCliResponse | null;
  errors: string[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDiagnostic(value: unknown): value is PlanCliDiagnostic {
  if (!isRecord(value)) return false;
  return typeof value["code"] === "string"
    && typeof value["message"] === "string"
    && typeof value["path"] === "string"
    && (value["severity"] === "error" || value["severity"] === "warning" || value["severity"] === "info")
    && (value["item_id"] === undefined || typeof value["item_id"] === "string");
}

function issue(errors: string[], message: string): void {
  errors.push(message);
}

/**
 * Validate the durable public envelope at a process boundary.  It intentionally
 * accepts unknown fields, so additions do not break a v1 consumer.
 */
export function validatePlanCliResponse(value: unknown): PlanCliResponseValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, value: null, errors: ["Response must be a JSON object."] };
  if (value["format"] !== PLAN_CLI_RESPONSE_FORMAT) issue(errors, `format must be '${PLAN_CLI_RESPONSE_FORMAT}'.`);
  if (value["format_version"] !== PLAN_CLI_RESPONSE_VERSION) issue(errors, `format_version must be '${PLAN_CLI_RESPONSE_VERSION}'.`);
  const operation = value["operation"];
  if (operation !== null && operation !== "current" && operation !== "context" && operation !== "expand") issue(errors, "operation must be current, context, expand, or null.");
  if (value["outcome"] !== "ok" && value["outcome"] !== "error") issue(errors, "outcome must be ok or error.");
  if (value["coverage"] !== "complete" && value["coverage"] !== "limited" && value["coverage"] !== "unavailable") issue(errors, "coverage is invalid.");
  if (value["completeness"] !== "complete" && value["completeness"] !== "incomplete" && value["completeness"] !== "unavailable") issue(errors, "completeness is invalid.");

  const request = value["request"];
  if (!isRecord(request)) {
    issue(errors, "request must be an object.");
  } else {
    if (request["format"] !== "json" && request["format"] !== "markdown") issue(errors, "request.format must be json or markdown.");
    for (const key of ["package_path", "store_path", "repository_path", "snapshot_id", "phase_id"]) {
      if (!isNullableString(request[key])) issue(errors, `request.${key} must be a string or null.`);
    }
    if (request["activity"] !== null && request["activity"] !== "implement" && request["activity"] !== "verify") issue(errors, "request.activity is invalid.");
    if (!isStringArray(request["refs"])) issue(errors, "request.refs must be a string array.");
    if (request["max_chars"] !== null && (!Number.isSafeInteger(request["max_chars"]) || (request["max_chars"] as number) <= 0)) issue(errors, "request.max_chars must be a positive integer or null.");
    if (typeof request["compare_draft"] !== "boolean") issue(errors, "request.compare_draft must be boolean.");
  }

  const source = value["source"];
  if (!isRecord(source)) {
    issue(errors, "source must be an object.");
  } else {
    if (!isNullableString(source["package_id"]) || !isNullableString(source["snapshot_id"])) issue(errors, "source package and snapshot IDs must be strings or null.");
    if (source["revision"] !== null && (!Number.isSafeInteger(source["revision"]) || (source["revision"] as number) <= 0)) issue(errors, "source.revision must be a positive integer or null.");
    if (source["acceptance_status"] !== "accepted" && source["acceptance_status"] !== "illustrative" && source["acceptance_status"] !== "unverified" && source["acceptance_status"] !== "unavailable") issue(errors, "source.acceptance_status is invalid.");
    for (const key of ["selected_source_ids", "result_ids", "code_revisions"]) if (!isStringArray(source[key])) issue(errors, `source.${key} must be a string array.`);
  }

  if (!Array.isArray(value["diagnostics"]) || !value["diagnostics"].every(isDiagnostic)) issue(errors, "diagnostics must be public diagnostic objects.");
  const readiness = value["readiness"];
  if (!isRecord(readiness)) {
    issue(errors, "readiness must be an object.");
  } else {
    if (readiness["state"] !== "ready" && readiness["state"] !== "blocked" && readiness["state"] !== "not_evaluated") issue(errors, "readiness.state is invalid.");
    if (!Array.isArray(readiness["blockers"]) || !readiness["blockers"].every(isDiagnostic)) issue(errors, "readiness.blockers must be public diagnostic objects.");
  }
  if (!isRecord(value["data"])) issue(errors, "data must be an object.");

  if (isRecord(request) && isRecord(source) && (operation === "context" || operation === "expand") && source["snapshot_id"] !== null) {
    if (typeof request["snapshot_id"] !== "string" || request["snapshot_id"] !== source["snapshot_id"]) issue(errors, "Resolved source snapshot_id must match the explicit request.");
  }
  if (isRecord(request) && operation === "context" && value["completeness"] === "complete") {
    if (typeof request["phase_id"] !== "string" || (request["activity"] !== "implement" && request["activity"] !== "verify")) issue(errors, "Complete context requires explicit phase and activity identity.");
  }

  return errors.length === 0
    ? { valid: true, value: value as unknown as PlanCliResponse, errors: [] }
    : { valid: false, value: null, errors };
}

export function serializePlanCliResponse(response: PlanCliResponse): string {
  return `${JSON.stringify(response, null, 2)}\n`;
}
