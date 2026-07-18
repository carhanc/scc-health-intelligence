import { test, expect } from "@playwright/test";

const KNOWN_TRACT_A = "06085500100";
const KNOWN_TRACT_B = "06085503112";

test.describe("Explore -- scenario switching and URL/browser state", () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, "mobile layout covered separately in explore-mobile-sheet.spec.ts");
  });

  test("switching priorities changes the displayed results", async ({ page }) => {
    await page.goto(`/explore?geography=tract&id=${KNOWN_TRACT_A}`);
    await expect(page.getByRole("heading", { name: `Tract ${KNOWN_TRACT_A}` })).toBeVisible({ timeout: 10_000 });

    const select = page.getByLabel("Priorities");
    await expect(select).toHaveValue(/default_integrated_screen_v1/, { timeout: 10_000 });
    const scoreBefore = await page.locator("p.text-3xl").first().textContent();

    await select.selectOption({ label: "Food access" });

    // The description paragraph next to the selector must change to the
    // new scenario's own description -- proof the switch took effect.
    // Scoped to the paragraph immediately after the Priorities label,
    // since "food insecurity" also appears inside metric text elsewhere
    // on the page once the tract's data has loaded.
    const prioritiesLabel = page.locator("label", { has: page.getByLabel("Priorities") });
    const scenarioDescription = prioritiesLabel.locator("xpath=following-sibling::p[1]");
    await expect(scenarioDescription).toContainText(/food insecurity/i, { timeout: 10_000 });
    await expect(page).toHaveURL(/scenario=food_access_v1/);

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
    await expect(page.getByLabel("Priorities")).toHaveValue(/diabetes_prevention_v1/, { timeout: 10_000 });

    await page.reload();

    await expect(page.getByRole("heading", { name: `Tract ${KNOWN_TRACT_B}` })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel("Priorities")).toHaveValue(/diabetes_prevention_v1/, { timeout: 10_000 });
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
