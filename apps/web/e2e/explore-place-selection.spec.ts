import { test, expect } from "@playwright/test";

/**
 * Regression + feature test for usability Task 1 ("Find Sunnyvale and
 * identify its two leading concerns"): selecting a place resolves its
 * real name and offers a real highest-concern-tract drill-down, so a
 * user can get from "found the city" to "looking at a specific tract's
 * profile" without already knowing a GEOID. Selection used to be
 * resolved by clicking a map; the map was removed after direct feedback
 * that its relationship to the screening view was unclear, so this now
 * exercises the drill-down list instead.
 */
test.describe("Explore -- selecting a place resolves it and offers a tract drill-down", () => {
  test("searching and selecting Sunnyvale shows its real name and lets the user drill into a tract inside it", async ({
    page,
  }) => {
    await page.goto("/explore");
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();

    const result = page.getByRole("button", { name: /Sunnyvale/ });
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    await expect(page).toHaveURL(/geography=place/);

    // The profile panel must be honest that this is a place, not a
    // scored tract, and must point at exactly the next action available.
    await expect(page.getByRole("heading", { name: "Sunnyvale city", exact: true })).toBeVisible();
    const drillDownHeading = page.getByText(/Highest-concern areas in Sunnyvale/);
    await expect(drillDownHeading).toBeVisible({ timeout: 10_000 });

    // Drilling into a real tract inside the city is the actual
    // resolution path for "identify its leading concerns." Scoped to the
    // list immediately after this heading -- the search box above it
    // renders its own <ul><button> results list too, which would
    // otherwise be matched first.
    const tractButton = drillDownHeading.locator("xpath=following-sibling::ul[1]").getByRole("button").first();
    await expect(tractButton).toBeVisible({ timeout: 10_000 });
    await tractButton.click();

    await expect(page).toHaveURL(/geography=tract&id=06085\d{6}/, { timeout: 10_000 });
    await expect(page.getByText("Health equity screening score", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("What is shaping this profile?")).toBeVisible();
  });
});
