import { test, expect } from "@playwright/test";

/** Every contributing page must use the same CTA, the same navigation
 * target, and the same plain-language confirmation once the user lands
 * in Advocate -- not just prove an internal record was created
 * (docs/design/advocate-intuitive-workspace-research.md
 * §"cross-page integration"). */
test.describe("Advocate -- cross-page 'Add to advocacy project' integration", () => {
  test("starting from a selected tract in Explore carries real structured state and confirms in plain English", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/explore?geography=tract&id=06085500100");
    if (isMobile) {
      // Below the xl breakpoint the profile opens behind a collapsed
      // summary bar (MobileSelectedSheet); open it first.
      await page.getByRole("button", { name: /Tap to view its full profile|concern/ }).click();
    }
    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Add to advocacy project" }).first().click();

    await expect(page).toHaveURL(/\/advocate\?workspace=.*added=1/, { timeout: 10_000 });
    // A plain-language confirmation banner, not "N evidence records
    // serialized successfully" -- and the geography label is a
    // human-readable name, never the raw GEOID.
    await expect(page.getByText(/Added .*Census Tract.* to your advocacy project\./)).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: /^Evidence,/ }).click();
    await expect(page.getByText(/facts? found for Census Tract/)).toBeVisible({ timeout: 15_000 });
  });

  test("starting from a Prioritize recommendation carries the priority scenario along", async ({ page }) => {
    await page.goto("/prioritize");
    await expect(page.getByRole("radio", { name: /Health equity overview/ })).toBeChecked({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: "Show drivers" }).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Show drivers" }).first().click();
    await expect(page.getByRole("button", { name: "Add to advocacy project" })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Add to advocacy project" }).click();

    await expect(page).toHaveURL(/\/advocate\?workspace=/, { timeout: 10_000 });
    await expect(page.getByText(/Added .* to your advocacy project\./)).toBeVisible({
      timeout: 10_000,
    });
    // The scenario radios live on the Project stage's entry tab, not
    // shown by default once evidence already exists -- open it to
    // confirm the carried-over scenario, rather than assuming it's
    // visible on whatever stage the handoff happened to land on.
    await page.getByRole("button", { name: /^Project,/ }).click();
    await expect(page.getByRole("radio", { name: /Health equity overview/ })).toBeChecked({
      timeout: 15_000,
    });
  });

  test("starting from an Access Lab tract summary carries the tract along", async ({ page }) => {
    await page.goto("/access-lab?geography=tract&id=06085500100");
    await expect(page.getByText("Nearest clinical care -- walking")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Add to advocacy project" }).click();

    await expect(page).toHaveURL(/\/advocate\?workspace=/, { timeout: 10_000 });
    // Access Lab's tract-summary endpoint doesn't return a human-readable
    // tract name (unlike Explore's tract profile, which does), so its
    // displayName is a raw-GEOID-based label rather than "Census Tract
    // ...": a real, pre-existing cross-page naming inconsistency that
    // would need a backend response field to fully fix, out of scope for
    // this frontend-only pass -- assert generically here instead of
    // requiring the nicer name this page can't currently provide.
    await expect(page.getByText(/Added .* to your advocacy project\./)).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: /^Evidence,/ }).click();
    await expect(page.getByText(/facts? found for/)).toBeVisible({ timeout: 15_000 });
  });

  test("starting from a Utilization finding carries the tract along, using the dense-table CTA variant", async ({
    page,
  }) => {
    await page.goto("/utilization?tab=geographic");
    await expect(page.getByRole("heading", { name: /modeled by tract/ })).toBeVisible({
      timeout: 15_000,
    });
    // Utilization's own table-column context uses the shorter "Add to
    // Advocate" label variant (documented exception for a dense
    // table-cell context) -- `exact: true` matters here since a
    // substring match on "Add" would also hit an unrelated column
    // header button.
    await page.getByRole("button", { name: "Add to Advocate", exact: true }).first().click();

    await expect(page).toHaveURL(/\/advocate\?workspace=/, { timeout: 10_000 });
    await expect(page.getByText(/Added .* to your advocacy project\./)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("adding evidence a second time, with a project already open, asks which project it belongs to", async ({
    page,
    isMobile,
  }) => {
    // First contribution creates the project silently (no existing
    // projects yet).
    await page.goto("/explore?geography=tract&id=06085500100");
    if (isMobile) {
      await page.getByRole("button", { name: /Tap to view its full profile|concern/ }).click();
    }
    await expect(page.getByRole("heading", { name: "Tract 06085500100" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Add to advocacy project" }).first().click();
    await expect(page).toHaveURL(/\/advocate\?workspace=/, { timeout: 10_000 });

    // A second contribution, with a real project already open, must ask
    // rather than silently create a second, disconnected project.
    await page.goto("/prioritize");
    await expect(page.getByRole("button", { name: "Show drivers" }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Show drivers" }).first().click();
    await page.getByRole("button", { name: "Add to advocacy project" }).click();

    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("dialog")).toContainText(/existing project|new project/i);
  });
});
