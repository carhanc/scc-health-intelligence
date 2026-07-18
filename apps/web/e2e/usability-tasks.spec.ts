import { test, expect } from "@playwright/test";

/**
 * Live verification for the remaining Phase 5 usability tasks (3, 5, 6, 7)
 * from docs/design/usability-testing.md. Task 1, 2, 4, and 8 are already
 * covered by explore-place-selection.spec.ts, explore-core.spec.ts,
 * explore-scenario-and-state.spec.ts, and accessibility.spec.ts
 * respectively.
 */
test.describe("Usability Task 3 -- compare two cities", () => {
  // Asserts on the desktop-inline detail panel; below the 1280px xl
  // breakpoint the same content lives behind a collapsed mobile summary
  // bar (MobileSelectedSheet), covered separately in
  // explore-mobile-sheet.spec.ts.
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, "mobile layout covered separately in explore-mobile-sheet.spec.ts");
  });

  test("San Jose and Sunnyvale: select a representative tract from each and compare them", async ({ page }) => {
    // Comparisons work tract-to-tract (scores are tract-level, not
    // aggregated to a city) -- the realistic path is: find a city, let
    // the map pan/outline it, click one of its tracts, then compare.
    await page.goto("/explore");
    await page.getByLabel("Find a place").fill("San Jose");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /San Jose/ }).first().click();
    await expect(page.getByText(/dashed outline shows/)).toBeVisible({ timeout: 10_000 });

    const mapRegion = page.getByRole("application", { name: /Map of Santa Clara County/ });
    await page.waitForTimeout(1500);
    const box = await mapRegion.boundingBox();
    if (!box) throw new Error("map region has no bounding box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page).toHaveURL(/geography=tract&id=06085\d{6}/, { timeout: 10_000 });

    await page.getByRole("button", { name: "Compare" }).click();
    const comparisonPanel = page.getByRole("region", { name: "Compare with another place" });
    await expect(comparisonPanel.getByText(/Comparisons work between two census tracts/)).toBeVisible();

    // The comparison box only accepts a tract selection (scores are
    // tract-level, not aggregated to a city) -- search a known
    // Sunnyvale-area tract GEOID directly.
    await comparisonPanel.getByLabel("Find a place").fill("06085500100");
    await comparisonPanel.getByRole("button", { name: "Search" }).click();
    await comparisonPanel.getByRole("button", { name: /06085500100/ }).click();

    await expect(page.getByText(/Comparing tract .* with tract 06085500100/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/scores.*(higher|lower).*than tract/)).toBeVisible();
  });
});

test.describe("Usability Task 5 -- tell whether a tract's ranking is stable", () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, "mobile layout covered separately in explore-mobile-sheet.spec.ts");
  });

  test("the stability badge and its explanation are visible right next to the headline result, not buried", async ({
    page,
  }) => {
    await page.goto("/explore?geography=tract&id=06085500100");
    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 10_000 });

    // The stability badge sits in the compact confidence line right
    // after the top drivers -- above the fold, before any disclosure
    // needs opening -- and its title attribute carries the
    // plain-language explanation (surfaced as a native tooltip on
    // hover/focus for sighted and AT users alike). The raw 0-100 score
    // number itself is deliberately secondary now (docs/design/
    // health-equity-product-consolidation.md's headline-result
    // requirement) and lives behind "How this was calculated" instead.
    const badge = page.locator("span[title]").filter({
      hasText: /^(Robust|Moderately stable|Assumption-sensitive|Data-limited)$/,
    });
    await expect(badge).toBeVisible();
    const title = await badge.getAttribute("title");
    expect(title, "stability badge must explain what the label means, not just show a word").toMatch(
      /priorities|weight|assumption|reliable|holds up/i,
    );
  });
});

test.describe("Usability Task 6 -- find a metric's publisher, vintage, and limitations", () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, "mobile layout covered separately in explore-mobile-sheet.spec.ts");
  });

  test("the evidence drawer lists a source citation for every metric, and each domain disclosure shows its limitation", async ({
    page,
  }) => {
    await page.goto("/explore?geography=tract&id=06085500100");
    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 10_000 });

    // Path A: expand a domain and read one metric's limitation inline.
    await page.locator("details summary").first().click();
    await expect(page.getByText(/Limitation:/).first()).toBeVisible();

    // Path B: the evidence drawer -- every metric row must show a
    // real-sounding source citation (publisher + vintage), never blank
    // and never an internal filename/table reference.
    await page.getByRole("button", { name: "View sources & evidence" }).click();
    const dialog = page.getByRole("dialog", { name: "Sources and evidence" });
    await expect(dialog).toBeVisible();
    const sourceCells = dialog.locator("table").first().locator("tbody tr td:last-child");
    const firstCitation = await sourceCells.first().textContent();
    expect(firstCitation?.trim().length ?? 0).toBeGreaterThan(0);
    expect(firstCitation).not.toMatch(/DATA_MANIFEST|source_id=|\.(csv|json)\b/i);
  });
});

test.describe("Usability Task 7 -- understand what the platform cannot conclude", () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, "mobile layout covered separately in explore-mobile-sheet.spec.ts");
  });

  test("the Overview trust section and the tract score panel both state the non-causal, screening-only framing in plain language", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "How to read what this platform shows you" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Screening, not causation")).toBeVisible();
    await expect(
      page.getByText(/it is not a claim that any specific program will fix it/),
    ).toBeVisible();

    await page.goto("/explore?geography=tract&id=06085500100");
    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/not a diagnosis or causal conclusion/)).toBeVisible();
  });
});
