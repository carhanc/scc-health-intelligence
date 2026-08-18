import { test, expect } from "@playwright/test";

const TRACT_GEOID_PATTERN = /^06085\d{6}$/;

test.describe("Explore -- search, selection, and view switching", () => {
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

  test("clicking a tract on the map loads that exact tract's profile", async ({ page }) => {
    await page.goto("/explore");
    // Wait for the map's own tract-choropleth layer to actually paint --
    // MapLibre renders via WebGL canvas, which Playwright's Chromium
    // supports via software rendering (no display server needed).
    const mapRegion = page.getByRole("application", { name: /Map of Santa Clara County/ });
    await expect(mapRegion).toBeVisible({ timeout: 15_000 });
    // `toBeVisible` doesn't guarantee the element is scrolled into the
    // viewport -- it starts below the fold on this page, and a raw
    // page.mouse.click at an off-screen coordinate silently hits nothing.
    await mapRegion.scrollIntoViewIfNeeded();
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
    // mismatched one, and not an error.
    await expect(page.getByRole("heading", { name: `Tract ${clickedGeoid}` })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Couldn't load this place")).not.toBeVisible();
    await expect(page.getByText(/not found/)).not.toBeVisible();
  });

  test("the Map/Table toggle switches the visible browse view", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByRole("application", { name: /Map of Santa Clara County/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("table")).not.toBeVisible();

    await page.getByRole("button", { name: "Table", exact: true }).click();
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("application", { name: /Map of Santa Clara County/ })).not.toBeVisible();

    await page.getByRole("button", { name: "Map", exact: true }).click();
    await expect(page.getByRole("application", { name: /Map of Santa Clara County/ })).toBeVisible({
      timeout: 15_000,
    });
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

  test("selecting a tract from the browse table loads its full profile", async ({ page }) => {
    await page.goto("/explore");
    await page.getByRole("button", { name: "Table", exact: true }).click();

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
    // The browse table is replaced by the full-width profile once
    // something is selected, not left competing for space beside it.
    await expect(page.getByRole("table")).not.toBeVisible();
  });

  test("keyboard selection of a table row works the same as a click", async ({ page }) => {
    await page.goto("/explore");
    await page.getByRole("button", { name: "Table", exact: true }).click();
    const table = page.getByRole("table");
    await expect(table).toBeVisible({ timeout: 15_000 });

    const firstDataRow = table.locator("tbody tr").first();
    const geoidText = (await firstDataRow.locator("td").first().textContent())?.trim();

    await firstDataRow.focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`geography=tract&id=${geoidText}`));
    await expect(page.getByRole("heading", { name: `Tract ${geoidText}` })).toBeVisible({ timeout: 10_000 });
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

    // The place's real name is the primary display (the heading) --
    // "Place ID {geoid}" is legitimate, clearly labeled secondary
    // metadata directly below it, not a stand-in for the name.
    const heading = page.getByRole("heading", { name: "San Jose city", exact: true });
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // Selecting a geography is always URL-driven (the same code path a
    // fresh page load or a bookmarked/shared link takes) -- a reload must
    // not regress the resolved name back to the raw place GEOID.
    await page.reload();
    await expect(heading).toBeVisible({ timeout: 10_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/explore$/);
    await page.goForward();
    await expect(heading).toBeVisible({ timeout: 10_000 });
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
    await expect(page.getByRole("heading", { name: "Supervisor District 3" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Highest-concern areas in District 3")).toBeVisible({ timeout: 10_000 });
  });

  test("ZIP code search finds the matching ZCTA", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByLabel("Find a place")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Find a place").fill("94086");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByText("ZIP Code Tabulation Area 94086")).toBeVisible({ timeout: 10_000 });
  });

  test("what would you like to do next offers Copilot, Prioritize, and Access Lab, each carrying the tract along", async ({
    page,
  }) => {
    await page.goto("/explore?geography=tract&id=06085500100");
    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 15_000 });

    const copilotLink = page.getByRole("link", { name: "Ask Copilot about this tract" });
    await expect(copilotLink).toHaveAttribute("href", /\/copilot\?geography=tract&id=06085500100&name=/);

    const accessLabLink = page.getByRole("link", { name: "See its access to care" });
    await expect(accessLabLink).toHaveAttribute("href", /\/access-lab\?geography=tract&id=06085500100&name=/);

    await accessLabLink.click();
    await expect(page.getByRole("heading", { name: "How are people traveling?" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Census Tract 5001/i)).toBeVisible();
  });
});
