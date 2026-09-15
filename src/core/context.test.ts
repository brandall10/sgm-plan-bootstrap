import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { selectContext } from "./context.js";
import { validatePlanPackage, type PlanPackage } from "./package.js";

function contextManifest(): Record<string, unknown> {
  return {
    format: "plan-package",
    format_version: "1.0",
    id: "context-example",
    revision: 1,
    title: "Context example",
    goal_md: "Make focused execution obligations recoverable.",
    scope: { included: ["Focused phase context"], excluded: ["Agent routing"] },
    constraints: [{ id: "constraint.shared", text_md: "Keep selected wording exact." }],
    phases: [
      {
        id: "phase.first",
        title: "Produce the prerequisite interface",
        depends_on: [],
        objective_md: "The prerequisite interface is explicit.",
        approach_md: "Keep the producer boundary small.",
        tasks: [
          { id: "task.first-implement", text_md: "Implement the prerequisite boundary.", activity: "implement" },
          { id: "task.first-verify", text_md: "Verify the prerequisite behavior.", activity: "verify" },
        ],
        acceptance_criteria: [{ id: "criterion.first", text_md: "The prerequisite interface is observable." }],
      },
      {
        id: "phase.second",
        title: "Consume the prerequisite interface",
        depends_on: ["phase.first"],
        objective_md: "The consumer uses the delivered interface.",
        approach_md: "The consumer narrative must not be in the producer handoff.",
        tasks: [
          { id: "task.second-implement", text_md: "Implement the consumer boundary.", activity: "implement" },
          { id: "task.second-verify", text_md: "Verify the consumer behavior.", activity: "verify" },
        ],
        acceptance_criteria: [
          { id: "criterion.second", text_md: "The consumer renders the delivered interface." },
          {
            id: "criterion.consumer-obligation",
            text_md: "The prerequisite exposes the exact result distinctions consumed by this phase.",
            applies_to: ["phase.first"],
          },
        ],
      },
    ],
    references: [],
    decisions: [],
    questions: [],
    assets: [],
    files: [],
    required_capabilities: ["inline-phases.v1", "context-selection.v1"],
    state: "draft",
  };
}

function contextPackage(): PlanPackage {
  const result = validatePlanPackage(contextManifest());
  if (!result.value || !result.valid) throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join("; "));
  return result.value;
}

function snapshot(packageId: string, accepted = true) {
  return { package_id: packageId, snapshot_id: "snapshot-context-1", accepted };
}

describe("deterministic context selection", () => {
  it("selects exact consumer obligations, filters tasks, and keeps unrelated narrative expandable", () => {
    const plan = contextPackage();
    const input = {
      plan,
      snapshot: snapshot(plan.id),
      phase_id: "phase.first",
      activity: "implement",
    } as const;
    const result = selectContext(input);
    const repeated = selectContext(input);

    expect(result.valid).toBe(true);
    expect(repeated).toEqual(result);
    expect(result.value?.coverage).toBe("complete");
    expect(result.value?.readiness).toEqual({ ready: true, blockers: [] });
    expect(result.value?.phase_map.map((phase) => phase.id)).toEqual(["phase.first", "phase.second"]);
    expect(result.value?.tasks.map((task) => task.id)).toEqual(["task.first-implement"]);
    expect(result.value?.criteria.map((criterion) => criterion.id)).toEqual([
      "criterion.first",
      "criterion.consumer-obligation",
    ]);
    expect(result.value?.criteria[1]?.text_md).toBe("The prerequisite exposes the exact result distinctions consumed by this phase.");
    expect(result.value?.expandable.some((item) => item.id === "phase.second" && item.kind === "phase-narrative")).toBe(true);
    expect(JSON.stringify(result.value)).not.toContain("The consumer narrative must not be in the producer handoff.");
    expect(result.value?.provenance.find((item) => item.id === "criterion.consumer-obligation")?.source).toEqual({
      package_id: plan.id,
      snapshot_id: "snapshot-context-1",
    });
  });

  it("classifies required references and designs as governing and blocks missing snapshot bytes", () => {
    const plan = contextPackage();
    plan.files = [
      {
        id: "file.design",
        root: "package",
        path: "design.md",
        sha256: "a".repeat(64),
        required: true,
      },
      {
        id: "file.notes",
        root: "package",
        path: "notes.md",
        sha256: "b".repeat(64),
        required: true,
      },
    ];
    plan.references = [{
      id: "reference.design",
      kind: "local",
      file_id: "file.design",
      purpose_md: "Governing design wording.",
      required: true,
      applies_to: ["phase.first"],
    }];
    plan.assets = [{
      id: "asset.notes",
      file_id: "file.notes",
      format: "markdown",
      authority: "authoritative",
      purpose_md: "Governing notes.",
      applies_to: ["phase.first"],
      required: true,
      dependency_file_ids: [],
      mock: false,
    }];

    const result = selectContext({
      plan,
      snapshot: { ...snapshot(plan.id), files: [{ id: "file.design", available: true }, { id: "file.notes", available: false }] },
      phase_id: "phase.first",
      activity: "implement",
    });

    expect(result.valid).toBe(true);
    expect(result.value?.governing_file_ids).toEqual(["file.design", "file.notes"]);
    expect(result.value?.governing.map((item) => item.id)).toContain("reference.design");
    expect(result.value?.governing.map((item) => item.id)).toContain("asset.notes");
    expect(result.value?.readiness.ready).toBe(false);
    expect(result.value?.readiness.blockers).toEqual([
      expect.objectContaining({ code: "governing-file-unavailable", itemId: "asset.notes" }),
    ]);
  });

  it("uses the requested verification activity and exposes direct prerequisite result slots", () => {
    const plan = contextPackage();
    const result = selectContext({
      plan,
      snapshot: snapshot(plan.id),
      phase_id: "phase.second",
      activity: "verify",
      prerequisite_results: [{
        phase_id: "phase.first",
        status: "available",
        result_id: "result.first",
        interface_ids: ["interface.outcome"],
      }],
    });

    expect(result.valid).toBe(true);
    expect(result.value?.tasks.map((task) => task.id)).toEqual(["task.second-verify"]);
    expect(result.value?.prerequisite_phases.map((phase) => phase.id)).toEqual(["phase.first"]);
    expect(result.value?.prerequisite_results).toEqual([{
      phase_id: "phase.first",
      status: "available",
      result_id: "result.first",
      interface_ids: ["interface.outcome"],
    }]);
    expect(result.value?.readiness).toEqual({ ready: true, blockers: [] });
  });

  it("keeps unanswered blocking questions and missing prerequisite results distinct", () => {
    const manifest = contextManifest();
    manifest["questions"] = [
      {
        id: "question.answered",
        title: "Answered",
        question_md: "Which boundary is used?",
        status: "answered",
        blocking: true,
        applies_to: ["phase.second"],
      },
      {
        id: "question.deferred",
        title: "Deferred",
        question_md: "Which evidence is required?",
        status: "deferred",
        blocking: true,
        applies_to: ["phase.second"],
      },
      {
        id: "question.open",
        title: "Open wording",
        question_md: "Which optional wording is clearest?",
        status: "open",
        blocking: false,
        applies_to: ["phase.second"],
      },
    ];
    const validation = validatePlanPackage(manifest);
    if (!validation.value || !validation.valid) throw new Error("Question fixture should be valid.");

    const result = selectContext({
      plan: validation.value,
      snapshot: snapshot(validation.value.id),
      phase_id: "phase.second",
      activity: "implement",
    });

    expect(result.valid).toBe(true);
    expect(result.value?.questions.map((question) => question.id)).toEqual([
      "question.answered",
      "question.deferred",
      "question.open",
    ]);
    expect(result.value?.readiness.blockers.map((item) => item.code)).toEqual([
      "blocking-question",
      "missing-prerequisite-result",
    ]);
    expect(result.value?.readiness.blockers.find((item) => item.code === "blocking-question")?.itemId).toBe("question.deferred");
  });

  it("reports invalid requests and dependency cycles without producing context", () => {
    const plan = contextPackage();
    const unknownPhase = selectContext({
      plan,
      snapshot: snapshot(plan.id),
      phase_id: "phase.missing",
      activity: "implement",
    });
    expect(unknownPhase.valid).toBe(false);
    expect(unknownPhase.diagnostics.map((diagnostic) => diagnostic.code)).toContain("unknown-phase");

    const invalidActivity = selectContext({
      plan,
      snapshot: snapshot(plan.id),
      phase_id: "phase.first",
      activity: "execute",
    });
    expect(invalidActivity.valid).toBe(false);
    expect(invalidActivity.diagnostics.map((diagnostic) => diagnostic.code)).toContain("invalid-activity");

    plan.phases[0]!.depends_on = ["phase.second"];
    const cycle = selectContext({
      plan,
      snapshot: snapshot(plan.id),
      phase_id: "phase.first",
      activity: "implement",
    });
    expect(cycle.valid).toBe(false);
    expect(cycle.diagnostics.map((diagnostic) => diagnostic.code)).toContain("dependency-cycle");
  });

  it("reads v1 packages but reports limited context coverage instead of inventing obligations", () => {
    const manifest = contextManifest();
    manifest["required_capabilities"] = ["inline-phases.v1"];
    for (const phase of manifest["phases"] as Array<Record<string, unknown>>) delete phase["tasks"];
    const validation = validatePlanPackage(manifest);
    if (!validation.value || !validation.valid) throw new Error("Legacy fixture should remain readable.");

    const result = selectContext({
      plan: validation.value,
      snapshot: snapshot(validation.value.id),
      phase_id: "phase.first",
      activity: "implement",
    });

    expect(result.valid).toBe(true);
    expect(result.value?.coverage).toBe("limited");
    expect(result.value?.tasks).toEqual([]);
    expect(result.value?.limitations.map((item) => item.code)).toEqual(["context-capability-missing"]);
    expect(result.value?.readiness.ready).toBe(false);
    expect(result.value?.readiness.blockers.map((item) => item.code)).toContain("context-capability-missing");
  });

  it("selects both context-capable illustrative fixtures through the same package identity", () => {
    for (const fixtureName of ["offline-recovery", "save-outcome"]) {
      const manifest = JSON.parse(readFileSync(resolve(process.cwd(), "examples", fixtureName, "plan.json"), "utf8")) as unknown;
      const validation = validatePlanPackage(manifest);
      if (!validation.value || !validation.valid) throw new Error(`${fixtureName} fixture should be valid.`);
      const phase = validation.value.phases[0];
      if (!phase) throw new Error(`${fixtureName} fixture has no phase.`);

      const result = selectContext({
        plan: validation.value,
        snapshot: {
          package_id: validation.value.id,
          snapshot_id: `${fixtureName}-snapshot`,
          accepted: true,
          available_file_ids: validation.value.files.map((file) => file.id),
        },
        phase_id: phase.id,
        activity: "implement",
      });

      expect(result.valid).toBe(true);
      expect(result.value?.package_id).toBe(validation.value.id);
      expect(result.value?.snapshot.package_id).toBe(validation.value.id);
      expect(result.value?.tasks.every((task) => task.activity === "implement")).toBe(true);
    }
  });
});
