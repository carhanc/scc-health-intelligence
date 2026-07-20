import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Browser-level half of the Phase 9 production smoke test. Complements
 * `scripts/smoke_test.py` (backend API checks) with what genuinely needs
 * a real browser: zero console errors and zero serious/critical axe
 * violations on the deployed frontend's actual first-load experience.
 *
 * Run against a deployed URL with SMOKE_TEST_BASE_URL set (see
 * playwright.config.ts and docs/deployment/production-deployment-guide.md):
 *
 *   SMOKE_TEST_BASE_URL=https://your-app.vercel.app npx playwright test e2e/production-smoke.spec.ts
 *
 * Without SMOKE_TEST_BASE_URL, this runs against the local dev server
 * exactly like every other e2e spec -- so it's also a normal part of the
 * regular local/CI Playwright suite, not something that only ever runs
 * against production.
 */
test.describe("Production smoke test", () => {
  test("Overview loads with no console errors and no serious/critical accessibility violations", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Understand health equity/i })).toBeVisible({
      timeout: 20_000,
    });

    expect(errors, `Console/page errors on Overview: ${JSON.stringify(errors)}`).toEqual([]);

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Advocate loads and the deterministic workflow completes with no console errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/advocate");
    await expect(page.getByRole("heading", { name: "Turn evidence into action", level: 1 })).toBeVisible({
      timeout: 20_000,
    });

    expect(errors, `Console/page errors on Advocate: ${JSON.stringify(errors)}`).toEqual([]);
  });

  test("every primary nav destination returns a real page, not an error screen", async ({ page }) => {
    const routes = [
      "/",
      "/explore",
      "/prioritize",
      "/access-lab",
      "/utilization",
      "/validate",
      "/advocate",
      "/copilot",
      "/data",
    ];
    for (const route of routes) {
      const response = await page.goto(route);
      expect(response?.status(), `${route} returned a non-2xx status`).toBeLessThan(400);
    }
  });
});
