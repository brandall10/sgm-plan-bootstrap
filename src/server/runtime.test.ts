import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { startRuntime } from "./runtime.js";
import { publishPackage } from "./publication.js";
import { SnapshotStore } from "./snapshot-store.js";

const repositoryRoot = resolve(process.cwd());

async function waitFor(check: () => Promise<boolean>, timeoutMs = 4_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise<void>((resolveWait) => setTimeout(resolveWait, 25));
  }
  throw new Error(`Condition was not met within ${timeoutMs}ms.`);
}

type SseBuffer = { value: string };

async function readSseEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  buffer: SseBuffer,
  expectedEvent: string,
): Promise<unknown> {
  while (true) {
    const boundary = buffer.value.indexOf("\n\n");
    if (boundary >= 0) {
      const block = buffer.value.slice(0, boundary);
      buffer.value = buffer.value.slice(boundary + 2);
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (event === expectedEvent && data) return JSON.parse(data) as unknown;
      continue;
    }
    const chunk = await reader.read();
    if (chunk.done) throw new Error("SSE stream ended before the expected event.");
    buffer.value += new TextDecoder().decode(chunk.value);
  }
}

describe("local package runtime", () => {
  it("publishes only after durable snapshot persistence and refreshes acceptance history", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-runtime-acceptance-"));
    const packageRoot = join(temporaryRoot, "save-outcome");
    await cp(resolve(repositoryRoot, "examples/save-outcome"), packageRoot, { recursive: true });
    const runtime = await startRuntime({ packageRoot, port: 0, watch: false });

    try {
      const before = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as {
        packageId: string;
        currentCandidateId: string | null;
        currentSnapshotId: string | null;
        acceptances: Array<{ record_id: string }>;
      };
      if (!before.currentSnapshotId) throw new Error("Runtime did not publish a durable snapshot.");
      if (!before.currentCandidateId) throw new Error("Runtime did not expose its content candidate.");
      const candidateModel = await (await fetch(`http://${runtime.host}:${runtime.port}/api/candidates/${before.currentCandidateId}/model`)).json() as {
        acceptance_status: string;
        snapshot_id: string;
        readiness: string;
      };
      const snapshotStore = new SnapshotStore({ root: join(packageRoot, ".plan-package") });
      const acceptance = await snapshotStore.recordAcceptance({
        format: "plan-package-acceptance",
        format_version: "1",
        record_id: "acceptance.runtime-test",
        package_id: before.packageId,
        snapshot_id: before.currentSnapshotId,
        instruction: "I accept the saved proposal for this runtime test.",
        source: "conversation:runtime-test",
        actor: "test:runtime",
        recorded_at: "2026-09-13T16:30:00.000Z",
        illustrative: true,
      });
      expect(acceptance.created).toBe(true);
      const reloaded = await (await fetch(`http://${runtime.host}:${runtime.port}/api/reload`, { method: "POST" })).json() as {
        acceptances: Array<{ record_id: string }>;
      };
      const history = await (await fetch(`http://${runtime.host}:${runtime.port}/api/acceptances`)).json() as {
        records: Array<{ record_id: string }>;
      };
      const afterModel = await (await fetch(`http://${runtime.host}:${runtime.port}/api/candidates/${before.currentCandidateId}/model`)).json() as { acceptance_status: string };

      expect(candidateModel.acceptance_status).toBe("unverified");
      expect(candidateModel.snapshot_id).toBe(before.currentSnapshotId);
      expect(candidateModel.readiness).toBe("reviewable");
      expect(afterModel.acceptance_status).toBe("illustrative");
      expect(reloaded.acceptances.map((record) => record.record_id)).toContain("acceptance.runtime-test");
      expect(history.records.map((record) => record.record_id)).toContain("acceptance.runtime-test");
    } finally {
      await runtime.close();
    }
  });

  it("returns the immutable model and captured asset for a candidate", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-runtime-"));
    const packageRoot = join(temporaryRoot, "save-outcome");
    await cp(resolve(repositoryRoot, "examples/save-outcome"), packageRoot, { recursive: true });
    const runtime = await startRuntime({ packageRoot, port: 0 });

    try {
      const stateResponse = await fetch(`http://${runtime.host}:${runtime.port}/api/state`);
      const state = await stateResponse.json() as { currentCandidateId: string | null; packageId: string | null };
      if (!state.currentCandidateId) throw new Error("Runtime did not load the fixture.");

      const modelResponse = await fetch(`http://${runtime.host}:${runtime.port}/api/candidates/${state.currentCandidateId}/model`);
      const model = await modelResponse.json() as { package: { id: string; phases: Array<{ id: string }> }; content_id: string };
      const assetResponse = await fetch(`http://${runtime.host}:${runtime.port}/api/candidates/${state.currentCandidateId}/assets/asset.save-outcome-diagram`);
      const assetBody = new Uint8Array(await assetResponse.arrayBuffer());
      const sourceAsset = new Uint8Array(await readFile(join(packageRoot, "assets/save-outcome.svg")));

      expect(stateResponse.status).toBe(200);
      expect(state.packageId).toBe("save-outcome");
      expect(modelResponse.status).toBe(200);
      expect(model.package.id).toBe("save-outcome");
      expect(model.package.phases).toHaveLength(1);
      expect(model.content_id).toBe(state.currentCandidateId);
      expect(assetResponse.status).toBe(200);
      expect(assetResponse.headers.get("x-plan-candidate")).toBe(state.currentCandidateId);
      expect(assetBody).toEqual(sourceAsset);
    } finally {
      await runtime.close();
    }
  });

  it("does not expose a failed candidate as current state", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-runtime-invalid-"));
    const packageRoot = join(temporaryRoot, "save-outcome");
    await cp(resolve(repositoryRoot, "examples/save-outcome"), packageRoot, { recursive: true });
    const runtime = await startRuntime({ packageRoot, port: 0, manifestPath: join(packageRoot, "missing-plan.json") });

    try {
      const response = await fetch(`http://${runtime.host}:${runtime.port}/api/health`);
      const health = await response.json() as { ok: boolean; state: { currentCandidateId: string | null; diagnostics: Array<{ code: string }> } };

      expect(response.status).toBe(200);
      expect(health.ok).toBe(true);
      expect(health.state.currentCandidateId).toBeNull();
      expect(health.state.diagnostics.map((diagnostic) => diagnostic.code)).toContain("manifest-unavailable");
    } finally {
      await runtime.close();
    }
  });

  it("serves an HTML mock only through its isolated candidate-scoped route", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-runtime-prototype-"));
    const packageRoot = join(temporaryRoot, "offline-recovery");
    await cp(resolve(repositoryRoot, "examples/offline-recovery"), packageRoot, { recursive: true });
    const runtime = await startRuntime({ packageRoot, port: 0 });

    try {
      const state = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentCandidateId: string | null };
      if (!state.currentCandidateId) throw new Error("Runtime did not load the fixture.");
      const base = `http://${runtime.host}:${runtime.port}/api/candidates/${state.currentCandidateId}`;
      const rawAsset = await fetch(`${base}/assets/asset.recovery-prototype`);
      const prototype = await fetch(`${base}/prototypes/asset.recovery-prototype/`);
      const script = await fetch(`${base}/prototypes/asset.recovery-prototype/recovery-prototype.js`);
      const traversal = await fetch(`${base}/prototypes/asset.recovery-prototype/../files/file.recovery-prototype-js`);

      expect(rawAsset.status).toBe(404);
      expect(prototype.status).toBe(200);
      expect(prototype.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
      expect(prototype.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
      expect(script.status).toBe(200);
      expect(traversal.status).toBe(404);
    } finally {
      await runtime.close();
    }
  });

  it("manually reloads a newly published candidate without a server restart", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-runtime-reload-"));
    const packageRoot = join(temporaryRoot, "save-outcome");
    await cp(resolve(repositoryRoot, "examples/save-outcome"), packageRoot, { recursive: true });
    const originalRevision = (JSON.parse(await readFile(join(packageRoot, "plan.json"), "utf8")) as { revision: number }).revision;
    const runtime = await startRuntime({ packageRoot, port: 0 });

    try {
      const before = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentCandidateId: string | null; currentRevision: number | null };
      await writeFile(join(packageRoot, "docs/save-outcome-notes.md"), "Updated package text for manual reload.\n");
      await publishPackage({ packageRoot });
      const reloaded = await (await fetch(`http://${runtime.host}:${runtime.port}/api/reload`, { method: "POST" })).json() as { currentCandidateId: string | null; currentRevision: number | null };

      expect(before.currentCandidateId).not.toBeNull();
      expect(reloaded.currentRevision).toBe(originalRevision + 1);
      expect(reloaded.currentCandidateId).not.toBe(before.currentCandidateId);
    } finally {
      await runtime.close();
    }
  });

  it("publishes filesystem changes, retains the last valid candidate, and recovers", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-runtime-watch-"));
    const packageRoot = join(temporaryRoot, "save-outcome");
    await cp(resolve(repositoryRoot, "examples/save-outcome"), packageRoot, { recursive: true });
    const originalRevision = (JSON.parse(await readFile(join(packageRoot, "plan.json"), "utf8")) as { revision: number }).revision;
    const runtime = await startRuntime({ packageRoot, port: 0, watchDebounceMs: 30 });

    try {
      const before = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentCandidateId: string | null; currentRevision: number | null };
      const notePath = join(packageRoot, "docs/save-outcome-notes.md");
      const assetPath = join(packageRoot, "assets/save-outcome.svg");
      const originalAsset = await readFile(assetPath);
      await writeFile(notePath, "A watched text update is published atomically.\n");
      const firstPublish = await publishPackage({ packageRoot });

      expect(firstPublish.published).toBe(true);
      await waitFor(async () => {
        const state = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentRevision: number | null };
        return state.currentRevision === originalRevision + 1;
      });
      const afterText = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentCandidateId: string | null; currentRevision: number | null; lastAttempt: string };
      expect(afterText.currentRevision).toBe(originalRevision + 1);
      expect(afterText.currentCandidateId).not.toBe(before.currentCandidateId);
      expect(afterText.lastAttempt).toBe("published");

      await writeFile(notePath, "An interrupted multi-file save is not yet coherent.\n");
      await writeFile(assetPath, "not an svg yet\n");
      await waitFor(async () => {
        const state = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentCandidateId: string | null; currentRevision: number | null; diagnostics: Array<{ code: string }>; lastAttempt: string };
        return state.lastAttempt === "rejected" && state.currentRevision === originalRevision + 1 && state.diagnostics.some((diagnostic) => diagnostic.code === "digest-mismatch");
      });
      const rejected = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentCandidateId: string | null; currentRevision: number | null; diagnostics: Array<{ code: string }> };
      expect(rejected.currentCandidateId).toBe(afterText.currentCandidateId);
      expect(rejected.currentRevision).toBe(originalRevision + 1);
      const retained = runtime.store.getCurrentCandidate();
      expect(retained?.getFileBytes("file.save-outcome-notes")).toEqual(new TextEncoder().encode("A watched text update is published atomically.\n"));

      await writeFile(assetPath, originalAsset);
      const secondPublish = await publishPackage({ packageRoot });
      expect(secondPublish.published).toBe(true);
      await waitFor(async () => {
        const state = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentRevision: number | null };
        return state.currentRevision === originalRevision + 2;
      });
      const recovered = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentCandidateId: string | null; currentRevision: number | null; lastAttempt: string };
      expect(recovered.currentRevision).toBe(originalRevision + 2);
      expect(recovered.currentCandidateId).not.toBe(rejected.currentCandidateId);
      expect(recovered.lastAttempt).toBe("published");
      const assetResponse = await fetch(`http://${runtime.host}:${runtime.port}/api/candidates/${recovered.currentCandidateId}/assets/asset.save-outcome-diagram`);
      expect(new Uint8Array(await assetResponse.arrayBuffer())).toEqual(new Uint8Array(originalAsset));
    } finally {
      await runtime.close();
    }
  });

  it("serves initial invalid packages once they become valid without restarting", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-runtime-invalid-watch-"));
    const packageRoot = join(temporaryRoot, "save-outcome");
    await cp(resolve(repositoryRoot, "examples/save-outcome"), packageRoot, { recursive: true });
    const manifestPath = join(packageRoot, "plan.json");
    const originalManifest = await readFile(manifestPath);
    const originalRevision = (JSON.parse(new TextDecoder().decode(originalManifest)) as { revision: number }).revision;
    await writeFile(manifestPath, "{\n");
    const runtime = await startRuntime({ packageRoot, port: 0, watchDebounceMs: 30 });

    try {
      await waitFor(async () => {
        const state = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentCandidateId: string | null; diagnostics: Array<{ code: string }>; lastAttempt: string };
        return state.currentCandidateId === null && state.lastAttempt === "rejected" && state.diagnostics.some((diagnostic) => diagnostic.code === "malformed-json");
      });
      await writeFile(manifestPath, originalManifest);
      await waitFor(async () => {
        const state = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentCandidateId: string | null; lastAttempt: string };
        return state.currentCandidateId !== null && state.lastAttempt === "published";
      });
      const recovered = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentCandidateId: string | null; currentRevision: number | null };
      expect(recovered.currentCandidateId).not.toBeNull();
      expect(recovered.currentRevision).toBe(originalRevision);
    } finally {
      await runtime.close();
    }
  });

  it("rediscovers and watches a dependency introduced by a valid manifest", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-runtime-new-dependency-"));
    const packageRoot = join(temporaryRoot, "save-outcome");
    await cp(resolve(repositoryRoot, "examples/save-outcome"), packageRoot, { recursive: true });
    const dependencyPath = join(packageRoot, "new-dependencies/nested/notes.md");
    await mkdir(join(packageRoot, "new-dependencies/nested"), { recursive: true });
    await writeFile(dependencyPath, "The newly declared dependency.\n");
    const manifestPath = join(packageRoot, "plan.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      revision: number;
      files: Array<{ id: string; root: string; path: string; sha256: string; required: boolean }>;
    };
    const originalRevision = manifest.revision;
    manifest.files.push({ id: "file.new-dependency", root: "package", path: "new-dependencies/nested/notes.md", sha256: "0".repeat(64), required: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const runtime = await startRuntime({ packageRoot, port: 0, watchDebounceMs: 30 });

    try {
      const published = await publishPackage({ packageRoot });
      expect(published.published).toBe(true);
      await waitFor(async () => {
        const state = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentRevision: number | null };
        return state.currentRevision === originalRevision + 1;
      });

      await writeFile(dependencyPath, "The dependency changed after it was discovered.\n");
      await waitFor(async () => {
        const state = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentRevision: number | null; lastAttempt: string; diagnostics: Array<{ code: string }> };
        return state.currentRevision === originalRevision + 1 && state.lastAttempt === "rejected" && state.diagnostics.some((diagnostic) => diagnostic.code === "digest-mismatch");
      });
      await publishPackage({ packageRoot });
      await waitFor(async () => {
        const state = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentRevision: number | null; lastAttempt: string };
        return state.currentRevision === originalRevision + 2 && state.lastAttempt === "published";
      });
    } finally {
      await runtime.close();
    }
  });

  it("streams initial, published, and rejected runtime state events", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-runtime-events-"));
    const packageRoot = join(temporaryRoot, "save-outcome");
    await cp(resolve(repositoryRoot, "examples/save-outcome"), packageRoot, { recursive: true });
    const originalRevision = (JSON.parse(await readFile(join(packageRoot, "plan.json"), "utf8")) as { revision: number }).revision;
    const runtime = await startRuntime({ packageRoot, port: 0, watch: false });
    const eventResponse = await fetch(`http://${runtime.host}:${runtime.port}/api/events`);
    const reader = eventResponse.body?.getReader();
    if (!reader) throw new Error("Runtime event stream has no body.");
    const buffer: SseBuffer = { value: "" };

    try {
      expect(eventResponse.headers.get("content-type")).toContain("text/event-stream");
      const initial = await readSseEvent(reader, buffer, "state") as { currentRevision: number; lastAttempt: string };
      expect(initial.currentRevision).toBe(originalRevision);
      expect(initial.lastAttempt).toBe("published");

      await writeFile(join(packageRoot, "docs/save-outcome-notes.md"), "stale bytes before publication\n");
      const rejectedResponse = await fetch(`http://${runtime.host}:${runtime.port}/api/reload`, { method: "POST" });
      expect(rejectedResponse.status).toBe(200);
      const rejected = await readSseEvent(reader, buffer, "candidate-rejected") as { currentRevision: number; lastAttempt: string; diagnostics: Array<{ code: string }> };
      expect(rejected.currentRevision).toBe(originalRevision);
      expect(rejected.lastAttempt).toBe("rejected");
      expect(rejected.diagnostics.map((diagnostic) => diagnostic.code)).toContain("digest-mismatch");

      await reader.cancel();
    } finally {
      await runtime.close();
    }
  });
});
