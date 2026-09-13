import type { Diagnostic } from "../core/diagnostics.js";
import { errorDiagnostic } from "../core/diagnostics.js";
import { join, posix } from "node:path";

import { compareSnapshots, type SnapshotComparisonResult } from "../core/compare.js";
import type { PackageAsset, PackageFile, PlanPackage } from "../core/package.js";
import type { AcceptanceRecord } from "../core/snapshot.js";
import { loadCandidate, type CandidateLoadOptions, type LoadedCandidate } from "./candidate-loader.js";
import { contentTypeForPath } from "./paths.js";
import { SnapshotStore, type StoredSnapshot } from "./snapshot-store.js";

export interface RuntimeFileResponse {
  bytes: Uint8Array;
  contentType: string;
  fileId: string;
  path: string;
}

export interface RuntimeAssetResponse extends RuntimeFileResponse {
  asset: PackageAsset;
}

export interface RuntimeViewReference {
  kind: "draft" | "snapshot";
  snapshot_id: string | null;
  candidate_id: string | null;
}

export interface RuntimeSnapshotSummary {
  snapshot_id: string;
  package_id: string;
  revision: number;
  content_id: string;
  acceptance_status: "unverified" | "accepted" | "illustrative";
  acceptance_provenance: AcceptanceRecord | null;
  acceptance_records: AcceptanceRecord[];
  available_file_count: number;
  file_count: number;
  omissions: StoredSnapshot["descriptor"]["omissions"];
}

export interface RuntimeHistory {
  package_id: string | null;
  defaultView: RuntimeViewReference;
  draft: {
    revision: number;
    content_id: string;
    snapshot_id: string | null;
  } | null;
  snapshots: RuntimeSnapshotSummary[];
  acceptances: AcceptanceRecord[];
  diagnostics: Diagnostic[];
}

/** The immutable, browser-facing projection of one accepted runtime candidate. */
export interface RuntimeModel {
  package: PlanPackage;
  package_id: string;
  revision: number;
  content_id: string;
  view_kind: "draft" | "snapshot";
  view_id: string;
  readiness: "reviewable" | "reviewable-with-planning-blockers";
  acceptance_status: "unverified" | "accepted" | "illustrative";
  acceptance_provenance: AcceptanceRecord | null;
  acceptance_records: AcceptanceRecord[];
  diagnostics: Diagnostic[];
  planning_blockers: Diagnostic[];
  files: PackageFile[];
  snapshot_id: string | null;
  acceptances: AcceptanceRecord[];
}

export interface RuntimeState {
  packageId: string | null;
  currentCandidateId: string | null;
  currentSnapshotId: string | null;
  currentRevision: number | null;
  defaultView: RuntimeViewReference;
  diagnostics: Diagnostic[];
  planningBlockers: Diagnostic[];
  acceptances: AcceptanceRecord[];
  acceptanceDiagnostics: Diagnostic[];
  /** Outcome of the most recent candidate load attempt. */
  lastAttempt: "published" | "rejected" | null;
}

export interface RuntimeChange {
  kind: "candidate-published" | "candidate-rejected";
  state: RuntimeState;
}

export type RuntimeChangeListener = (change: RuntimeChange) => void;

export class CandidateStore {
  private readonly candidates = new Map<string, LoadedCandidate>();
  private currentCandidateId: string | null = null;
  private lastDiagnostics: Diagnostic[] = [];
  private lastPlanningBlockers: Diagnostic[] = [];
  private acceptances: AcceptanceRecord[] = [];
  private acceptanceDiagnostics: Diagnostic[] = [];
  private lastAttempt: RuntimeState["lastAttempt"] = null;
  private readonly listeners = new Set<RuntimeChangeListener>();
  private loadGeneration = 0;
  private loadQueue: Promise<void> = Promise.resolve();
  private readonly snapshotStores = new Map<string, SnapshotStore>();
  private readonly storedSnapshots = new Map<string, StoredSnapshot>();

  private storeFor(options: CandidateLoadOptions): SnapshotStore {
    if (options.snapshotStore) return options.snapshotStore;
    const root = join(options.packageRoot, ".plan-package");
    const existing = this.snapshotStores.get(root);
    if (existing) return existing;
    const store = new SnapshotStore({ root });
    this.snapshotStores.set(root, store);
    return store;
  }

  private acceptanceStatus(snapshotId: string | undefined): RuntimeModel["acceptance_status"] {
    if (!snapshotId) return "unverified";
    if (this.acceptances.some((record) => record.snapshot_id === snapshotId && !record.illustrative)) return "accepted";
    if (this.acceptances.some((record) => record.snapshot_id === snapshotId && record.illustrative)) return "illustrative";
    return "unverified";
  }

  private acceptanceRecords(snapshotId: string | undefined): AcceptanceRecord[] {
    return snapshotId ? this.acceptances.filter((record) => record.snapshot_id === snapshotId) : [];
  }

  private acceptanceProvenance(snapshotId: string | undefined): AcceptanceRecord | null {
    const records = this.acceptanceRecords(snapshotId);
    return records.at(-1) ?? null;
  }

  private snapshotCacheKey(store: SnapshotStore, snapshotId: string): string {
    return `${store.root}\u0000${snapshotId}`;
  }

  private rememberSnapshot(store: SnapshotStore, snapshot: StoredSnapshot): StoredSnapshot {
    this.storedSnapshots.set(this.snapshotCacheKey(store, snapshot.snapshotId), snapshot);
    return snapshot;
  }

  private modelFromCandidate(candidate: LoadedCandidate): RuntimeModel {
    const acceptanceRecords = this.acceptanceRecords(candidate.snapshotId);
    return {
      package: candidate.plan,
      package_id: candidate.packageId,
      revision: candidate.revision,
      content_id: candidate.contentId,
      view_kind: "draft",
      view_id: candidate.contentId,
      readiness: candidate.planningBlockers.length > 0 ? "reviewable-with-planning-blockers" : "reviewable",
      acceptance_status: this.acceptanceStatus(candidate.snapshotId),
      acceptance_provenance: this.acceptanceProvenance(candidate.snapshotId),
      acceptance_records: acceptanceRecords,
      diagnostics: candidate.diagnostics,
      planning_blockers: [...candidate.planningBlockers],
      files: [...candidate.files.values()].map(({ file }) => ({ ...file })),
      snapshot_id: candidate.snapshotId ?? null,
      acceptances: [...this.acceptances],
    };
  }

  private modelFromSnapshot(snapshot: StoredSnapshot): RuntimeModel {
    const acceptanceRecords = this.acceptanceRecords(snapshot.snapshotId);
    return {
      package: snapshot.plan,
      package_id: snapshot.packageId,
      revision: snapshot.revision,
      content_id: snapshot.contentId,
      view_kind: "snapshot",
      view_id: snapshot.snapshotId,
      readiness: snapshot.planningBlockers.length > 0 ? "reviewable-with-planning-blockers" : "reviewable",
      acceptance_status: this.acceptanceStatus(snapshot.snapshotId),
      acceptance_provenance: this.acceptanceProvenance(snapshot.snapshotId),
      acceptance_records: acceptanceRecords,
      diagnostics: [...snapshot.diagnostics],
      planning_blockers: [...snapshot.planningBlockers],
      files: [...snapshot.files.values()].map(({ file }) => ({ ...file })),
      snapshot_id: snapshot.snapshotId,
      acceptances: [...this.acceptances],
    };
  }

  getDefaultView(): RuntimeViewReference {
    const accepted = this.acceptances.filter((record) => !record.illustrative).at(-1);
    if (accepted) return { kind: "snapshot", snapshot_id: accepted.snapshot_id, candidate_id: null };
    const current = this.getCurrentCandidate();
    return {
      kind: "draft",
      snapshot_id: current?.snapshotId ?? null,
      candidate_id: current?.contentId ?? null,
    };
  }

  async loadAndPublish(options: CandidateLoadOptions): Promise<LoadedCandidate | null> {
    const generation = ++this.loadGeneration;
    const queuedLoad = this.loadQueue.then(async () => {
      let result: Awaited<ReturnType<typeof loadCandidate>>;
      try {
        result = await loadCandidate(options);
      } catch (error) {
        result = {
          candidate: null,
          manifestPath: options.manifestPath ?? "plan.json",
          diagnostics: [errorDiagnostic(
            "candidate-load-failed",
            error instanceof Error ? error.message : "The package candidate could not be loaded.",
            "plan.json",
          )],
          planningBlockers: [],
        };
      }

      // A newer watcher/manual reload request supersedes this load. Queueing
      // keeps filesystem work serialized; this fence also prevents a slow
      // older resolution from publishing after a newer request exists.
      if (generation !== this.loadGeneration) return null;

      this.lastDiagnostics = [...result.diagnostics];
      this.lastPlanningBlockers = [...result.planningBlockers];
      if (!result.candidate) {
        this.lastAttempt = "rejected";
        this.notify({ kind: "candidate-rejected", state: this.getState() });
        return null;
      }
      let descriptor;
      const snapshotStore = this.storeFor(options);
      try {
        descriptor = await snapshotStore.persist({
          packageId: result.candidate.packageId,
          revision: result.candidate.revision,
          contentId: result.candidate.contentId,
          manifestBytes: result.candidate.manifestBytes,
          plan: result.candidate.plan,
          files: result.candidate.files,
          snapshotFiles: result.candidate.snapshotFiles,
          snapshotOmissions: result.candidate.snapshotOmissions,
        });
        const opened = await snapshotStore.open(descriptor.snapshot_id);
        if (!opened.snapshot) throw new Error(opened.diagnostics.map((diagnostic) => diagnostic.message).join("; ") || "The persisted snapshot could not be reopened.");
        this.rememberSnapshot(snapshotStore, opened.snapshot);
      } catch (error) {
        this.lastDiagnostics = [
          ...result.diagnostics,
          errorDiagnostic(
            "snapshot-persistence-failed",
            error instanceof Error ? error.message : "The valid candidate could not be persisted as a durable snapshot.",
            ".plan-package",
          ),
        ];
        this.lastAttempt = "rejected";
        this.notify({ kind: "candidate-rejected", state: this.getState() });
        return null;
      }
      const history = await snapshotStore.listAcceptances(result.candidate.packageId);
      this.acceptances = [...history.records];
      this.acceptanceDiagnostics = [...history.diagnostics];
      const candidate: LoadedCandidate = { ...result.candidate, snapshotId: descriptor.snapshot_id };
      this.candidates.set(candidate.contentId, candidate);
      this.currentCandidateId = candidate.contentId;
      this.lastAttempt = "published";
      this.notify({ kind: "candidate-published", state: this.getState() });
      return candidate;
    });
    this.loadQueue = queuedLoad.then(() => undefined, () => undefined);
    return queuedLoad;
  }

  subscribe(listener: RuntimeChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(change: RuntimeChange): void {
    for (const listener of this.listeners) listener(change);
  }

  getCandidate(candidateId: string): LoadedCandidate | null {
    return this.candidates.get(candidateId) ?? null;
  }

  getCurrentCandidate(): LoadedCandidate | null {
    return this.currentCandidateId ? this.getCandidate(this.currentCandidateId) : null;
  }

  getModel(candidateId: string): RuntimeModel | null {
    const candidate = this.getCandidate(candidateId);
    if (!candidate) return null;
    return this.modelFromCandidate(candidate);
  }

  getDraftModel(): RuntimeModel | null {
    const current = this.getCurrentCandidate();
    return current ? this.modelFromCandidate(current) : null;
  }

  getFile(candidateId: string, fileId: string): RuntimeFileResponse | null {
    const candidate = this.getCandidate(candidateId);
    const resolved = candidate?.files.get(fileId);
    if (!candidate || !resolved) return null;
    return {
      bytes: new Uint8Array(resolved.bytes),
      contentType: contentTypeForPath(resolved.file.path, resolved.file.media_type),
      fileId,
      path: resolved.file.path,
    };
  }

  getAsset(candidateId: string, assetId: string): RuntimeAssetResponse | null {
    const candidate = this.getCandidate(candidateId);
    const asset = candidate?.plan.assets.find((entry) => entry.id === assetId);
    if (!candidate || !asset) return null;
    const file = this.getFile(candidateId, asset.file_id);
    if (!file) return null;
    return { ...file, asset };
  }

  /**
   * Resolves only the primary HTML file or a declared relative dependency for
   * an isolated prototype. It never consults the package directory after the
   * candidate was captured.
   */
  getPrototypeFile(candidateId: string, assetId: string, relativePath?: string): RuntimeFileResponse | null {
    const candidate = this.getCandidate(candidateId);
    const asset = candidate?.plan.assets.find((entry) => entry.id === assetId);
    if (!candidate || !asset || asset.format !== "html") return null;

    const primary = this.getFile(candidateId, asset.file_id);
    if (!primary) return null;
    if (!relativePath) return primary;

    const normalized = relativePath.split("/");
    if (normalized.length === 0 || normalized.some((part) => !part || part === "." || part === ".." || part.includes("\\"))) {
      return null;
    }

    const directory = posix.dirname(primary.path);
    const fileIds = [asset.file_id, ...asset.dependency_file_ids];
    for (const fileId of fileIds) {
      const candidateFile = this.getFile(candidateId, fileId);
      if (!candidateFile) continue;
      if (posix.relative(directory, candidateFile.path) === relativePath) return candidateFile;
    }
    return null;
  }

  private fileFromSnapshot(snapshot: StoredSnapshot, fileId: string): RuntimeFileResponse | null {
    const resolved = snapshot.files.get(fileId);
    if (!resolved) return null;
    return {
      bytes: new Uint8Array(resolved.bytes),
      contentType: contentTypeForPath(resolved.file.path, resolved.file.media_type),
      fileId,
      path: resolved.file.path,
    };
  }

  getSnapshotFile(snapshotId: string, fileId: string): RuntimeFileResponse | null {
    const snapshot = [...this.storedSnapshots.values()].find((candidate) => candidate.snapshotId === snapshotId);
    return snapshot ? this.fileFromSnapshot(snapshot, fileId) : null;
  }

  getSnapshotAsset(snapshotId: string, assetId: string): RuntimeAssetResponse | null {
    const snapshot = [...this.storedSnapshots.values()].find((candidate) => candidate.snapshotId === snapshotId);
    const asset = snapshot?.plan.assets.find((entry) => entry.id === assetId);
    if (!snapshot || !asset) return null;
    const file = this.fileFromSnapshot(snapshot, asset.file_id);
    return file ? { ...file, asset } : null;
  }

  getSnapshotPrototypeFile(snapshotId: string, assetId: string, relativePath?: string): RuntimeFileResponse | null {
    const snapshot = [...this.storedSnapshots.values()].find((candidate) => candidate.snapshotId === snapshotId);
    const asset = snapshot?.plan.assets.find((entry) => entry.id === assetId);
    if (!snapshot || !asset || asset.format !== "html") return null;
    const primary = this.fileFromSnapshot(snapshot, asset.file_id);
    if (!primary) return null;
    if (!relativePath) return primary;
    const normalized = relativePath.split("/");
    if (normalized.length === 0 || normalized.some((part) => !part || part === "." || part === ".." || part.includes("\\"))) return null;
    const directory = posix.dirname(primary.path);
    for (const fileId of [asset.file_id, ...asset.dependency_file_ids]) {
      const candidateFile = this.fileFromSnapshot(snapshot, fileId);
      if (candidateFile && posix.relative(directory, candidateFile.path) === relativePath) return candidateFile;
    }
    return null;
  }

  getState(): RuntimeState {
    const current = this.getCurrentCandidate();
    return {
      packageId: current?.packageId ?? null,
      currentCandidateId: current?.contentId ?? null,
      currentSnapshotId: current?.snapshotId ?? null,
      currentRevision: current?.revision ?? null,
      defaultView: this.getDefaultView(),
      diagnostics: [...this.lastDiagnostics],
      planningBlockers: [...this.lastPlanningBlockers],
      acceptances: [...this.acceptances],
      acceptanceDiagnostics: [...this.acceptanceDiagnostics],
      lastAttempt: this.lastAttempt,
    };
  }

  async openSnapshot(options: CandidateLoadOptions, snapshotId: string): Promise<StoredSnapshot> {
    const store = this.storeFor(options);
    const result = await store.open(snapshotId);
    if (!result.snapshot) {
      throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("; ") || `Snapshot '${snapshotId}' is unavailable.`);
    }
    return this.rememberSnapshot(store, result.snapshot);
  }

  async getSnapshotModel(options: CandidateLoadOptions, snapshotId: string): Promise<{ model: RuntimeModel | null; diagnostics: Diagnostic[] }> {
    const store = this.storeFor(options);
    const result = await store.open(snapshotId);
    if (!result.snapshot) return { model: null, diagnostics: result.diagnostics };
    this.rememberSnapshot(store, result.snapshot);
    return { model: this.modelFromSnapshot(result.snapshot), diagnostics: [...result.diagnostics] };
  }

  async getHistory(options: CandidateLoadOptions): Promise<RuntimeHistory> {
    const current = this.getCurrentCandidate();
    const packageId = current?.packageId ?? null;
    const store = this.storeFor(options);
    const listed = packageId ? await store.listSnapshots(packageId) : { snapshots: [], diagnostics: [] };
    for (const snapshot of listed.snapshots) this.rememberSnapshot(store, snapshot);
    const snapshots = listed.snapshots.map((snapshot) => {
      const records = this.acceptanceRecords(snapshot.snapshotId);
      return {
        snapshot_id: snapshot.snapshotId,
        package_id: snapshot.packageId,
        revision: snapshot.revision,
        content_id: snapshot.contentId,
        acceptance_status: this.acceptanceStatus(snapshot.snapshotId),
        acceptance_provenance: this.acceptanceProvenance(snapshot.snapshotId),
        acceptance_records: records,
        available_file_count: snapshot.files.size,
        file_count: snapshot.descriptor.files.length,
        omissions: snapshot.descriptor.omissions.map((omission) => ({ ...omission })),
      } satisfies RuntimeSnapshotSummary;
    });
    return {
      package_id: packageId,
      defaultView: this.getDefaultView(),
      draft: current ? { revision: current.revision, content_id: current.contentId, snapshot_id: current.snapshotId ?? null } : null,
      snapshots,
      acceptances: [...this.acceptances],
      diagnostics: [...listed.diagnostics, ...this.acceptanceDiagnostics],
    };
  }

  private comparisonInput(snapshot: StoredSnapshot) {
    return {
      snapshot_id: snapshot.snapshotId,
      package_id: snapshot.packageId,
      plan: snapshot.plan,
      descriptor: snapshot.descriptor,
      files: new Map([...snapshot.files.entries()].map(([fileId, file]) => [fileId, new Uint8Array(file.bytes)])),
    };
  }

  async compare(options: CandidateLoadOptions, fromSnapshotId: string, toSnapshotId: string): Promise<SnapshotComparisonResult> {
    const diagnostics: Diagnostic[] = [];
    let from: StoredSnapshot;
    let to: StoredSnapshot;
    try {
      from = await this.openSnapshot(options, fromSnapshotId);
    } catch (error) {
      diagnostics.push(errorDiagnostic("comparison-snapshot-unavailable", error instanceof Error ? error.message : `Snapshot '${fromSnapshotId}' is unavailable.`, "from"));
      return { valid: false, value: null, diagnostics };
    }
    if (toSnapshotId === "draft") {
      const current = this.getCurrentCandidate();
      if (!current?.snapshotId) {
        return { valid: false, value: null, diagnostics: [errorDiagnostic("comparison-draft-unavailable", "The current draft has no durable snapshot.", "to")] };
      }
      try {
        to = await this.openSnapshot(options, current.snapshotId);
      } catch (error) {
        diagnostics.push(errorDiagnostic("comparison-draft-unavailable", error instanceof Error ? error.message : "The current draft snapshot is unavailable.", "to"));
        return { valid: false, value: null, diagnostics };
      }
    } else {
      try {
        to = await this.openSnapshot(options, toSnapshotId);
      } catch (error) {
        diagnostics.push(errorDiagnostic("comparison-snapshot-unavailable", error instanceof Error ? error.message : `Snapshot '${toSnapshotId}' is unavailable.`, "to"));
        return { valid: false, value: null, diagnostics };
      }
    }
    return compareSnapshots(this.comparisonInput(from), this.comparisonInput(to));
  }
}
