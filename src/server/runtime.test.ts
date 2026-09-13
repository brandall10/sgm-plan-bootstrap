import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { startRuntime } from "./runtime.js";

const repositoryRoot = resolve(process.cwd());

describe("P1 local runtime", () => {
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
});
