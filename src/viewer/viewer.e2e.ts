import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

import { startRuntime, type RunningRuntime } from "../server/runtime.js";

const repositoryRoot = resolve(process.cwd());
let offlineRuntime: RunningRuntime | undefined;
let saveOutcomeRuntime: RunningRuntime | undefined;

function runtimeUrl(runtime: RunningRuntime): string {
  return `http://${runtime.host}:${runtime.port}`;
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
  await expect(page.locator(".criterion--highlighted")).toContainText("A recoverable snapshot offers restore");

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
