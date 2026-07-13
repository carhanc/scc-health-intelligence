import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Automated accessibility coverage (Phase 5 closeout item C). This
 * complements, not replaces, manual keyboard/focus/screen-reader review
 * (see docs/design/usability-testing.md Task 8 and the manual checklist
 * handed to the user for genuinely visual judgments axe cannot make).
 */
test.describe("Accessibility (axe-core)", () => {
  test("Overview has no serious or critical violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/tracts in the top quartile/)).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Explore (default map view, no selection) has no serious or critical violations", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("application", { name: /Map of Santa Clara County/ })).toBeVisible({
      timeout: 15_000,
    });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Explore table view has no serious or critical violations", async ({ page }) => {
    await page.goto("/explore?tab=table");
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Explore with a tract selected (score, domains, evidence drawer) has no serious or critical violations", async ({
    page,
  }) => {
    await page.goto("/explore?geography=tract&id=06085500100");
    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 10_000 });
    // Expand a domain disclosure and open the evidence drawer so their
    // content is included in the scan too.
    await page.locator("details summary").first().click();
    await page.getByRole("button", { name: "View sources & evidence" }).click();
    await expect(page.getByRole("dialog", { name: "Sources and evidence" })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Data page has no serious or critical violations", async ({ page }) => {
    await page.goto("/data");
    await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible({ timeout: 10_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("a coming-soon shell page has no serious or critical violations", async ({ page }) => {
    await page.goto("/prioritize");
    await expect(page.getByRole("heading", { name: "Prioritize", level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Access Lab (no tract selected) has no serious or critical violations", async ({ page }) => {
    await page.goto("/access-lab");
    await expect(page.getByRole("heading", { name: "Access Lab" })).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Access Lab summary tab (tract selected) has no serious or critical violations", async ({ page }) => {
    await page.goto("/access-lab?geography=tract&id=06085500100");
    await expect(page.getByText("Nearest clinical care -- walking")).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Access Lab resource browser has no serious or critical violations", async ({ page }) => {
    await page.goto("/access-lab?tab=resources");
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Access Lab resource-gaps tab has no serious or critical violations", async ({ page }) => {
    await page.goto("/access-lab?tab=gaps&geography=tract&id=06085500100");
    await expect(page.getByText("Where estimated health need and measured access overlap")).toBeVisible({
      timeout: 15_000,
    });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Access Lab mobile-service scenarios tab has no serious or critical violations", async ({ page }) => {
    await page.goto("/access-lab?tab=scenarios");
    await expect(page.getByText("No solution satisfies these constraints")).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});

test.describe("Keyboard navigation and focus", () => {
  test("skip link is the first Tab stop and jumps to main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to main content" });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
  });

  test("the full Explore workflow -- search, select, expand evidence, close -- works with keyboard only", async ({
    page,
  }) => {
    await page.goto("/explore");
    await expect(page.getByLabel("Find a place")).toBeVisible({ timeout: 15_000 });

    await page.getByLabel("Find a place").fill("06085500100");
    await page.keyboard.press("Enter");

    const result = page.getByRole("button", { name: /06085500100/ });
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 10_000 });

    const evidenceButton = page.getByRole("button", { name: "View sources & evidence" });
    await evidenceButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Sources and evidence" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Sources and evidence" })).not.toBeVisible();
    // Focus should return somewhere sensible (native <dialog> restores
    // focus to the triggering element by default).
    await expect(evidenceButton).toBeFocused();
  });

  test("the Map/Table segmented control follows the WAI-ARIA radiogroup pattern: one tab stop, arrow keys move selection", async ({
    page,
  }) => {
    await page.goto("/explore");
    const mapRadio = page.getByRole("radio", { name: "Map" });
    const tableRadio = page.getByRole("radio", { name: "Table" });

    await expect(mapRadio).toHaveAttribute("tabindex", "0");
    await expect(tableRadio).toHaveAttribute("tabindex", "-1");

    await mapRadio.focus();
    await expect(mapRadio).toBeFocused();
    await page.keyboard.press("ArrowRight");

    await expect(tableRadio).toBeFocused();
    await expect(tableRadio).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });
  });
});
