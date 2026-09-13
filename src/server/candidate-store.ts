import type { Diagnostic } from "../core/diagnostics.js";
import type { PackageAsset } from "../core/package.js";
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

export interface RuntimeState {
  packageId: string | null;
  currentCandidateId: string | null;
  currentRevision: number | null;
  diagnostics: Diagnostic[];
}

export class CandidateStore {
  private readonly candidates = new Map<string, LoadedCandidate>();
  private currentCandidateId: string | null = null;
  private lastDiagnostics: Diagnostic[] = [];

  async loadAndPublish(options: CandidateLoadOptions): Promise<LoadedCandidate | null> {
    const result = await loadCandidate(options);
    this.lastDiagnostics = result.diagnostics;
    if (!result.candidate) return null;
    this.candidates.set(result.candidate.contentId, result.candidate);
    this.currentCandidateId = result.candidate.contentId;
    return result.candidate;
  }

  getCandidate(candidateId: string): LoadedCandidate | null {
    return this.candidates.get(candidateId) ?? null;
  }

  getCurrentCandidate(): LoadedCandidate | null {
    return this.currentCandidateId ? this.getCandidate(this.currentCandidateId) : null;
  }

  getModel(candidateId: string): Record<string, unknown> | null {
    const candidate = this.getCandidate(candidateId);
    if (!candidate) return null;
    return {
      package: candidate.plan,
      package_id: candidate.packageId,
      revision: candidate.revision,
      content_id: candidate.contentId,
      readiness: "resolved",
      diagnostics: candidate.diagnostics,
      files: [...candidate.files.values()].map(({ file }) => ({
        id: file.id,
        root: file.root,
        path: file.path,
        sha256: file.sha256,
        required: file.required,
        ...(file.media_type ? { media_type: file.media_type } : {}),
      })),
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

  getState(): RuntimeState {
    const current = this.getCurrentCandidate();
    return {
      packageId: current?.packageId ?? null,
      currentCandidateId: current?.contentId ?? null,
      currentRevision: current?.revision ?? null,
      diagnostics: [...this.lastDiagnostics],
    };
  }
}
