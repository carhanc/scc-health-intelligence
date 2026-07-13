import { test, expect } from "@playwright/test";

test.describe("Validate -- coverage, methods, uncertainty, validation, limitations, reproducibility", () => {
  test("data coverage tab summarizes real source freshness and links to the Data page", async ({ page }) => {
    await page.goto("/validate");
    await expect(page.getByRole("heading", { name: "Validate", level: 1 })).toBeVisible();
    await expect(page.getByText(/published data sources/)).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("link", { name: /See every source, its publisher, vintage, license/ }),
    ).toHaveAttribute("href", "/data");
  });

  test("scoring methods tab explains the four-step method and expands the real metric registry", async ({
    page,
  }) => {
    await page.goto("/validate?tab=methods");
    await expect(page.getByText("How a combined score is built")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/1\. Metric\./)).toBeVisible();

    await expect(page.getByRole("button", { name: /Health burden/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Health burden/ }).click();
    await expect(page.getByText("Source:", { exact: false }).first()).toBeVisible();
  });

  test("uncertainty & sensitivity tab shows real stability counts and preset correlations", async ({ page }) => {
    await page.goto("/validate?tab=uncertainty");
    await expect(page.getByText(/tracts have a/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Sensitivity to alternate weightings", { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/r = /).first()).toBeVisible();
  });

  test("validation tab shows both convergent and criterion validity, never tautological", async ({ page }) => {
    await page.goto("/validate?tab=validation");
    await expect(page.getByText("Tautology guard")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Convergent validity", exact: false })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "Criterion validity", exact: false })).toBeVisible();
    // "BLOCKED" alone also matches the explanatory prose above ("...would
    // show \"BLOCKED\" instead of a correlation..."); the actual guard
    // badge text is "BLOCKED -- tautological" -- neither validity check
    // should produce one for any of the 8 scenarios.
    await expect(page.getByText("BLOCKED -- tautological")).toHaveCount(0);
    await expect(page.getByText(/Spearman r = /).first()).toBeVisible({ timeout: 15_000 });
  });

  test("known limitations tab discloses causal-interpretation and individual-risk limits", async ({ page }) => {
    await page.goto("/validate?tab=limitations");
    await expect(page.getByText("Causal interpretation")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Individual-level risk")).toBeVisible();
    await expect(page.getByText("ZIP-to-tract crosswalk uncertainty", { exact: false })).toBeVisible();
  });

  test("reproducibility tab shows real audit status and stable scenario hashes", async ({ page }) => {
    await page.goto("/validate?tab=reproducibility");
    await expect(page.getByText("Audit status")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/passing/).first()).toBeVisible();
    await expect(page.getByText("Scenario configuration hashes")).toBeVisible();
  });

  test("no console errors across all six tabs", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/validate");
    await expect(page.getByRole("heading", { name: "Validate" })).toBeVisible({ timeout: 15_000 });
    for (const tab of ["Scoring methods", "Uncertainty & sensitivity", "Validation", "Known limitations", "Reproducibility"]) {
      await page.getByRole("tab", { name: tab }).click();
      await page.waitForTimeout(800);
    }

    expect(errors).toEqual([]);
  });
});
