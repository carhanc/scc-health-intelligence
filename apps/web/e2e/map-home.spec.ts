import { test, expect } from "@playwright/test";
import { mapRegion, openMap, openTract, TRACT_A } from "./helpers";

// Runs against the real API and warehouse data (no mocking), matching the
// "never fabricate data" rule end to end.
test.describe("Map home", () => {
  test("loads real countywide data, not placeholders", async ({ page }) => {
    await openMap(page);

    await expect(page.getByRole("heading", { name: /Where in Santa Clara County does health need the most support/, level: 1 })).toBeAttached();
    await expect(page.getByText(/^408 neighborhoods, scored from \d+ public indicators/)).toBeVisible({ timeout: 30_000 });

    const list = page.getByRole("region", { name: /Where to look first/ });
    const rows = list.getByRole("button");
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    // Each row names a real neighborhood and shows a real 0-100 score.
    await expect(rows.first()).toContainText(/Census Tract/);
    await expect(rows.first()).toContainText(/\d{2}/);

    await expect(page.getByText(/sources current/)).toBeVisible({ timeout: 20_000 });
  });

  test("the legend and 'how to read this map' say what the colors mean", async ({ page }) => {
    await openMap(page);
    await expect(page.getByRole("img", { name: /Color scale from lower to higher/ })).toBeVisible();
    // The phone legend is the compact version (no "No score" key).
    if ((page.viewportSize()?.width ?? 0) >= 640) {
      await expect(page.getByText("No score", { exact: true }).first()).toBeVisible();
    }
    // Closed to start; one click opens it.
    const guideText = page.getByText(/Green means lower overlapping need and red means higher/);
    await expect(guideText).not.toBeVisible();
    await page.getByText("How to read this map").click();
    await expect(guideText).toBeVisible();
    await expect(page.getByText(/does not mean a worse community/)).toBeVisible();
  });

  test("the layer picker recolors the map and updates its accessible description", async ({ page }) => {
    await openMap(page);
    const picker = page.getByRole("combobox", { name: "Color the map by" });
    await picker.selectOption({ label: "Access barriers" });
    await expect(mapRegion(page)).toHaveAttribute("aria-label", /shaded by access barriers/i);
  });

  test("the header's search shortcut opens the home page with search ready", async ({ page }) => {
    await page.goto("/validate");
    await page.getByRole("link", { name: "Search a place" }).click();
    await expect(page).toHaveURL(/\/\?search=1/);
    await expect(page.getByRole("combobox", { name: "Find a place" })).toBeFocused({ timeout: 30_000 });
  });

  test("a neighborhood opens with a plain-language score, tabs, and a way back", async ({ page }) => {
    await openTract(page, TRACT_A);
    await expect(page.getByText("Health equity screening score", { exact: true })).toBeVisible();
    await expect(page.getByText(/not a diagnosis or a cause/)).toBeVisible();
    for (const tab of ["Reasons", "Numbers", "Confidence"]) {
      await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    }
    await page.getByRole("tab", { name: "Confidence" }).click();
    await expect(page.getByText(/What this result does not mean/)).toBeVisible();
    await page.getByRole("button", { name: "Back to the county" }).click();
    await expect(page.getByText("What matters most to you?")).toBeVisible();
  });

  test("a floating button says who built this, opens on click, and closes with Escape", async ({ page }) => {
    await openMap(page);
    const button = page.getByRole("button", { name: "Who built this?" });
    await expect(button).toBeVisible();
    await button.click();
    const card = page.getByRole("region", { name: "About this platform" });
    await expect(card).toContainText("Developed by Arhan Chakravarthy");
    await expect(card).toContainText("In collaboration with Santa Clara County Health Advisory Commission");
    await expect(card.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    await page.keyboard.press("Escape");
    await expect(card).not.toBeVisible();
  });

  test("Escape closes the about card without leaving the neighborhood behind it", async ({ page }) => {
    await openTract(page, TRACT_A);
    await page.getByRole("button", { name: "Who built this?" }).click();
    await expect(page.getByRole("region", { name: "About this platform" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "About this platform" })).not.toBeVisible();
    await expect(page).toHaveURL(/geography=tract/);
  });
});
