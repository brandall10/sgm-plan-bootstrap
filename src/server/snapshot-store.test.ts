import { cp, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadCandidate } from "./candidate-loader.js";
import { CandidateStore } from "./candidate-store.js";
import { SnapshotStore } from "./snapshot-store.js";
import type { ResultRecord } from "../core/result.js";

const repositoryRoot = resolve(process.cwd());

async function copyFixture(name: string): Promise<{ packageRoot: string }> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-snapshot-"));
  const packageRoot = join(temporaryRoot, name);
  await cp(resolve(repositoryRoot, "examples", name), packageRoot, { recursive: true });
  return { packageRoot };
}

function recordFor(snapshotId: string, packageId: string, instruction = "I accept this proposal.") {
  return {
    format: "plan-package-acceptance" as const,
    format_version: "1" as const,
    record_id: "acceptance.first",
    package_id: packageId,
    snapshot_id: snapshotId,
    instruction,
    source: "conversation:user-message-1",
    actor: "user:beau",
    recorded_at: "2026-09-13T16:00:00.000Z",
    illustrative: false,
  };
}

function resultFor(snapshotId: string, packageId: string, resultId = "result.first", overrides: Partial<ResultRecord> = {}): ResultRecord {
  return {
    format: "plan-package-result",
    format_version: "1",
    result_id: resultId,
    package_id: packageId,
    snapshot_id: snapshotId,
    phase_id: "phase.save-outcome",
    activity: "implement",
    author: "agent:test",
    recorded_at: "2026-09-14T16:00:00.000Z",
    code_revision: "commit-result-1",
    environment: { node: "test" },
    related_item_ids: ["criterion.successful-save"],
    intended_work: [{ id: "intent.boundary", text_md: "Implement the outcome boundary.", disposition: "intended", related_item_ids: ["task.save-outcome-implementation"] }],
    observed_facts: [{ id: "fact.readback", text_md: "The saved snapshot can be read back.", disposition: "observed", related_item_ids: ["criterion.successful-save"] }],
    inferences: [],
    unverified_claims: [],
    produced_interfaces: [{ id: "interface.outcome", name: "Outcome interface", description_md: "Returns saved or unsaved.", disposition: "observed", related_item_ids: ["criterion.successful-save"] }],
    deviations: [],
    unresolved_findings: [],
    evidence: [{ id: "evidence.readback", kind: "test", label: "Read-back test", locator: "snapshot-store.test.ts", code_revision: "commit-result-1", statement_ids: ["fact.readback"], status: "current" }],
    delivery_facts: { review_status: "pending", integration_status: "not-integrated" },
    continuation_notes: [],
    supersedes: [],
    illustrative: false,
    ...overrides,
  };
}

describe("durable plan snapshots", () => {
  it("persists a complete candidate and reopens it without draft files or roots", async () => {
    const fixture = await copyFixture("save-outcome");
    const store = new CandidateStore();
    const candidate = await store.loadAndPublish({ packageRoot: fixture.packageRoot });
    if (!candidate?.snapshotId) throw new Error("Candidate should have a durable snapshot.");

    const snapshotStore = new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") });
    const before = candidate.getFileBytes("file.save-outcome-notes");
    await unlink(join(fixture.packageRoot, "plan.json"));
    await unlink(join(fixture.packageRoot, "docs/save-outcome-notes.md"));
    await unlink(join(fixture.packageRoot, "assets/save-outcome.svg"));

    const reopened = await snapshotStore.open(candidate.snapshotId);

    expect(reopened.snapshot?.plan.title).toBe("Expose the saved-progress outcome");
    expect(reopened.snapshot?.descriptor.snapshot_id).toBe(candidate.snapshotId);
    expect(reopened.snapshot?.getFileBytes("file.save-outcome-notes")).toEqual(before);
    expect(reopened.snapshot?.getFileBytes("file.save-outcome-diagram")).not.toBeNull();
    expect(reopened.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("reopens retained repository-root bytes after the original source is removed", async () => {
    const fixture = await copyFixture("save-outcome");
    const temporaryRepositoryRoot = await mkdtemp(join(tmpdir(), "plan-repository-root-"));
    const repositoryFilePath = join(temporaryRepositoryRoot, "handoff-notes.md");
    const repositoryBytes = new TextEncoder().encode("Retained handoff source for the P3 trial.\n");
    await writeFile(repositoryFilePath, repositoryBytes);

    const manifestPath = join(fixture.packageRoot, "plan.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files: Array<{ id: string; root: string; path: string; sha256: string }> };
    const firstFile = manifest.files[0];
    if (!firstFile) throw new Error("Fixture has no files.");
    firstFile.root = "repository";
    firstFile.path = "handoff-notes.md";
    firstFile.sha256 = createHash("sha256").update(repositoryBytes).digest("hex");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const candidate = await new CandidateStore().loadAndPublish({ packageRoot: fixture.packageRoot, repositoryRoot: temporaryRepositoryRoot });
    if (!candidate?.snapshotId) throw new Error("Repository-root candidate should publish.");
    await unlink(repositoryFilePath);

    const reopened = await new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") }).open(candidate.snapshotId);
    expect(reopened.snapshot?.getFileBytes(firstFile.id)).toEqual(repositoryBytes);
    expect(reopened.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("converges concurrent identical writes and retains repository-root bytes", async () => {
    const fixture = await copyFixture("save-outcome");
    const manifestPath = join(fixture.packageRoot, "plan.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files: Array<{ id: string; root: string; path: string; sha256: string }> };
    const repositoryBytes = new Uint8Array(await readFile(join(repositoryRoot, "README.md")));
    const firstFile = manifest.files[0];
    if (!firstFile) throw new Error("Fixture has no files.");
    firstFile.root = "repository";
    firstFile.path = "README.md";
    firstFile.sha256 = createHash("sha256").update(repositoryBytes).digest("hex");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const candidate = await loadCandidate({ packageRoot: fixture.packageRoot, repositoryRoot });
    if (!candidate.candidate) throw new Error("Repository-root candidate should load.");
    const snapshotStore = new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") });
    const capture = {
      packageId: candidate.candidate.packageId,
      revision: candidate.candidate.revision,
      contentId: candidate.candidate.contentId,
      manifestBytes: candidate.candidate.manifestBytes,
      plan: candidate.candidate.plan,
      files: candidate.candidate.files,
      snapshotFiles: candidate.candidate.snapshotFiles,
      snapshotOmissions: candidate.candidate.snapshotOmissions,
    };
    const [first, second] = await Promise.all([snapshotStore.persist(capture), snapshotStore.persist(capture)]);
    const reopened = await snapshotStore.open(first.snapshot_id);

    expect(second.snapshot_id).toBe(first.snapshot_id);
    expect(reopened.snapshot?.getFileBytes(firstFile.id)).toEqual(repositoryBytes);
  });

  it("preserves optional omissions while selected asset dependencies remain required", async () => {
    const optional = await copyFixture("save-outcome");
    const optionalManifestPath = join(optional.packageRoot, "plan.json");
    const optionalManifest = JSON.parse(await readFile(optionalManifestPath, "utf8")) as {
      files: Array<{ id: string; required: boolean }>;
      references: Array<{ required: boolean }>;
    };
    optionalManifest.files[0]!.required = false;
    optionalManifest.references[0]!.required = false;
    await writeFile(optionalManifestPath, `${JSON.stringify(optionalManifest, null, 2)}\n`);
    await unlink(join(optional.packageRoot, "docs/save-outcome-notes.md"));
    const optionalStore = new CandidateStore();
    const optionalCandidate = await optionalStore.loadAndPublish({ packageRoot: optional.packageRoot });
    if (!optionalCandidate?.snapshotId) throw new Error("Optional omission should remain reviewable.");
    const optionalSnapshot = await new SnapshotStore({ root: join(optional.packageRoot, ".plan-package") }).open(optionalCandidate.snapshotId);
    const omitted = optionalSnapshot.snapshot?.descriptor.files.find((file) => file.id === "file.save-outcome-notes");
    expect(omitted?.available).toBe(false);
    expect(omitted?.omission?.code).toBe("missing-optional-file");

    const requiredAsset = await copyFixture("offline-recovery");
    const requiredManifestPath = join(requiredAsset.packageRoot, "plan.json");
    const requiredManifest = JSON.parse(await readFile(requiredManifestPath, "utf8")) as {
      assets: Array<{ required: boolean }>;
    };
    requiredManifest.assets[0]!.required = false;
    await writeFile(requiredManifestPath, `${JSON.stringify(requiredManifest, null, 2)}\n`);
    await unlink(join(requiredAsset.packageRoot, "assets/recovery-flow.svg"));
    const rejected = await new CandidateStore().loadAndPublish({ packageRoot: requiredAsset.packageRoot });
    expect(rejected).toBeNull();
  });

  it("records explicit acceptance with idempotent retries and rejects conflicting reuse", async () => {
    const fixture = await copyFixture("save-outcome");
    const candidate = await new CandidateStore().loadAndPublish({ packageRoot: fixture.packageRoot });
    if (!candidate?.snapshotId) throw new Error("Candidate should have a durable snapshot.");
    const snapshotStore = new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") });
    const record = recordFor(candidate.snapshotId, candidate.packageId);

    const first = await snapshotStore.recordAcceptance(record);
    const retry = await snapshotStore.recordAcceptance({ ...record, recorded_at: "2026-09-13T16:01:00.000Z" });
    const conflict = await snapshotStore.recordAcceptance({ ...record, instruction: "A conflicting instruction." });
    const history = await snapshotStore.listAcceptances(candidate.packageId);

    expect(first.created).toBe(true);
    expect(retry.idempotent).toBe(true);
    expect(conflict.diagnostics.map((diagnostic) => diagnostic.code)).toContain("acceptance-record-conflict");
    expect(history.records).toHaveLength(1);
    expect(history.records[0]?.snapshot_id).toBe(candidate.snapshotId);
  });

  it("fails closed on corrupted retained bytes and preserves the previous runtime candidate on store failure", async () => {
    const fixture = await copyFixture("save-outcome");
    const store = new CandidateStore();
    const first = await store.loadAndPublish({ packageRoot: fixture.packageRoot });
    if (!first?.snapshotId) throw new Error("Initial candidate should publish.");
    const descriptor = JSON.parse(await readFile(join(fixture.packageRoot, ".plan-package", "snapshots", `${first.snapshotId}.json`), "utf8")) as { manifest_sha256: string };
    await writeFile(join(fixture.packageRoot, ".plan-package", "blobs", descriptor.manifest_sha256), "corrupt\n");
    const corrupted = await new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") }).open(first.snapshotId);
    expect(corrupted.snapshot).toBeNull();
    expect(corrupted.diagnostics.map((diagnostic) => diagnostic.code)).toContain("snapshot-blob-corrupt");

    const failingFixture = await copyFixture("save-outcome");
    const failing = new CandidateStore();
    const rejected = await failing.loadAndPublish({
      packageRoot: failingFixture.packageRoot,
      snapshotStore: new SnapshotStore({ root: join(failingFixture.packageRoot, ".plan-package"), beforeWrite: () => { throw new Error("disk full"); } }),
    });
    expect(rejected).toBeNull();
    expect(failing.getState().lastAttempt).toBe("rejected");
    expect(failing.getState().diagnostics.map((diagnostic) => diagnostic.code)).toContain("snapshot-persistence-failed");
  });

  it("records and reopens an attributable result after the draft files disappear", async () => {
    const fixture = await copyFixture("save-outcome");
    const candidate = await new CandidateStore().loadAndPublish({ packageRoot: fixture.packageRoot });
    if (!candidate?.snapshotId) throw new Error("Candidate should have a durable snapshot.");
    const snapshotStore = new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") });
    const record = resultFor(candidate.snapshotId, candidate.packageId);
    const manifestBefore = await readFile(join(fixture.packageRoot, "plan.json"));

    const written = await snapshotStore.recordResult(record);
    expect(written.created).toBe(true);
    expect(written.result?.snapshot_id).toBe(candidate.snapshotId);
    expect(written.result?.phase_id).toBe("phase.save-outcome");
    expect(await readFile(join(fixture.packageRoot, "plan.json"))).toEqual(manifestBefore);

    await unlink(join(fixture.packageRoot, "plan.json"));
    await unlink(join(fixture.packageRoot, "docs/save-outcome-notes.md"));
    await unlink(join(fixture.packageRoot, "assets/save-outcome.svg"));

    const reopened = await new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") }).openResult(record.result_id);
    expect(reopened.result?.snapshot_id).toBe(candidate.snapshotId);
    expect(reopened.result?.package_id).toBe(candidate.packageId);
    expect(reopened.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });

  it("makes retries idempotent, conflicts visible, and superseded history explicit", async () => {
    const fixture = await copyFixture("save-outcome");
    const candidate = await new CandidateStore().loadAndPublish({ packageRoot: fixture.packageRoot });
    if (!candidate?.snapshotId) throw new Error("Candidate should have a durable snapshot.");
    const snapshotStore = new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") });
    const first = resultFor(candidate.snapshotId, candidate.packageId, "result.first");
    const second = resultFor(candidate.snapshotId, candidate.packageId, "result.repaired", {
      recorded_at: "2026-09-14T17:00:00.000Z",
      code_revision: "commit-result-2",
      supersedes: ["result.first"],
    });

    expect((await snapshotStore.recordResult(first)).created).toBe(true);
    const retry = await snapshotStore.recordResult({ ...first, recorded_at: "2026-09-14T16:01:00.000Z" });
    const conflict = await snapshotStore.recordResult({ ...first, observed_facts: [{ ...first.observed_facts[0]!, text_md: "A different observation." }] });
    expect(retry.idempotent).toBe(true);
    expect(conflict.diagnostics.map((diagnostic) => diagnostic.code)).toContain("result-record-conflict");

    expect((await snapshotStore.recordResult(second)).created).toBe(true);
    const history = await snapshotStore.listResults(candidate.packageId, candidate.snapshotId, "phase.save-outcome");
    expect(history.records.map((result) => result.result_id)).toEqual(["result.first", "result.repaired"]);
    expect(history.current.map((result) => result.result_id)).toEqual(["result.repaired"]);
  });

  it("converges concurrent retries for one immutable result ID", async () => {
    const fixture = await copyFixture("save-outcome");
    const candidate = await new CandidateStore().loadAndPublish({ packageRoot: fixture.packageRoot });
    if (!candidate?.snapshotId) throw new Error("Candidate should have a durable snapshot.");
    const snapshotStore = new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") });
    const [first, second] = await Promise.all([
      snapshotStore.recordResult(resultFor(candidate.snapshotId, candidate.packageId, "result.concurrent", { recorded_at: "2026-09-14T16:00:00.000Z" })),
      snapshotStore.recordResult(resultFor(candidate.snapshotId, candidate.packageId, "result.concurrent", { recorded_at: "2026-09-14T16:01:00.000Z" })),
    ]);

    expect(first.result).not.toBeNull();
    expect(second.result).not.toBeNull();
    expect([first.created, second.created].filter(Boolean)).toHaveLength(1);
    expect([first.idempotent, second.idempotent].filter(Boolean)).toHaveLength(1);
    expect((await snapshotStore.listResults(candidate.packageId)).records.map((result) => result.result_id)).toEqual(["result.concurrent"]);
  });

  it("rejects mismatched or corrupt records without making them readable history", async () => {
    const fixture = await copyFixture("save-outcome");
    const candidate = await new CandidateStore().loadAndPublish({ packageRoot: fixture.packageRoot });
    if (!candidate?.snapshotId) throw new Error("Candidate should have a durable snapshot.");
    const root = join(fixture.packageRoot, ".plan-package");
    const snapshotStore = new SnapshotStore({ root });

    const wrongPackage = await snapshotStore.recordResult(resultFor(candidate.snapshotId, "other-package", "result.wrong-package"));
    expect(wrongPackage.result).toBeNull();
    expect(wrongPackage.diagnostics.map((diagnostic) => diagnostic.code)).toContain("result-package-mismatch");

    const wrongItem = await snapshotStore.recordResult(resultFor(candidate.snapshotId, candidate.packageId, "result.wrong-item", { related_item_ids: ["criterion.missing"] }));
    expect(wrongItem.result).toBeNull();
    expect(wrongItem.diagnostics.map((diagnostic) => diagnostic.code)).toContain("result-related-item-unavailable");

    const good = resultFor(candidate.snapshotId, candidate.packageId, "result.corruptible");
    expect((await snapshotStore.recordResult(good)).created).toBe(true);
    await writeFile(join(root, "results", `${good.result_id}.json`), "{\n");
    const opened = await new SnapshotStore({ root }).openResult(good.result_id);
    expect(opened.result).toBeNull();
    expect(opened.diagnostics.map((diagnostic) => diagnostic.code)).toContain("result-record-corrupt");
    expect((await snapshotStore.listResults(candidate.packageId)).records.map((result) => result.result_id)).not.toContain(good.result_id);
  });

  it("retains stale evidence as a visible limitation and preserves prior records on write failure", async () => {
    const fixture = await copyFixture("save-outcome");
    const candidate = await new CandidateStore().loadAndPublish({ packageRoot: fixture.packageRoot });
    if (!candidate?.snapshotId) throw new Error("Candidate should have a durable snapshot.");
    const stale = resultFor(candidate.snapshotId, candidate.packageId, "result.stale", {
      evidence: [{ id: "evidence.old", kind: "test", label: "Old test", locator: "old-test", code_revision: "old-commit", statement_ids: ["fact.readback"], status: "current" }],
    });
    const snapshotStore = new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") });
    const written = await snapshotStore.recordResult(stale);
    expect(written.created).toBe(true);
    expect(written.diagnostics.map((diagnostic) => diagnostic.code)).toContain("stale-evidence");

    const failingStore = new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package"), beforeWrite: (_path, kind) => {
      if (kind === "result") throw new Error("disk full");
    } });
    const failed = await failingStore.recordResult(resultFor(candidate.snapshotId, candidate.packageId, "result.failed-write"));
    expect(failed.result).toBeNull();
    expect(failed.diagnostics.map((diagnostic) => diagnostic.code)).toContain("result-record-write-failed");
    expect((await snapshotStore.listResults(candidate.packageId)).records.map((result) => result.result_id)).toContain("result.stale");
  });
});
