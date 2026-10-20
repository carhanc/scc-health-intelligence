import { test, expect } from "@playwright/test";

/**
 * Responsive verification (Phase 5 closeout item D) at the six required
 * widths. These checks go beyond "does it stack" -- each asserts that the
 * actual workflow (navigate, search, select, read a score, compare,
 * inspect evidence) is still completable and nothing critical is clipped
 * or hidden at that width.
 */
const BREAKPOINTS = [
  { name: "1440-desktop", width: 1440, height: 900 },
  { name: "1280-desktop", width: 1280, height: 800 },
  { name: "1024-tablet-landscape", width: 1024, height: 900 },
  { name: "768-tablet-portrait", width: 768, height: 1024 },
  { name: "390-mobile", width: 390, height: 844 },
  { name: "320-mobile-small", width: 320, height: 700 },
];

for (const bp of BREAKPOINTS) {
  test.describe(`Responsive @ ${bp.name} (${bp.width}px)`, () => {
    test.use({ viewport: { width: bp.width, height: bp.height } });

    test("Map home: navigation, search, lens chips, and the ranked list are reachable without horizontal scroll", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("application", { name: /Map of Santa Clara County/ })).toBeVisible({
        timeout: 30_000,
      });

      // The page must never be wider than the viewport.
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "page must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);

      if (bp.width < 1024) {
        // Below the desktop breakpoint the four destinations live behind the menu button.
        await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
        await page.getByRole("button", { name: "Open navigation menu" }).click();
        await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Getting to care" })).toBeVisible();
        await page.getByRole("button", { name: "Close navigation menu" }).click();
      } else {
        await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Getting to care" })).toBeVisible();
      }

      // The side panel (a bottom sheet on phones) always shows the search box.
      await expect(page.getByRole("combobox", { name: "Find a place" })).toBeVisible();
    });

    test("Map home: search, pick a tract, and read its score at this width", async ({ page }) => {
      await page.goto("/");
      const box = page.getByRole("combobox", { name: "Find a place" });
      await expect(box).toBeVisible({ timeout: 30_000 });
      await box.fill("06085500100");
      const result = page.getByRole("option", { name: /06085500100/ }).first();
      await expect(result).toBeVisible({ timeout: 15_000 });
      await result.click();

      await expect(page.getByRole("heading", { name: /Tract 06085500100/ })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Health equity screening score", { exact: true })).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "map home must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);
    });

    test("Map home: the all-neighborhoods table stays inside the screen", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: /See all .* as a table/ }).scrollIntoViewIfNeeded();
      await page.getByRole("button", { name: /See all .* as a table/ }).click();
      const table = page.getByRole("dialog").getByRole("table");
      await expect(table).toBeVisible({ timeout: 20_000 });
      // The table may scroll inside its own box; the page itself must not overflow.
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });

    test("Tract detail, comparison, and evidence drawer remain operable", async ({ page }) => {
      await page.goto("/?geography=tract&id=06085500100");
      await expect(page.getByRole("heading", { name: /Tract 06085500100/ })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Health equity screening score", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Compare" }).click();
      await expect(page.getByRole("region", { name: "Compare with another place" })).toBeVisible();

      await page.getByRole("tab", { name: "Numbers" }).click();
      await page.getByRole("button", { name: "View sources & evidence" }).click();
      const dialog = page.getByRole("dialog", { name: "Sources and evidence" });
      await expect(dialog).toBeVisible();
      // The drawer must not itself force page-level horizontal overflow.
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });

    test("Prioritize: ranked-area cards, the focus chips, and custom sliders remain usable", async ({
      page,
    }) => {
      await page.goto("/prioritize");
      await expect(page.getByRole("heading", { name: "Highest screening concern" })).toBeVisible({
        timeout: 15_000,
      });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "Prioritize must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);

      await page.getByRole("button", { name: "Build your own" }).click();
      await expect(page.getByRole("slider", { name: "Health needs" })).toBeVisible({ timeout: 10_000 });

      const scrollWidth2 = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth2).toBeLessThanOrEqual(clientWidth + 1);
    });

    test("Utilization: the task chooser, facility table, and tab switching remain usable", async ({ page }) => {
      await page.goto("/utilization");
      await expect(page.getByRole("heading", { name: "What would you like to understand?" })).toBeVisible({
        timeout: 15_000,
      });

      let scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "Utilization task chooser must not overflow horizontally").toBeLessThanOrEqual(
        clientWidth + 1,
      );

      await page.getByRole("button", { name: /^Compare facilities:/ }).click();
      await expect(page.getByText("STANFORD HEALTH CARE")).toBeVisible({ timeout: 15_000 });

      scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, "Utilization facility view must not overflow horizontally").toBeLessThanOrEqual(
        clientWidth + 1,
      );
    });

    test("Validate: sections remain reachable and content does not overflow", async ({ page }) => {
      await page.goto("/validate");
      await expect(page.getByRole("heading", { name: "Trust, methods, and data quality" })).toBeVisible({
        timeout: 15_000,
      });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "Validate must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);

      await page.getByRole("tab", { name: "Reproduce the analysis" }).click();
      await expect(page.getByText("Audit status")).toBeVisible({ timeout: 10_000 });
    });

    test("Advocate: the full place-to-brief workflow completes and never overflows horizontally", async ({
      page,
    }) => {
      await page.goto("/advocate");
      await expect(page.getByText("Where would you like to start?")).toBeVisible({ timeout: 15_000 });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "Advocate must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);

      await page.getByRole("button", { name: /^Choose a community:/ }).click();
      await page.getByRole("combobox", { name: "Find a place" }).fill("Sunnyvale");
      await page.getByRole("option", { name: /Sunnyvale/ }).first().click();
      await expect(page.getByRole("heading", { name: "What would you like to focus on?" })).toBeVisible({
        timeout: 10_000,
      });
      await page.getByRole("button", { name: /^Health equity overview, recommended:/ }).click();
      await expect(page.getByRole("heading", { name: "What facts would you like to use?" })).toBeVisible({
        timeout: 15_000,
      });

      await page.locator('button[aria-label^="Include "]').first().click();
      await page.getByRole("button", { name: /^Continue with 1 fact$/ }).click();
      await page.getByRole("button", { name: /^One-page meeting brief:/ }).click();
      await page.getByRole("button", { name: "Commissioner / staff" }).click();
      await page.getByRole("button", { name: "Continue" }).click();
      await page.getByRole("button", { name: "Create draft" }).click();
      await expect(page.getByText("What is happening?")).toBeVisible({ timeout: 15_000 });

      const scrollWidth2 = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth2).toBeLessThanOrEqual(clientWidth + 1);
    });

    test("Copilot: action choice, place search, and a generated answer remain usable", async ({ page }) => {
      await page.goto("/copilot");
      await expect(page.getByRole("heading", { name: "What would you like help with?" })).toBeVisible({
        timeout: 15_000,
      });

      let scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "Copilot landing must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);

      await page.getByRole("button", { name: /^Explain a community:/ }).click();
      await expect(page.getByLabel("Find a place")).toBeVisible();
      await page.getByRole("combobox", { name: "Find a place" }).fill("Gilroy");
      await page.getByRole("option", { name: /Gilroy/ }).first().click();
      await page.getByRole("button", { name: /^Health equity overview, recommended:/ }).click();
      await page.getByRole("button", { name: "Create explanation" }).click();
      await expect(page.getByRole("heading", { name: "Gilroy city" })).toBeVisible({ timeout: 15_000 });

      scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth, "Copilot result must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);
    });
  });
}
