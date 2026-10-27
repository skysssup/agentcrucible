import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL: "http://127.0.0.1:7358", trace: "retain-on-failure", ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
  webServer: { command: "node dist/cli.js ui --demo --port 7358", url: "http://127.0.0.1:7358", timeout: 120_000 },
});
