import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

import type { ResultRecord } from "../core/result.js";
import { startRuntime, type RunningRuntime } from "../server/runtime.js";
import { publishPackage } from "../server/publication.js";
import { SnapshotStore } from "../server/snapshot-store.js";

const repositoryRoot = resolve(process.cwd());
let offlineRuntime: RunningRuntime | undefined;
let saveOutcomeRuntime: RunningRuntime | undefined;
let offlineFixture: { packageRoot: string } | undefined;
let saveOutcomeFixture: { packageRoot: string } | undefined;

function runtimeUrl(runtime: RunningRuntime): string {
  return `http://${runtime.host}:${runtime.port}`;
}

async function copyFixture(name: string): Promise<{ packageRoot: string }> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-viewer-e2e-"));
  const packageRoot = join(temporaryRoot, name);
  await cp(resolve(repositoryRoot, "examples", name), packageRoot, { recursive: true });
  await rm(join(packageRoot, ".plan-package"), { recursive: true, force: true });
  return { packageRoot };
}

function viewerResultFor(snapshotId: string, resultId: string, codeRevision: string, overrides: Partial<ResultRecord> = {}): ResultRecord {
  const factId = `fact.${resultId.replaceAll("result.", "")}`;
  const evidenceId = `evidence.${resultId.replaceAll("result.", "")}`;
  return {
    format: "plan-package-result",
    format_version: "1",
    result_id: resultId,
    package_id: "offline-recovery",
    snapshot_id: snapshotId,
    phase_id: "phase.recovery-experience",
    activity: "verify",
    author: "fixture:viewer-e2e",
    recorded_at: codeRevision === "viewer-before-repair" ? "2026-09-15T15:00:00.000Z" : "2026-09-15T15:01:00.000Z",
    code_revision: codeRevision,
    environment: { runner: "playwright", scenario: "result-panel" },
    related_item_ids: ["criterion.restore-choice", "criterion.recovery-outcome-contract"],
    intended_work: [],
    observed_facts: [{ id: factId, text_md: "The viewer can inspect this retained verification record.", disposition: "observed", related_item_ids: ["criterion.restore-choice"] }],
    inferences: [],
    unverified_claims: [],
    produced_interfaces: [],
    deviations: [],
    unresolved_findings: [],
    evidence: [{ id: evidenceId, kind: "test", label: "Viewer result-panel check", locator: "src/viewer/viewer.e2e.ts", code_revision: codeRevision, statement_ids: [factId], status: "current" }],
    delivery_facts: { review_status: "not-reviewed", integration_status: "not-integrated", notes_md: "This fixture result supports package inspection only; it is not a delivered exercise product." },
    continuation_notes: [],
    supersedes: [],
    illustrative: true,
    ...overrides,
  };
}

test.beforeAll(async () => {
  offlineFixture = await copyFixture("offline-recovery");
  saveOutcomeFixture = await copyFixture("save-outcome");
  offlineRuntime = await startRuntime({
    packageRoot: offlineFixture.packageRoot,
    repositoryRoot,
    port: 0,
    serveViewer: true,
    viewerRoot: repositoryRoot,
  });
  saveOutcomeRuntime = await startRuntime({
    packageRoot: saveOutcomeFixture.packageRoot,
    repositoryRoot,
    port: 0,
    serveViewer: true,
    viewerRoot: repositoryRoot,
  });
});

test.afterAll(async () => {
  await Promise.all([offlineRuntime?.close(), saveOutcomeRuntime?.close()]);
});

test("renders the structured offline package, navigates exact criteria, and exposes designs", async ({ page }) => {
  await page.goto(`${runtimeUrl(offlineRuntime!)}/#/packages/offline-recovery`);

  await expect(page.getByRole("heading", { name: "Make offline exercise recovery explicit", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Phase map", exact: true })).toBeVisible();
  const recoveryPhaseLink = page.getByRole("link", { name: "Explain restore and start-over choices", exact: true }).first();
  await expect(recoveryPhaseLink).toBeVisible();
  await expect(page.getByText("answered", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /Behavior diagram/ })).toBeVisible();

  let reloadRequests = 0;
  await page.route("**/api/reload", async (route) => {
    if (route.request().method() === "POST") reloadRequests += 1;
    await route.continue();
  });
  await page.getByRole("button", { name: "Reload package", exact: true }).click();
  await expect.poll(() => reloadRequests).toBe(1);

  await page.getByRole("button", { name: "Reload package", exact: true }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(recoveryPhaseLink).toBeFocused();
  expect(await recoveryPhaseLink.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe("solid");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/items\/phase\.recovery-experience$/);

  await page.getByRole("link", { name: "criterion.restore-choice", exact: true }).first().click();
  await expect(page).toHaveURL(/\/items\/criterion\.restore-choice$/);
  await expect(page.locator(".criterion--highlighted")).toContainText("A recoverable snapshot clearly identifies the exact progress");

  await page.goto(`${runtimeUrl(offlineRuntime!)}/#/packages/offline-recovery/items/no-such-item`);
  await expect(page.getByTestId("route-error")).toContainText("No addressable item named 'no-such-item'");
});

test("runs the selected mock inside a candidate-scoped sandbox", async ({ page }) => {
  await page.goto(`${runtimeUrl(offlineRuntime!)}/#/packages/offline-recovery/items/phase.recovery-experience`);
  const prototype = page.getByTestId("prototype-asset.recovery-prototype");
  const frame = page.frameLocator("[data-testid='prototype-asset.recovery-prototype']");

  await expect(frame.getByText("Illustrative prototype · mock behavior", { exact: true })).toBeVisible();
  await frame.getByRole("button", { name: "Restore snapshot", exact: true }).click();
  await expect(frame.getByRole("status")).toContainText("Mock outcome: restore would return 8 completed exercises.");
  await expect(prototype).toHaveAttribute("sandbox", "allow-scripts");
  await expect(prototype).toHaveAttribute("src", /\/prototypes\/asset\.recovery-prototype\/$/);

  const canReachViewer = await frame.locator("body").evaluate(() => {
    try {
      return Boolean(window.parent.document.getElementById("viewer-main"));
    } catch {
      return false;
    }
  });
  expect(canReachViewer).toBe(false);
});

test("uses a second package's own content instead of offline-recovery assumptions", async ({ page }) => {
  await page.goto(`${runtimeUrl(saveOutcomeRuntime!)}/#/packages/save-outcome/items/phase.save-outcome`);

  await expect(page.getByRole("heading", { name: "Expose the saved-progress outcome", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Return and consume the save outcome", exact: true })).toBeVisible();
  await expect(page.getByText("A successful write returns saved only after the persisted snapshot can be read back.", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /small diagram showing the distinction/ })).toBeVisible();
  await expect(page.getByText("Continue your offline practice?", { exact: true })).toHaveCount(0);
});

test("renders read-only result history consistently on overview and phase views", async ({ page }) => {
  const fixture = await copyFixture("offline-recovery");
  const runtime = await startRuntime({
    packageRoot: fixture.packageRoot,
    port: 0,
    watch: false,
    serveViewer: true,
    viewerRoot: repositoryRoot,
  });

  try {
    const base = runtimeUrl(runtime);
    const state = await (await fetch(`${base}/api/state`)).json() as { packageId: string; currentSnapshotId: string | null };
    if (!state.currentSnapshotId) throw new Error("The fixture did not publish a durable snapshot.");
    const snapshotId = state.currentSnapshotId;
    const store = new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") });
    expect((await store.recordAcceptance({
      format: "plan-package-acceptance",
      format_version: "1",
      record_id: "acceptance.viewer-results",
      package_id: state.packageId,
      snapshot_id: snapshotId,
      instruction: "I accept this exact result-panel snapshot.",
      source: "test:viewer-results",
      actor: "user:viewer-results",
      recorded_at: "2026-09-15T15:00:00.000Z",
      illustrative: false,
    })).created).toBe(true);

    const beforeRepair = viewerResultFor(snapshotId, "result.viewer-before-repair", "viewer-before-repair", {
      evidence: [{
        id: "evidence.viewer-before-repair",
        kind: "test",
        label: "Obsolete viewer verification",
        locator: "src/viewer/viewer.e2e.ts",
        code_revision: "viewer-obsolete",
        statement_ids: ["fact.viewer-before-repair"],
        status: "stale",
      }],
      unresolved_findings: [{
        id: "finding.viewer-repair",
        text_md: "The first verification pass is stale after the candidate repair.",
        severity: "consequential",
        disposition: "observed",
        related_item_ids: ["criterion.restore-choice"],
      }],
    });
    const afterRepair = viewerResultFor(snapshotId, "result.viewer-after-repair", "viewer-after-repair", {
      evidence: [{
        id: "evidence.viewer-after-repair",
        kind: "test",
        label: "Repaired viewer verification",
        locator: "src/viewer/viewer.e2e.ts",
        code_revision: "viewer-after-repair",
        statement_ids: ["fact.viewer-after-repair"],
        status: "current",
      }],
      supersedes: [beforeRepair.result_id],
    });
    expect((await store.recordResult(beforeRepair)).created).toBe(true);
    expect((await store.recordResult(afterRepair)).created).toBe(true);
    await fetch(`${base}/api/reload`, { method: "POST" });

    await page.goto(`${base}/#/packages/offline-recovery/snapshots/${snapshotId}`);
    await expect(page.getByText("Accepted snapshot", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("execution-results")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Result availability by phase", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "result.viewer-after-repair", exact: true })).toBeVisible();

    await page.goto(`${base}/#/packages/offline-recovery/snapshots/${snapshotId}/items/phase.recovery-experience`);
    const phaseResults = page.getByTestId("phase-results");
    await expect(phaseResults).toBeVisible();
    await expect(phaseResults.getByTestId("result-record-result.viewer-before-repair")).toContainText("superseded");
    await expect(phaseResults.getByTestId("result-record-result.viewer-before-repair")).toContainText("stale");
    await expect(phaseResults.getByTestId("result-record-result.viewer-before-repair")).toContainText("The first verification pass is stale after the candidate repair.");
    await expect(phaseResults.getByTestId("result-record-result.viewer-after-repair")).toContainText("current");
    await expect(phaseResults.getByTestId("result-record-result.viewer-after-repair")).toContainText("Evidence");
    await expect(phaseResults.getByTestId("result-record-result.viewer-after-repair")).toContainText("Review and integration facts");
    await expect(phaseResults.getByTestId("result-record-result.viewer-after-repair")).toContainText("This fixture result supports package inspection only; it is not a delivered exercise product.");
    await expect(phaseResults).toContainText(snapshotId);
    await expect(phaseResults).toContainText("src/viewer/viewer.e2e.ts");

    await page.setViewportSize({ width: 700, height: 1000 });
    await expect(page.locator(".result-metadata").first()).toBeVisible();
    const metadata = await page.locator(".result-metadata").first().boundingBox();
    const panel = await phaseResults.boundingBox();
    expect(metadata).not.toBeNull();
    expect(panel).not.toBeNull();
    expect(metadata!.width).toBeLessThanOrEqual(panel!.width);
  } finally {
    await page.goto("about:blank");
    await runtime.close();
  }
});

test("renders unsafe narrative as text and keeps an unsafe destination inert", async ({ page }) => {
  await page.route("**/api/candidates/*/model", async (route) => {
    const response = await route.fetch();
    const model = await response.json() as { package: { goal_md: string } };
    model.package.goal_md = "<script>window.viewerNarrativeInjection = true</script>\n\n[Do not run](javascript:window.viewerNarrativeInjection=true)";
    await route.fulfill({ response, json: model });
  });

  await page.goto(`${runtimeUrl(offlineRuntime!)}/#/packages/offline-recovery`);

  await expect(page.getByText("<script>window.viewerNarrativeInjection = true</script>", { exact: true })).toBeVisible();
  await expect(page.locator("a[href^='javascript:']")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { viewerNarrativeInjection?: boolean }).viewerNarrativeInjection)).toBeUndefined();
});

test("labels a blocking question and preserves the hierarchy from tablet to narrow layouts", async ({ page }) => {
  await page.route("**/api/candidates/*/model", async (route) => {
    const response = await route.fetch();
    const model = await response.json() as { package: { questions: Array<{ blocking: boolean; status: string }> } };
    model.package.questions[0]!.blocking = true;
    model.package.questions[0]!.status = "open";
    await route.fulfill({ response, json: model });
  });
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto(`${runtimeUrl(offlineRuntime!)}/#/packages/offline-recovery`);

  await expect(page.getByText("Open · blocking", { exact: true })).toBeVisible();
  const tabletSidebar = await page.locator(".viewer-sidebar").boundingBox();
  const tabletMain = await page.locator("#viewer-main").boundingBox();
  expect(tabletSidebar).not.toBeNull();
  expect(tabletMain).not.toBeNull();
  expect(tabletMain!.x).toBeGreaterThan(tabletSidebar!.x);

  await page.setViewportSize({ width: 740, height: 960 });
  const sidebar = await page.locator(".viewer-sidebar").boundingBox();
  const main = await page.locator("#viewer-main").boundingBox();
  expect(sidebar).not.toBeNull();
  expect(main).not.toBeNull();
  expect(main!.y).toBeGreaterThan(sidebar!.y);
});

test("refreshes complete edits and keeps the last valid revision visible for rejected edits", async ({ page }) => {
  const fixture = await copyFixture("save-outcome");
  const originalRevision = (JSON.parse(await readFile(join(fixture.packageRoot, "plan.json"), "utf8")) as { revision: number }).revision;
  const runtime = await startRuntime({
    packageRoot: fixture.packageRoot,
    port: 0,
    watchDebounceMs: 35,
    serveViewer: true,
    viewerRoot: repositoryRoot,
  });

  try {
    await page.goto(`${runtimeUrl(runtime)}/#/packages/save-outcome/items/phase.save-outcome`);
    await expect(page.getByTestId("connection-status")).toContainText("connected");
    await expect(page.getByTestId("current-revision")).toHaveText(String(originalRevision));
    const initialContentId = await page.getByTestId("content-id").innerText();

    const manifestPath = join(fixture.packageRoot, "plan.json");
    const notePath = join(fixture.packageRoot, "docs/save-outcome-notes.md");
    await writeFile(notePath, "A complete watched update is now available.\n");
    const published = await publishPackage({ packageRoot: fixture.packageRoot });
    expect(published.published).toBe(true);
    const publishedManifest = await readFile(manifestPath);

    await expect(page.getByTestId("current-revision")).toHaveText(String(originalRevision + 1), { timeout: 5_000 });
    await expect(page.getByTestId("content-id")).not.toHaveText(initialContentId);

    await writeFile(manifestPath, "{\n");
    await expect(page.getByTestId("last-valid-notice")).toContainText(`last valid revision ${originalRevision + 1}`, { timeout: 5_000 });
    await expect(page.getByTestId("diagnostics")).toContainText("malformed-json");
    await expect(page.getByTestId("current-revision")).toHaveText(String(originalRevision + 1));

    await writeFile(manifestPath, publishedManifest);
    await expect(page.getByTestId("last-valid-notice")).toHaveCount(0, { timeout: 5_000 });
  } finally {
    await page.goto("about:blank");
    await runtime.close();
  }
});

test("falls back to a surviving phase when a selected item is removed", async ({ page }) => {
  const fixture = await copyFixture("offline-recovery");
  const runtime = await startRuntime({
    packageRoot: fixture.packageRoot,
    port: 0,
    watchDebounceMs: 35,
    serveViewer: true,
    viewerRoot: repositoryRoot,
  });

  try {
    await page.goto(`${runtimeUrl(runtime)}/#/packages/offline-recovery/items/criterion.restore-choice`);
    await expect(page.locator(".criterion--highlighted")).toContainText("A recoverable snapshot clearly identifies the exact progress");

    const manifestPath = join(fixture.packageRoot, "plan.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      phases: Array<{ id: string; acceptance_criteria: Array<{ id: string }> }>;
      assets: Array<{ applies_to: string[] }>;
      decisions: Array<{ applies_to: string[] }>;
    };
    const recoveryPhase = manifest.phases.find((phase) => phase.id === "phase.recovery-experience");
    if (!recoveryPhase) throw new Error("Recovery phase is missing from the fixture.");
    recoveryPhase.acceptance_criteria = recoveryPhase.acceptance_criteria.filter((criterion) => criterion.id !== "criterion.restore-choice");
    for (const entry of [...manifest.assets, ...manifest.decisions]) {
      entry.applies_to = entry.applies_to.filter((itemId) => itemId !== "criterion.restore-choice");
    }
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const published = await publishPackage({ packageRoot: fixture.packageRoot });
    expect(published.published).toBe(true);

    await expect(page).toHaveURL(/\/items\/phase\.recovery-experience$/, { timeout: 5_000 });
    await expect(page.getByTestId("navigation-notice")).toContainText("criterion 'criterion.restore-choice' was removed");
    await expect(page.getByRole("heading", { name: "Explain restore and start-over choices", exact: true }).first()).toBeVisible();
  } finally {
    await page.goto("about:blank");
    await runtime.close();
  }
});

test("reconnects after a runtime restart and reloads the current state", async ({ page }) => {
  const fixture = await copyFixture("save-outcome");
  const originalRevision = (JSON.parse(await readFile(join(fixture.packageRoot, "plan.json"), "utf8")) as { revision: number }).revision;
  const firstRuntime = await startRuntime({
    packageRoot: fixture.packageRoot,
    port: 0,
    watchDebounceMs: 35,
    serveViewer: true,
    viewerRoot: repositoryRoot,
  });

  await page.goto(`${runtimeUrl(firstRuntime)}/#/packages/save-outcome`);
  await expect(page.getByTestId("connection-status")).toContainText("connected");
  const port = firstRuntime.port;
  await firstRuntime.close();
  await expect(page.getByTestId("connection-status")).toContainText(/reconnecting|offline/, { timeout: 5_000 });

  let restartedRuntime: RunningRuntime | undefined;
  try {
    restartedRuntime = await startRuntime({
      packageRoot: fixture.packageRoot,
      port,
      watchDebounceMs: 35,
      serveViewer: true,
      viewerRoot: repositoryRoot,
    });
    await expect(page.getByTestId("connection-status")).toContainText("connected", { timeout: 8_000 });
    await expect(page.getByTestId("current-revision")).toHaveText(String(originalRevision));
    await expect(page.getByRole("heading", { name: "Expose the saved-progress outcome", exact: true }).first()).toBeVisible();
  } finally {
    await page.goto("about:blank");
    await restartedRuntime?.close();
  }
});

test("opens the latest real acceptance as a concrete pinned route and compares it with the draft", async ({ page }) => {
  const fixture = await copyFixture("offline-recovery");
  const runtime = await startRuntime({
    packageRoot: fixture.packageRoot,
    port: 0,
    watch: false,
    serveViewer: true,
    viewerRoot: repositoryRoot,
  });

  try {
    const before = await (await fetch(`${runtimeUrl(runtime)}/api/state`)).json() as { packageId: string; currentSnapshotId: string; currentRevision: number; };
    const snapshotStore = new SnapshotStore({ root: join(fixture.packageRoot, ".plan-package") });
    const recorded = await snapshotStore.recordAcceptance({
      format: "plan-package-acceptance",
      format_version: "1",
      record_id: "acceptance.viewer-pinned",
      package_id: before.packageId,
      snapshot_id: before.currentSnapshotId,
      instruction: "I accept this exact illustrative viewer proposal.",
      source: "conversation:viewer-e2e",
      actor: "test:viewer-e2e",
      recorded_at: "2026-09-13T18:00:00.000Z",
      illustrative: false,
    });
    expect(recorded.created).toBe(true);
    await writeFile(join(fixture.packageRoot, "docs/behavior-notes.md"), "The newer draft wording is deliberately different.\n");
    await writeFile(join(fixture.packageRoot, "designs/recovery-prototype.css"), "body { background: #fef3c7; }\n");
    expect((await publishPackage({ packageRoot: fixture.packageRoot })).published).toBe(true);
    await fetch(`${runtimeUrl(runtime)}/api/reload`, { method: "POST" });

    await page.goto(`${runtimeUrl(runtime)}/#/packages/offline-recovery`);
    await expect(page.getByText("Accepted snapshot", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("acceptance-provenance")).toContainText("test:viewer-e2e");
    await expect(page).toHaveURL(new RegExp(`/snapshots/${before.currentSnapshotId}$`));
    await expect(page.getByTestId("compare-with-draft")).toBeVisible();

    await page.getByTestId("compare-with-draft").click();
    await expect(page.getByTestId("comparison-summary")).toBeVisible();
    await expect(page.getByTestId("comparison-summary")).toContainText("file.behavior-notes");
    await expect(page.getByTestId("comparison-summary")).toContainText("file.recovery-prototype-css");
    await expect(page.getByTestId("comparison-summary")).toContainText("asset.recovery-prototype");

    await page.getByTestId("view-draft").click();
    await expect(page).toHaveURL(/\/draft$/);
    await expect(page.getByText("Working draft", { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId("current-revision")).toHaveText(String(before.currentRevision + 1));
  } finally {
    await page.goto("about:blank");
    await runtime.close();
  }
});
