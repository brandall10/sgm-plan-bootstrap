import { describe, expect, it } from "vitest";

import { validatePlanPackage } from "./package.js";

function minimalPackage(): Record<string, unknown> {
  return {
    format: "plan-package",
    format_version: "1.0",
    id: "example-plan",
    revision: 1,
    title: "Example plan",
    goal_md: "Make the example behavior explicit.",
    scope: { included: ["The example"], excluded: ["Everything else"] },
    constraints: [{ id: "constraint.example", text_md: "Keep the behavior honest." }],
    phases: [{
      id: "phase.example",
      title: "Implement the example",
      depends_on: [],
      objective_md: "The example is inspectable.",
      approach_md: "Use a small boundary.",
      acceptance_criteria: [{ id: "criterion.example", text_md: "The example can be checked." }],
    }],
    references: [],
    decisions: [],
    questions: [],
    assets: [],
    files: [],
    required_capabilities: ["inline-phases.v1"],
    state: "draft",
    metadata: { owner: "fixture" },
  };
}

describe("plan package validation", () => {
  it("accepts the inline contract while retaining opaque metadata", () => {
    const result = validatePlanPackage(minimalPackage());

    expect(result.valid).toBe(true);
    expect(result.value?.metadata).toEqual({ owner: "fixture" });
    expect(result.value?.phases[0]?.tasks).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
  });

  it("rejects duplicate IDs and unknown relationships", () => {
    const packageValue = minimalPackage();
    packageValue["constraints"] = [
      { id: "constraint.example", text_md: "First declaration." },
      { id: "constraint.example", text_md: "Duplicate declaration." },
    ];
    packageValue["phases"] = [{
      id: "phase.example",
      title: "Implement the example",
      depends_on: ["phase.missing"],
      objective_md: "The example is inspectable.",
      approach_md: "Use a small boundary.",
      acceptance_criteria: [{ id: "criterion.example", text_md: "The example can be checked." }],
    }];

    const result = validatePlanPackage(packageValue);
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    expect(result.valid).toBe(false);
    expect(codes).toContain("duplicate-id");
    expect(codes).toContain("unknown-dependency");
  });

  it("identifies dependency cycles and blocking targets", () => {
    const packageValue = minimalPackage();
    packageValue["phases"] = [
      {
        id: "phase.first",
        title: "First",
        depends_on: ["phase.second"],
        objective_md: "First objective.",
        approach_md: "First approach.",
        acceptance_criteria: [{ id: "criterion.first", text_md: "First criterion." }],
      },
      {
        id: "phase.second",
        title: "Second",
        depends_on: ["phase.first"],
        objective_md: "Second objective.",
        approach_md: "Second approach.",
        acceptance_criteria: [{ id: "criterion.second", text_md: "Second criterion." }],
      },
    ];
    packageValue["questions"] = [{
      id: "question.missing-target",
      title: "Missing target",
      question_md: "Where does this apply?",
      status: "open",
      blocking: true,
      applies_to: ["phase.missing"],
    }];

    const result = validatePlanPackage(packageValue);
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    expect(result.valid).toBe(false);
    expect(codes).toContain("dependency-cycle");
    expect(codes).toContain("unknown-applicability-target");
  });

  it("rejects unsupported required semantics and unsafe paths", () => {
    const packageValue = minimalPackage();
    packageValue["required_capabilities"] = ["future-context-engine.v1"];
    packageValue["files"] = [{
      id: "file.escape",
      root: "package",
      path: "../outside.txt",
      sha256: "a".repeat(64),
      required: true,
    }];

    const result = validatePlanPackage(packageValue);
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    expect(result.valid).toBe(false);
    expect(codes).toContain("unsupported-required-capability");
    expect(codes).toContain("unsafe-path");
  });

  it("reserves the local history store from package inputs", () => {
    const packageValue = minimalPackage();
    packageValue["files"] = [{
      id: "file.history",
      root: "package",
      path: ".plan-package/snapshots/example.json",
      sha256: "a".repeat(64),
      required: true,
    }];

    const result = validatePlanPackage(packageValue);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("reserved-history-path");
  });

  it("parses activity-tagged tasks and cross-phase criterion applicability", () => {
    const packageValue = minimalPackage();
    packageValue["required_capabilities"] = ["inline-phases.v1", "context-selection.v1"];
    packageValue["phases"] = [
      {
        id: "phase.first",
        title: "First",
        depends_on: [],
        objective_md: "First objective.",
        approach_md: "First approach.",
        tasks: [{ id: "task.first", text_md: "Implement first.", activity: "implement" }],
        acceptance_criteria: [{ id: "criterion.first", text_md: "First criterion." }],
      },
      {
        id: "phase.second",
        title: "Second",
        depends_on: ["phase.first"],
        objective_md: "Second objective.",
        approach_md: "Second approach.",
        tasks: [{ id: "task.second", text_md: "Verify second.", activity: "verify" }],
        acceptance_criteria: [{
          id: "criterion.consumer",
          text_md: "First must expose the result that second consumes.",
          applies_to: ["phase.first"],
        }],
      },
    ];

    const result = validatePlanPackage(packageValue);

    expect(result.valid).toBe(true);
    expect(result.value?.phases[0]?.tasks).toEqual([{ id: "task.first", text_md: "Implement first.", activity: "implement" }]);
    expect(result.value?.phases[1]?.acceptance_criteria[0]?.applies_to).toEqual(["phase.first"]);
  });

  it("rejects invalid task activities and context phases without tasks", () => {
    const packageValue = minimalPackage();
    packageValue["required_capabilities"] = ["context-selection.v1"];
    packageValue["phases"] = [{
      id: "phase.example",
      title: "Implement the example",
      depends_on: [],
      objective_md: "The example is inspectable.",
      approach_md: "Use a small boundary.",
      tasks: [{ id: "task.invalid", text_md: "Use an unsupported activity.", activity: "plan" }],
      acceptance_criteria: [{ id: "criterion.example", text_md: "The example can be checked." }],
    }];

    const result = validatePlanPackage(packageValue);
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);

    expect(result.valid).toBe(false);
    expect(codes).toContain("invalid-task-activity");
    expect(codes).toContain("missing-context-tasks");
  });

  it("validates criterion applicability against the shared phase and item IDs", () => {
    const packageValue = minimalPackage();
    packageValue["phases"] = [{
      id: "phase.example",
      title: "Implement the example",
      depends_on: [],
      objective_md: "The example is inspectable.",
      approach_md: "Use a small boundary.",
      acceptance_criteria: [{
        id: "criterion.example",
        text_md: "The example can be checked.",
        applies_to: ["phase.missing"],
      }],
    }];

    const result = validatePlanPackage(packageValue);

    expect(result.valid).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain("unknown-applicability-target");
  });
});
