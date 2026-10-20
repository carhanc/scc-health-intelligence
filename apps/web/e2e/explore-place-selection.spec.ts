import { test, expect } from "@playwright/test";
import { openMap, searchAndPick } from "./helpers";

/**
 * Usability task 1 ("Find Sunnyvale and identify its two leading concerns"):
 * selecting a place resolves its real name and offers a real highest-concern
 * tract drill-down, so a person can get from "found the city" to "looking at
 * a specific tract's profile" without already knowing a GEOID.
 */
test.describe("Map home -- selecting a place resolves it and offers a tract drill-down", () => {
  test("searching and selecting Sunnyvale shows its real name and lets the user drill into a tract inside it", async ({
    page,
  }) => {
    await openMap(page);
    await searchAndPick(page, "Sunnyvale", /Sunnyvale/);

    await expect(page).toHaveURL(/geography=place/);
    await expect(page.getByRole("heading", { name: "Sunnyvale city", exact: true })).toBeVisible({ timeout: 15_000 });
    const drillDownHeading = page.getByText(/Highest-concern areas in Sunnyvale/);
    await expect(drillDownHeading).toBeVisible({ timeout: 15_000 });

    const tractButton = drillDownHeading.locator("xpath=following-sibling::ul[1]").getByRole("button").first();
    await expect(tractButton).toBeVisible({ timeout: 10_000 });
    await tractButton.click();

    await expect(page).toHaveURL(/geography=tract&id=06085\d{6}/, { timeout: 10_000 });
    await expect(page.getByText("Health equity screening score", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "What is shaping this score" })).toBeVisible();
  });
});
