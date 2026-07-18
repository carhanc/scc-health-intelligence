import { test, expect } from "@playwright/test";

test.describe("Advocate -- cross-page 'Use in Advocate' integration", () => {
  test("starting from a selected tract in Explore carries real structured state", async ({ page, isMobile }) => {
    await page.goto("/explore?geography=tract&id=06085500100");
    if (isMobile) {
      // Below the xl breakpoint the profile opens behind a collapsed
      // summary bar (MobileSelectedSheet); open it first.
      await page.getByRole("button", { name: /Tap to view its full profile|combined concern/ }).click();
    }
    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Use in Advocate" }).first().click();

    await expect(page).toHaveURL(/\/advocate\?workspace=/, { timeout: 10_000 });
    // The geography label shown here is a plain-language name (e.g. "Census
    // Tract 5001"), never the raw GEOID -- per this platform's own
    // "no internal IDs in primary views" rule (CLAUDE.md), so this asserts
    // on the human-readable label, not the id passed into the workspace.
    await expect(page.getByText(/evidence item\(s\) found for Census Tract/)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("starting from a Prioritize recommendation carries the scenario along", async ({ page }) => {
    await page.goto("/prioritize");
    await expect(page.getByRole("radio", { name: /Health equity overview/ })).toBeChecked({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Show drivers" }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Show drivers" }).first().click();
    await expect(page.getByRole("button", { name: "Use in Advocate" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Use in Advocate" }).click();

    await expect(page).toHaveURL(/\/advocate\?workspace=/, { timeout: 10_000 });
    await expect(page.getByRole("radio", { name: /Health equity overview/ })).toBeChecked({
      timeout: 15_000,
    });
  });

  test("starting from an Access Lab tract summary carries the tract along", async ({ page }) => {
    await page.goto("/access-lab?geography=tract&id=06085500100");
    await expect(page.getByText("Nearest clinical care -- walking")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Use in Advocate" }).click();

    await expect(page).toHaveURL(/\/advocate\?workspace=/, { timeout: 10_000 });
    await expect(page.getByText(/evidence item\(s\) found for Census Tract/)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("starting from a Utilization finding carries the tract along", async ({ page }) => {
    await page.goto("/utilization?tab=geographic");
    await expect(page.getByRole("heading", { name: /modeled by tract/ })).toBeVisible({
      timeout: 15_000,
    });
    // `exact: true` matters here -- a substring match on "Use" also hits
    // the "High modeled use" column-sort header button, which sits earlier
    // in DOM order than any row's real "Use" action button.
    await page.getByRole("button", { name: "Use", exact: true }).first().click();

    await expect(page).toHaveURL(/\/advocate\?workspace=/, { timeout: 10_000 });
    await expect(page.getByText(/evidence item\(s\) found for/)).toBeVisible({ timeout: 15_000 });
  });
});
