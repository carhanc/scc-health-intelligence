import { test, expect } from "@playwright/test";
import { trackConsoleErrors } from "./helpers";

/** Prioritize was rebuilt around a concise, card-based "highest
 * screening concern" result shown by default, with the scenario/focus
 * grid moved into a collapsed "Adjust priorities" disclosure (the same
 * shared FocusPicker used by Advocate and Copilot) and Export/
 * Constraints demoted from full tabs to secondary disclosures
 * (docs/design/product-wide-flow-simplification-visual-review.md
 * "PRIORITIZE"). */

test.describe("Prioritize -- ranked areas, adjustable priorities, compare, constraints, download", () => {
  test("the default view shows concise ranked-area cards, not a 408-row table, with priorities collapsed", async ({
    page,
  }) => {
    await page.goto("/prioritize");
    await expect(page.getByRole("heading", { name: "Find areas for closer review", level: 1 })).toBeVisible();
    await expect(page.getByText("Health equity overview").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Highest screening concern" })).toBeVisible({ timeout: 15_000 });
    // The full sortable table and the priorities grid are not part of
    // the first viewport.
    await expect(page.getByRole("table")).not.toBeVisible();
    await expect(page.getByRole("radio", { name: /Health equity overview/ })).not.toBeVisible();
    await expect(page.getByText(/^#1 /).first()).toBeVisible();
  });

  test("choosing a focus area updates the ranked areas", async ({ page }) => {
    await page.goto("/prioritize");
    await expect(page.getByRole("button", { name: "Health equity overview" })).toHaveAttribute("aria-pressed", "true", {
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Diabetes prevention" }).click();
    await expect(page).toHaveURL(/scenario=diabetes_prevention_v1/);
    await expect(page.getByRole("button", { name: "Diabetes prevention" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: "Highest screening concern" })).toBeVisible({ timeout: 15_000 });
  });

  test("a custom focus reveals weight sliders and weights always sum to 100%", async ({ page }) => {
    await page.goto("/prioritize");
    await page.getByRole("button", { name: "Build your own" }).click();

    const healthNeedsSlider = page.getByRole("slider", { name: "Health needs" });
    await healthNeedsSlider.fill("80");

    const status = page.getByRole("status").filter({ hasText: "Applied weights" });
    await expect(status).toContainText("Total: 100%", { timeout: 10_000 });
    await expect(page.getByRole("heading", { name: "Highest screening concern" })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/weights=/, { timeout: 10_000 });
  });

  test("language access is explained as not scored yet, only under More focus areas", async ({ page }) => {
    await page.goto("/prioritize");
    await expect(page.getByText(/Language access isn't scored yet/)).not.toBeVisible();
    await page.getByRole("button", { name: "More focus areas" }).click();
    await expect(page.getByText(/Language access isn't scored yet/)).toBeVisible();
  });

  test("view all 408 tracts reveals the full sortable table with a Show drivers explanation", async ({ page }) => {
    await page.goto("/prioritize");
    await page.getByRole("button", { name: /^View all \d+ tracts$/ }).click();
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Show drivers" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Show drivers" }).first().click();
    await expect(page.getByText(/Why .* ranked here/)).toBeVisible();

    await page.getByRole("button", { name: "Back to the concise view" }).click();
    await expect(page.getByRole("heading", { name: "Highest screening concern" })).toBeVisible();
  });

  test("adding practical constraints reveals the Access Lab optimizer scenarios without leaving the page", async ({
    page,
  }) => {
    await page.goto("/prioritize");
    await page.getByRole("button", { name: "Add practical constraints" }).click();
    await expect(page.getByText("modeled planning scenarios", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("No solution satisfies these constraints")).toBeVisible();
  });

  test("compare places shows overlap between two focus areas' top priority places", async ({ page }) => {
    await page.goto("/prioritize");
    await page.getByRole("tab", { name: "Compare places" }).click();
    await page.selectOption("select", { label: "Food access" });
    await expect(page.getByText(/of the top 10 places appear under both priorities/)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("downloading results offers a CSV link and a printable decision memo without a separate Export tab", async ({
    page,
  }) => {
    await page.goto("/prioritize");
    await expect(page.getByRole("tab", { name: "Export" })).not.toBeVisible();
    await page.getByRole("button", { name: "Download results" }).click();
    await expect(page.getByRole("link", { name: "Download CSV" })).toHaveAttribute(
      "href",
      /\/api\/v1\/prioritize\/export\/csv/,
    );
    await expect(page.getByText("Priority recommendation memo", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Limitations" })).toBeVisible();
  });

  test("a ranked area card offers to view the area and add it to an advocacy project", async ({ page }) => {
    await page.goto("/prioritize");
    await expect(page.getByRole("heading", { name: "Highest screening concern" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "View area" }).first()).toHaveAttribute(
      "href",
      /\/\?geography=tract&id=/,
    );
    await expect(page.getByRole("button", { name: "Add to advocacy project" }).first()).toBeVisible();
  });

  test("no console errors on initial load or after adjusting to a custom focus", async ({ page }) => {
    const errors = trackConsoleErrors(page);

    await page.goto("/prioritize");
    await expect(page.getByRole("heading", { name: "Find areas for closer review" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Build your own" }).click();
    await expect(page.getByRole("heading", { name: "Highest screening concern" })).toBeVisible({ timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
