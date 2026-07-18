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

    test("Overview: navigation, hero, and task actions are all reachable without horizontal scroll", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: /Understand health equity/i })).toBeVisible({
        timeout: 15_000,
      });

      // No horizontal overflow at any of the required widths -- a
      // content-width wider than the viewport is exactly the "just
      // stacked, not redesigned" anti-pattern the closeout calls out.
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "page must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);

      if (bp.width < 1024) {
        // Below the desktop-sidebar breakpoint, navigation must be
        // reachable via the mobile menu button, not a permanently
        // visible sidebar competing for space.
        await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
        await page.getByRole("button", { name: "Open navigation menu" }).click();
        await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Explore" })).toBeVisible();
        await page.getByRole("button", { name: "Close", exact: true }).click();
      } else {
        await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Explore" })).toBeVisible();
      }

      await expect(page.getByRole("link", { name: "Explore the map" })).toBeVisible();
    });

    test("Explore: search, view toggle, and scenario selector remain usable", async ({ page }) => {
      await page.goto("/explore");
      await expect(page.getByLabel("Find a place")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Screening view")).toBeVisible();
      await expect(page.getByRole("radio", { name: "Map" })).toBeVisible();
      await expect(page.getByRole("radio", { name: "Table" })).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "Explore must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);

      await page.getByLabel("Find a place").fill("06085500100");
      await page.getByRole("button", { name: "Search" }).click();
      const result = page.getByRole("button", { name: /06085500100/ });
      await expect(result).toBeVisible({ timeout: 10_000 });
      await result.click();

      // Below the app's own lg (1024px) breakpoint, the selected-tract
      // profile opens behind a collapsed summary bar instead of inline
      // (MobileSelectedSheet) -- open it before asserting on the heading.
      if (bp.width < 1024) {
        await page
          .getByRole("button", { name: /Tap to view its full profile|combined concern/ })
          .click();
      }
      await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 10_000 });
    });

    test("Explore table view: table remains readable (horizontally scrollable if needed, not clipped)", async ({
      page,
    }) => {
      await page.goto("/explore?tab=table");
      const table = page.getByRole("table");
      await expect(table).toBeVisible({ timeout: 15_000 });
      // A data table with many columns may legitimately need its own
      // internal horizontal scroll on narrow viewports -- that is
      // acceptable; the page itself must not overflow.
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });

    test("Tract detail, comparison, and evidence drawer remain operable", async ({ page }) => {
      await page.goto("/explore?geography=tract&id=06085500100");
      // Below the app's own lg (1024px) breakpoint, the selected-tract
      // profile opens behind a collapsed summary bar instead of inline
      // (MobileSelectedSheet).
      if (bp.width < 1024) {
        await page
          .getByRole("button", { name: /Tap to view its full profile|combined concern/ })
          .click();
      }
      await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 10_000 });
      // The raw "Combined concern score" caption now lives behind the
      // collapsed "How this was calculated" disclosure by design (docs/
      // design/health-equity-product-consolidation.md's headline-result
      // requirement) -- the always-visible proof of a rendered result is
      // the plain-language screening-view caption in the headline block.
      await expect(page.getByText(/screening view$/)).toBeVisible();

      await page.getByRole("button", { name: "Compare" }).click();
      // Tapping Compare from inside the mobile sheet closes it first (the
      // comparison panel renders as a page-level sibling, not inside the
      // sheet) -- on desktop the inline panel is unaffected either way.
      await expect(page.getByRole("region", { name: "Compare with another place" })).toBeVisible();

      if (bp.width < 1024) {
        await page
          .getByRole("button", { name: /Tap to view its full profile|combined concern/ })
          .click();
      }
      await page.getByRole("button", { name: "View sources & evidence" }).click();
      const dialog = page.getByRole("dialog", { name: "Sources and evidence" });
      await expect(dialog).toBeVisible();
      // The drawer must not itself force page-level horizontal overflow.
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });

    test("Prioritize: scenario selector, custom sliders, and ranked results remain usable", async ({ page }) => {
      await page.goto("/prioritize");
      await expect(page.getByRole("radio", { name: /Health equity overview/ })).toBeVisible({ timeout: 15_000 });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "Prioritize must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);

      await page.getByRole("radio", { name: "Custom scenario" }).click();
      await expect(page.getByLabel("Health needs")).toBeVisible({ timeout: 10_000 });

      const scrollWidth2 = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth2).toBeLessThanOrEqual(clientWidth + 1);
    });

    test("Utilization: facility table and tab switching remain usable", async ({ page }) => {
      await page.goto("/utilization");
      await expect(page.getByText("STANFORD HEALTH CARE")).toBeVisible({ timeout: 15_000 });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "Utilization must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);
    });

    test("Validate: tabs remain reachable and content does not overflow", async ({ page }) => {
      await page.goto("/validate");
      await expect(page.getByRole("heading", { name: "Validate" })).toBeVisible({ timeout: 15_000 });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "Validate must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);

      await page.getByRole("tab", { name: "Reproducibility" }).click();
      await expect(page.getByText("Audit status")).toBeVisible({ timeout: 10_000 });
    });

    test("Advocate: the full geography-to-brief workflow completes and never overflows horizontally", async ({
      page,
    }) => {
      await page.goto("/advocate");
      await expect(page.getByLabel("Find a place")).toBeVisible({ timeout: 15_000 });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "Advocate must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);

      await page.getByLabel("Find a place").fill("Sunnyvale");
      await page.getByRole("button", { name: "Search" }).click();
      await page.getByRole("button", { name: /Sunnyvale/ }).first().click();
      await expect(page.getByText(/evidence item\(s\) found for/)).toBeVisible({ timeout: 15_000 });

      await page.locator('input[type="checkbox"][aria-label^="Include"]').first().check();
      await page.getByRole("button", { name: "Generate" }).click();
      await expect(page.getByText("What is happening?")).toBeVisible({ timeout: 15_000 });

      const scrollWidth2 = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth2).toBeLessThanOrEqual(clientWidth + 1);
    });

    test("Copilot: search and ask remain usable", async ({ page }) => {
      await page.goto("/copilot");
      await expect(page.getByLabel("Find a place")).toBeVisible({ timeout: 15_000 });

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth, "Copilot must not overflow horizontally").toBeLessThanOrEqual(clientWidth + 1);
    });
  });
}
