import { test, expect } from "@playwright/test";
import { TRACT_A, TRACT_B, openMap, openTract, readScore, searchAndPick, tractHeading } from "./helpers";

test.describe("Map home -- focus switching and URL/browser state", () => {
  test("choosing a different focus area changes the map's ranking and a neighborhood's score", async ({ page }) => {
    await openTract(page, TRACT_A);
    await expect(page.getByText(/Scored under Health equity overview/)).toBeVisible();
    const before = await readScore(page);

    // Go back to the county, pick another focus, then reopen the tract.
    await page.getByRole("button", { name: "Back to the county" }).click();
    await page.getByRole("button", { name: "More focus areas" }).click();
    await page.getByRole("button", { name: /^Food access/ }).click();
    await expect(page).toHaveURL(/scenario=food_access_v1/);
    await expect(page.getByRole("button", { name: /^Food access/ })).toHaveAttribute("aria-pressed", "true");

    await searchAndPick(page, TRACT_A, new RegExp(TRACT_A));
    await expect(page.getByText(/Scored under Food access/)).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      expect(await readScore(page)).not.toBe(before);
    }).toPass({ timeout: 10_000 });
  });

  test("reloading preserves the selected tract and focus area", async ({ page }) => {
    await openTract(page, TRACT_B, "&scenario=diabetes_prevention_v1");
    await expect(page.getByText(/Scored under Diabetes prevention/)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(tractHeading(page, TRACT_B)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Scored under Diabetes prevention/)).toBeVisible({ timeout: 15_000 });
  });

  test("browser back and forward restore the previously selected tract", async ({ page }) => {
    // Several searches and history steps; a slow machine needs more than the default 30 seconds.
    test.setTimeout(90_000);
    const countyView = page.getByText("What matters most to you?");

    await openMap(page);
    await searchAndPick(page, TRACT_A, new RegExp(TRACT_A));
    await expect(tractHeading(page, TRACT_A)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Back to the county" }).click();
    await expect(countyView).toBeVisible({ timeout: 15_000 });
    await searchAndPick(page, TRACT_B, new RegExp(TRACT_B));
    await expect(tractHeading(page, TRACT_B)).toBeVisible({ timeout: 15_000 });

    // Walk the history one step at a time and check each stop, instead of pressing
    // the button twice in a row, which a busy page can legitimately coalesce.
    await page.goBack();
    await expect(countyView).toBeVisible({ timeout: 15_000 });
    await page.goBack();
    await expect(tractHeading(page, TRACT_A)).toBeVisible({ timeout: 15_000 });

    await page.goForward();
    await expect(countyView).toBeVisible({ timeout: 15_000 });
    await page.goForward();
    await expect(tractHeading(page, TRACT_B)).toBeVisible({ timeout: 15_000 });
  });

  test("pressing Escape returns from a neighborhood to the whole county", async ({ page }) => {
    await openTract(page, TRACT_A);
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/geography=/);
    await expect(page.getByRole("button", { name: "Back to the county" })).not.toBeVisible();
    await expect(page.getByText("What matters most to you?")).toBeVisible();
  });

  test("building your own weighting recolors the ranking and shares as a link", async ({ page }) => {
    await openMap(page);
    await page.getByRole("button", { name: "Build your own" }).click();
    await expect(page).toHaveURL(/scenario=__custom__/, { timeout: 10_000 });
    await expect(page.getByRole("slider").first()).toBeVisible();
    await expect(page.getByRole("region", { name: /Where to look first/ }).getByRole("button").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveURL(/weights=/, { timeout: 10_000 });
  });
});
