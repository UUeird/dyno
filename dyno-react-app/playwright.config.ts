import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1, // tests share a DB — must run sequentially
  retries: 0,
  reporter: "list",
  // Cap per-test wall clock, expect retries, action retries, and navigation.
  // Tight timeouts surface real failures fast — a click blocked by an error
  // overlay used to consume the full 30s test budget; now it fails in ~3s with
  // a clear "click timeout" message. Slower waits (badge toast, etc.) can
  // override per-call.
  timeout: 15000,
  expect: { timeout: 3000 },
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 3000,
    navigationTimeout: 8000,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Start the test backend before the suite, tear it down after
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
});
