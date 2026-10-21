import { test, expect } from "@playwright/test";
import {
  TRACT_A,
  TRACT_GEOID_PATTERN,
  mapRegion,
  openMap,
  openTract,
  searchAndPick,
  searchBox,
  tractHeading,
} from "./helpers";

test.describe("Map home -- search, selection, and the table", () => {
  test("typing a city name suggests that city", async ({ page }) => {
    await openMap(page);
    await searchBox(page).fill("Sunnyvale");
    await expect(page.getByRole("option", { name: /Sunnyvale/ }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("clicking a tract on the map opens that exact tract's profile", async ({ page }) => {
    await openMap(page);
    const region = mapRegion(page);
    // Give the boundaries fetch and first paint a moment; the map exposes no
    // "ready" signal to the DOM, so this is the same allowance a person's
    // eyes need before clicking.
    await page.waitForTimeout(3000);

    const box = await region.boundingBox();
    if (!box) throw new Error("map region has no bounding box");
    // The county is fitted into the area to the right of the side panel, so
    // aim for the middle of that area, which is inside some tract.
    const isDesktop = (page.viewportSize()?.width ?? 0) >= 1024;
    let x: number;
    let y: number;
    if (isDesktop) {
      const panelWidth = 440 + 16;
      x = box.x + panelWidth + (box.width - panelWidth) / 2;
      y = box.y + box.height / 2;
    } else {
      // On phones the panel is a bottom sheet (312px when collapsed); aim at
      // the middle of the map above it.
      x = box.x + box.width / 2;
      y = box.y + 72 + (box.height - 312 - 72) / 2;
    }
    await page.mouse.click(x, y);

    await expect(page).toHaveURL(/geography=tract&id=06085\d{6}/, { timeout: 10_000 });
    const clickedGeoid = new URL(page.url()).searchParams.get("id");
    expect(clickedGeoid).toMatch(TRACT_GEOID_PATTERN);

    await expect(tractHeading(page, clickedGeoid!)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("We couldn't load this place")).not.toBeVisible();
  });

  test("searching a full 11-character tract number opens that tract", async ({ page }) => {
    await openMap(page);
    await searchAndPick(page, TRACT_A, new RegExp(TRACT_A));
    await expect(page).toHaveURL(new RegExp(`geography=tract&id=${TRACT_A}`));
    await expect(tractHeading(page, TRACT_A)).toBeVisible({ timeout: 15_000 });
  });

  test("selecting a neighborhood from the ranked list opens its profile", async ({ page }) => {
    await openMap(page);
    const list = page.getByRole("region", { name: /Where to look first/ });
    const first = list.getByRole("button").first();
    await expect(first).toBeVisible({ timeout: 30_000 });
    await first.click();
    await expect(page).toHaveURL(/geography=tract&id=06085\d{6}/);
    await expect(page.getByRole("heading", { name: /^Tract 06085\d{6}/ })).toBeVisible({ timeout: 15_000 });
  });

  test("the table lists every neighborhood and selecting a row opens its profile", async ({ page }) => {
    await openMap(page);
    await page.getByRole("button", { name: /See all .* as a table/ }).click();

    const dialog = page.getByRole("dialog", { name: "All neighborhoods, as a table" });
    const table = dialog.getByRole("table");
    await expect(table).toBeVisible({ timeout: 20_000 });

    const firstRow = table.locator("tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    const geoid = (await firstRow.locator("td").nth(1).textContent())?.trim();
    expect(geoid).toMatch(TRACT_GEOID_PATTERN);

    await firstRow.click();
    await expect(page).toHaveURL(new RegExp(`geography=tract&id=${geoid}`));
    await expect(tractHeading(page, geoid!)).toBeVisible({ timeout: 15_000 });
    await expect(dialog).not.toBeVisible();
  });

  test("keyboard selection of a table row works the same as a click", async ({ page }) => {
    await openMap(page);
    await page.getByRole("button", { name: /See all .* as a table/ }).click();
    const table = page.getByRole("dialog").getByRole("table");
    await expect(table).toBeVisible({ timeout: 20_000 });

    const firstRow = table.locator("tbody tr").first();
    const geoid = (await firstRow.locator("td").nth(1).textContent())?.trim();
    await firstRow.focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(new RegExp(`geography=tract&id=${geoid}`));
    await expect(tractHeading(page, geoid!)).toBeVisible({ timeout: 15_000 });
  });

  test("selecting a city shows its human-readable name, never a raw place GEOID, including after reload and back/forward", async ({
    page,
  }) => {
    await openMap(page);
    await searchAndPick(page, "San Jose", /San Jose/);

    const heading = page.getByRole("heading", { name: "San Jose city", exact: true });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(heading).toBeVisible({ timeout: 30_000 });

    await page.goBack();
    await expect(page).not.toHaveURL(/geography=place/);
    await page.goForward();
    await expect(heading).toBeVisible({ timeout: 15_000 });
  });

  test("supervisor district search and selection shows the district name, not just a number", async ({ page }) => {
    await openMap(page);
    await searchAndPick(page, "district 3", /District 3/);

    await expect(page).toHaveURL(/geography=supervisor_district&id=3/);
    await expect(page.getByRole("heading", { name: "Supervisor District 3" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Highest-concern areas in District 3")).toBeVisible({ timeout: 15_000 });
  });

  test("a ZIP code search finds the matching ZIP area", async ({ page }) => {
    await openMap(page);
    await searchBox(page).fill("94086");
    await expect(page.getByRole("option", { name: /94086/ }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("the next-step links carry the tract along to Copilot and Access Lab", async ({ page }) => {
    await openTract(page, TRACT_A);

    const copilotLink = page.getByRole("link", { name: "Ask Copilot about this tract" });
    await expect(copilotLink).toHaveAttribute("href", new RegExp(`/copilot\\?geography=tract&id=${TRACT_A}&name=`));

    const accessLabLink = page.getByRole("link", { name: "See its access to care" });
    await expect(accessLabLink).toHaveAttribute("href", new RegExp(`/access-lab\\?geography=tract&id=${TRACT_A}&name=`));

    await accessLabLink.click();
    await expect(page.getByRole("heading", { name: "How are people traveling?" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Census Tract 5001/i).first()).toBeVisible();
  });

  test("the old /explore address still works and lands on the map", async ({ page }) => {
    await page.goto(`/explore?geography=tract&id=${TRACT_A}`);
    await expect(page).toHaveURL(new RegExp(`^http://localhost:3000/\\?geography=tract&id=${TRACT_A}`));
    await expect(tractHeading(page, TRACT_A)).toBeVisible({ timeout: 30_000 });
  });
});
