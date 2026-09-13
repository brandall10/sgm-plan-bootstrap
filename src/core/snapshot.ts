import type { Diagnostic } from "./diagnostics.js";
import {
  isSafePackageRelativePath,
  isSha256,
  isValidIdentifier,
  type PackageRootKind,
  type PlanPackage,
} from "./package.js";
import type { ResolvedFile } from "./resolve.js";

export const SNAPSHOT_FORMAT = "plan-package-snapshot" as const;
export const SNAPSHOT_FORMAT_VERSION = "1" as const;
export const ACCEPTANCE_RECORD_FORMAT = "plan-package-acceptance" as const;
export const ACCEPTANCE_RECORD_VERSION = "1" as const;

export type SnapshotOmissionKind = "file" | "external-reference";

export interface SnapshotOmission {
  kind: SnapshotOmissionKind;
  id: string;
  code: string;
  message: string;
  path: string;
  item_id?: string;
}

export interface SnapshotFileEntry {
  id: string;
  root: PackageRootKind;
  path: string;
  sha256: string;
  required: boolean;
  available: boolean;
  blob_sha256?: string;
  media_type?: string;
  omission?: SnapshotOmission;
}

/**
 * A descriptor is content addressed by snapshot_id. It points only to
 * content-addressed blobs and never embeds a second copy of the manifest or
 * captured file bytes.
 */
export interface SnapshotDescriptor {
  format: typeof SNAPSHOT_FORMAT;
  format_version: typeof SNAPSHOT_FORMAT_VERSION;
  snapshot_id: string;
  package_id: string;
  author_revision: number;
  manifest_sha256: string;
  content_id: string;
  files: SnapshotFileEntry[];
  omissions: SnapshotOmission[];
}

export interface AcceptanceRecord {
  format: typeof ACCEPTANCE_RECORD_FORMAT;
  format_version: typeof ACCEPTANCE_RECORD_VERSION;
  record_id: string;
  package_id: string;
  snapshot_id: string;
  instruction: string;
  source: string;
  actor: string;
  recorded_at: string;
  illustrative: boolean;
}

export interface SnapshotValidationResult {
  valid: boolean;
  value: SnapshotDescriptor | null;
  diagnostics: Diagnostic[];
}

export interface AcceptanceValidationResult {
  valid: boolean;
  value: AcceptanceRecord | null;
  diagnostics: Diagnostic[];
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: RecordValue, key: string, path: string, diagnostics: Diagnostic[]): string | null {
  const candidate = value[key];
  if (typeof candidate !== "string" || candidate.trim() === "") {
    diagnostics.push({ code: "invalid-string", message: `${key} must be a non-empty string.`, path: `${path}.${key}`, severity: "error" });
    return null;
  }
  return candidate;
}

function requiredBoolean(value: RecordValue, key: string, path: string, diagnostics: Diagnostic[]): boolean | null {
  const candidate = value[key];
  if (typeof candidate !== "boolean") {
    diagnostics.push({ code: "invalid-boolean", message: `${key} must be a boolean.`, path: `${path}.${key}`, severity: "error" });
    return null;
  }
  return candidate;
}

function requiredPositiveInteger(value: RecordValue, key: string, path: string, diagnostics: Diagnostic[]): number | null {
  const candidate = value[key];
  if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate <= 0) {
    diagnostics.push({ code: "invalid-positive-integer", message: `${key} must be a positive integer.`, path: `${path}.${key}`, severity: "error" });
    return null;
  }
  return candidate;
}

function validRecordedAt(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && value === new Date(value).toISOString();
}

function omissionKey(omission: SnapshotOmission): string {
  return `${omission.kind}:${omission.id}`;
}

function normalizeOmission(value: unknown, path: string, diagnostics: Diagnostic[]): SnapshotOmission | null {
  if (!isRecord(value)) {
    diagnostics.push({ code: "invalid-omission", message: "Snapshot omission must be an object.", path, severity: "error" });
    return null;
  }
  const kind = requiredString(value, "kind", path, diagnostics);
  const id = requiredString(value, "id", path, diagnostics);
  const code = requiredString(value, "code", path, diagnostics);
  const message = requiredString(value, "message", path, diagnostics);
  const omissionPath = requiredString(value, "path", path, diagnostics);
  const item_id = typeof value["item_id"] === "string" ? value["item_id"] : undefined;
  if (kind !== "file" && kind !== "external-reference") {
    diagnostics.push({ code: "invalid-omission-kind", message: "Omission kind must be file or external-reference.", path: `${path}.kind`, severity: "error" });
  }
  if (id && !isValidIdentifier(id)) {
    diagnostics.push({ code: "invalid-id", message: `Omission ID '${id}' is not a valid package identifier.`, path: `${path}.id`, severity: "error" });
  }
  if (kind && id && code && message && omissionPath && (kind === "file" || kind === "external-reference") && (!id || isValidIdentifier(id))) {
    return { kind, id, code, message, path: omissionPath, ...(item_id ? { item_id } : {}) };
  }
  return null;
}

function normalizeFileEntry(value: unknown, path: string, diagnostics: Diagnostic[]): SnapshotFileEntry | null {
  if (!isRecord(value)) {
    diagnostics.push({ code: "invalid-snapshot-file", message: "Snapshot file entry must be an object.", path, severity: "error" });
    return null;
  }
  const id = requiredString(value, "id", path, diagnostics);
  const root = requiredString(value, "root", path, diagnostics);
  const filePath = requiredString(value, "path", path, diagnostics);
  const sha256 = requiredString(value, "sha256", path, diagnostics);
  const required = requiredBoolean(value, "required", path, diagnostics);
  const available = requiredBoolean(value, "available", path, diagnostics);
  const blob_sha256 = typeof value["blob_sha256"] === "string" ? value["blob_sha256"] : undefined;
  const media_type = typeof value["media_type"] === "string" ? value["media_type"] : undefined;
  const omission = value["omission"] === undefined ? undefined : normalizeOmission(value["omission"], `${path}.omission`, diagnostics);
  if (id && !isValidIdentifier(id)) diagnostics.push({ code: "invalid-id", message: `Snapshot file ID '${id}' is invalid.`, path: `${path}.id`, severity: "error" });
  if (root !== "package" && root !== "repository") diagnostics.push({ code: "invalid-root", message: "Snapshot file root must be package or repository.", path: `${path}.root`, severity: "error" });
  if (filePath && !isSafePackageRelativePath(filePath)) diagnostics.push({ code: "unsafe-path", message: `Snapshot file path '${filePath}' is unsafe.`, path: `${path}.path`, severity: "error" });
  if (sha256 && !isSha256(sha256)) diagnostics.push({ code: "invalid-digest", message: "Snapshot file sha256 must be a lowercase SHA-256 digest.", path: `${path}.sha256`, severity: "error" });
  if (blob_sha256 && !isSha256(blob_sha256)) diagnostics.push({ code: "invalid-digest", message: "Snapshot blob_sha256 must be a lowercase SHA-256 digest.", path: `${path}.blob_sha256`, severity: "error" });
  if (available === true && !blob_sha256) diagnostics.push({ code: "missing-blob-reference", message: "An available snapshot file must identify its content blob.", path, severity: "error" });
  if (available === false && !omission) diagnostics.push({ code: "missing-omission", message: "An unavailable snapshot file must preserve an omission diagnostic.", path, severity: "error" });
  if (available === true && omission) diagnostics.push({ code: "unexpected-omission", message: "An available snapshot file cannot also be omitted.", path, severity: "error" });
  if (omission && omission.kind !== "file") diagnostics.push({ code: "invalid-file-omission", message: "A file entry can only contain a file omission.", path: `${path}.omission.kind`, severity: "error" });
  if (omission && id && omission.id !== id) diagnostics.push({ code: "omission-id-mismatch", message: "File omission ID must match its file entry.", path: `${path}.omission.id`, severity: "error" });
  if (id && root && (root === "package" || root === "repository") && filePath && isSafePackageRelativePath(filePath) && sha256 && isSha256(sha256) && required !== null && available !== null) {
    return { id, root, path: filePath, sha256, required, available, ...(blob_sha256 ? { blob_sha256 } : {}), ...(media_type ? { media_type } : {}), ...(omission ? { omission } : {}) };
  }
  return null;
}

export function isSnapshotId(value: string): boolean {
  return isSha256(value);
}

export function snapshotIdentityInput(
  manifestBytes: Uint8Array,
  files: readonly SnapshotFileEntry[],
  omissions: readonly SnapshotOmission[],
): Uint8Array {
  const normalizedFiles = [...files]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((file) => ({ ...file, ...(file.omission ? { omission: { ...file.omission } } : {}) }));
  const normalizedOmissions = [...omissions]
    .sort((left, right) => omissionKey(left).localeCompare(omissionKey(right)))
    .map((omission) => ({ ...omission }));
  const manifestHex = [...manifestBytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return new TextEncoder().encode(JSON.stringify({ manifest_hex: manifestHex, files: normalizedFiles, omissions: normalizedOmissions }));
}

export function snapshotFileInventory(
  plan: PlanPackage,
  files: ReadonlyMap<string, ResolvedFile>,
  omissions: readonly SnapshotOmission[],
): SnapshotFileEntry[] {
  const fileOmissions = new Map(omissions.filter((omission) => omission.kind === "file").map((omission) => [omission.id, omission]));
  return plan.files.map((file) => {
    const resolved = files.get(file.id);
    if (resolved) {
      return {
        id: file.id,
        root: file.root,
        path: file.path,
        sha256: file.sha256,
        required: file.required,
        available: true,
        blob_sha256: file.sha256,
        ...(file.media_type ? { media_type: file.media_type } : {}),
      } satisfies SnapshotFileEntry;
    }
    const omission = fileOmissions.get(file.id) ?? {
      kind: "file" as const,
      id: file.id,
      code: "snapshot-file-omitted",
      message: `File '${file.path}' was not captured.`,
      path: `files.${file.id}.path`,
      item_id: file.id,
    } satisfies SnapshotOmission;
    return {
      id: file.id,
      root: file.root,
      path: file.path,
      sha256: file.sha256,
      required: file.required,
      available: false,
      ...(file.media_type ? { media_type: file.media_type } : {}),
      omission,
    } satisfies SnapshotFileEntry;
  });
}

export function validateSnapshotDescriptor(input: unknown): SnapshotValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(input)) return { valid: false, value: null, diagnostics: [{ code: "invalid-snapshot", message: "Snapshot descriptor must be an object.", path: "$", severity: "error" }] };
  const format = requiredString(input, "format", "$", diagnostics);
  const format_version = requiredString(input, "format_version", "$", diagnostics);
  const snapshot_id = requiredString(input, "snapshot_id", "$", diagnostics);
  const package_id = requiredString(input, "package_id", "$", diagnostics);
  const author_revision = requiredPositiveInteger(input, "author_revision", "$", diagnostics);
  const manifest_sha256 = requiredString(input, "manifest_sha256", "$", diagnostics);
  const content_id = requiredString(input, "content_id", "$", diagnostics);
  const filesValue = input["files"];
  const omissionsValue = input["omissions"];
  if (format !== SNAPSHOT_FORMAT) diagnostics.push({ code: "unsupported-snapshot-format", message: `Snapshot format must be '${SNAPSHOT_FORMAT}'.`, path: "$.format", severity: "error" });
  if (format_version !== SNAPSHOT_FORMAT_VERSION) diagnostics.push({ code: "unsupported-snapshot-version", message: `Snapshot version '${format_version ?? ""}' is not supported.`, path: "$.format_version", severity: "error" });
  if (snapshot_id && !isSnapshotId(snapshot_id)) diagnostics.push({ code: "invalid-snapshot-id", message: "snapshot_id must be a full lowercase SHA-256 digest.", path: "$.snapshot_id", severity: "error" });
  if (package_id && !isValidIdentifier(package_id)) diagnostics.push({ code: "invalid-package-id", message: `Package ID '${package_id}' is invalid.`, path: "$.package_id", severity: "error" });
  if (manifest_sha256 && !isSha256(manifest_sha256)) diagnostics.push({ code: "invalid-digest", message: "manifest_sha256 must be a lowercase SHA-256 digest.", path: "$.manifest_sha256", severity: "error" });
  if (!Array.isArray(filesValue)) diagnostics.push({ code: "invalid-array", message: "Snapshot files must be an array.", path: "$.files", severity: "error" });
  if (!Array.isArray(omissionsValue)) diagnostics.push({ code: "invalid-array", message: "Snapshot omissions must be an array.", path: "$.omissions", severity: "error" });
  const files: SnapshotFileEntry[] = [];
  if (Array.isArray(filesValue)) {
    for (const [index, entry] of filesValue.entries()) {
      const file = normalizeFileEntry(entry, `$.files[${index}]`, diagnostics);
      if (file) files.push(file);
    }
  }
  const omissions: SnapshotOmission[] = [];
  if (Array.isArray(omissionsValue)) {
    for (const [index, entry] of omissionsValue.entries()) {
      const omission = normalizeOmission(entry, `$.omissions[${index}]`, diagnostics);
      if (omission) {
        if (omission.kind !== "external-reference") diagnostics.push({ code: "invalid-top-level-omission", message: "Only external-reference omissions belong at descriptor level.", path: `$.omissions[${index}]`, severity: "error" });
        omissions.push(omission);
      }
    }
  }
  const ids = new Set<string>();
  for (const [index, file] of files.entries()) {
    if (ids.has(file.id)) diagnostics.push({ code: "duplicate-snapshot-file", message: `Snapshot file '${file.id}' is declared more than once.`, path: `$.files[${index}].id`, severity: "error" });
    ids.add(file.id);
  }
  const omissionIds = new Set<string>();
  for (const [index, omission] of omissions.entries()) {
    const key = omissionKey(omission);
    if (omissionIds.has(key)) diagnostics.push({ code: "duplicate-omission", message: `Snapshot omission '${key}' is declared more than once.`, path: `$.omissions[${index}].id`, severity: "error" });
    omissionIds.add(key);
  }
  if (format && format_version && snapshot_id && package_id && author_revision && manifest_sha256 && content_id && Array.isArray(filesValue) && Array.isArray(omissionsValue)) {
    const value: SnapshotDescriptor = {
      format: format as typeof SNAPSHOT_FORMAT,
      format_version: format_version as typeof SNAPSHOT_FORMAT_VERSION,
      snapshot_id,
      package_id,
      author_revision,
      manifest_sha256,
      content_id,
      files,
      omissions,
    };
    return { valid: diagnostics.every((diagnostic) => diagnostic.severity !== "error"), value, diagnostics };
  }
  return { valid: false, value: null, diagnostics };
}

export function acceptanceRecordComparable(record: AcceptanceRecord): string {
  return JSON.stringify({
    format: record.format,
    format_version: record.format_version,
    record_id: record.record_id,
    package_id: record.package_id,
    snapshot_id: record.snapshot_id,
    instruction: record.instruction,
    source: record.source,
    actor: record.actor,
    illustrative: record.illustrative,
  });
}

export function validateAcceptanceRecord(input: unknown): AcceptanceValidationResult {
  const diagnostics: Diagnostic[] = [];
  if (!isRecord(input)) return { valid: false, value: null, diagnostics: [{ code: "invalid-acceptance-record", message: "Acceptance record must be an object.", path: "$", severity: "error" }] };
  const format = requiredString(input, "format", "$", diagnostics);
  const format_version = requiredString(input, "format_version", "$", diagnostics);
  const record_id = requiredString(input, "record_id", "$", diagnostics);
  const package_id = requiredString(input, "package_id", "$", diagnostics);
  const snapshot_id = requiredString(input, "snapshot_id", "$", diagnostics);
  const instruction = requiredString(input, "instruction", "$", diagnostics);
  const source = requiredString(input, "source", "$", diagnostics);
  const actor = requiredString(input, "actor", "$", diagnostics);
  const recorded_at = requiredString(input, "recorded_at", "$", diagnostics);
  const illustrative = requiredBoolean(input, "illustrative", "$", diagnostics);
  if (format !== ACCEPTANCE_RECORD_FORMAT) diagnostics.push({ code: "unsupported-acceptance-format", message: `Acceptance record format must be '${ACCEPTANCE_RECORD_FORMAT}'.`, path: "$.format", severity: "error" });
  if (format_version !== ACCEPTANCE_RECORD_VERSION) diagnostics.push({ code: "unsupported-acceptance-version", message: `Acceptance record version '${format_version ?? ""}' is not supported.`, path: "$.format_version", severity: "error" });
  if (record_id && !isValidIdentifier(record_id)) diagnostics.push({ code: "invalid-record-id", message: `Record ID '${record_id}' is invalid.`, path: "$.record_id", severity: "error" });
  if (package_id && !isValidIdentifier(package_id)) diagnostics.push({ code: "invalid-package-id", message: `Package ID '${package_id}' is invalid.`, path: "$.package_id", severity: "error" });
  if (snapshot_id && !isSnapshotId(snapshot_id)) diagnostics.push({ code: "invalid-snapshot-id", message: "snapshot_id must be a full lowercase SHA-256 digest.", path: "$.snapshot_id", severity: "error" });
  if (recorded_at && !validRecordedAt(recorded_at)) diagnostics.push({ code: "invalid-recorded-at", message: "recorded_at must be a canonical ISO-8601 timestamp.", path: "$.recorded_at", severity: "error" });
  if (format && format_version && record_id && package_id && snapshot_id && instruction && source && actor && recorded_at && illustrative !== null) {
    const value: AcceptanceRecord = {
      format: format as typeof ACCEPTANCE_RECORD_FORMAT,
      format_version: format_version as typeof ACCEPTANCE_RECORD_VERSION,
      record_id,
      package_id,
      snapshot_id,
      instruction,
      source,
      actor,
      recorded_at,
      illustrative,
    };
    return { valid: diagnostics.every((diagnostic) => diagnostic.severity !== "error"), value, diagnostics };
  }
  return { valid: false, value: null, diagnostics };
}
