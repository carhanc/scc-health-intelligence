import { test, expect } from "@playwright/test";

const TRACT_GEOID_PATTERN = /^06085\d{6}$/;

test.describe("Explore -- search, selection, and view switching", () => {
  // These tests assert on the desktop-inline detail panel (selection
  // wiring: does the right URL/heading appear). Below the 1280px xl
  // breakpoint, a selected geography opens in a collapsed summary bar +
  // bottom sheet instead (see MobileSelectedSheet in geography-detail.tsx),
  // so the same assertions don't apply on the mobile-chromium project --
  // that layout and its own content are covered in
  // e2e/explore-mobile-sheet.spec.ts.
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, "mobile layout covered separately in explore-mobile-sheet.spec.ts");
  });

  test("search by city name finds a real place", async ({ page }) => {
    await page.goto("/explore");
    // First navigation of the suite pays Next.js dev mode's on-demand
    // compile cost for this route; a generous timeout here reflects a
    // real user's first visit, not a production concern (a built app has
    // no on-demand compilation).
    await expect(page.getByLabel("Find a place")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();

    const result = page.getByRole("button", { name: /Sunnyvale/ });
    await expect(result).toBeVisible({ timeout: 10_000 });
  });

  test("searching a full 11-character tract number loads that tract's profile", async ({ page }) => {
    await page.goto("/explore");
    await page.getByLabel("Find a place").fill("06085500100");
    await page.getByRole("button", { name: "Search" }).click();

    const result = page.getByRole("button", { name: /06085500100/ });
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    await expect(page).toHaveURL(/geography=tract&id=06085500100/);
    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 10_000 });
  });

  test("clicking a tract on the map loads that exact tract's profile", async ({ page }) => {
    await page.goto("/explore");

    // Wait for the map's own tract-choropleth layer to actually paint --
    // MapLibre renders via WebGL canvas, which Playwright's Chromium
    // supports via software rendering (no display server needed).
    const mapRegion = page.getByRole("application", { name: /Map of Santa Clara County/ });
    await expect(mapRegion).toBeVisible({ timeout: 15_000 });
    // Give the boundaries fetch + first paint a moment; the map has no
    // "ready" signal exposed to the DOM, so a short settle wait here is
    // the same allowance a real user's eyes need before clicking.
    await page.waitForTimeout(2000);

    const box = await mapRegion.boundingBox();
    if (!box) throw new Error("map region has no bounding box");
    // Click near the center of the rendered map, which -- after
    // fitBounds() -- is guaranteed to be inside the county and therefore
    // inside some tract polygon.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    // The URL is the source of truth for what got selected.
    await expect(page).toHaveURL(/geography=tract&id=06085\d{6}/, { timeout: 10_000 });
    const url = new URL(page.url());
    const clickedGeoid = url.searchParams.get("id");
    expect(clickedGeoid).toMatch(TRACT_GEOID_PATTERN);

    // The detail panel must show that exact tract -- not "tract", not a
    // mismatched one, and not an error (the Phase 5 map-selection defect).
    await expect(page.getByRole("heading", { name: `Tract ${clickedGeoid}` })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Couldn't load this place")).not.toBeVisible();
    await expect(page.getByText(/not found/)).not.toBeVisible();
  });

  test("selecting a tract from the table loads the same profile a map click would", async ({ page }) => {
    await page.goto("/explore?tab=table");

    const table = page.getByRole("table");
    await expect(table).toBeVisible({ timeout: 15_000 });

    const firstDataRow = table.locator("tbody tr").first();
    await expect(firstDataRow).toBeVisible({ timeout: 10_000 });
    const geoidCell = firstDataRow.locator("td").first();
    const geoidText = (await geoidCell.textContent())?.trim();
    expect(geoidText).toMatch(TRACT_GEOID_PATTERN);

    await firstDataRow.click();

    await expect(page).toHaveURL(new RegExp(`geography=tract&id=${geoidText}`));
    await expect(page.getByRole("heading", { name: `Tract ${geoidText}` })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Couldn't load this place")).not.toBeVisible();
  });

  test("keyboard selection of a table row works the same as a click", async ({ page }) => {
    await page.goto("/explore?tab=table");
    const table = page.getByRole("table");
    await expect(table).toBeVisible({ timeout: 15_000 });

    const firstDataRow = table.locator("tbody tr").first();
    const geoidText = (await firstDataRow.locator("td").first().textContent())?.trim();

    await firstDataRow.focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`geography=tract&id=${geoidText}`));
    await expect(page.getByRole("heading", { name: `Tract ${geoidText}` })).toBeVisible({ timeout: 10_000 });
  });

  test("Map/Table segmented control switches the visible view", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("application", { name: /Map of Santa Clara County/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("table")).not.toBeVisible();

    await page.getByRole("radio", { name: "Table" }).click();
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("application", { name: /Map of Santa Clara County/ })).not.toBeVisible();

    await page.getByRole("radio", { name: "Map" }).click();
    await expect(page.getByRole("application", { name: /Map of Santa Clara County/ })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("selecting a city shows its human-readable name, never a raw place GEOID, including after reload and browser back/forward (Phase 6.5 regression)", async ({
    page,
  }) => {
    await page.goto("/explore");
    await expect(page.getByLabel("Find a place")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Find a place").fill("San Jose");
    await page.getByRole("button", { name: "Search" }).click();
    const result = page.getByRole("button", { name: /San Jose/ });
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    const caption = page.getByText("The dashed outline shows", { exact: false });
    await expect(caption).toContainText("San Jose city", { timeout: 10_000 });
    await expect(caption).not.toContainText("0668000");

    // Selecting a geography is always URL-driven (the same code path a
    // fresh page load or a bookmarked/shared link takes) -- a reload must
    // not regress the resolved name back to the raw place GEOID.
    await page.reload();
    await expect(caption).toContainText("San Jose city", { timeout: 10_000 });
    await expect(caption).not.toContainText("0668000");

    await page.goBack();
    await expect(page).toHaveURL(/\/explore$/);
    await page.goForward();
    await expect(caption).toContainText("San Jose city", { timeout: 10_000 });
  });

  test("supervisor district search and selection shows the district name, not just a bare number", async ({
    page,
  }) => {
    await page.goto("/explore");
    await expect(page.getByLabel("Find a place")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Find a place").fill("district 3");
    await page.getByRole("button", { name: "Search" }).click();

    const result = page.getByRole("button", { name: /District 3/ });
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    await expect(page).toHaveURL(/geography=supervisor_district&id=3/);
    const caption = page.getByText("The dashed outline shows", { exact: false });
    await expect(caption).toContainText("District 3", { timeout: 10_000 });
    await expect(page.getByText("Highest-concern areas in District 3")).toBeVisible({ timeout: 10_000 });
  });

  test("ZIP code search finds the matching ZCTA", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByLabel("Find a place")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Find a place").fill("94086");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByText("ZIP Code Tabulation Area 94086")).toBeVisible({ timeout: 10_000 });
  });
});
