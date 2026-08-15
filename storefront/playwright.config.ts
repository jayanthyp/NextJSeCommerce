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
  // One retry even outside CI: continuous trace/video capture adds real
  // per-action overhead (observed pushing a normally ~2s Server Action past
  // 15s on this machine), and a single retry absorbs that without masking a
  // genuinely broken flow — a real bug fails both attempts.
  retries: process.env.CI ? 2 : 1,
  workers: 1,

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
