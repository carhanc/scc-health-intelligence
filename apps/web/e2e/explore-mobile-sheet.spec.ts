import { test, expect } from "@playwright/test";

const KNOWN_TRACT_A = "06085500100";

/**
 * Below the 1024px lg breakpoint, a selected geography's full profile
 * moves from the always-visible sidebar into a collapsed summary
 * bar + bottom sheet (MobileSelectedSheet in geography-detail.tsx) --
 * this pass's mobile counterpart to the desktop-only assertions in
 * explore-core.spec.ts, usability-tasks.spec.ts, and
 * explore-errors-and-comparison.spec.ts (all of which now skip on
 * `isMobile`; see their own comments).
 */
test.describe("Explore -- mobile collapsed summary and bottom sheet", () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(!isMobile, "desktop-inline layout is covered by the other Explore e2e specs");
  });

  test("selecting a tract shows a collapsed summary bar, not the full profile, until expanded", async ({ page }) => {
    await page.goto(`/explore?geography=tract&id=${KNOWN_TRACT_A}`);

    // The collapsed bar surfaces place, concern band, and rank without
    // requiring the sheet to open.
    const collapsedButton = page.getByRole("button", { name: new RegExp(KNOWN_TRACT_A) });
    await expect(collapsedButton).toBeVisible({ timeout: 10_000 });
    await expect(collapsedButton).toContainText(/concern/);
    await expect(collapsedButton).toContainText("View profile");

    // The full profile heading exists in the DOM (native <dialog>
    // children are always mounted) but is not visible until opened.
    await expect(page.getByRole("heading", { name: `Tract ${KNOWN_TRACT_A}` })).not.toBeVisible();

    await collapsedButton.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    await expect(sheet.getByRole("heading", { name: `Tract ${KNOWN_TRACT_A}` })).toBeVisible();

    // The full content -- domain summary and ranked driver list -- is
    // reachable inside the expanded sheet, not just the headline. The
    // detailed per-metric contribution arithmetic lives one click
    // further behind "See all factors" (docs/design/
    // health-equity-product-consolidation.md's progressive-disclosure
    // requirement), so this checks the always-visible simplified driver
    // row instead of the collapsed detail.
    await expect(sheet.getByText("Conditions that may shape health equity here")).toBeVisible();
    await expect(sheet.getByText("What is shaping this profile?")).toBeVisible();
    await expect(sheet.locator("li").filter({ hasText: /higher than .* of county tracts/ }).first()).toBeVisible();
  });

  test("the expanded sheet closes via Escape and via the close button, returning to the collapsed bar", async ({
    page,
  }) => {
    await page.goto(`/explore?geography=tract&id=${KNOWN_TRACT_A}`);
    const collapsedButton = page.getByRole("button", { name: new RegExp(KNOWN_TRACT_A) });
    await collapsedButton.click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    // Native <dialog> Escape-to-close, exercised directly on the mobile
    // sheet's own instance of the shared Dialog primitive.
    await page.keyboard.press("Escape");
    await expect(sheet).not.toBeVisible();
    await expect(collapsedButton).toBeVisible();

    // Re-open, then close via the explicit close (X) button instead.
    await collapsedButton.click();
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).not.toBeVisible();
  });

  test("nothing selected shows the non-modal orientation panel on mobile too", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText("Search for a community")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
