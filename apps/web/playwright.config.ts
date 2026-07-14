import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the real API + real Next.js dev server -- no
 * mocking, matching PLAN.md's "the frontend never fabricates data" rule
 * all the way through to e2e coverage. Playwright launches its own
 * Chromium (independent of the Preview MCP tool, which is blocked by a
 * macOS permission gap this session -- see RISK-012) via the Bash tool's
 * unrestricted process spawning, so this is the primary automated
 * browser-verification path for Phase 5.
 *
 * Phase 9: SMOKE_TEST_BASE_URL, if set, points every test at a deployed
 * URL instead of the local dev server and skips spawning local
 * webServer processes entirely -- this is how `e2e/production-smoke.spec.ts`
 * runs against a real Vercel/Render deployment (see
 * docs/deployment/production-deployment-guide.md). Unset, everything
 * behaves exactly as before.
 */
const smokeTestBaseUrl = process.env.SMOKE_TEST_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    // Must be "localhost", not "127.0.0.1" -- the API's CORS policy
    // (apps/api/src/scc_health_api/main.py) allows only
    // http://localhost:3000, and browsers treat 127.0.0.1 and localhost
    // as different origins even though they resolve to the same host.
    // Using 127.0.0.1 here silently CORS-blocked every API fetch and
    // made every data-dependent test time out with no visible error.
    baseURL: smokeTestBaseUrl ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: smokeTestBaseUrl
    ? undefined
    : [
        {
          command:
            "cd ../.. && uv run --package scc-health-api uvicorn scc_health_api.main:app --port 8000",
          url: "http://localhost:8000/api/v1/health",
          reuseExistingServer: true,
          timeout: 60_000,
        },
        {
          command: "pnpm dev",
          url: "http://localhost:3000",
          reuseExistingServer: true,
          timeout: 60_000,
        },
      ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
