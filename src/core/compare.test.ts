import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { compareSnapshots, type SnapshotComparisonInput } from "./compare.js";
import type { PlanPackage } from "./package.js";
import type { SnapshotDescriptor, SnapshotFileEntry } from "./snapshot.js";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function plan(revision = 1): PlanPackage {
  const css = "body { color: navy; }\n";
  return {
    format: "plan-package",
    format_version: "1.0",
    id: "example-plan",
    revision,
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
    assets: [{
      id: "asset.prototype",
      file_id: "file.prototype-css",
      format: "css",
      authority: "authoritative",
      purpose_md: "The selected prototype styling.",
      applies_to: ["phase.example"],
      required: true,
      dependency_file_ids: [],
      mock: false,
    }],
    files: [{
      id: "file.prototype-css",
      root: "package",
      path: "designs/prototype.css",
      sha256: digest(css),
      required: true,
      media_type: "text/css; charset=utf-8",
    }],
    required_capabilities: ["inline-phases.v1"],
    state: "draft",
  };
}

function input(
  snapshotId: string,
  value: PlanPackage,
  fileBytes: Uint8Array | undefined,
  manifestSha256 = "c".repeat(64),
): SnapshotComparisonInput {
  const fileDigest = value.files[0]?.sha256 ?? digest("body { color: navy; }\n");
  const file: SnapshotFileEntry = {
    id: "file.prototype-css",
    root: "package",
    path: "designs/prototype.css",
    sha256: fileDigest,
    required: true,
    available: true,
    blob_sha256: fileDigest,
    media_type: "text/css; charset=utf-8",
  };
  const descriptor: SnapshotDescriptor = {
    format: "plan-package-snapshot",
    format_version: "1",
    snapshot_id: snapshotId,
    package_id: value.id,
    author_revision: value.revision,
    manifest_sha256: manifestSha256,
    content_id: `content-${snapshotId.slice(0, 8)}`,
    files: [file],
    omissions: [],
  };
  return {
    snapshot_id: snapshotId,
    package_id: value.id,
    plan: value,
    descriptor,
    files: fileBytes ? new Map([[file.id, fileBytes]]) : new Map(),
  };
}

describe("snapshot comparison", () => {
  it("reports stable item changes and identifies prototype dependency impact", () => {
    const left = input("a".repeat(64), plan(), new TextEncoder().encode("body { color: navy; }\n"));
    const changed = plan(2);
    changed.phases[0]!.acceptance_criteria[0]!.text_md = "The changed example can be checked.";
    changed.files[0]!.sha256 = digest("body { color: teal; }\n");
    const right = input("b".repeat(64), changed, new TextEncoder().encode("body { color: teal; }\n"), "d".repeat(64));

    const result = compareSnapshots(left, right);

    expect(result.valid).toBe(true);
    expect(result.value?.changes.some((change) => change.category === "criterion" && change.id === "criterion.example" && change.kind === "changed")).toBe(true);
    const fileChange = result.value?.changes.find((change) => change.category === "file" && change.id === "file.prototype-css");
    expect(fileChange?.affected_asset_ids).toContain("asset.prototype");
    expect(fileChange?.affected_item_ids).toContain("phase.example");
  });

  it("distinguishes metadata and serialization changes from material changes", () => {
    const left = input("a".repeat(64), plan(), new TextEncoder().encode("body { color: navy; }\n"));
    const right = input("b".repeat(64), plan(2), new TextEncoder().encode("body { color: navy; }\n"), "d".repeat(64));

    const result = compareSnapshots(left, right);

    expect(result.valid).toBe(true);
    expect(result.value?.material_change_count).toBe(0);
    expect(result.value?.metadata_change_count).toBe(1);
    expect(result.value?.changes[0]?.classification).toBe("metadata");
    expect(result.value?.changes[0]?.fields).toEqual(["revision", "serialization"]);
  });

  it("reports stable phase order changes", () => {
    const leftPlan = plan();
    const secondPhase = {
      id: "phase.second",
      title: "A second phase",
      depends_on: ["phase.example"],
      objective_md: "The second phase is inspectable.",
      approach_md: "Use the first phase result.",
      acceptance_criteria: [],
    };
    leftPlan.phases.push(secondPhase);
    const rightPlan = plan(2);
    rightPlan.phases = [secondPhase, rightPlan.phases[0]!];

    const result = compareSnapshots(
      input("a".repeat(64), leftPlan, new TextEncoder().encode("body { color: navy; }\n")),
      input("b".repeat(64), rightPlan, new TextEncoder().encode("body { color: navy; }\n"), "d".repeat(64)),
    );

    const phaseChange = result.value?.changes.find((change) => change.category === "phase" && change.id === "phase.example");
    expect(phaseChange?.fields).toContain("order");
  });

  it("rejects cross-package comparisons and reports missing captured inputs", () => {
    const left = input("a".repeat(64), plan(), new TextEncoder().encode("body { color: navy; }\n"));
    const other = input("b".repeat(64), { ...plan(), id: "other-plan" }, new TextEncoder().encode("body { color: navy; }\n"));
    const crossPackage = compareSnapshots(left, other);
    expect(crossPackage.value).toBeNull();
    expect(crossPackage.diagnostics.map((diagnostic) => diagnostic.code)).toContain("comparison-package-mismatch");

    const unavailable = compareSnapshots(input("c".repeat(64), plan(), undefined), left);
    expect(unavailable.valid).toBe(false);
    expect(unavailable.value?.unavailable_inputs[0]?.file_id).toBe("file.prototype-css");
    expect(unavailable.diagnostics.map((diagnostic) => diagnostic.code)).toContain("comparison-input-unavailable");
  });
});
