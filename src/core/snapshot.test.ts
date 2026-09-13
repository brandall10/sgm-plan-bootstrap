import { describe, expect, it } from "vitest";

import {
  acceptanceRecordComparable,
  snapshotIdentityInput,
  validateAcceptanceRecord,
  validateSnapshotDescriptor,
} from "./snapshot.js";

const file = {
  id: "file.notes",
  root: "package" as const,
  path: "docs/notes.md",
  sha256: "a".repeat(64),
  required: true,
  available: true,
  blob_sha256: "a".repeat(64),
};

describe("snapshot and acceptance contracts", () => {
  it("binds identity to exact manifest bytes and normalizes inventory order", () => {
    const first = snapshotIdentityInput(new TextEncoder().encode("one"), [file], []);
    const second = snapshotIdentityInput(new TextEncoder().encode("one"), [{ ...file }], []);
    const changed = snapshotIdentityInput(new TextEncoder().encode("two"), [file], []);

    expect(second).toEqual(first);
    expect(changed).not.toEqual(first);
  });

  it("rejects unsupported descriptor and acceptance versions", () => {
    const descriptor = validateSnapshotDescriptor({
      format: "plan-package-snapshot",
      format_version: "99",
      snapshot_id: "b".repeat(64),
      package_id: "example-plan",
      author_revision: 1,
      manifest_sha256: "c".repeat(64),
      content_id: "content-example",
      files: [file],
      omissions: [],
    });
    const acceptance = validateAcceptanceRecord({
      format: "plan-package-acceptance",
      format_version: "99",
      record_id: "acceptance.first",
      package_id: "example-plan",
      snapshot_id: "b".repeat(64),
      instruction: "I accept this proposal.",
      source: "conversation:test",
      actor: "user:test",
      recorded_at: "2026-09-13T16:00:00.000Z",
      illustrative: false,
    });

    expect(descriptor.valid).toBe(false);
    expect(descriptor.diagnostics.map((diagnostic) => diagnostic.code)).toContain("unsupported-snapshot-version");
    expect(acceptance.valid).toBe(false);
    expect(acceptance.diagnostics.map((diagnostic) => diagnostic.code)).toContain("unsupported-acceptance-version");
  });

  it("uses explicit provenance fields for acceptance retry identity", () => {
    const base = {
      format: "plan-package-acceptance" as const,
      format_version: "1" as const,
      record_id: "acceptance.first",
      package_id: "example-plan",
      snapshot_id: "b".repeat(64),
      instruction: "I accept this proposal.",
      source: "conversation:test",
      actor: "user:test",
      recorded_at: "2026-09-13T16:00:00.000Z",
      illustrative: false,
    };

    expect(acceptanceRecordComparable(base)).toBe(acceptanceRecordComparable({ ...base, recorded_at: "2026-09-13T16:01:00.000Z" }));
  });
});
