import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { startRuntime, type RunningRuntime } from "../server/runtime.js";
import { publishPackage } from "../server/publication.js";

const repositoryRoot = resolve(process.cwd());
let offlineRuntime: RunningRuntime | undefined;
let saveOutcomeRuntime: RunningRuntime | undefined;

function runtimeUrl(runtime: RunningRuntime): string {
  return `http://${runtime.host}:${runtime.port}`;
}

async function copyFixture(name: string): Promise<{ packageRoot: string }> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "plan-viewer-e2e-"));
  const packageRoot = join(temporaryRoot, name);
  await cp(resolve(repositoryRoot, "examples", name), packageRoot, { recursive: true });
  return { packageRoot };
}

test.beforeAll(async () => {
  offlineRuntime = await startRuntime({
    packageRoot: resolve(repositoryRoot, "examples/offline-recovery"),
    repositoryRoot,
    port: 0,
    serveViewer: true,
    viewerRoot: repositoryRoot,
  });
  saveOutcomeRuntime = await startRuntime({
    packageRoot: resolve(repositoryRoot, "examples/save-outcome"),
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
  await expect(page.getByText("Open · non-blocking", { exact: true })).toBeVisible();
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
    const model = await response.json() as { package: { questions: Array<{ blocking: boolean }> } };
    model.package.questions[0]!.blocking = true;
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
    await expect(page.getByTestId("current-revision")).toHaveText("1");
    const initialContentId = await page.getByTestId("content-id").innerText();

    const manifestPath = join(fixture.packageRoot, "plan.json");
    const notePath = join(fixture.packageRoot, "docs/save-outcome-notes.md");
    await writeFile(notePath, "A complete watched update is now available.\n");
    const published = await publishPackage({ packageRoot: fixture.packageRoot });
    expect(published.published).toBe(true);
    const publishedManifest = await readFile(manifestPath);

    await expect(page.getByTestId("current-revision")).toHaveText("2", { timeout: 5_000 });
    await expect(page.getByTestId("content-id")).not.toHaveText(initialContentId);

    await writeFile(manifestPath, "{\n");
    await expect(page.getByTestId("last-valid-notice")).toContainText("last valid revision 2", { timeout: 5_000 });
    await expect(page.getByTestId("diagnostics")).toContainText("malformed-json");
    await expect(page.getByTestId("current-revision")).toHaveText("2");

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
    await expect(page.getByTestId("current-revision")).toHaveText("1");
    await expect(page.getByRole("heading", { name: "Expose the saved-progress outcome", exact: true }).first()).toBeVisible();
  } finally {
    await page.goto("about:blank");
    await restartedRuntime?.close();
  }
});
