import { defineConfig, devices } from "@playwright/test"

/**
 * E2E config for the storefront. Targets an already-running stack rather
 * than starting one itself (`webServer`) — the storefront alone is useless
 * without Postgres/Redis/the Medusa backend behind it, and orchestrating
 * that from Playwright would just reimplement docker-compose.yml. Bring the
 * stack up yourself first; see tests/e2e/README.md.
 */
export default defineConfig({
  testDir: "./tests/e2e",

  fullyParallel: false, // every test drives one shared cart/session flow
  forbidOnly: !!process.env.CI,
  // One retry absorbs trace/video overhead and transient flakiness without
  // masking a genuinely broken flow — a real bug fails both attempts. Was 2 in
  // CI; dropped to 1 because the isolated QA stack is deterministic enough and
  // 2 retries tripled the wall-clock of a failing run (each failing test ran
  // 3x against its timeout).
  retries: 1,
  // Parallelize across spec files. `fullyParallel: false` only serializes
  // tests *within* a file (they share a cart/session); the specs themselves use
  // unique-per-run customer/account stamps, so cross-file workers are safe.
  workers: 4,

  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    // Trace only on retry, not "retain-on-failure": tracing captures a DOM
    // snapshot + screenshot on every single action, which is exactly the
    // continuous overhead causing the slowdown above. Still gives a full
    // trace to debug whenever a test actually struggles.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Video recording is the most expensive of the three (continuous frame
    // capture to disk for the whole test, not just on failure) and isn't
    // essential when trace-on-retry already reconstructs the DOM at every
    // step. Off by default; flip to "on-first-retry" if a failure needs it.
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
