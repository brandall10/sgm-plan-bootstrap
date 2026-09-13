import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { startRuntime } from "./runtime.js";
import { publishPackage } from "./publication.js";
import { SnapshotStore } from "./snapshot-store.js";

const repositoryRoot = resolve(process.cwd());

async function copyFixture(name: string): Promise<{ packageRoot: string }> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-history-runtime-"));
  const packageRoot = join(temporaryRoot, name);
  await cp(resolve(repositoryRoot, "examples", name), packageRoot, { recursive: true });
  return { packageRoot };
}

describe("history and pinned runtime views", () => {
  it("keeps an accepted snapshot pinned while comparing a later draft and its prototype dependency", async () => {
    const fixture = await copyFixture("offline-recovery");
    const runtime = await startRuntime({ packageRoot: fixture.packageRoot, port: 0, watch: false });
    try {
      const initialState = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as {
        packageId: string;
        currentSnapshotId: string;
        currentCandidateId: string;
      };
      const acceptedSnapshotId = initialState.currentSnapshotId;
      const snapshotStore = new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") });
      const acceptance = await snapshotStore.recordAcceptance({
        format: "plan-package-acceptance",
        format_version: "1",
        record_id: "acceptance.history-runtime",
        package_id: initialState.packageId,
        snapshot_id: acceptedSnapshotId,
        instruction: "I accept this exact recovery proposal.",
        source: "conversation:history-runtime",
        actor: "user:history-runtime",
        recorded_at: "2026-09-13T17:00:00.000Z",
        illustrative: false,
      });
      expect(acceptance.created).toBe(true);

      const notesPath = join(fixture.packageRoot, "docs/behavior-notes.md");
      const cssPath = join(fixture.packageRoot, "designs/recovery-prototype.css");
      const oldCss = await readFile(cssPath);
      await writeFile(notesPath, "The revised recovery wording is explicit.\n");
      await writeFile(cssPath, "body { background: #fef3c7; }\n");
      expect((await publishPackage({ packageRoot: fixture.packageRoot })).published).toBe(true);

      const reloaded = await (await fetch(`http://${runtime.host}:${runtime.port}/api/reload`, { method: "POST" })).json() as {
        defaultView: { kind: string; snapshot_id: string | null };
        currentSnapshotId: string;
        currentCandidateId: string;
      };
      expect(reloaded.defaultView).toEqual({ kind: "snapshot", snapshot_id: acceptedSnapshotId, candidate_id: null });
      expect(reloaded.currentSnapshotId).not.toBe(acceptedSnapshotId);

      const history = await (await fetch(`http://${runtime.host}:${runtime.port}/api/history`)).json() as {
        snapshots: Array<{ snapshot_id: string; acceptance_status: string }>;
      };
      expect(history.snapshots.map((snapshot) => snapshot.snapshot_id)).toEqual(expect.arrayContaining([acceptedSnapshotId, reloaded.currentSnapshotId]));
      expect(history.snapshots.find((snapshot) => snapshot.snapshot_id === acceptedSnapshotId)?.acceptance_status).toBe("accepted");

      const acceptedModelResponse = await fetch(`http://${runtime.host}:${runtime.port}/api/snapshots/${acceptedSnapshotId}/model`);
      const acceptedModel = await acceptedModelResponse.json() as { view_kind: string; acceptance_status: string; acceptance_provenance: { actor: string } | null };
      expect(acceptedModelResponse.status).toBe(200);
      expect(acceptedModel.view_kind).toBe("snapshot");
      expect(acceptedModel.acceptance_status).toBe("accepted");
      expect(acceptedModel.acceptance_provenance?.actor).toBe("user:history-runtime");

      const draftModelResponse = await fetch(`http://${runtime.host}:${runtime.port}/api/draft/model`);
      const draftModel = await draftModelResponse.json() as { view_kind: string; revision: number };
      expect(draftModelResponse.status).toBe(200);
      expect(draftModel.view_kind).toBe("draft");
      expect(draftModel.revision).toBeGreaterThan(2);

      const oldPrototype = await fetch(`http://${runtime.host}:${runtime.port}/api/snapshots/${acceptedSnapshotId}/prototypes/asset.recovery-prototype/recovery-prototype.css`);
      const newPrototype = await fetch(`http://${runtime.host}:${runtime.port}/api/draft/prototypes/asset.recovery-prototype/recovery-prototype.css`);
      expect(new Uint8Array(await oldPrototype.arrayBuffer())).toEqual(new Uint8Array(oldCss));
      expect(new TextDecoder().decode(await newPrototype.arrayBuffer())).toContain("#fef3c7");

      const comparisonResponse = await fetch(`http://${runtime.host}:${runtime.port}/api/compare?from=${acceptedSnapshotId}&to=draft`);
      const comparison = await comparisonResponse.json() as {
        valid: boolean;
        value: { changes: Array<{ category: string; id: string; affected_asset_ids: string[] }> };
      };
      expect(comparisonResponse.status).toBe(200);
      expect(comparison.valid).toBe(true);
      const dependencyChange = comparison.value.changes.find((change) => change.category === "file" && change.id === "file.recovery-prototype-css");
      expect(dependencyChange?.affected_asset_ids).toContain("asset.recovery-prototype");
      expect(comparison.value.changes.some((change) => change.category === "file" && change.id === "file.behavior-notes")).toBe(true);
    } finally {
      await runtime.close();
    }
  });

  it("orders multiple acceptances, excludes illustrative defaults, and rechecks corrupt pinned snapshots", async () => {
    const fixture = await copyFixture("save-outcome");
    const runtime = await startRuntime({ packageRoot: fixture.packageRoot, port: 0, watch: false });
    try {
      const base = `http://${runtime.host}:${runtime.port}`;
      const initial = await (await fetch(`${base}/api/state`)).json() as { packageId: string; currentSnapshotId: string };
      const snapshotStore = new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") });
      const firstSnapshotId = initial.currentSnapshotId;
      await snapshotStore.recordAcceptance({
        format: "plan-package-acceptance",
        format_version: "1",
        record_id: "acceptance.history-illustrative",
        package_id: initial.packageId,
        snapshot_id: firstSnapshotId,
        instruction: "Use this only as a review illustration.",
        source: "conversation:history-illustrative",
        actor: "test:history",
        recorded_at: "2026-09-13T17:00:00.000Z",
        illustrative: true,
      });

      await writeFile(join(fixture.packageRoot, "docs/save-outcome-notes.md"), "A later draft remains distinct from the accepted proposal.\n");
      expect((await publishPackage({ packageRoot: fixture.packageRoot })).published).toBe(true);
      const second = await (await fetch(`${base}/api/reload`, { method: "POST" })).json() as { packageId: string; currentSnapshotId: string };
      const secondSnapshotId = second.currentSnapshotId;
      expect(secondSnapshotId).not.toBe(firstSnapshotId);
      await snapshotStore.recordAcceptance({
        format: "plan-package-acceptance",
        format_version: "1",
        record_id: "acceptance.history-real-new",
        package_id: second.packageId,
        snapshot_id: secondSnapshotId,
        instruction: "I accept this later proposal.",
        source: "conversation:history-real-new",
        actor: "test:history",
        recorded_at: "2026-09-13T18:00:00.000Z",
        illustrative: false,
      });
      await (await fetch(`${base}/api/reload`, { method: "POST" })).json();

      const latestReal = await (await fetch(`${base}/api/state`)).json() as { defaultView: { kind: string; snapshot_id: string | null }; acceptances: Array<{ record_id: string }> };
      expect(latestReal.defaultView).toEqual({ kind: "snapshot", snapshot_id: secondSnapshotId, candidate_id: null });
      expect(latestReal.acceptances.map((record) => record.record_id)).toEqual([
        "acceptance.history-illustrative",
        "acceptance.history-real-new",
      ]);

      await snapshotStore.recordAcceptance({
        format: "plan-package-acceptance",
        format_version: "1",
        record_id: "acceptance.history-real-old",
        package_id: initial.packageId,
        snapshot_id: firstSnapshotId,
        instruction: "I accept the earlier proposal after reconsideration.",
        source: "conversation:history-real-old",
        actor: "test:history",
        recorded_at: "2026-09-13T19:00:00.000Z",
        illustrative: false,
      });
      const reordered = await (await fetch(`${base}/api/reload`, { method: "POST" })).json() as { defaultView: { kind: string; snapshot_id: string | null }; acceptances: Array<{ record_id: string }> };
      expect(reordered.defaultView).toEqual({ kind: "snapshot", snapshot_id: firstSnapshotId, candidate_id: null });
      expect(reordered.acceptances.map((record) => record.record_id)).toEqual([
        "acceptance.history-illustrative",
        "acceptance.history-real-new",
        "acceptance.history-real-old",
      ]);

      const descriptor = JSON.parse(await readFile(join(fixture.packageRoot, ".plan-package", "snapshots", `${firstSnapshotId}.json`), "utf8")) as { manifest_sha256: string };
      await writeFile(join(fixture.packageRoot, ".plan-package", "blobs", descriptor.manifest_sha256), "corrupt pinned manifest\n");
      const pinned = await fetch(`${base}/api/snapshots/${firstSnapshotId}/model`);
      const pinnedBody = await pinned.json() as { diagnostics: Array<{ code: string }> };
      expect(pinned.status).toBe(404);
      expect(pinnedBody.diagnostics.map((diagnostic) => diagnostic.code)).toContain("snapshot-blob-corrupt");

      const recoveredState = await (await fetch(`${base}/api/reload`, { method: "POST" })).json() as {
        defaultView: { kind: string; snapshot_id: string | null };
        acceptanceDiagnostics: Array<{ code: string }>;
      };
      expect(recoveredState.defaultView).toEqual({ kind: "snapshot", snapshot_id: secondSnapshotId, candidate_id: null });
      expect(recoveredState.acceptanceDiagnostics.map((diagnostic) => diagnostic.code)).toContain("acceptance-snapshot-unavailable");
    } finally {
      await runtime.close();
    }
  });
});
