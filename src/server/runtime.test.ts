import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { startRuntime } from "./runtime.js";
import { publishPackage } from "./publication.js";

const repositoryRoot = resolve(process.cwd());

describe("local package runtime", () => {
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
    const runtime = await startRuntime({ packageRoot, port: 0 });

    try {
      const before = await (await fetch(`http://${runtime.host}:${runtime.port}/api/state`)).json() as { currentCandidateId: string | null; currentRevision: number | null };
      await writeFile(join(packageRoot, "docs/save-outcome-notes.md"), "Updated package text for manual reload.\n");
      await publishPackage({ packageRoot });
      const reloaded = await (await fetch(`http://${runtime.host}:${runtime.port}/api/reload`, { method: "POST" })).json() as { currentCandidateId: string | null; currentRevision: number | null };

      expect(before.currentCandidateId).not.toBeNull();
      expect(reloaded.currentRevision).toBe(2);
      expect(reloaded.currentCandidateId).not.toBe(before.currentCandidateId);
    } finally {
      await runtime.close();
    }
  });
});
