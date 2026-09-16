import { cp, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { selectContext } from "../core/context.js";
import type { ResultRecord } from "../core/result.js";
import { runPlanCli } from "./plan-cli.js";
import { CandidateStore } from "./candidate-store.js";
import { publishPackage } from "./publication.js";
import { SnapshotStore } from "./snapshot-store.js";
import { startRuntime } from "./runtime.js";

const repositoryRoot = resolve(process.cwd());

async function copyFixture(): Promise<string> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-p4-recovery-"));
  const packageRoot = join(temporaryRoot, "offline-recovery");
  await cp(resolve(repositoryRoot, "examples/offline-recovery"), packageRoot, { recursive: true });
  return packageRoot;
}

function resultFor(
  snapshotId: string,
  resultId: string,
  phaseId: "phase.persistence-outcomes" | "phase.recovery-experience",
  recordedAt: string,
  codeRevision: string,
  overrides: Partial<ResultRecord> = {},
): ResultRecord {
  const relatedItemIds = phaseId === "phase.persistence-outcomes"
    ? ["criterion.recovery-outcome-contract"]
    : ["criterion.restore-choice", "criterion.recovery-outcome-contract"];
  const factId = `fact.${resultId.replaceAll("result.", "")}`;
  return {
    format: "plan-package-result",
    format_version: "1",
    result_id: resultId,
    package_id: "offline-recovery",
    snapshot_id: snapshotId,
    phase_id: phaseId,
    activity: "verify",
    author: "fixture:p4-recovery",
    recorded_at: recordedAt,
    code_revision: codeRevision,
    environment: { runner: "vitest", scenario: "fresh-recovery" },
    related_item_ids: relatedItemIds,
    intended_work: [],
    observed_facts: [{ id: factId, text_md: `The ${phaseId} recovery observation was recorded against the retained snapshot.`, disposition: "observed", related_item_ids: relatedItemIds }],
    inferences: [],
    unverified_claims: [],
    produced_interfaces: phaseId === "phase.persistence-outcomes"
      ? [{ id: "interface.p4-persistence-outcome", name: "Named persistence outcome", description_md: "The recovery phase receives saved, unsaved, unavailable, restored, and discarded outcome distinctions.", disposition: "observed", related_item_ids: ["criterion.recovery-outcome-contract"] }]
      : [],
    deviations: [],
    unresolved_findings: [],
    evidence: [{ id: `evidence.${resultId.replaceAll("result.", "")}`, kind: "test", label: "Fresh recovery verification", locator: "src/server/p4-recovery.test.ts", code_revision: codeRevision, statement_ids: [factId], status: "current" }],
    delivery_facts: { review_status: "not-reviewed", integration_status: "not-integrated", notes_md: "This is fixture evidence for package recovery, not evidence that the described exercise product exists." },
    continuation_notes: [],
    supersedes: [],
    illustrative: true,
    ...overrides,
  };
}

describe("W03 P4 fresh recovery demonstration", () => {
  it("recovers a pinned result history through fresh runtime and CLI processes after governed files disappear", async () => {
    const packageRoot = await copyFixture();
    const firstRuntime = await startRuntime({ packageRoot, port: 0, watch: false });
    let snapshotId: string;

    try {
      const state = await (await fetch(`http://${firstRuntime.host}:${firstRuntime.port}/api/state`)).json() as { packageId: string; currentSnapshotId: string | null };
      if (!state.currentSnapshotId) throw new Error("The fixture did not publish a retained snapshot.");
      snapshotId = state.currentSnapshotId;
      const store = new SnapshotStore({ root: join(packageRoot, ".plan-package") });
      expect((await store.recordAcceptance({
        format: "plan-package-acceptance",
        format_version: "1",
        record_id: "acceptance.p4-recovery",
        package_id: state.packageId,
        snapshot_id: snapshotId,
        instruction: "I accept this exact recovery demonstration snapshot.",
        source: "test:p4-recovery",
        actor: "user:p4-recovery",
        recorded_at: "2026-09-15T14:00:00.000Z",
        illustrative: false,
      })).created).toBe(true);

      expect((await store.recordResult(resultFor(
        snapshotId,
        "result.p4-predecessor",
        "phase.persistence-outcomes",
        "2026-09-15T14:01:00.000Z",
        "fixture-predecessor",
      ))).created).toBe(true);
      expect((await store.recordResult(resultFor(
        snapshotId,
        "result.p4-recovery-before-repair",
        "phase.recovery-experience",
        "2026-09-15T14:02:00.000Z",
        "fixture-before-repair",
        {
          evidence: [{
            id: "evidence.p4-recovery-before-repair",
            kind: "test",
            label: "Obsolete recovery verification",
            locator: "src/server/p4-recovery.test.ts",
            code_revision: "fixture-obsolete",
            statement_ids: ["fact.p4-recovery-before-repair"],
            status: "stale",
          }],
          unresolved_findings: [{
            id: "finding.p4-recovery-repair",
            text_md: "The first verification pass used an obsolete candidate and cannot be carried forward after repair.",
            severity: "consequential",
            disposition: "observed",
            related_item_ids: ["criterion.restore-choice"],
          }],
        },
      ))).created).toBe(true);
      expect((await store.recordResult(resultFor(
        snapshotId,
        "result.p4-recovery-after-repair",
        "phase.recovery-experience",
        "2026-09-15T14:03:00.000Z",
        "fixture-after-repair",
        {
          evidence: [{
            id: "evidence.p4-recovery-after-repair",
            kind: "test",
            label: "Repaired recovery verification",
            locator: "src/server/p4-recovery.test.ts",
            code_revision: "fixture-after-repair",
            statement_ids: ["fact.p4-recovery-after-repair", "finding.p4-fixture-limit"],
            status: "current",
          }],
          unresolved_findings: [{
            id: "finding.p4-fixture-limit",
            text_md: "The fixture demonstrates retained context and result inspection only; it is not a delivered exercise product.",
            severity: "informational",
            disposition: "unverified",
            related_item_ids: ["criterion.recovery-outcome-contract"],
          }],
          supersedes: ["result.p4-recovery-before-repair"],
        },
      ))).created).toBe(true);
    } finally {
      await firstRuntime.close();
    }

    await unlink(join(packageRoot, "plan.json"));
    await unlink(join(packageRoot, "docs/behavior-notes.md"));
    await unlink(join(packageRoot, "assets/recovery-flow.svg"));

    const context = await runPlanCli({
      command: "context",
      storePath: join(packageRoot, ".plan-package"),
      snapshotId,
      phaseId: "phase.recovery-experience",
      activity: "verify",
      refs: [],
      compareDraft: false,
      format: "markdown",
    });
    expect(context.exitCode).toBe(0);
    expect(context.output).toContain("status: READY");
    expect(context.output).toContain("criterion.recovery-outcome-contract");
    expect(context.output).toContain("The recovery experience receives named saved, unsaved, unavailable, restored, and discarded outcomes from persistence without inferring them from presentation.");
    expect(context.output).toContain("interface.p4-persistence-outcome");
    expect(context.output).toContain("finding.p4-fixture-limit");
    expect(context.output).toContain("evidence.p4-recovery-after-repair");
    expect(context.output).toContain("Historical result IDs");
    expect(context.output).toContain("result.p4-recovery-before-repair");

    const freshRuntime = await startRuntime({ packageRoot, port: 0, watch: false });
    try {
      const base = `http://${freshRuntime.host}:${freshRuntime.port}`;
      const freshState = await (await fetch(`${base}/api/state`)).json() as { currentCandidateId: string | null };
      expect(freshState.currentCandidateId).toBeNull();

      const response = await fetch(`${base}/api/snapshots/${snapshotId}/model`);
      const model = await response.json() as {
        package_id: string;
        acceptance_status: string;
        results: Array<{ record: { result_id: string }; status: string; evidence_status: string }>;
        phase_results: Array<{ phase_id: string; activities: Array<{ activity: string; current_result_ids: string[]; historical_result_ids: string[] }> }>;
      };
      expect(response.status).toBe(200);
      expect(model.package_id).toBe("offline-recovery");
      expect(model.acceptance_status).toBe("accepted");
      expect(model.results.map((result) => [result.record.result_id, result.status, result.evidence_status])).toEqual([
        ["result.p4-predecessor", "current", "current"],
        ["result.p4-recovery-before-repair", "superseded", "stale"],
        ["result.p4-recovery-after-repair", "current", "current"],
      ]);
      expect(model.phase_results.find((phase) => phase.phase_id === "phase.recovery-experience")?.activities.find((activity) => activity.activity === "verify")).toEqual({
        activity: "verify",
        current_result_ids: ["result.p4-recovery-after-repair"],
        historical_result_ids: ["result.p4-recovery-before-repair", "result.p4-recovery-after-repair"],
      });
    } finally {
      await freshRuntime.close();
    }
  });

  it("keeps missing governed inputs and graph-free references explicit during independent selection", async () => {
    const packageRoot = await copyFixture();
    const candidate = await new CandidateStore().loadAndPublish({ packageRoot });
    if (!candidate?.snapshotId) throw new Error("The fixture did not publish a retained snapshot.");

    const selected = selectContext({
      plan: candidate.plan,
      snapshot: {
        package_id: candidate.packageId,
        snapshot_id: candidate.snapshotId,
        acceptance_status: "accepted",
        files: candidate.snapshotFiles.map((file) => ({ id: file.id, available: file.id !== "file.behavior-notes" })),
      },
      phase_id: "phase.persistence-outcomes",
      activity: "implement",
    });
    expect(selected.value?.readiness.ready).toBe(false);
    expect(selected.value?.readiness.blockers.map((blocker) => blocker.code)).toContain("governing-file-unavailable");
    expect(selected.value?.references.map((reference) => reference.id)).toContain("reference.recovery-notes");
    expect(selected.value?.source).toEqual({ package_id: "offline-recovery", snapshot_id: candidate.snapshotId });
  });

  it("does not carry a verification result into a repaired candidate's new snapshot", async () => {
    const packageRoot = await copyFixture();
    const firstStore = new CandidateStore();
    const firstCandidate = await firstStore.loadAndPublish({ packageRoot });
    if (!firstCandidate?.snapshotId) throw new Error("The fixture did not publish an initial snapshot.");
    const snapshotStore = new SnapshotStore({ root: join(packageRoot, ".plan-package") });
    expect((await snapshotStore.recordResult(resultFor(
      firstCandidate.snapshotId,
      "result.p4-obsolete-verification",
      "phase.persistence-outcomes",
      "2026-09-15T14:10:00.000Z",
      "fixture-obsolete-candidate",
    ))).created).toBe(true);

    const manifestPath = join(packageRoot, "plan.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { goal_md: string };
    manifest.goal_md = "A repaired candidate has a new snapshot identity.";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    expect((await publishPackage({ packageRoot })).published).toBe(true);

    const repairedStore = new CandidateStore();
    const repairedCandidate = await repairedStore.loadAndPublish({ packageRoot });
    if (!repairedCandidate?.snapshotId) throw new Error("The repaired fixture did not publish a new snapshot.");
    expect(repairedCandidate.snapshotId).not.toBe(firstCandidate.snapshotId);
    expect(repairedStore.getModel(repairedCandidate.contentId)?.results).toEqual([]);
  });
});
