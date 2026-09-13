import type { Diagnostic } from "../core/diagnostics.js";
import { errorDiagnostic } from "../core/diagnostics.js";
import { posix } from "node:path";

import type { PackageAsset, PackageFile, PlanPackage } from "../core/package.js";
import { loadCandidate, type CandidateLoadOptions, type LoadedCandidate } from "./candidate-loader.js";
import { contentTypeForPath } from "./paths.js";

export interface RuntimeFileResponse {
  bytes: Uint8Array;
  contentType: string;
  fileId: string;
  path: string;
}

export interface RuntimeAssetResponse extends RuntimeFileResponse {
  asset: PackageAsset;
}

/** The immutable, browser-facing projection of one accepted runtime candidate. */
export interface RuntimeModel {
  package: PlanPackage;
  package_id: string;
  revision: number;
  content_id: string;
  readiness: "resolved";
  diagnostics: Diagnostic[];
  files: PackageFile[];
}

export interface RuntimeState {
  packageId: string | null;
  currentCandidateId: string | null;
  currentRevision: number | null;
  diagnostics: Diagnostic[];
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
  private lastAttempt: RuntimeState["lastAttempt"] = null;
  private readonly listeners = new Set<RuntimeChangeListener>();
  private loadGeneration = 0;
  private loadQueue: Promise<void> = Promise.resolve();

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
        };
      }

      // A newer watcher/manual reload request supersedes this load. Queueing
      // keeps filesystem work serialized; this fence also prevents a slow
      // older resolution from publishing after a newer request exists.
      if (generation !== this.loadGeneration) return null;

      this.lastDiagnostics = [...result.diagnostics];
      if (!result.candidate) {
        this.lastAttempt = "rejected";
        this.notify({ kind: "candidate-rejected", state: this.getState() });
        return null;
      }
      this.candidates.set(result.candidate.contentId, result.candidate);
      this.currentCandidateId = result.candidate.contentId;
      this.lastAttempt = "published";
      this.notify({ kind: "candidate-published", state: this.getState() });
      return result.candidate;
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
    return {
      package: candidate.plan,
      package_id: candidate.packageId,
      revision: candidate.revision,
      content_id: candidate.contentId,
      readiness: "resolved",
      diagnostics: candidate.diagnostics,
      files: [...candidate.files.values()].map(({ file }) => ({ ...file })),
    };
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

  getState(): RuntimeState {
    const current = this.getCurrentCandidate();
    return {
      packageId: current?.packageId ?? null,
      currentCandidateId: current?.contentId ?? null,
      currentRevision: current?.revision ?? null,
      diagnostics: [...this.lastDiagnostics],
      lastAttempt: this.lastAttempt,
    };
  }
}
