import { watch } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { FSWatcher } from "node:fs";

import type { CandidateLoadOptions } from "./candidate-loader.js";
import type { CandidateStore } from "./candidate-store.js";

export interface PackageWatcherOptions {
  store: CandidateStore;
  loadOptions: CandidateLoadOptions;
  debounceMs?: number;
  onWatchError?: (error: Error, path: string) => void;
}

async function existingWatchPath(path: string): Promise<string | null> {
  let current = path;
  while (true) {
    try {
      await stat(current);
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return null;
      current = parent;
    }
  }
}

/**
 * Watches the package manifest, captured declared files, and only the parent
 * directories needed to observe atomic replacement and missing-file recovery.
 * The store owns candidate publication and generation fencing; this class
 * only turns filesystem activity into debounced load attempts.
 */
export class PackageWatcher {
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly debounceMs: number;
  private readonly store: CandidateStore;
  private readonly loadOptions: CandidateLoadOptions;
  private readonly onWatchError?: (error: Error, path: string) => void;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private reloadRequested = false;
  private reloadInFlight: Promise<void> | null = null;
  private closed = false;

  constructor(options: PackageWatcherOptions) {
    this.store = options.store;
    this.loadOptions = options.loadOptions;
    this.debounceMs = Math.max(0, options.debounceMs ?? 100);
    this.onWatchError = options.onWatchError;
  }

  async start(): Promise<void> {
    this.closed = false;
    await this.refreshTargets();
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
    await this.reloadInFlight;
  }

  private async watchPaths(): Promise<Set<string>> {
    const paths = new Set<string>();
    const manifestPath = resolve(this.loadOptions.manifestPath ?? join(this.loadOptions.packageRoot, "plan.json"));
    paths.add(manifestPath);
    paths.add(dirname(manifestPath));
    // Acceptance records are outside the draft manifest but their appearance
    // refreshes the same runtime state/event stream. Never watch blobs or
    // descriptors, which are immutable implementation details of the store.
    paths.add(join(this.loadOptions.packageRoot, ".plan-package", "acceptances"));

    const candidate = this.store.getCurrentCandidate();
    for (const file of candidate?.plan.files ?? []) {
      const root = file.root === "package" ? this.loadOptions.packageRoot : this.loadOptions.repositoryRoot;
      if (!root) continue;
      const absolutePath = resolve(root, file.path);
      paths.add(absolutePath);
      paths.add(dirname(absolutePath));
    }

    const existingPaths = new Set<string>();
    for (const path of paths) {
      const existing = await existingWatchPath(path);
      if (existing) existingPaths.add(existing);
    }
    return existingPaths;
  }

  private async refreshTargets(): Promise<void> {
    if (this.closed) return;
    const nextPaths = await this.watchPaths();
    for (const [path, watcher] of this.watchers) {
      if (nextPaths.has(path)) continue;
      watcher.close();
      this.watchers.delete(path);
    }
    for (const path of nextPaths) {
      if (this.watchers.has(path)) continue;
      try {
        const watcher = watch(path, () => this.scheduleReload());
        watcher.on("error", (error) => this.onWatchError?.(error, path));
        this.watchers.set(path, watcher);
      } catch (error) {
        this.onWatchError?.(error instanceof Error ? error : new Error(String(error)), path);
      }
    }
  }

  private scheduleReload(): void {
    if (this.closed) return;
    this.reloadRequested = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flushReload();
    }, this.debounceMs);
  }

  private async flushReload(): Promise<void> {
    if (this.closed || this.reloadInFlight) return;
    this.reloadRequested = false;
    const reload = (async () => {
      await this.store.loadAndPublish(this.loadOptions);
      if (!this.closed) await this.refreshTargets();
    })();
    this.reloadInFlight = reload;
    try {
      await reload;
    } finally {
      this.reloadInFlight = null;
      if (!this.closed && this.reloadRequested && !this.timer) void this.flushReload();
    }
  }
}
