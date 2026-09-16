import { cp, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CandidateStore } from "./candidate-store.js";
import { parsePlanCliArgs, runPlanCli, type PlanCliOptions } from "./plan-cli.js";
import { validatePlanCliResponse, type PlanCliResponse } from "./plan-cli-response.js";
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

function parsedResponse(output: string): PlanCliResponse {
  const response = JSON.parse(output) as unknown;
  const validated = validatePlanCliResponse(response);
  expect(validated.valid, validated.errors.join("; ")).toBe(true);
  if (!validated.value) throw new Error("Expected a validated public response.");
  return validated.value;
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
    expect(parsed.options).toMatchObject({ command: "context", phaseId: "phase.save-outcome", activity: "verify", maxChars: 4000, format: "json" });
    expect(parsePlanCliArgs(["current", "--package", "fixture", "--format", "markdown"]).options?.format).toBe("markdown");

    expect(parsePlanCliArgs(["context", "--package", "fixture", "--snapshot", "a".repeat(64), "--phase", "phase.x"]).error).toContain("--activity");
    expect(parsePlanCliArgs(["current", "--package", "fixture", "--unknown"]).error).toContain("Unknown");
    expect(parsePlanCliArgs(["expand", "--package", "fixture", "--snapshot", "a".repeat(64)]).error).toContain("--refs");
  });

  it("emits validated JSON by default and renders the same context explicitly as Markdown", async () => {
    const packageRoot = await copyFixture("save-outcome");
    const { snapshotId, store } = await publishAndAccept(packageRoot);
    const recorded = await store.recordResult(resultFor(snapshotId));
    expect(recorded.created).toBe(true);

    const current = await runPlanCli(cliOptions({ command: "current", packagePath: packageRoot }));
    expect(current.exitCode).toBe(0);
    const currentResponse = parsedResponse(current.output);
    expect(currentResponse).toMatchObject({
      operation: "current",
      outcome: "ok",
      completeness: "complete",
      source: { snapshot_id: snapshotId, acceptance_status: "accepted", result_ids: ["result.cli-current"], code_revisions: ["cli-test-revision"] },
    });

    const context = await runPlanCli(cliOptions({
      packagePath: packageRoot,
      snapshotId,
      phaseId: "phase.save-outcome",
      activity: "verify",
    }));
    expect(context.exitCode).toBe(0);
    const contextResponse = parsedResponse(context.output);
    expect(contextResponse).toMatchObject({
      operation: "context",
      source: { snapshot_id: snapshotId, acceptance_status: "accepted" },
      coverage: "complete",
      completeness: "complete",
      readiness: { state: "ready" },
    });
    expect(JSON.stringify(contextResponse)).toContain("Verify successful read-back and failed-write preservation before reporting the outcome.");
    expect(JSON.stringify(contextResponse)).toContain("A successful write returns saved only after the persisted snapshot can be read back.");

    const markdown = await runPlanCli(cliOptions({
      packagePath: packageRoot,
      snapshotId,
      phaseId: "phase.save-outcome",
      activity: "verify",
      format: "markdown",
    }));
    expect(markdown.exitCode).toBe(0);
    expect(markdown.output).toContain("status: READY");
    expect(markdown.output).toContain("Verify successful read-back and failed-write preservation before reporting the outcome.");
    expect(markdown.output).toContain("A successful write returns saved only after the persisted snapshot can be read back.");
    expect(markdown.output).toContain("source_identity:");
    expect(markdown.output).toContain("Available expansions");
  });

  it("labels an unaccepted snapshot as blocked without draft fallback", async () => {
    const packageRoot = await copyFixture("save-outcome");
    const candidate = await new CandidateStore().loadAndPublish({ packageRoot });
    if (!candidate?.snapshotId) throw new Error("Fixture did not publish a snapshot.");

    const current = await runPlanCli(cliOptions({ command: "current", packagePath: packageRoot }));
    expect(current.exitCode).toBe(1);
    expect(parsedResponse(current.output)).toMatchObject({
      operation: "current",
      source: { acceptance_status: "unverified" },
      readiness: { state: "blocked" },
      data: { accepted_baseline: { state: "unavailable" } },
    });

    const context = await runPlanCli(cliOptions({ packagePath: packageRoot, snapshotId: candidate.snapshotId, phaseId: "phase.save-outcome", activity: "implement" }));
    expect(context.exitCode).toBe(1);
    expect(parsedResponse(context.output)).toMatchObject({
      operation: "context",
      source: { snapshot_id: candidate.snapshotId, acceptance_status: "unverified" },
      readiness: { state: "blocked" },
    });
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
    const response = parsedResponse(expanded.output);
    expect(response).toMatchObject({ operation: "expand", completeness: "complete", readiness: { state: "not_evaluated" } });
    expect(JSON.stringify(response.data)).toContain("A short independently worded explanation of the result contract.");
    expect(JSON.stringify(response.data)).toContain(`/api/snapshots/${snapshotId}/files/file.save-outcome-notes`);
    expect(JSON.stringify(response.data)).toContain(`/api/snapshots/${snapshotId}/assets/asset.save-outcome-diagram`);
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
    const response = parsedResponse(context.output);
    expect(JSON.stringify(response.data)).toContain('"status":"changed"');
    expect(JSON.stringify(response.data)).toContain("Tell a caller whether completed practice progress was actually persisted.");
    expect(JSON.stringify(response.data)).not.toContain("A changed draft goal that must not enter the accepted handoff.");

    const markdown = await runPlanCli(cliOptions({
      packagePath: packageRoot,
      snapshotId,
      phaseId: "phase.save-outcome",
      activity: "implement",
      compareDraft: true,
      format: "markdown",
    }));
    expect(markdown.output).toContain("CHANGED");
    expect(markdown.output).toContain("W02 comparison:");
    expect(markdown.output).toContain("accepted baseline remains snapshot");
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
    const crossResponse = parsedResponse(crossSnapshot.output);
    expect(crossResponse.diagnostics.map((diagnostic) => diagnostic.code)).toContain("cross-snapshot-expansion");
    expect(JSON.stringify(crossResponse.data)).not.toContain("A short independently worded explanation of the result contract.");

    const bounded = await runPlanCli(cliOptions({
      packagePath: packageRoot,
      snapshotId,
      phaseId: "phase.save-outcome",
      activity: "implement",
      maxChars: 1,
    }));
    expect(bounded.exitCode).toBe(1);
    const boundedResponse = parsedResponse(bounded.output);
    expect(boundedResponse).toMatchObject({ completeness: "incomplete", readiness: { state: "not_evaluated" }, data: { kind: "budget", requested_max_chars: 1 } });
    expect(boundedResponse.diagnostics.map((diagnostic) => diagnostic.code)).toContain("budget-exceeded");

    const markdown = await runPlanCli(cliOptions({
      packagePath: packageRoot,
      snapshotId,
      phaseId: "phase.save-outcome",
      activity: "implement",
      maxChars: 1,
      format: "markdown",
    }));
    expect(markdown.output).toContain("INCOMPLETE");
    expect(markdown.output).toContain("Required omitted IDs");
    expect(markdown.output).toContain("exact token count: not reported");
    expect(markdown.output).not.toContain("Give a learner an honest way");
  });

  it("uses the supported silent launcher for all operations and returns JSON argument failures", async () => {
    const packageRoot = await copyFixture("save-outcome");
    const { snapshotId } = await publishAndAccept(packageRoot);
    const invoke = (args: string[]) => spawnSync("npm", ["run", "--silent", "plan", "--", ...args], { cwd: repositoryRoot, encoding: "utf8" });

    const current = invoke(["current", "--package", packageRoot]);
    expect(current.status).toBe(0);
    expect(parsedResponse(current.stdout).operation).toBe("current");

    const context = invoke(["context", "--package", packageRoot, "--snapshot", snapshotId, "--phase", "phase.save-outcome", "--activity", "implement", "--format", "json"]);
    expect(context.status).toBe(0);
    expect(parsedResponse(context.stdout)).toMatchObject({ operation: "context", source: { snapshot_id: snapshotId } });

    const expand = invoke(["expand", "--package", packageRoot, "--snapshot", snapshotId, "--refs", "reference.save-outcome-notes"]);
    expect(expand.status).toBe(0);
    expect(parsedResponse(expand.stdout).operation).toBe("expand");

    const invalid = invoke(["context", "--package", packageRoot, "--snapshot", snapshotId]);
    expect(invalid.status).toBe(2);
    expect(parsedResponse(invalid.stdout)).toMatchObject({ operation: "context", outcome: "error", completeness: "unavailable" });
  });

  it("fails closed for an unsupported public response version and handles non-ASCII tiny budgets", async () => {
    const packageRoot = await copyFixture("save-outcome");
    const manifestPath = join(packageRoot, "plan.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { goal_md: string };
    manifest.goal_md = "Résumé: preserve exact accepted wording.";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const { snapshotId } = await publishAndAccept(packageRoot);
    const bounded = await runPlanCli(cliOptions({ packagePath: packageRoot, snapshotId, phaseId: "phase.save-outcome", activity: "implement", maxChars: 1 }));
    const response = parsedResponse(bounded.output);
    expect(response.completeness).toBe("incomplete");
    expect(response.diagnostics.map((diagnostic) => diagnostic.code)).toContain("budget-exceeded");
    expect(validatePlanCliResponse({ ...response, format_version: "2" }).valid).toBe(false);
  });
});
