import { cp, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CandidateStore } from "./candidate-store.js";
import { parsePlanCliArgs, runPlanCli, type PlanCliOptions } from "./plan-cli.js";
import { SnapshotStore } from "./snapshot-store.js";
import type { ResultRecord } from "../core/result.js";

const repositoryRoot = resolve(process.cwd());

async function copyFixture(name: string): Promise<string> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-cli-"));
  const packageRoot = join(temporaryRoot, name);
  await cp(resolve(repositoryRoot, "examples", name), packageRoot, { recursive: true });
  return packageRoot;
}

async function publishAndAccept(packageRoot: string, illustrative = false): Promise<{ snapshotId: string; store: SnapshotStore }> {
  const candidate = await new CandidateStore().loadAndPublish({ packageRoot });
  if (!candidate?.snapshotId) throw new Error("Fixture did not publish a durable snapshot.");
  const store = new SnapshotStore({ root: join(packageRoot, ".plan-package") });
  const acceptance = await store.recordAcceptance({
    format: "plan-package-acceptance",
    format_version: "1",
    record_id: illustrative ? "acceptance.cli-illustrative" : "acceptance.cli-real",
    package_id: candidate.packageId,
    snapshot_id: candidate.snapshotId,
    instruction: illustrative ? "Illustrative acceptance." : "I accept this proposal for the CLI test.",
    source: "test:plan-cli",
    actor: "agent:plan-cli-test",
    recorded_at: illustrative ? "2026-09-15T10:00:00.000Z" : "2026-09-15T11:00:00.000Z",
    illustrative,
  });
  if (!acceptance.record) throw new Error(acceptance.diagnostics.map((diagnostic) => diagnostic.message).join("; "));
  return { snapshotId: candidate.snapshotId, store };
}

function cliOptions(overrides: Partial<PlanCliOptions> = {}): PlanCliOptions {
  return {
    command: "context",
    packagePath: "",
    refs: [],
    compareDraft: false,
    ...overrides,
  };
}

function resultFor(snapshotId: string): ResultRecord {
  return {
    format: "plan-package-result",
    format_version: "1",
    result_id: "result.cli-current",
    package_id: "save-outcome",
    snapshot_id: snapshotId,
    phase_id: "phase.save-outcome",
    activity: "implement",
    author: "agent:plan-cli-test",
    recorded_at: "2026-09-15T12:00:00.000Z",
    code_revision: "cli-test-revision",
    environment: { runner: "vitest" },
    related_item_ids: ["criterion.successful-save"],
    intended_work: [{ id: "intent.cli", text_md: "Implement the CLI boundary.", disposition: "intended", related_item_ids: ["task.save-outcome-implementation"] }],
    observed_facts: [{ id: "fact.cli", text_md: "The CLI can recover this result.", disposition: "observed", related_item_ids: ["criterion.successful-save"] }],
    inferences: [],
    unverified_claims: [],
    produced_interfaces: [{ id: "interface.cli", name: "CLI context", description_md: "Returns attributed Markdown context.", disposition: "observed", related_item_ids: ["criterion.successful-save"] }],
    deviations: [],
    unresolved_findings: [],
    evidence: [{ id: "evidence.cli", kind: "test", label: "CLI test", locator: "plan-cli.test.ts", code_revision: "cli-test-revision", statement_ids: ["fact.cli"], status: "current" }],
    delivery_facts: { review_status: "not-reviewed", integration_status: "not-integrated" },
    continuation_notes: [],
    supersedes: [],
    illustrative: false,
  };
}

describe("package-local plan CLI", () => {
  it("parses only operation-specific flags and requires explicit context identity", () => {
    const parsed = parsePlanCliArgs([
      "context",
      "--package", "examples/save-outcome",
      "--snapshot", "a".repeat(64),
      "--phase", "phase.save-outcome",
      "--activity", "verify",
      "--max-chars", "4000",
    ]);
    expect(parsed.error).toBeNull();
    expect(parsed.options).toMatchObject({ command: "context", phaseId: "phase.save-outcome", activity: "verify", maxChars: 4000 });

    expect(parsePlanCliArgs(["context", "--package", "fixture", "--snapshot", "a".repeat(64), "--phase", "phase.x"]).error).toContain("--activity");
    expect(parsePlanCliArgs(["current", "--package", "fixture", "--unknown"]).error).toContain("Unknown");
    expect(parsePlanCliArgs(["expand", "--package", "fixture", "--snapshot", "a".repeat(64)]).error).toContain("--refs");
  });

  it("renders accepted current/context output with retained result provenance", async () => {
    const packageRoot = await copyFixture("save-outcome");
    const { snapshotId, store } = await publishAndAccept(packageRoot);
    const recorded = await store.recordResult(resultFor(snapshotId));
    expect(recorded.created).toBe(true);

    const current = await runPlanCli(cliOptions({ command: "current", packagePath: packageRoot }));
    expect(current.exitCode).toBe(0);
    expect(current.output).toContain("status: ACCEPTED");
    expect(current.output).toContain(snapshotId);
    expect(current.output).toContain("result.cli-current");
    expect(current.output).toContain("cli-test-revision");

    const context = await runPlanCli(cliOptions({
      packagePath: packageRoot,
      snapshotId,
      phaseId: "phase.save-outcome",
      activity: "verify",
    }));
    expect(context.exitCode).toBe(0);
    expect(context.output).toContain("status: READY");
    expect(context.output).toContain("Verify successful read-back and failed-write preservation before reporting the outcome.");
    expect(context.output).toContain("A successful write returns saved only after the persisted snapshot can be read back.");
    expect(context.output).toContain("source_identity:");
    expect(context.output).toContain("Available expansions");
  });

  it("labels an unaccepted snapshot as blocked without draft fallback", async () => {
    const packageRoot = await copyFixture("save-outcome");
    const candidate = await new CandidateStore().loadAndPublish({ packageRoot });
    if (!candidate?.snapshotId) throw new Error("Fixture did not publish a snapshot.");

    const current = await runPlanCli(cliOptions({ command: "current", packagePath: packageRoot }));
    expect(current.exitCode).toBe(1);
    expect(current.output).toContain("UNACCEPTED");
    expect(current.output).toContain("no draft was substituted");

    const context = await runPlanCli(cliOptions({ packagePath: packageRoot, snapshotId: candidate.snapshotId, phaseId: "phase.save-outcome", activity: "implement" }));
    expect(context.exitCode).toBe(1);
    expect(context.output).toContain("status: BLOCKED");
    expect(context.output).toContain("snapshot-acceptance-unverified");
    expect(context.output).toContain("not executable");
  });

  it("expands retained text and immutable routes after live source removal", async () => {
    const packageRoot = await copyFixture("save-outcome");
    const { snapshotId } = await publishAndAccept(packageRoot);
    await unlink(join(packageRoot, "docs/save-outcome-notes.md"));
    await unlink(join(packageRoot, "assets/save-outcome.svg"));

    const expanded = await runPlanCli(cliOptions({
      command: "expand",
      packagePath: packageRoot,
      snapshotId,
      refs: ["reference.save-outcome-notes", "asset.save-outcome-diagram"],
    }));
    expect(expanded.exitCode).toBe(0);
    expect(expanded.output).toContain("A short independently worded explanation of the result contract.");
    expect(expanded.output).toContain(`/api/snapshots/${snapshotId}/files/file.save-outcome-notes`);
    expect(expanded.output).toContain(`/api/snapshots/${snapshotId}/assets/asset.save-outcome-diagram`);
  });

  it("labels a changed working draft and keeps it outside the accepted context", async () => {
    const packageRoot = await copyFixture("save-outcome");
    const { snapshotId } = await publishAndAccept(packageRoot);
    const manifestPath = join(packageRoot, "plan.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { goal_md: string };
    manifest.goal_md = "A changed draft goal that must not enter the accepted handoff.";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const context = await runPlanCli(cliOptions({
      packagePath: packageRoot,
      snapshotId,
      phaseId: "phase.save-outcome",
      activity: "implement",
      compareDraft: true,
    }));
    expect(context.exitCode).toBe(0);
    expect(context.output).toContain("CHANGED");
    expect(context.output).toContain("W02 comparison:");
    expect(context.output).toContain("accepted baseline remains snapshot");
    expect(context.output).toContain("Tell a caller whether completed practice progress was actually persisted.");
    expect(context.output).not.toContain("A changed draft goal that must not enter the accepted handoff.");
  });

  it("rejects cross-snapshot expansion and never truncates governing text", async () => {
    const packageRoot = await copyFixture("save-outcome");
    const { snapshotId } = await publishAndAccept(packageRoot);
    const otherSnapshotId = "f".repeat(64);
    const crossSnapshot = await runPlanCli(cliOptions({
      command: "expand",
      packagePath: packageRoot,
      snapshotId,
      refs: [`${otherSnapshotId}:reference.save-outcome-notes`],
    }));
    expect(crossSnapshot.exitCode).toBe(1);
    expect(crossSnapshot.output).toContain("cross-snapshot-expansion");
    expect(crossSnapshot.output).not.toContain("A short independently worded explanation of the result contract.");

    const bounded = await runPlanCli(cliOptions({
      packagePath: packageRoot,
      snapshotId,
      phaseId: "phase.save-outcome",
      activity: "implement",
      maxChars: 1,
    }));
    expect(bounded.exitCode).toBe(1);
    expect(bounded.output).toContain("INCOMPLETE");
    expect(bounded.output).toContain("Required omitted IDs");
    expect(bounded.output).toContain("exact token count: not reported");
    expect(bounded.output).not.toContain("Give a learner an honest way");
  });
});
