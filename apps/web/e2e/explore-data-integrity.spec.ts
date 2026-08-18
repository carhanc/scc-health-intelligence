import { test, expect, request } from "@playwright/test";

test.describe("Explore -- missing data is never rendered as zero", () => {
  test("a tract with a null score (if one exists in current live data) shows a dash, never 0", async ({ page }) => {
    // Look for a real tract the live data currently reports as unscored,
    // rather than mocking one -- consistent with this project's "never
    // fabricate data" testing policy. If none exists right now (data
    // coverage happens to be complete), this is a documented, honest
    // skip rather than a fabricated pass; the exact same contract is
    // covered with a controlled fixture in
    // apps/web/test/geography-detail.test.tsx.
    const api = await request.newContext({ baseURL: "http://localhost:8000" });
    const response = await api.get(
      "/api/v1/scenarios/default_integrated_screen_v1/scores?limit=408",
    );
    const body = await response.json();
    const unscored = (body.scores as Array<{ tract_geoid_2020: string; score: number | null }>).find(
      (s) => s.score === null,
    );

    test.skip(
      !unscored,
      "No tract in the current live warehouse has a null score -- coverage is complete right now. " +
        "The null-score-never-renders-as-zero contract is covered by a controlled fixture in " +
        "apps/web/test/geography-detail.test.tsx instead.",
    );

    await page.goto(`/explore?geography=tract&id=${unscored!.tract_geoid_2020}`);
    await expect(page.getByRole("heading", { name: `Tract ${unscored!.tract_geoid_2020}` })).toBeVisible({
      timeout: 10_000,
    });

    const scoreDisplay = page.locator("p.text-3xl").first();
    await expect(scoreDisplay).toContainText("—");
    await expect(scoreDisplay).not.toContainText(/^0/);
  });

  test("a metric with no raw value shows 'No data', never a numeric 0", async ({ page }) => {
    await page.goto("/explore?geography=tract&id=06085500100");
    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 10_000 });

    // Expand every domain disclosure and confirm no metric row shows a
    // bare "0" where the underlying value is actually absent -- every
    // metric row must show either a real number+unit or the literal text
    // "No data". The "Domain breakdown" section (docs/design/health-
    // equity-product-consolidation.md's progressive-disclosure
    // requirement) now nests a per-domain <details> inside it, so this
    // clicks every <summary> directly, in document order, rather than
    // assuming exactly one summary per <details> -- clicking outermost
    // to innermost this way opens each ancestor before its nested
    // summaries are reached.
    const summaries = page.locator("summary");
    const count = await summaries.count();
    for (let i = 0; i < count; i++) {
      await summaries.nth(i).click();
    }
    await expect(page.getByText(/^0$/)).toHaveCount(0);
  });
});
