import { createHash, randomBytes } from "node:crypto";
import { link, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { contentIdInput } from "../core/content-id.js";
import { errorDiagnostic, hasErrors, isDiagnostic, warningDiagnostic, type Diagnostic } from "../core/diagnostics.js";
import { isSha256, isValidIdentifier, validatePlanPackage, type PlanPackage } from "../core/package.js";
import type { ResolvedFile } from "../core/resolve.js";
import {
  resultRecordComparable,
  validateResultRecord,
  type ResultRecord,
} from "../core/result.js";
import {
  acceptanceRecordComparable,
  isSnapshotId,
  SNAPSHOT_FORMAT,
  SNAPSHOT_FORMAT_VERSION,
  snapshotIdentityInput,
  validateAcceptanceRecord,
  validateSnapshotDescriptor,
  type AcceptanceRecord,
  type SnapshotDescriptor,
  type SnapshotFileEntry,
  type SnapshotOmission,
} from "../core/snapshot.js";

export interface SnapshotCapture {
  packageId: string;
  revision: number;
  contentId: string;
  manifestBytes: Uint8Array;
  plan: PlanPackage;
  files: ReadonlyMap<string, ResolvedFile>;
  snapshotFiles: readonly SnapshotFileEntry[];
  snapshotOmissions: readonly SnapshotOmission[];
}

export interface SnapshotStoreOptions {
  root: string;
  /** Test seam for read-only/full-disk and interrupted-write scenarios. */
  beforeWrite?: (path: string, kind: "blob" | "descriptor" | "acceptance" | "result") => void | Promise<void>;
}

export interface StoredSnapshot {
  descriptor: SnapshotDescriptor;
  snapshotId: string;
  packageId: string;
  revision: number;
  contentId: string;
  manifestBytes: Uint8Array;
  plan: PlanPackage;
  files: ReadonlyMap<string, ResolvedFile>;
  diagnostics: Diagnostic[];
  planningBlockers: Diagnostic[];
  getFileBytes(fileId: string): Uint8Array | null;
}

export interface SnapshotOpenResult {
  snapshot: StoredSnapshot | null;
  diagnostics: Diagnostic[];
  planningBlockers: Diagnostic[];
}

export interface AcceptanceWriteResult {
  record: AcceptanceRecord | null;
  created: boolean;
  idempotent: boolean;
  diagnostics: Diagnostic[];
}

export interface AcceptanceHistoryResult {
  records: AcceptanceRecord[];
  diagnostics: Diagnostic[];
}

export interface SnapshotHistoryResult {
  snapshots: StoredSnapshot[];
  diagnostics: Diagnostic[];
}

export interface ResultOpenResult {
  result: ResultRecord | null;
  diagnostics: Diagnostic[];
}

export interface ResultWriteResult {
  result: ResultRecord | null;
  created: boolean;
  idempotent: boolean;
  diagnostics: Diagnostic[];
}

export interface ResultHistoryResult {
  /** Valid records in deterministic recorded_at/result_id order, including superseded history. */
  records: ResultRecord[];
  /** Records not superseded by another valid record in this store. */
  current: ResultRecord[];
  diagnostics: Diagnostic[];
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function parseJson(bytes: Uint8Array, path: string): unknown | Diagnostic {
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return errorDiagnostic("malformed-json", `Stored JSON at '${path}' is not valid JSON.`, path);
  }
}

function serialize(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function snapshotPlanningBlockers(plan: PlanPackage): Diagnostic[] {
  return plan.questions.flatMap((question) => question.status === "open" && question.blocking
    ? [errorDiagnostic("blocking-question", `Blocking question '${question.title}' is unresolved.`, `questions.${question.id}`, question.id)]
    : []);
}

function displayedContentId(manifestBytes: Uint8Array, files: Iterable<ResolvedFile>): string {
  return `content-${sha256(contentIdInput(manifestBytes, files)).slice(0, 24)}`;
}

function fileEntryMatchesPlan(entry: SnapshotFileEntry, planFile: PlanPackage["files"][number]): boolean {
  return entry.id === planFile.id
    && entry.root === planFile.root
    && entry.path === planFile.path
    && entry.sha256 === planFile.sha256
    && entry.required === planFile.required
    && entry.media_type === planFile.media_type;
}

function packageItemIds(plan: PlanPackage): Set<string> {
  return new Set([
    plan.id,
    ...plan.constraints.map((item) => item.id),
    ...plan.phases.flatMap((phase) => [
      phase.id,
      ...(phase.tasks ?? []).map((task) => task.id),
      ...phase.acceptance_criteria.map((criterion) => criterion.id),
    ]),
    ...plan.references.map((item) => item.id),
    ...plan.decisions.map((item) => item.id),
    ...plan.questions.map((item) => item.id),
    ...plan.assets.map((item) => item.id),
    ...plan.files.map((item) => item.id),
  ]);
}

function resultRelatedItemIds(record: ResultRecord): string[] {
  return [
    ...record.related_item_ids,
    ...record.intended_work.flatMap((item) => item.related_item_ids),
    ...record.observed_facts.flatMap((item) => item.related_item_ids),
    ...record.inferences.flatMap((item) => item.related_item_ids),
    ...record.unverified_claims.flatMap((item) => item.related_item_ids),
    ...record.produced_interfaces.flatMap((item) => item.related_item_ids),
    ...record.deviations.flatMap((item) => item.related_item_ids),
    ...record.unresolved_findings.flatMap((item) => item.related_item_ids),
    ...record.continuation_notes.flatMap((item) => item.related_item_ids),
  ];
}

function requiredSnapshotFileIds(plan: PlanPackage): Set<string> {
  const required = new Set(plan.files.filter((file) => file.required).map((file) => file.id));
  for (const reference of plan.references) {
    if (reference.kind === "local" && reference.required) required.add(reference.file_id);
    if (reference.kind === "external" && reference.required && reference.local_file_id) required.add(reference.local_file_id);
  }
  for (const asset of plan.assets) {
    required.add(asset.file_id);
    for (const dependency of asset.dependency_file_ids) required.add(dependency);
  }
  return required;
}

export class SnapshotStore {
  readonly root: string;
  private readonly beforeWrite?: SnapshotStoreOptions["beforeWrite"];

  constructor(options: SnapshotStoreOptions) {
    this.root = resolve(options.root);
    this.beforeWrite = options.beforeWrite;
  }

  private blobPath(digest: string): string {
    return join(this.root, "blobs", digest);
  }

  private descriptorPath(snapshotId: string): string {
    return join(this.root, "snapshots", `${snapshotId}.json`);
  }

  private acceptancePath(recordId: string): string {
    return join(this.root, "acceptances", `${recordId}.json`);
  }

  private resultPath(resultId: string): string {
    return join(this.root, "results", `${resultId}.json`);
  }

  private async writeExclusive(path: string, bytes: Uint8Array, kind: "blob" | "descriptor" | "acceptance" | "result"): Promise<void> {
    await this.beforeWrite?.(path, kind);
    await mkdir(resolve(path, ".."), { recursive: true });
    const temporaryPath = `${path}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`;
    try {
      await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
      try {
        // Linking a complete temporary file publishes it atomically without
        // replacing a descriptor/blob another writer already created.
        await link(temporaryPath, path);
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
        const existing = new Uint8Array(await readFile(path));
        if (!sameBytes(existing, bytes)) throw new Error(`Existing content at '${path}' differs from the requested immutable content.`);
      }
    } finally {
      try {
        await unlink(temporaryPath);
      } catch {
        // The temporary file may have been linked and removed by cleanup.
      }
    }
  }

  private async writeBlob(bytes: Uint8Array): Promise<string> {
    const digest = sha256(bytes);
    await this.writeExclusive(this.blobPath(digest), bytes, "blob");
    return digest;
  }

  async persist(capture: SnapshotCapture): Promise<SnapshotDescriptor> {
    const manifestSha256 = sha256(capture.manifestBytes);
    const files = capture.snapshotFiles.map((file) => ({ ...file, ...(file.omission ? { omission: { ...file.omission } } : {}) }));
    for (const entry of files) {
      if (!entry.available) continue;
      const resolved = capture.files.get(entry.id);
      if (!resolved) throw new Error(`Snapshot file '${entry.id}' is marked available but has no captured bytes.`);
      const actualDigest = sha256(resolved.bytes);
      if (actualDigest !== entry.sha256 || (entry.blob_sha256 && actualDigest !== entry.blob_sha256)) {
        throw new Error(`Captured bytes for '${entry.id}' do not match the snapshot inventory.`);
      }
    }
    await this.writeBlob(capture.manifestBytes);
    for (const entry of files) {
      if (entry.available) {
        const resolved = capture.files.get(entry.id);
        if (resolved) await this.writeBlob(resolved.bytes);
      }
    }
    const snapshotId = sha256(snapshotIdentityInput(capture.manifestBytes, files, capture.snapshotOmissions));
    const descriptor: SnapshotDescriptor = {
      format: SNAPSHOT_FORMAT,
      format_version: SNAPSHOT_FORMAT_VERSION,
      snapshot_id: snapshotId,
      package_id: capture.packageId,
      author_revision: capture.revision,
      manifest_sha256: manifestSha256,
      content_id: capture.contentId,
      files,
      omissions: capture.snapshotOmissions.map((omission) => ({ ...omission })),
    };
    const validation = validateSnapshotDescriptor(descriptor);
    if (!validation.valid || !validation.value) throw new Error(`Snapshot descriptor is invalid: ${validation.diagnostics.map((diagnostic) => diagnostic.message).join("; ")}`);
    await this.writeExclusive(this.descriptorPath(snapshotId), serialize(descriptor), "descriptor");
    return descriptor;
  }

  private async readBlob(digest: string, path: string, diagnostics: Diagnostic[]): Promise<Uint8Array | null> {
    if (!isSha256(digest)) {
      diagnostics.push(errorDiagnostic("invalid-blob-reference", `Stored blob reference '${digest}' is invalid.`, path));
      return null;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(this.blobPath(digest)));
    } catch {
      diagnostics.push(errorDiagnostic("snapshot-blob-missing", `Snapshot blob '${digest}' is unavailable.`, path));
      return null;
    }
    if (sha256(bytes) !== digest) {
      diagnostics.push(errorDiagnostic("snapshot-blob-corrupt", `Snapshot blob '${digest}' failed its SHA-256 integrity check.`, path));
      return null;
    }
    return bytes;
  }

  async open(snapshotId: string): Promise<SnapshotOpenResult> {
    const diagnostics: Diagnostic[] = [];
    const planningBlockers: Diagnostic[] = [];
    if (!isSnapshotId(snapshotId)) {
      return { snapshot: null, diagnostics: [errorDiagnostic("invalid-snapshot-id", "Snapshot ID must be a full lowercase SHA-256 digest.", "snapshot_id")], planningBlockers };
    }
    let descriptorBytes: Uint8Array;
    try {
      descriptorBytes = new Uint8Array(await readFile(this.descriptorPath(snapshotId)));
    } catch {
      return { snapshot: null, diagnostics: [errorDiagnostic("snapshot-unavailable", `Snapshot '${snapshotId}' is unavailable.`, "snapshot_id")], planningBlockers };
    }
    const parsedDescriptor = parseJson(descriptorBytes, `snapshots/${snapshotId}.json`);
    if (typeof parsedDescriptor !== "object" || parsedDescriptor === null || "code" in parsedDescriptor) {
      return { snapshot: null, diagnostics: [parsedDescriptor as Diagnostic], planningBlockers };
    }
    const descriptorValidation = validateSnapshotDescriptor(parsedDescriptor);
    diagnostics.push(...descriptorValidation.diagnostics);
    if (!descriptorValidation.valid || !descriptorValidation.value) return { snapshot: null, diagnostics, planningBlockers };
    const descriptor = descriptorValidation.value;
    if (descriptor.snapshot_id !== snapshotId) {
      diagnostics.push(errorDiagnostic("snapshot-id-mismatch", "Snapshot descriptor identity does not match its requested path.", "snapshot_id"));
      return { snapshot: null, diagnostics, planningBlockers };
    }
    const manifestBytes = await this.readBlob(descriptor.manifest_sha256, "manifest_sha256", diagnostics);
    if (!manifestBytes) return { snapshot: null, diagnostics, planningBlockers };
    const parsedManifest = parseJson(manifestBytes, "snapshot manifest");
    if (typeof parsedManifest !== "object" || parsedManifest === null || "code" in parsedManifest) {
      diagnostics.push(parsedManifest as Diagnostic);
      return { snapshot: null, diagnostics, planningBlockers };
    }
    const planValidation = validatePlanPackage(parsedManifest);
    diagnostics.push(...planValidation.diagnostics);
    if (!planValidation.valid || !planValidation.value) return { snapshot: null, diagnostics, planningBlockers };
    const plan = planValidation.value;
    if (plan.id !== descriptor.package_id) {
      diagnostics.push(errorDiagnostic("snapshot-package-mismatch", "Snapshot descriptor package_id does not match its retained manifest.", "package_id"));
    }
    if (sha256(manifestBytes) !== descriptor.manifest_sha256) {
      diagnostics.push(errorDiagnostic("snapshot-manifest-corrupt", "Retained manifest bytes do not match the descriptor digest.", "manifest_sha256"));
    }
    const descriptorFiles = new Map(descriptor.files.map((file) => [file.id, file]));
    const files = new Map<string, ResolvedFile>();
    const requiredFileIds = requiredSnapshotFileIds(plan);
    const descriptorOmissions = new Set(descriptor.omissions.filter((omission) => omission.kind === "external-reference").map((omission) => omission.id));
    for (const reference of plan.references) {
      if (reference.kind !== "external") continue;
      if (reference.required && !reference.local_file_id) {
        diagnostics.push(errorDiagnostic("required-external-unresolved", `Required external reference '${reference.url}' has no retained local copy.`, `references.${reference.id}`, reference.id));
      }
      if (!reference.required && !reference.local_file_id && !descriptorOmissions.has(reference.id)) {
        diagnostics.push(errorDiagnostic("snapshot-omission-missing", `Snapshot does not preserve the optional omission for external reference '${reference.id}'.`, `references.${reference.id}`, reference.id));
      }
    }
    for (const omission of descriptor.omissions) {
      const reference = plan.references.find((candidate) => candidate.id === omission.id);
      if (!reference || reference.kind !== "external" || reference.required || reference.local_file_id) {
        diagnostics.push(errorDiagnostic("snapshot-omission-mismatch", `Snapshot omission '${omission.id}' does not match an optional external reference.`, `omissions.${omission.id}`, omission.id));
      }
    }
    for (const planFile of plan.files) {
      const entry = descriptorFiles.get(planFile.id);
      if (!entry) {
        diagnostics.push(errorDiagnostic("snapshot-file-missing", `Snapshot has no inventory entry for '${planFile.id}'.`, `files.${planFile.id}`, planFile.id));
        continue;
      }
      if (!fileEntryMatchesPlan(entry, planFile)) {
        diagnostics.push(errorDiagnostic("snapshot-file-mismatch", `Snapshot inventory for '${planFile.id}' does not match the retained manifest.`, `files.${planFile.id}`, planFile.id));
        continue;
      }
      if (!entry.available) {
        if (requiredFileIds.has(planFile.id) || !entry.omission) diagnostics.push(errorDiagnostic("snapshot-required-file-omitted", `Required snapshot file '${planFile.path}' is unavailable.`, `files.${planFile.id}`, planFile.id));
        else diagnostics.push(warningDiagnostic("snapshot-file-omitted", entry.omission.message, entry.omission.path, planFile.id));
        continue;
      }
      const bytes = await this.readBlob(entry.blob_sha256 ?? entry.sha256, `files.${planFile.id}`, diagnostics);
      if (!bytes) continue;
      if (sha256(bytes) !== planFile.sha256) {
        diagnostics.push(errorDiagnostic("snapshot-file-corrupt", `Retained bytes for '${planFile.path}' do not match the manifest digest.`, `files.${planFile.id}`, planFile.id));
        continue;
      }
      files.set(planFile.id, { file: planFile, bytes });
    }
    for (const entry of descriptor.files) {
      if (!plan.files.some((file) => file.id === entry.id)) diagnostics.push(errorDiagnostic("snapshot-extra-file", `Snapshot contains undeclared file '${entry.id}'.`, `files.${entry.id}`, entry.id));
    }
    const expectedSnapshotId = sha256(snapshotIdentityInput(manifestBytes, descriptor.files, descriptor.omissions));
    if (expectedSnapshotId !== snapshotId) diagnostics.push(errorDiagnostic("snapshot-identity-mismatch", "Retained snapshot content does not reproduce its full snapshot ID.", "snapshot_id"));
    if (descriptor.author_revision !== plan.revision) diagnostics.push(errorDiagnostic("snapshot-revision-mismatch", "Retained snapshot author revision does not match its manifest.", "author_revision"));
    const expectedContentId = displayedContentId(manifestBytes, files.values());
    if (expectedContentId !== descriptor.content_id) diagnostics.push(errorDiagnostic("snapshot-content-id-mismatch", "Retained snapshot content does not reproduce its compatibility content ID.", "content_id"));
    planningBlockers.push(...snapshotPlanningBlockers(plan));
    if (hasErrors(diagnostics)) return { snapshot: null, diagnostics, planningBlockers };
    if (plan.state === "accepted") diagnostics.push(warningDiagnostic("unverified-manifest-state", "Manifest state 'accepted' is legacy author metadata; only a durable acceptance record can establish acceptance.", "$.state"));
    const snapshot: StoredSnapshot = {
      descriptor,
      snapshotId,
      packageId: plan.id,
      revision: plan.revision,
      contentId: descriptor.content_id,
      manifestBytes: new Uint8Array(manifestBytes),
      plan,
      files,
      diagnostics,
      planningBlockers,
      getFileBytes(fileId: string): Uint8Array | null {
        const resolved = files.get(fileId);
        return resolved ? new Uint8Array(resolved.bytes) : null;
      },
    };
    return { snapshot, diagnostics, planningBlockers };
  }

  async listAcceptances(packageId?: string): Promise<AcceptanceHistoryResult> {
    const diagnostics: Diagnostic[] = [];
    const records: AcceptanceRecord[] = [];
    let names: string[];
    try {
      names = await readdir(join(this.root, "acceptances"));
    } catch {
      return { records, diagnostics };
    }
    for (const name of names.filter((candidate) => candidate.endsWith(".json")).sort()) {
      const path = join(this.root, "acceptances", name);
      try {
        const parsed = parseJson(new Uint8Array(await readFile(path)), path);
        if (typeof parsed !== "object" || parsed === null || "code" in parsed) {
          diagnostics.push(parsed as Diagnostic);
          continue;
        }
        const validation = validateAcceptanceRecord(parsed);
        if (!validation.valid || !validation.value) {
          diagnostics.push(...validation.diagnostics);
          continue;
        }
        if (packageId && validation.value.package_id !== packageId) continue;
        const snapshot = await this.open(validation.value.snapshot_id);
        if (!snapshot.snapshot || snapshot.snapshot.packageId !== validation.value.package_id) {
          diagnostics.push(errorDiagnostic("acceptance-snapshot-unavailable", `Acceptance record '${validation.value.record_id}' does not resolve to its recorded snapshot.`, path, validation.value.record_id));
          continue;
        }
        records.push(validation.value);
      } catch {
        diagnostics.push(errorDiagnostic("acceptance-record-unavailable", `Acceptance record '${name}' could not be read.`, path));
      }
    }
    records.sort((left, right) => left.recorded_at.localeCompare(right.recorded_at) || left.record_id.localeCompare(right.record_id));
    return { records, diagnostics };
  }

  async listSnapshots(packageId?: string): Promise<SnapshotHistoryResult> {
    const diagnostics: Diagnostic[] = [];
    const snapshots: StoredSnapshot[] = [];
    let names: string[];
    try {
      names = await readdir(join(this.root, "snapshots"));
    } catch {
      return { snapshots, diagnostics };
    }
    for (const name of names.filter((candidate) => candidate.endsWith(".json")).sort()) {
      const snapshotId = name.slice(0, -".json".length);
      const result = await this.open(snapshotId);
      if (!result.snapshot) {
        diagnostics.push(...result.diagnostics);
        continue;
      }
      if (packageId && result.snapshot.packageId !== packageId) continue;
      snapshots.push(result.snapshot);
    }
    snapshots.sort((left, right) => left.revision - right.revision || left.snapshotId.localeCompare(right.snapshotId));
    return { snapshots, diagnostics };
  }

  private resultSnapshotDiagnostics(record: ResultRecord, snapshot: StoredSnapshot): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    if (snapshot.snapshotId !== record.snapshot_id) {
      diagnostics.push(errorDiagnostic("result-snapshot-mismatch", "Result snapshot_id does not match the opened snapshot.", "snapshot_id", record.result_id));
    }
    if (snapshot.packageId !== record.package_id) {
      diagnostics.push(errorDiagnostic("result-package-mismatch", "Result package_id does not match the referenced snapshot.", "package_id", record.result_id));
    }
    if (!snapshot.plan.phases.some((phase) => phase.id === record.phase_id)) {
      diagnostics.push(errorDiagnostic("result-phase-unavailable", `Result phase '${record.phase_id}' is not declared by the retained snapshot.`, "phase_id", record.result_id));
    }
    const itemIds = packageItemIds(snapshot.plan);
    for (const [index, itemId] of resultRelatedItemIds(record).entries()) {
      if (!itemIds.has(itemId)) diagnostics.push(errorDiagnostic("result-related-item-unavailable", `Result refers to undeclared package item '${itemId}'.`, `related_item_ids[${index}]`, record.result_id));
    }
    return diagnostics;
  }

  async openResult(resultId: string): Promise<ResultOpenResult> {
    if (!isValidIdentifier(resultId)) {
      return { result: null, diagnostics: [errorDiagnostic("invalid-result-id", "Result ID must be a valid package identifier.", "result_id", resultId)] };
    }
    const path = this.resultPath(resultId);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(path));
    } catch {
      return { result: null, diagnostics: [errorDiagnostic("result-unavailable", `Result '${resultId}' is unavailable.`, "result_id", resultId)] };
    }
    const parsed = parseJson(bytes, path);
    if (typeof parsed !== "object" || parsed === null || "code" in parsed) {
      const parseDiagnostic = isDiagnostic(parsed)
        ? parsed
        : errorDiagnostic("malformed-json", `Stored result at '${path}' is not a JSON object.`, path, resultId);
      return {
        result: null,
        diagnostics: [errorDiagnostic("result-record-corrupt", `Result '${resultId}' is not valid JSON.`, path, resultId), parseDiagnostic],
      };
    }
    const validation = validateResultRecord(parsed);
    const diagnostics = [...validation.diagnostics];
    if (!validation.value || !validation.valid) return { result: null, diagnostics };
    if (validation.value.result_id !== resultId) {
      diagnostics.push(errorDiagnostic("result-id-mismatch", "Result record identity does not match its requested path.", "result_id", resultId));
      return { result: null, diagnostics };
    }
    const snapshot = await this.open(validation.value.snapshot_id);
    diagnostics.push(...snapshot.diagnostics);
    if (!snapshot.snapshot) {
      diagnostics.push(errorDiagnostic("result-snapshot-unavailable", `Result '${resultId}' cannot resolve its retained snapshot.`, "snapshot_id", resultId));
      return { result: null, diagnostics };
    }
    diagnostics.push(...this.resultSnapshotDiagnostics(validation.value, snapshot.snapshot));
    if (hasErrors(diagnostics)) return { result: null, diagnostics };
    return { result: validation.value, diagnostics };
  }

  async listResults(packageId?: string, snapshotId?: string, phaseId?: string): Promise<ResultHistoryResult> {
    const diagnostics: Diagnostic[] = [];
    const records: ResultRecord[] = [];
    let names: string[];
    try {
      names = await readdir(join(this.root, "results"));
    } catch {
      return { records, current: [], diagnostics };
    }
    for (const name of names.filter((candidate) => candidate.endsWith(".json")).sort()) {
      const resultId = name.slice(0, -".json".length);
      const opened = await this.openResult(resultId);
      diagnostics.push(...opened.diagnostics);
      if (!opened.result) continue;
      if (records.some((record) => record.result_id === opened.result?.result_id)) {
        diagnostics.push(errorDiagnostic("duplicate-result-id", `Result ID '${opened.result.result_id}' is declared more than once.`, `results.${opened.result.result_id}`, opened.result.result_id));
        continue;
      }
      if (packageId && opened.result.package_id !== packageId) continue;
      if (snapshotId && opened.result.snapshot_id !== snapshotId) continue;
      if (phaseId && opened.result.phase_id !== phaseId) continue;
      records.push(opened.result);
    }
    records.sort((left, right) => left.recorded_at.localeCompare(right.recorded_at) || left.result_id.localeCompare(right.result_id));

    const byId = new Map(records.map((record) => [record.result_id, record]));
    const invalid = new Set<string>();
    for (const record of records) {
      for (const supersededId of record.supersedes) {
        const target = byId.get(supersededId);
        if (!target) {
          diagnostics.push(errorDiagnostic("superseded-result-unavailable", `Result '${record.result_id}' supersedes unavailable result '${supersededId}'.`, `results.${record.result_id}.supersedes`, record.result_id));
          invalid.add(record.result_id);
          continue;
        }
        if (target.package_id !== record.package_id || target.snapshot_id !== record.snapshot_id || target.phase_id !== record.phase_id || target.activity !== record.activity) {
          diagnostics.push(errorDiagnostic("superseded-result-mismatch", `Result '${record.result_id}' can only supersede a result for the same package, snapshot, phase, and activity.`, `results.${record.result_id}.supersedes`, record.result_id));
          invalid.add(record.result_id);
        }
      }
    }
    const visiting: string[] = [];
    const visited = new Set<string>();
    const reportedCycles = new Set<string>();
    const visit = (resultId: string): void => {
      const cycleIndex = visiting.indexOf(resultId);
      if (cycleIndex >= 0) {
        const cycle = [...visiting.slice(cycleIndex), resultId];
        const cycleKey = [...new Set(cycle)].sort().join(",");
        if (!reportedCycles.has(cycleKey)) {
          diagnostics.push(errorDiagnostic("result-supersession-cycle", `Result supersession cycle detected: ${cycle.join(" -> ")}.`, `results.${resultId}.supersedes`, resultId));
          for (const member of cycle) invalid.add(member);
          reportedCycles.add(cycleKey);
        }
        return;
      }
      if (visited.has(resultId) || invalid.has(resultId)) return;
      const record = byId.get(resultId);
      if (!record) return;
      visiting.push(resultId);
      for (const supersededId of record.supersedes) visit(supersededId);
      visiting.pop();
      visited.add(resultId);
    };
    for (const record of records) visit(record.result_id);

    const validRecords = records.filter((record) => !invalid.has(record.result_id));
    const superseded = new Set(validRecords.flatMap((record) => record.supersedes));
    return {
      records: validRecords,
      current: validRecords.filter((record) => !superseded.has(record.result_id)),
      diagnostics,
    };
  }

  async recordAcceptance(record: AcceptanceRecord): Promise<AcceptanceWriteResult> {
    const validation = validateAcceptanceRecord(record);
    if (!validation.valid || !validation.value) return { record: null, created: false, idempotent: false, diagnostics: validation.diagnostics };
    const snapshotResult = await this.open(record.snapshot_id);
    if (!snapshotResult.snapshot) return { record: null, created: false, idempotent: false, diagnostics: snapshotResult.diagnostics };
    if (snapshotResult.snapshot.packageId !== record.package_id) {
      return {
        record: null,
        created: false,
        idempotent: false,
        diagnostics: [errorDiagnostic("acceptance-package-mismatch", "Acceptance package_id does not match the referenced snapshot.", "package_id")],
      };
    }
    const path = this.acceptancePath(record.record_id);
    try {
      const existing = new Uint8Array(await readFile(path));
      const parsed = parseJson(existing, path);
      if (typeof parsed !== "object" || parsed === null || "code" in parsed) return { record: null, created: false, idempotent: false, diagnostics: [parsed as Diagnostic] };
      const existingValidation = validateAcceptanceRecord(parsed);
      if (!existingValidation.valid || !existingValidation.value) return { record: null, created: false, idempotent: false, diagnostics: existingValidation.diagnostics };
      if (acceptanceRecordComparable(existingValidation.value) === acceptanceRecordComparable(record)) {
        return { record: existingValidation.value, created: false, idempotent: true, diagnostics: [] };
      }
      return { record: null, created: false, idempotent: false, diagnostics: [errorDiagnostic("acceptance-record-conflict", `Acceptance record ID '${record.record_id}' already contains different input.`, "record_id", record.record_id)] };
    } catch (error) {
      if (!isAlreadyExists(error) && typeof error === "object" && error !== null && "code" in error && error.code !== "ENOENT") {
        return { record: null, created: false, idempotent: false, diagnostics: [errorDiagnostic("acceptance-record-read-failed", `Acceptance record '${record.record_id}' could not be read.`, path, record.record_id)] };
      }
    }
    try {
      await this.writeExclusive(path, serialize(record), "acceptance");
      return { record, created: true, idempotent: false, diagnostics: [] };
    } catch (error) {
      return {
        record: null,
        created: false,
        idempotent: false,
        diagnostics: [errorDiagnostic("acceptance-record-write-failed", error instanceof Error ? error.message : "Acceptance record could not be written.", path, record.record_id)],
      };
    }
  }

  async recordResult(record: ResultRecord): Promise<ResultWriteResult> {
    const validation = validateResultRecord(record);
    if (!validation.valid || !validation.value) return { result: null, created: false, idempotent: false, diagnostics: validation.diagnostics };
    const normalized = validation.value;
    const snapshotResult = await this.open(normalized.snapshot_id);
    if (!snapshotResult.snapshot) {
      return { result: null, created: false, idempotent: false, diagnostics: snapshotResult.diagnostics };
    }
    const snapshotDiagnostics = this.resultSnapshotDiagnostics(normalized, snapshotResult.snapshot);
    if (hasErrors(snapshotDiagnostics)) return { result: null, created: false, idempotent: false, diagnostics: [...validation.diagnostics, ...snapshotDiagnostics] };

    const existingPath = this.resultPath(normalized.result_id);
    try {
      const existing = new Uint8Array(await readFile(existingPath));
      const parsed = parseJson(existing, existingPath);
      if (typeof parsed !== "object" || parsed === null || "code" in parsed) {
        const parseDiagnostic = isDiagnostic(parsed)
          ? parsed
          : errorDiagnostic("malformed-json", `Stored result at '${existingPath}' is not a JSON object.`, existingPath, normalized.result_id);
        return { result: null, created: false, idempotent: false, diagnostics: [errorDiagnostic("result-record-corrupt", `Result '${normalized.result_id}' already exists but is corrupt.`, existingPath, normalized.result_id), parseDiagnostic] };
      }
      const existingValidation = validateResultRecord(parsed);
      if (!existingValidation.valid || !existingValidation.value) return { result: null, created: false, idempotent: false, diagnostics: existingValidation.diagnostics };
      if (resultRecordComparable(existingValidation.value) === resultRecordComparable(normalized)) {
        return { result: existingValidation.value, created: false, idempotent: true, diagnostics: [...validation.diagnostics, ...existingValidation.diagnostics] };
      }
      return { result: null, created: false, idempotent: false, diagnostics: [errorDiagnostic("result-record-conflict", `Result ID '${normalized.result_id}' already contains different input.`, "result_id", normalized.result_id)] };
    } catch (error) {
      if (!isAlreadyExists(error) && typeof error === "object" && error !== null && "code" in error && error.code !== "ENOENT") {
        return { result: null, created: false, idempotent: false, diagnostics: [errorDiagnostic("result-record-read-failed", `Result '${normalized.result_id}' could not be read.`, existingPath, normalized.result_id)] };
      }
    }

    if (normalized.supersedes.length > 0) {
      const history = await this.listResults(normalized.package_id, normalized.snapshot_id, normalized.phase_id);
      const targets = new Map(history.records.map((candidate) => [candidate.result_id, candidate]));
      const missing = normalized.supersedes.find((supersededId) => !targets.has(supersededId));
      if (missing) {
        return {
          result: null,
          created: false,
          idempotent: false,
          diagnostics: [errorDiagnostic("superseded-result-unavailable", `Result '${normalized.result_id}' supersedes unavailable result '${missing}'.`, "supersedes", normalized.result_id)],
        };
      }
    }

    try {
      await this.writeExclusive(existingPath, serialize(normalized), "result");
    } catch (error) {
      // A concurrent writer may have published the same immutable input with
      // a different generated timestamp between our initial read and this
      // link. Re-read the winner before reporting a write failure.
      try {
        const concurrent = new Uint8Array(await readFile(existingPath));
        const parsed = parseJson(concurrent, existingPath);
        if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) && !("code" in parsed)) {
          const concurrentValidation = validateResultRecord(parsed);
          if (concurrentValidation.valid && concurrentValidation.value && resultRecordComparable(concurrentValidation.value) === resultRecordComparable(normalized)) {
            return { result: concurrentValidation.value, created: false, idempotent: true, diagnostics: [...validation.diagnostics, ...concurrentValidation.diagnostics] };
          }
          if (concurrentValidation.valid && concurrentValidation.value) {
            return { result: null, created: false, idempotent: false, diagnostics: [errorDiagnostic("result-record-conflict", `Result ID '${normalized.result_id}' already contains different input.`, "result_id", normalized.result_id)] };
          }
        }
      } catch {
        // Preserve the original write diagnostic when the concurrent file is
        // not readable or is itself malformed.
      }
      return {
        result: null,
        created: false,
        idempotent: false,
        diagnostics: [errorDiagnostic("result-record-write-failed", error instanceof Error ? error.message : "Result record could not be written.", existingPath, normalized.result_id)],
      };
    }
    const reopened = await this.openResult(normalized.result_id);
    if (!reopened.result) {
      return {
        result: null,
        created: false,
        idempotent: false,
        diagnostics: [errorDiagnostic("result-record-verification-failed", `Result '${normalized.result_id}' could not be verified after publication.`, existingPath, normalized.result_id), ...reopened.diagnostics],
      };
    }
    return { result: reopened.result, created: true, idempotent: false, diagnostics: [...validation.diagnostics, ...reopened.diagnostics] };
  }
}
