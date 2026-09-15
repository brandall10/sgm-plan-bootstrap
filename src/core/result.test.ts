import { describe, expect, it } from "vitest";

import {
  resultEvidenceStatus,
  resultRecordComparable,
  validateResultRecord,
  type ResultRecord,
} from "./result.js";

const snapshotId = "a".repeat(64);

function resultInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: "plan-package-result",
    format_version: "1",
    result_id: "result.first",
    package_id: "save-outcome",
    snapshot_id: snapshotId,
    phase_id: "phase.save-outcome",
    activity: "implement",
    author: "user:beau",
    recorded_at: "2026-09-14T16:00:00.000Z",
    code_revision: "abc123",
    environment: { node: "20.19.0", platform: "test" },
    related_item_ids: ["criterion.successful-save"],
    intended_work: [{ id: "statement.intent", text_md: "Implement the boundary.", disposition: "intended", related_item_ids: ["task.save-outcome-implementation"] }],
    observed_facts: [{ id: "statement.observed", text_md: "The read-back succeeded.", disposition: "observed", related_item_ids: ["criterion.successful-save"] }],
    inferences: [],
    unverified_claims: [],
    produced_interfaces: [{ id: "interface.outcome", name: "Save outcome", description_md: "Returns persisted or unsaved.", disposition: "observed", related_item_ids: ["criterion.successful-save"] }],
    deviations: [],
    unresolved_findings: [],
    evidence: [{ id: "evidence.test", kind: "test", label: "Unit test", locator: "npm test -- result", code_revision: "abc123", statement_ids: ["statement.observed"], status: "current" }],
    delivery_facts: { review_status: "pending", integration_status: "not-integrated", pr_url: "https://github.com/example/repo/pull/1" },
    continuation_notes: [],
    supersedes: [],
    illustrative: false,
    ...overrides,
  };
}

describe("result record contract", () => {
  it("validates attributable statement classes and current evidence", () => {
    const validation = validateResultRecord(resultInput());

    expect(validation.valid).toBe(true);
    expect(validation.value?.result_id).toBe("result.first");
    expect(validation.value?.environment).toEqual({ node: "20.19.0", platform: "test" });
    expect(resultEvidenceStatus(validation.value as ResultRecord)).toBe("current");
  });

  it("keeps stale evidence valid as an attributed but non-current observation", () => {
    const validation = validateResultRecord(resultInput({
      evidence: [{ id: "evidence.old", kind: "test", label: "Old test", locator: "npm test", code_revision: "old456", statement_ids: ["statement.observed"], status: "current" }],
    }));

    expect(validation.valid).toBe(true);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toContain("stale-evidence");
    expect(resultEvidenceStatus(validation.value as ResultRecord)).toBe("stale");
  });

  it("rejects disposition mismatches and unknown evidence claims", () => {
    const validation = validateResultRecord(resultInput({
      intended_work: [{ id: "statement.intent", text_md: "Wrong class.", disposition: "observed", related_item_ids: [] }],
      evidence: [{ id: "evidence.test", kind: "test", label: "Unit test", locator: "npm test", code_revision: "abc123", statement_ids: ["statement.missing"], status: "current" }],
    }));

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expect.arrayContaining([
      "statement-disposition-mismatch",
      "unknown-evidence-statement",
    ]));
  });

  it("uses the immutable result input, not recorded time, for retry identity", () => {
    const first = validateResultRecord(resultInput()).value as ResultRecord;
    const retry = validateResultRecord(resultInput({ recorded_at: "2026-09-14T17:00:00.000Z" })).value as ResultRecord;

    expect(resultRecordComparable(first)).toBe(resultRecordComparable(retry));
  });

  it("requires integrated delivery facts to name the integrated revision", () => {
    const validation = validateResultRecord(resultInput({
      delivery_facts: { review_status: "approved", integration_status: "integrated" },
    }));

    expect(validation.valid).toBe(false);
    expect(validation.diagnostics.map((diagnostic) => diagnostic.code)).toContain("missing-integrated-revision");
  });
});
