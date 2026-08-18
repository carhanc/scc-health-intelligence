import path from "node:path";
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

  test("Explore (initial map browse view, no selection) has no serious or critical violations", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("application", { name: /Map of Santa Clara County/ })).toBeVisible({
      timeout: 15_000,
    });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Explore (browse table view, no selection) has no serious or critical violations", async ({ page }) => {
    await page.goto("/explore");
    await page.getByRole("button", { name: "Table", exact: true }).click();
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

  test("Explore with a city selected (highest-concern-tract drill-down) has no serious or critical violations", async ({
    page,
  }) => {
    await page.goto("/explore?geography=place&id=0668000");
    await expect(page.getByText("Highest-concern areas in San Jose", { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Access Lab with a city selected (drill-down list) has no serious or critical violations", async ({
    page,
  }) => {
    await page.goto("/access-lab?geography=place&id=0668000");
    await expect(page.getByText("Select a tract in", { exact: false })).toBeVisible({ timeout: 10_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Data page has no serious or critical violations", async ({ page }) => {
    await page.goto("/data");
    // The page's own h1 ("Explore data sources and coverage") also
    // substring-matches "Sources" -- scope to the exact section heading.
    await expect(page.getByRole("heading", { name: "Sources", exact: true })).toBeVisible({ timeout: 10_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Prioritize (priorities disclosure, custom focus, drivers expanded) has no serious or critical violations", async ({
    page,
  }) => {
    await page.goto("/prioritize");
    await page.getByRole("button", { name: "Adjust priorities" }).click();
    await page.getByRole("button", { name: "Create a custom focus" }).click();
    await expect(page.getByText("Custom focus", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Use this custom focus" }).click();
    await expect(page.getByRole("heading", { name: "Highest screening concern" })).toBeVisible({ timeout: 15_000 });
    let results = await new AxeBuilder({ page }).analyze();
    let serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.getByRole("button", { name: /^View all \d+ tracts$/ }).click();
    await page.getByRole("button", { name: "Show drivers" }).first().click();
    await expect(page.getByText(/Why .* ranked here/)).toBeVisible();
    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Prioritize downloading results (decision memo rendered) has no serious or critical violations", async ({
    page,
  }) => {
    await page.goto("/prioritize");
    await page.getByRole("button", { name: "Download results" }).click();
    await expect(page.getByText("Priority recommendation memo", { exact: false })).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Utilization (task chooser, no view selected yet) has no serious or critical violations", async ({
    page,
  }) => {
    await page.goto("/utilization");
    await expect(page.getByRole("heading", { name: "What would you like to understand?" })).toBeVisible({
      timeout: 15_000,
    });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Utilization facility view (facility selected) has no serious or critical violations", async ({ page }) => {
    await page.goto("/utilization?tab=facilities");
    await expect(page.getByText("STANFORD HEALTH CARE")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("row", { name: /STANFORD HEALTH CARE/ }).click();
    await expect(page.getByText("Payer mix")).toBeVisible({ timeout: 10_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Utilization geographic view has no serious or critical violations", async ({ page }) => {
    await page.goto("/utilization?tab=geographic");
    await expect(page.getByRole("heading", { name: /modeled by tract/ })).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Validate (each section) has no serious or critical violations", async ({ page }) => {
    await page.goto("/validate");
    await expect(page.getByRole("heading", { name: "Trust, methods, and data quality" })).toBeVisible({
      timeout: 15_000,
    });
    let results = await new AxeBuilder({ page }).analyze();
    let serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, `Overview: ${JSON.stringify(serious, null, 2)}`).toEqual([]);

    for (const tab of ["How scores are built", "Checks and uncertainty", "Known limitations", "Reproduce the analysis"]) {
      await page.getByRole("tab", { name: tab }).click();
      await page.waitForTimeout(600);
      results = await new AxeBuilder({ page }).analyze();
      serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious, `${tab}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
    }
  });

  test("Access Lab (no place chosen yet) has no serious or critical violations", async ({ page }) => {
    await page.goto("/access-lab");
    await expect(page.getByRole("heading", { name: "Understand access to care" })).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Access Lab summary (tract chosen) has no serious or critical violations", async ({ page }) => {
    await page.goto("/access-lab?geography=tract&id=06085500100&name=Census%20Tract%205001");
    await expect(page.getByText("Nearest clinical care -- walking")).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Access Lab resource browser (a secondary tab) has no serious or critical violations", async ({ page }) => {
    await page.goto("/access-lab?tab=resources&geography=tract&id=06085500100&name=Census%20Tract%205001");
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Access Lab resource-gaps tab has no serious or critical violations", async ({ page }) => {
    await page.goto("/access-lab?tab=gaps&geography=tract&id=06085500100&name=Census%20Tract%205001");
    await expect(page.getByText("Where estimated health need and measured access overlap")).toBeVisible({
      timeout: 15_000,
    });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Access Lab mobile-service scenarios tab has no serious or critical violations", async ({ page }) => {
    await page.goto("/access-lab?tab=scenarios&geography=tract&id=06085500100&name=Census%20Tract%205001");
    await expect(page.getByText("No solution satisfies these constraints")).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Advocate landing (choose a starting point) has no serious or critical violations", async ({ page }) => {
    await page.goto("/advocate");
    await expect(page.getByRole("heading", { name: "Turn evidence into action" })).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Advocate Place step (search results shown) has no serious or critical violations", async ({ page }) => {
    await page.goto("/advocate");
    await page.getByRole("button", { name: /^Choose a community:/ }).click();
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("button", { name: /Sunnyvale/ }).first()).toBeVisible({ timeout: 10_000 });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Advocate Focus step has no serious or critical violations", async ({ page }) => {
    await page.goto("/advocate");
    await page.getByRole("button", { name: /^Choose a community:/ }).click();
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Sunnyvale/ }).first().click();
    await expect(page.getByRole("heading", { name: "What would you like to focus on?" })).toBeVisible({
      timeout: 10_000,
    });
    // The heading is static, but FocusPicker's own real content (the
    // recommended-focus card) loads asynchronously after it and briefly
    // shows a loading skeleton first -- scanning before that settles
    // caught a real, intermittent violation live in this skeleton state.
    await expect(page.getByRole("button", { name: /^Health equity overview, recommended:/ })).toBeVisible({
      timeout: 10_000,
    });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Advocate Evidence step (recommended facts loaded) and a generated brief have no serious or critical violations", async ({
    page,
  }) => {
    await page.goto("/advocate");
    await page.getByRole("button", { name: /^Choose a community:/ }).click();
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Sunnyvale/ }).first().click();
    await expect(page.getByRole("heading", { name: "What would you like to focus on?" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: /^Health equity overview, recommended:/ }).click();
    await expect(page.getByRole("heading", { name: "What facts would you like to use?" })).toBeVisible({
      timeout: 15_000,
    });

    let results = await new AxeBuilder({ page }).analyze();
    let serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.locator('button[aria-label^="Include "]').first().click();
    await page.getByRole("button", { name: /^Continue with 1 fact$/ }).click();
    await expect(page.getByRole("heading", { name: "What would you like to create?" })).toBeVisible();

    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.getByRole("button", { name: /^One-page meeting brief:/ }).click();
    await page.getByRole("button", { name: "Commissioner / staff" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByText("What is happening?")).toBeVisible({ timeout: 15_000 });

    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Advocate document flow (choose a document, review passages) has no serious or critical violations", async ({
    page,
  }) => {
    await page.goto("/advocate");
    await page.getByRole("button", { name: /^Review a document:/ }).click();
    await expect(page.getByRole("heading", { name: "Choose a document" })).toBeVisible();

    let results = await new AxeBuilder({ page }).analyze();
    let serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Upload a meeting document")
      .setInputFiles(path.join(__dirname, "fixtures", "sample-agenda.txt"));
    await expect(page.getByRole("heading", { name: "Review useful passages" })).toBeVisible({ timeout: 15_000 });

    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });

  test("Copilot (action choice, place chosen, and a generated answer) has no serious or critical violations", async ({
    page,
  }) => {
    await page.goto("/copilot");
    await expect(page.getByRole("heading", { name: "Understand the evidence" })).toBeVisible({ timeout: 15_000 });
    let results = await new AxeBuilder({ page }).analyze();
    let serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.getByRole("button", { name: /^Explain a community:/ }).click();
    await page.getByLabel("Find a place").fill("Gilroy");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Gilroy/ }).first().click();
    await expect(page.getByRole("heading", { name: "What should the explanation focus on?" })).toBeVisible();

    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);

    await page.getByRole("button", { name: /^Health equity overview, recommended:/ }).click();
    await page.getByRole("button", { name: "Create explanation" }).click();
    await expect(page.getByRole("heading", { name: "Gilroy city" })).toBeVisible({ timeout: 15_000 });

    results = await new AxeBuilder({ page }).analyze();
    serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
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

  test("the full Advocate workflow -- choose a place, focus, select evidence, create a draft -- works with keyboard only", async ({
    page,
  }) => {
    await page.goto("/advocate");
    const chooseCommunity = page.getByRole("button", { name: /^Choose a community:/ });
    await expect(chooseCommunity).toBeVisible({ timeout: 15_000 });
    await chooseCommunity.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByLabel("Find a place")).toBeVisible();
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.keyboard.press("Enter");

    const result = page.getByRole("button", { name: /Sunnyvale/ }).first();
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.focus();
    await page.keyboard.press("Enter");

    const recommendedFocus = page.getByRole("button", { name: /^Health equity overview, recommended:/ });
    await expect(recommendedFocus).toBeVisible({ timeout: 10_000 });
    await recommendedFocus.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { name: "What facts would you like to use?" })).toBeVisible({
      timeout: 15_000,
    });
    const includeButton = page.locator('button[aria-label^="Include "]').first();
    await includeButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("1 fact selected").first()).toBeVisible();

    const continueButton = page.getByRole("button", { name: /^Continue with 1 fact$/ });
    await continueButton.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { name: "What would you like to create?" })).toBeVisible();
    const briefOption = page.getByRole("button", { name: /^One-page meeting brief:/ });
    await briefOption.focus();
    await page.keyboard.press("Enter");

    const audienceOption = page.getByRole("button", { name: "Commissioner / staff" });
    await expect(audienceOption).toBeVisible();
    await audienceOption.focus();
    await page.keyboard.press("Enter");

    const goalContinue = page.getByRole("button", { name: "Continue" });
    await goalContinue.focus();
    await page.keyboard.press("Enter");

    const createButton = page.getByRole("button", { name: "Create draft" });
    await expect(createButton).toBeVisible();
    await createButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("What is happening?")).toBeVisible({ timeout: 15_000 });
  });
});
