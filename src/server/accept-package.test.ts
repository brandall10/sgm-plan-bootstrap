import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CandidateStore } from "./candidate-store.js";
import { SnapshotStore } from "./snapshot-store.js";

const runFile = promisify(execFile);
const repositoryRoot = resolve(process.cwd());

describe("acceptance command", () => {
  it("requires and records the explicitly selected snapshot", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-accept-command-"));
    const packageRoot = join(temporaryRoot, "save-outcome");
    await cp(resolve(repositoryRoot, "examples/save-outcome"), packageRoot, { recursive: true });
    const candidate = await new CandidateStore().loadAndPublish({ packageRoot });
    if (!candidate?.snapshotId) throw new Error("Candidate should have a durable snapshot.");
    const instructionPath = join(temporaryRoot, "acceptance.txt");
    await writeFile(instructionPath, "I accept this exact saved proposal.\n");
    const cli = join(repositoryRoot, "node_modules/.bin/tsx");
    const args = [
      "src/server/accept-package.ts",
      "--package", packageRoot,
      "--snapshot-id", candidate.snapshotId,
      "--record-id", "acceptance.cli-test",
      "--actor", "user:cli-test",
      "--source", "conversation:cli-test",
      "--instruction-file", instructionPath,
    ];

    const first = await runFile(cli, args, { cwd: repositoryRoot });
    const retry = await runFile(cli, args, { cwd: repositoryRoot });
    const history = await new SnapshotStore({ root: join(packageRoot, ".plan-package") }).listAcceptances("save-outcome");

    expect(first.stdout).toContain("Recorded acceptance acceptance.cli-test");
    expect(retry.stdout).toContain("Acceptance already recorded acceptance.cli-test");
    expect(history.records.map((record) => record.record_id)).toContain("acceptance.cli-test");
  });
});
