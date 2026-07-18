import { test, expect } from "@playwright/test";

test.describe("Prioritize -- scenario selection, custom weighting, results, export", () => {
  test("default view loads a named scenario's ranked results", async ({ page }) => {
    await page.goto("/prioritize");
    await expect(page.getByRole("heading", { name: "Identify health-equity priorities", level: 1 })).toBeVisible();
    await expect(page.getByRole("radio", { name: /Health equity overview/ })).toBeChecked({ timeout: 15_000 });
    await expect(page.getByRole("columnheader", { name: /Combined priority score/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/of 408 tracts have a combined priority score/)).toBeVisible();
  });

  test("custom scenario reveals sliders and weights always sum to 100%", async ({ page }) => {
    await page.goto("/prioritize");
    await page.getByRole("radio", { name: "Custom scenario" }).click();
    await expect(page.getByText("Custom priority weighting")).toBeVisible();

    const healthNeedsSlider = page.getByLabel("Health needs");
    await healthNeedsSlider.fill("80");

    const status = page.getByRole("status").filter({ hasText: "Applied weights" });
    await expect(status).toContainText("Total: 100%", { timeout: 10_000 });
  });

  test("reset to equal weights restores 20% on every domain", async ({ page }) => {
    await page.goto("/prioritize");
    await page.getByRole("radio", { name: "Custom scenario" }).click();
    await page.getByLabel("Health needs").fill("90");

    const status = page.getByRole("status").filter({ hasText: "Applied weights" });
    await expect(status).toContainText("Health needs 53%", { timeout: 10_000 });

    await page.getByRole("button", { name: "Reset to equal weights" }).click();
    await expect(status).toContainText("Health needs 20%", { timeout: 10_000 });
  });

  test("language access is shown as a real, explained unavailable option", async ({ page }) => {
    await page.goto("/prioritize");
    await expect(page.getByText("Not available yet")).toBeVisible();
    await expect(page.getByText("Language access:", { exact: false })).toBeVisible();
    await expect(page.getByText(/no tract-level language-barrier data source/i)).toBeVisible();
  });

  test("show drivers reveals a domain-by-domain explanation for a custom weighting", async ({ page }) => {
    await page.goto("/prioritize");
    await page.getByRole("radio", { name: "Custom scenario" }).click();
    await expect(page.getByRole("button", { name: "Show drivers" }).first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Show drivers" }).first().click();

    await expect(page.getByText(/Why .* ranked here/)).toBeVisible();
    await expect(page.getByText("View full sources & evidence in Explore")).toBeVisible();
  });

  test("site & program constraints tab reuses the Access Lab optimizer scenarios", async ({ page }) => {
    await page.goto("/prioritize?tab=constraints");
    await expect(page.getByText("modeled planning scenarios", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("No solution satisfies these constraints")).toBeVisible();
  });

  test("compare tab shows overlap between two scenarios' top priority places", async ({ page }) => {
    await page.goto("/prioritize?tab=compare");
    await page.selectOption("select", { label: "Food access" });
    await expect(page.getByText(/of the top 10 places appear under both priorities/)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("export tab offers a CSV download link and a printable decision memo", async ({ page }) => {
    await page.goto("/prioritize?tab=export");
    await expect(page.getByRole("link", { name: "Download CSV" })).toHaveAttribute(
      "href",
      /\/api\/v1\/prioritize\/export\/csv/,
    );
    await expect(page.getByText("Priority recommendation memo", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Limitations" })).toBeVisible();
    await expect(page.getByText(/screening tool, not a prediction/i).last()).toBeVisible();
  });

  test("no console errors on initial load or after switching to a custom weighting", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/prioritize");
    await expect(page.getByRole("heading", { name: "Identify health-equity priorities" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("radio", { name: "Custom scenario" }).click();
    await page.waitForTimeout(1000);

    expect(errors).toEqual([]);
  });
});
