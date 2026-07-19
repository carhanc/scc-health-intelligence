import { test, expect } from "@playwright/test";

/** Validate was rebuilt as a trust-first Overview (grouped source
 * status instead of six equal-sized cards) plus a simplified 5-section
 * nav -- Uncertainty & sensitivity and Validation are merged into one
 * "Checks and uncertainty" section, since a first-time visitor
 * shouldn't have to know which of the two to enter first
 * (docs/design/product-wide-flow-simplification-visual-review.md
 * "VALIDATE"). */

test.describe("Validate -- overview, methods, checks and uncertainty, limitations, reproducibility", () => {
  test("overview answers whether the data can be trusted, with grouped status and a link to the Data page", async ({
    page,
  }) => {
    await page.goto("/validate");
    await expect(page.getByRole("heading", { name: "Trust, methods, and data quality", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Can I trust what I'm seeing?" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/published data sources/)).toBeVisible();
    await expect(page.getByText("Available and current")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /See every source, its publisher, vintage, license/ }),
    ).toHaveAttribute("href", "/data");
  });

  test("scoring methods section explains the four-step method and expands the real metric registry", async ({
    page,
  }) => {
    await page.goto("/validate?tab=methods");
    await expect(page.getByText("How the health equity screening score is built")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/1\. Metric\./)).toBeVisible();

    await expect(page.getByRole("button", { name: /Health needs/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Health needs/ }).click();
    await expect(page.getByText("Source:", { exact: false }).first()).toBeVisible();
  });

  test("checks and uncertainty merges sensitivity and validation into one section", async ({ page }) => {
    await page.goto("/validate?tab=checks");
    await expect(page.getByText(/tracts have a/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Sensitivity to alternate weightings", { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/r = /).first()).toBeVisible();

    // Both formerly-separate tabs' content now live in this one section.
    await expect(page.getByText("Tautology guard")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Convergent validity", exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Criterion validity", exact: false })).toBeVisible();
    // "BLOCKED" alone also matches the explanatory prose above ("...would
    // show \"BLOCKED\" instead of a correlation..."); the actual guard
    // badge text is "BLOCKED -- tautological" -- neither validity check
    // should produce one for any of the 8 scenarios.
    await expect(page.getByText("BLOCKED -- tautological")).toHaveCount(0);
    await expect(page.getByText(/Spearman r = /).first()).toBeVisible({ timeout: 15_000 });
  });

  test("known limitations discloses causal-interpretation and individual-risk limits", async ({ page }) => {
    await page.goto("/validate?tab=limitations");
    await expect(page.getByText("Causal interpretation")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Individual-level risk")).toBeVisible();
    await expect(page.getByText("ZIP-to-tract crosswalk uncertainty", { exact: false })).toBeVisible();
  });

  test("reproduce the analysis shows real audit status and stable scenario hashes", async ({ page }) => {
    await page.goto("/validate?tab=reproducibility");
    await expect(page.getByText("Audit status")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/passing/).first()).toBeVisible();
    await expect(page.getByText("Scenario configuration hashes")).toBeVisible();
  });

  test("no console errors across all five sections", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/validate");
    await expect(page.getByRole("heading", { name: "Trust, methods, and data quality" })).toBeVisible({
      timeout: 15_000,
    });
    for (const tab of ["How scores are built", "Checks and uncertainty", "Known limitations", "Reproduce the analysis"]) {
      await page.getByRole("tab", { name: tab }).click();
      await page.waitForTimeout(800);
    }

    expect(errors).toEqual([]);
  });
});
