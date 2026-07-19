import { test, expect } from "@playwright/test";

/** Access Lab was rebuilt as a place-first flow: only a search field
 * until a community is chosen (no travel-mode toggle, no methodology
 * paragraph body, no secondary tabs visible yet), then travel mode and
 * the access summary appear together as the result, with Resource
 * browser/Resource gaps/Mobile-service scenarios reachable as secondary
 * tabs below it (docs/design/product-wide-flow-simplification-visual-
 * review.md "ACCESS LAB"). */

async function selectTract(page: import("@playwright/test").Page, query: string) {
  await page.goto("/access-lab");
  await page.getByLabel("Find a place").fill(query);
  await page.getByRole("button", { name: "Search" }).click();
  const result = page.getByRole("button", { name: new RegExp(query, "i") }).first();
  await expect(result).toBeVisible({ timeout: 10_000 });
  await result.click();
}

test.describe("Access Lab -- place-first flow, travel mode, and real access data", () => {
  test("the first screen asks only which community, no travel mode or secondary tabs visible yet", async ({
    page,
  }) => {
    await page.goto("/access-lab");
    await expect(page.getByRole("heading", { name: "Understand access to care", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Which community would you like to explore?" })).toBeVisible();
    await expect(page.getByLabel("Find a place")).toBeVisible();
    await expect(page.getByText("Travel mode")).not.toBeVisible();
    await expect(page.getByRole("tab", { name: "Resource browser" })).not.toBeVisible();
  });

  test("searching a tract loads its real network/transit access summary alongside the travel-mode choice", async ({
    page,
  }) => {
    await selectTract(page, "06085500100");
    await expect(page).toHaveURL(/geography=tract&id=06085500100/);
    await expect(page.getByRole("heading", { name: "How are people traveling?" })).toBeVisible();
    await expect(page.getByText("Nearest clinical care -- walking")).toBeVisible({ timeout: 10_000 });
    // Real distance figures, not placeholders -- "mi" unit always present.
    await expect(page.getByText(/\d+\.\d mi/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scheduled transit access" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to advocacy project" })).toBeVisible();
  });

  test("switching travel mode updates the displayed distances", async ({ page }) => {
    await page.goto("/access-lab?geography=tract&id=06085500100");
    await expect(page.getByText("Nearest clinical care -- walking")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("radio", { name: "Driving" }).click();
    await expect(page).toHaveURL(/mode=drive/);
    await expect(page.getByText("Nearest clinical care -- driving")).toBeVisible({ timeout: 10_000 });
  });

  test("the advocacy handoff uses the real place name from search, not a raw GEOID", async ({ page }) => {
    await selectTract(page, "06085500100");
    await expect(page.getByRole("button", { name: "Add to advocacy project" })).toBeVisible({ timeout: 10_000 });
    // The compact context bar already shows the real, search-provided
    // name -- confirm it, not a bare "Tract 06085500100" fallback.
    await expect(page.getByText(/Census Tract 5001/i)).toBeVisible();
  });

  test("resource browser (a secondary tab, reachable only once a place is chosen) shows real facilities", async ({
    page,
  }) => {
    await selectTract(page, "06085500100");
    await page.getByRole("tab", { name: "Resource browser" }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();

    // Default category is hospital -- Santa Clara County has exactly 15.
    await expect(page.getByText(/15 hospitals/i)).toBeVisible({ timeout: 15_000 });
    // Two distinct HCAI-licensed facilities both organizationally named
    // "Stanford Health Care" (different campuses/licenses, different bed
    // counts) -- correctly kept as two separate canonical facilities, not
    // merged, so this legitimately matches twice.
    await expect(page.getByText("STANFORD HEALTH CARE").first()).toBeVisible();

    await page.getByRole("button", { name: /Clinics and health centers/ }).click();
    await expect(page.getByText(/clinics and health centers in Santa Clara County/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("resource gaps (a secondary tab) shows all four classification counts summing to real tracts", async ({
    page,
  }) => {
    await selectTract(page, "06085500100");
    await page.getByRole("tab", { name: "Resource gaps" }).click();

    // Each classification label legitimately appears twice (a <dt> term
    // and a status badge repeating it) -- .first() is sufficient proof
    // it renders at all.
    await expect(page.getByText("High estimated need, low measured access").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("High estimated need, high measured access").first()).toBeVisible();
    await expect(page.getByText("Low estimated need, low measured access").first()).toBeVisible();
    await expect(page.getByText("Low estimated need, high measured access").first()).toBeVisible();
  });

  test("mobile-service scenarios (a secondary tab) shows the precomputed sensitivity sweep including an infeasible run", async ({
    page,
  }) => {
    await selectTract(page, "06085500100");
    await page.getByRole("tab", { name: "Mobile-service scenarios" }).click();

    await expect(page.getByText("modeled planning scenarios", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("No solution satisfies these constraints")).toBeVisible();

    // Never presents modeled coverage as real service delivery.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.toLowerCase()).not.toContain("people served");
    expect(bodyText.toLowerCase()).not.toContain("patients served");
    // A blind usability review found the pipeline's raw internal domain
    // key leaking into every scenario card title as a technical-looking
    // parenthetical -- confirm the frontend strips it (the plain-language
    // version already appears once in the intro paragraph above the list).
    expect(bodyText).not.toContain("health_burden-weighted");
    expect(bodyText).not.toContain("health_burden_weighted");
  });

  test("selecting a city offers a real tract drill-down, not a dead end", async ({ page }) => {
    await selectTract(page, "Sunnyvale");

    const guidance = page.getByText("Select a tract in", { exact: false });
    await expect(guidance).toBeVisible({ timeout: 10_000 });
    await expect(guidance).toContainText("Sunnyvale city");
    await expect(guidance).not.toContainText("0677000");

    const tractButton = page.getByRole("button", { name: /Census Tract \d/ }).first();
    await expect(tractButton).toBeVisible({ timeout: 10_000 });
    await tractButton.click();

    await expect(page).toHaveURL(/geography=tract&id=06085\d{6}/, { timeout: 10_000 });
    await expect(page.getByText("Nearest clinical care", { exact: false })).toBeVisible({ timeout: 10_000 });
  });

  test("selecting a ZIP code (no drill-down data available) shows plain guidance with a real link out, not a dead end", async ({
    page,
  }) => {
    await selectTract(page, "94086");

    await expect(
      page.getByText("Access Lab currently shows results by census tract", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
    // A blind usability review flagged this guidance as a dead end --
    // "pick a place" named an action with no way to actually do it.
    const exploreLink = page.getByRole("link", { name: /pick a place on the map in Explore/i });
    await expect(exploreLink).toBeVisible();
    await expect(exploreLink).toHaveAttribute("href", "/explore");
  });

  test("a fully unreachable backend produces a plain, recoverable error on the access summary -- no raw pipeline/script names", async ({
    page,
  }) => {
    // A blind usability review found this exact error message naming an
    // internal pipeline script ("run_access_metrics_pipeline") -- confirm
    // it now matches the codebase-wide plain "Couldn't load X. Is the API
    // running?" convention used by every sibling panel on this page.
    await page.route("http://localhost:8000/**", (route) => route.abort("connectionrefused"));
    await page.goto("/access-lab?geography=tract&id=06085500100");

    const error = page.getByRole("alert").filter({ has: page.getByRole("heading", { name: /couldn.t load this tract.s access summary/i }) });
    await expect(error).toBeVisible({ timeout: 10_000 });
    const errorText = await error.innerText();
    expect(errorText).not.toContain("run_access_metrics_pipeline");
    expect(errorText).not.toMatch(/`/);
  });

  test("no console errors or hydration warnings on initial load or after choosing a place", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await selectTract(page, "06085500100");
    await expect(page.getByText("Nearest clinical care -- walking")).toBeVisible({ timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
