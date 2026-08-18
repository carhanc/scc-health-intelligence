import { test, expect } from "@playwright/test";

const KNOWN_TRACT_A = "06085500100";
const KNOWN_TRACT_B = "06085503112";

test.describe("Explore -- scenario switching and URL/browser state", () => {
  test("switching priorities changes the displayed results", async ({ page }) => {
    await page.goto(`/explore?geography=tract&id=${KNOWN_TRACT_A}`);
    await expect(page.getByRole("heading", { name: `Tract ${KNOWN_TRACT_A}` })).toBeVisible({ timeout: 10_000 });

    // Scoped next to "Screening view:" -- the scenario name also
    // legitimately appears again in the "Scored under X's weighting"
    // reference line further down the profile.
    await expect(page.getByText("Screening view:").locator("..").getByText("Health equity overview")).toBeVisible();
    const scoreBefore = await page.locator("p.text-3xl").first().textContent();

    await page.getByRole("button", { name: "Change view" }).click();
    await page.getByRole("button", { name: "See more focus areas" }).click();
    await page.getByRole("button", { name: /^Food access:/ }).click();

    await expect(page).toHaveURL(/scenario=food_access_v1/);
    await expect(page.getByText("Screening view:").locator("..").getByText("Food access")).toBeVisible({
      timeout: 10_000,
    });

    // The score box must re-fetch and (for almost any real tract) show a
    // different number under different domain weights.
    await expect(async () => {
      const scoreAfter = await page.locator("p.text-3xl").first().textContent();
      expect(scoreAfter).not.toBe(scoreBefore);
    }).toPass({ timeout: 10_000 });
  });

  test("reloading the page preserves the selected tract and scenario", async ({ page }) => {
    await page.goto(`/explore?geography=tract&id=${KNOWN_TRACT_B}&scenario=diabetes_prevention_v1`);
    await expect(page.getByRole("heading", { name: `Tract ${KNOWN_TRACT_B}` })).toBeVisible({ timeout: 10_000 });
    // Scoped next to "Screening view:" -- "Diabetes prevention" also
    // legitimately appears elsewhere on the page (a real driving metric
    // is literally named "Diabetes prevalence").
    const viewLabel = page.getByText("Screening view:").locator("..").getByText("Diabetes prevention");
    await expect(viewLabel).toBeVisible({ timeout: 10_000 });

    await page.reload();

    await expect(page.getByRole("heading", { name: `Tract ${KNOWN_TRACT_B}` })).toBeVisible({ timeout: 10_000 });
    await expect(viewLabel).toBeVisible({ timeout: 10_000 });
  });

  test("browser back and forward restore the previously selected tract", async ({ page }) => {
    await page.goto("/explore");
    await page.getByLabel("Find a place").fill(KNOWN_TRACT_A);
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: new RegExp(KNOWN_TRACT_A) }).click();
    await expect(page.getByRole("heading", { name: `Tract ${KNOWN_TRACT_A}` })).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("Find a place").fill(KNOWN_TRACT_B);
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: new RegExp(KNOWN_TRACT_B) }).click();
    await expect(page.getByRole("heading", { name: `Tract ${KNOWN_TRACT_B}` })).toBeVisible({ timeout: 10_000 });

    await page.goBack();
    await expect(page.getByRole("heading", { name: `Tract ${KNOWN_TRACT_A}` })).toBeVisible({ timeout: 10_000 });

    await page.goForward();
    await expect(page.getByRole("heading", { name: `Tract ${KNOWN_TRACT_B}` })).toBeVisible({ timeout: 10_000 });
  });
});
