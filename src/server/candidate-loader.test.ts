import { createHash } from "node:crypto";
import { appendFile, cp, mkdtemp, readFile, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadCandidate } from "./candidate-loader.js";
import { CandidateStore } from "./candidate-store.js";
import { publishPackage } from "./publication.js";

const repositoryRoot = resolve(process.cwd());

async function copyFixture(name: string): Promise<{ temporaryRoot: string; packageRoot: string }> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-package-"));
  const packageRoot = join(temporaryRoot, name);
  await cp(resolve(repositoryRoot, "examples", name), packageRoot, { recursive: true });
  return { temporaryRoot, packageRoot };
}

function diagnosticCodes(result: { diagnostics: readonly { code: string }[] }): string[] {
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe("candidate loading and publication", () => {
  it("loads both data-driven fixtures from absolute declared roots", async () => {
    const offline = await copyFixture("offline-recovery");
    const saveOutcome = await copyFixture("save-outcome");

    const offlineResult = await loadCandidate({ packageRoot: offline.packageRoot, repositoryRoot });
    const saveResult = await loadCandidate({ packageRoot: saveOutcome.packageRoot, repositoryRoot });

    expect(offlineResult.candidate?.plan.phases).toHaveLength(2);
    expect(offlineResult.candidate?.plan.title).toContain("offline exercise recovery");
    expect(diagnosticCodes(offlineResult)).toContain("external-not-fetched");
    expect(saveResult.candidate?.plan.phases).toHaveLength(1);
    expect(saveResult.candidate?.plan.title).toContain("saved-progress outcome");
    expect(saveResult.candidate?.packageId).not.toBe(offlineResult.candidate?.packageId);
  });

  it("resolves a repository-root file only when that root is explicitly supplied", async () => {
    const fixture = await copyFixture("save-outcome");
    const manifestPath = join(fixture.packageRoot, "plan.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files: Array<{ root: string; path: string; sha256: string }> };
    const repositoryReadme = new Uint8Array(await readFile(join(repositoryRoot, "README.md")));
    const digest = createHash("sha256").update(repositoryReadme).digest("hex");
    const firstFile = manifest.files[0];
    if (!firstFile) throw new Error("Fixture has no files.");
    firstFile.root = "repository";
    firstFile.path = "README.md";
    firstFile.sha256 = digest;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const withoutRoot = await loadCandidate({ packageRoot: fixture.packageRoot });
    const withRoot = await loadCandidate({ packageRoot: fixture.packageRoot, repositoryRoot });

    expect(withoutRoot.candidate).toBeNull();
    expect(diagnosticCodes(withoutRoot)).toContain("missing-declared-root");
    expect(withRoot.candidate?.files.get("file.save-outcome-notes")?.file.root).toBe("repository");
  });

  it("rejects malformed manifests, stale digests, and missing required files", async () => {
    const malformed = await copyFixture("save-outcome");
    await writeFile(join(malformed.packageRoot, "plan.json"), "{\n");
    const malformedResult = await loadCandidate({ packageRoot: malformed.packageRoot });

    const stale = await copyFixture("save-outcome");
    await writeFile(join(stale.packageRoot, "docs/save-outcome-notes.md"), "changed without publication\n");
    const staleResult = await loadCandidate({ packageRoot: stale.packageRoot });

    const missing = await copyFixture("save-outcome");
    await unlink(join(missing.packageRoot, "assets/save-outcome.svg"));
    const missingResult = await loadCandidate({ packageRoot: missing.packageRoot });

    expect(malformedResult.candidate).toBeNull();
    expect(diagnosticCodes(malformedResult)).toContain("malformed-json");
    expect(staleResult.candidate).toBeNull();
    expect(diagnosticCodes(staleResult)).toContain("digest-mismatch");
    expect(missingResult.candidate).toBeNull();
    expect(diagnosticCodes(missingResult)).toContain("missing-file");
  });

  it("keeps unresolved blocking questions out of the valid-revision path", async () => {
    const fixture = await copyFixture("save-outcome");
    const manifestPath = join(fixture.packageRoot, "plan.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest["questions"] = [{
      id: "question.blocking",
      title: "Need a product decision",
      question_md: "Which persistence boundary owns the retry?",
      status: "open",
      blocking: true,
      applies_to: ["phase.save-outcome"],
    }];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const result = await loadCandidate({ packageRoot: fixture.packageRoot });

    expect(result.candidate).toBeNull();
    expect(diagnosticCodes(result)).toContain("blocking-question");
  });

  it("rejects traversal and symlink escapes before serving bytes", async () => {
    const traversal = await copyFixture("save-outcome");
    const manifestPath = join(traversal.packageRoot, "plan.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files: Array<{ path: string }> };
    const firstFile = manifest.files[0];
    if (!firstFile) throw new Error("Fixture has no files.");
    firstFile.path = "../outside.txt";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const traversalResult = await loadCandidate({ packageRoot: traversal.packageRoot });

    const symlinked = await copyFixture("save-outcome");
    const outsidePath = join(symlinked.temporaryRoot, "outside.txt");
    await writeFile(outsidePath, "outside package root\n");
    const targetPath = join(symlinked.packageRoot, "docs/save-outcome-notes.md");
    await unlink(targetPath);
    await symlink(outsidePath, targetPath);
    const symlinkResult = await loadCandidate({ packageRoot: symlinked.packageRoot });

    expect(traversalResult.candidate).toBeNull();
    expect(diagnosticCodes(traversalResult)).toContain("unsafe-path");
    expect(symlinkResult.candidate).toBeNull();
    expect(diagnosticCodes(symlinkResult)).toContain("path-confinement");
  });

  it("discards a manifest that changes during resolution", async () => {
    const fixture = await copyFixture("save-outcome");
    const result = await loadCandidate({
      packageRoot: fixture.packageRoot,
      onBeforeFinalManifestRead: async () => appendFile(join(fixture.packageRoot, "plan.json"), "\n"),
    });

    expect(result.candidate).toBeNull();
    expect(diagnosticCodes(result)).toContain("manifest-mutated-during-load");
  });

  it("serves captured asset bytes after the working file changes", async () => {
    const fixture = await copyFixture("save-outcome");
    const store = new CandidateStore();
    const candidate = await store.loadAndPublish({ packageRoot: fixture.packageRoot });
    if (!candidate) throw new Error("Fixture should load.");
    const before = store.getAsset(candidate.contentId, "asset.save-outcome-diagram");
    if (!before) throw new Error("Fixture asset should load.");
    await writeFile(join(fixture.packageRoot, "assets/save-outcome.svg"), "changed after capture\n");
    const after = store.getAsset(candidate.contentId, "asset.save-outcome-diagram");

    expect(after?.bytes).toEqual(before.bytes);
    expect(after?.bytes).not.toEqual(new TextEncoder().encode("changed after capture\n"));
  });

  it("retains the last published candidate when a later load fails", async () => {
    const fixture = await copyFixture("save-outcome");
    const store = new CandidateStore();
    const first = await store.loadAndPublish({ packageRoot: fixture.packageRoot });
    if (!first) throw new Error("Fixture should load.");
    await writeFile(join(fixture.packageRoot, "docs/save-outcome-notes.md"), "changed without publication\n");
    const rejected = await store.loadAndPublish({ packageRoot: fixture.packageRoot });

    expect(rejected).toBeNull();
    expect(store.getCurrentCandidate()?.contentId).toBe(first.contentId);
    expect(store.getState().diagnostics.map((diagnostic) => diagnostic.code)).toContain("digest-mismatch");
  });

  it("publishes a validated manifest with new digests and an incremented revision", async () => {
    const fixture = await copyFixture("save-outcome");
    await writeFile(join(fixture.packageRoot, "docs/save-outcome-notes.md"), "A newly published wording.\n");

    const result = await publishPackage({ packageRoot: fixture.packageRoot });
    const manifest = JSON.parse(await readFile(join(fixture.packageRoot, "plan.json"), "utf8")) as { revision: number; files: Array<{ path: string; sha256: string }> };
    const note = manifest.files.find((file) => file.path === "docs/save-outcome-notes.md");

    expect(result.published).toBe(true);
    expect(result.revision).toBe(2);
    expect(result.candidate?.revision).toBe(2);
    expect(manifest.revision).toBe(2);
    expect(note?.sha256).toBe("f5023d4d1f206d8f63ea675ce9aa8f8eb951b8337377f7a670e5e2000d0177a9");
  });

  it("leaves the existing manifest in place when publication validation fails", async () => {
    const fixture = await copyFixture("save-outcome");
    const manifestPath = join(fixture.packageRoot, "plan.json");
    const before = await readFile(manifestPath);
    const manifest = JSON.parse(before.toString("utf8")) as Record<string, unknown>;
    manifest["phases"] = [];
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const invalidSource = await readFile(manifestPath);
    const result = await publishPackage({ packageRoot: fixture.packageRoot });

    expect(result.published).toBe(false);
    expect(await readFile(manifestPath)).toEqual(invalidSource);
  });
});
