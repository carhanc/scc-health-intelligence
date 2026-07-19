import { test, expect } from "@playwright/test";

/** Every contributing page must use the same CTA and land the user
 * directly on Evidence with a plain-language confirmation -- never make
 * them repeat a place selection another page already supplied (docs/
 * design/advocate-flow-simplification-visual-review.md "CROSS-PAGE
 * HANDOFF"). */
test.describe("Advocate -- cross-page 'Add to advocacy project' handoff", () => {
  test("starting from Explore lands directly on Evidence with a plain-English confirmation, not the Place step", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/explore?geography=tract&id=06085500100");
    if (isMobile) {
      await page.getByRole("button", { name: /Tap to view its full profile|concern/ }).click();
    }
    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Add to advocacy project" }).first().click();

    await expect(page).toHaveURL(/\/advocate\?workspace=.*added=1/, { timeout: 10_000 });
    await expect(page.getByText("Evidence was added from Explore")).toBeVisible({ timeout: 10_000 });
    // A real, specific fact count -- never "0 facts" while evidence is
    // still loading, and never the raw GEOID.
    await expect(page.getByText(/\d+ facts? about Census Tract.*ready to review/)).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "Review the evidence" }).click();
    await expect(page.getByRole("heading", { name: "What facts would you like to use?" })).toBeVisible({
      timeout: 10_000,
    });
    // The facts this page contributed appear first, clearly labeled.
    await expect(page.getByText("ADDED FROM EXPLORE")).toBeVisible();
  });

  test("starting from a Prioritize recommendation carries the focus area along", async ({ page }) => {
    await page.goto("/prioritize");
    await expect(page.getByRole("radio", { name: /Health equity overview/ })).toBeChecked({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Show drivers" }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Show drivers" }).first().click();
    await expect(page.getByRole("button", { name: "Add to advocacy project" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Add to advocacy project" }).click();

    await expect(page).toHaveURL(/\/advocate\?workspace=/, { timeout: 10_000 });
    await expect(page.getByText(/Evidence was added from Prioritize/)).toBeVisible({ timeout: 10_000 });

    // The carried-over focus is visible from the Place step (a real
    // scenario was set, not left blank) -- confirm via View project
    // details rather than assuming any one UI location. The compact
    // project summary bar shows the same focus label too, so scope to
    // the details disclosure specifically to avoid a strict-mode
    // ambiguity between the two intentionally-overlapping summaries.
    await page.getByRole("button", { name: "Review the evidence" }).click();
    await expect(page.getByRole("heading", { name: "What facts would you like to use?" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "View project details" }).click();
    await expect(page.getByTestId("project-details-disclosure")).toContainText("Health equity overview");
  });

  test("starting from an Access Lab tract summary carries the tract along and confirms in plain English", async ({
    page,
  }) => {
    await page.goto("/access-lab?geography=tract&id=06085500100");
    await expect(page.getByText("Nearest clinical care -- walking")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Add to advocacy project" }).click();

    await expect(page).toHaveURL(/\/advocate\?workspace=/, { timeout: 10_000 });
    await expect(page.getByText("Evidence was added from Access Lab")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Review the evidence" }).click();
    await expect(page.getByText("ADDED FROM ACCESS LAB")).toBeVisible({ timeout: 10_000 });
  });

  test("starting from a Utilization finding carries the tract along, using the dense-table CTA variant", async ({
    page,
  }) => {
    await page.goto("/utilization?tab=geographic");
    await expect(page.getByRole("heading", { name: /modeled by tract/ })).toBeVisible({ timeout: 15_000 });
    // Utilization's own table-column context uses the shorter "Add to
    // Advocate" label variant (documented exception for a dense
    // table-cell context) -- `exact: true` avoids matching an unrelated
    // column-sort header button.
    await page.getByRole("button", { name: "Add to Advocate", exact: true }).first().click();

    await expect(page).toHaveURL(/\/advocate\?workspace=/, { timeout: 10_000 });
    await expect(page.getByText(/Evidence was added from Utilization/)).toBeVisible({ timeout: 10_000 });
  });

  test("adding evidence a second time, with a real project already open, asks which project it belongs to", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/explore?geography=tract&id=06085500100");
    if (isMobile) {
      await page.getByRole("button", { name: /Tap to view its full profile|concern/ }).click();
    }
    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Add to advocacy project" }).first().click();
    await expect(page).toHaveURL(/\/advocate\?workspace=/, { timeout: 10_000 });

    await page.goto("/prioritize");
    await expect(page.getByRole("button", { name: "Show drivers" }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Show drivers" }).first().click();
    await page.getByRole("button", { name: "Add to advocacy project" }).click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("dialog")).toContainText(/existing project|new project/i);
    // Never silently added to an unrelated project without asking.
  });
});
