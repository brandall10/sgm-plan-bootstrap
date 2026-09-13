import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/viewer",
  testMatch: "**/*.e2e.ts",
  forbidOnly: Boolean(process.env["CI"]),
  fullyParallel: false,
  reporter: "list",
  use: {
    browserName: "chromium",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 920 },
  },
});
