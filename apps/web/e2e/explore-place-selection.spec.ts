import { test, expect } from "@playwright/test";

/**
 * Regression + feature test for the Phase 5 closeout fix to usability
 * Task 1 ("Find Sunnyvale and identify its two leading concerns"):
 * selecting a place now pans/zooms the map to that place's real boundary
 * and outlines it, so a user can get from "found the city" to "clicked a
 * tract inside it" without already knowing a GEOID.
 */
test.describe("Explore -- selecting a place pans the map to it", () => {
  test("searching and selecting Sunnyvale outlines it on the map and lets the user click a tract inside it", async ({
    page,
  }) => {
    await page.goto("/explore");
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();

    const result = page.getByRole("button", { name: /Sunnyvale/ });
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    await expect(page).toHaveURL(/geography=place/);
    // The map must acknowledge the selection with an outline hint --
    // proof it actually re-centered rather than silently doing nothing.
    await expect(page.getByText(/dashed outline shows/)).toBeVisible({ timeout: 10_000 });

    // The profile panel must be honest that this is a place, not a
    // scored tract, and must point at exactly the next action available.
    // Phase 6.5: the panel now also surfaces a real highest-concern-tract
    // drill-down, so "Sunnyvale" legitimately matches two headings --
    // the place title itself and the drill-down section title.
    await expect(page.getByRole("heading", { name: "Sunnyvale city", exact: true })).toBeVisible();
    await expect(page.getByText(/Highest-concern areas in Sunnyvale/)).toBeVisible();

    // Now the user can click a tract inside the outlined city -- this is
    // the actual resolution path for "identify its leading concerns."
    const mapRegion = page.getByRole("application", { name: /Map of Santa Clara County/ });
    await page.waitForTimeout(1500);
    const box = await mapRegion.boundingBox();
    if (!box) throw new Error("map region has no bounding box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect(page).toHaveURL(/geography=tract&id=06085\d{6}/, { timeout: 10_000 });
    await expect(page.getByText("Combined concern score, this scenario only")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("What's driving this score")).toBeVisible();
  });
});
