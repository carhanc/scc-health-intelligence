import { test, expect } from "@playwright/test";

/** Utilization was rebuilt as a task-first flow: "What would you like to
 * understand?" with three choices, replacing an immediate full facility
 * table as the first thing shown. Trends over time now leads with a
 * real, computed chart and takeaway sentence (docs/design/product-wide-
 * flow-simplification-visual-review.md "UTILIZATION"). Deep links with
 * `?tab=` remain fully backward compatible, skipping straight past the
 * task chooser. */

test.describe("Utilization -- task-first flow, facility, geographic, and trend views", () => {
  test("the first screen asks what to understand, not an immediate facility table", async ({ page }) => {
    await page.goto("/utilization");
    await expect(page.getByRole("heading", { name: "See how health services are used", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What would you like to understand?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Compare facilities:/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Explore where patients come from:/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^See changes over time:/ })).toBeVisible();
    await expect(page.getByRole("table")).not.toBeVisible();
  });

  test("compare facilities shows a plain-language takeaway before the table, and a breakdown on selection", async ({
    page,
  }) => {
    await page.goto("/utilization");
    await page.getByRole("button", { name: /^Compare facilities:/ }).click();
    await expect(page.getByRole("columnheader", { name: "Facility" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/facilities operate a comprehensive-level emergency department/)).toBeVisible();
    await expect(page.getByText("STANFORD HEALTH CARE")).toBeVisible();

    await page.getByRole("row", { name: /STANFORD HEALTH CARE/ }).click();
    await expect(page.getByText("Payer mix")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Disposition")).toBeVisible();
    await expect(page.getByText("Language")).toBeVisible();
  });

  test("exploring where patients come from distinguishes observed ZIP data from modeled tract data", async ({
    page,
  }) => {
    await page.goto("/utilization");
    await page.getByRole("button", { name: /^Explore where patients come from:/ }).click();
    await expect(page.getByRole("heading", { name: /modeled by tract/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /observed by patient ZIP code/ })).toBeVisible();
    await expect(page.getByText(/modeled allocation/, { exact: false }).first()).toBeVisible();
  });

  test("a tract with an implausible allocation is flagged unreliable, not presented as ordinary", async ({
    page,
  }) => {
    await page.goto("/utilization?tab=geographic");
    await expect(page.getByText("Unreliable estimate", { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  });

  test("seeing changes over time leads with a real chart and takeaway, and the table shows suppressed cells as a labeled gap, never a zero", async ({
    page,
  }) => {
    await page.goto("/utilization");
    await page.getByRole("button", { name: /^See changes over time:/ }).click();
    await expect(page.getByRole("button", { name: "Disposition" })).toBeVisible({ timeout: 15_000 });
    // A real chart, not a placeholder -- title, unit, and source note all
    // present, plus a computed plain-language takeaway sentence.
    await expect(page.locator("svg[role='img']")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Unit: ED encounters/)).toBeVisible();
    await expect(page.getByText(/encounters (rose|fell) from/)).toBeVisible();
    await expect(page.getByText("Suppressed (small count)").first()).toBeVisible();

    await page.getByRole("button", { name: "Expected payer" }).click();
    await expect(page.getByRole("columnheader", { name: "Category" })).toBeVisible({ timeout: 10_000 });
  });

  test("deep links with ?tab= remain backward compatible, skipping the task chooser", async ({ page }) => {
    await page.goto("/utilization?tab=geographic");
    await expect(page.getByRole("heading", { name: /modeled by tract/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "What would you like to understand?" })).not.toBeVisible();
  });

  test("no console errors across the task chooser and all three views", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/utilization");
    await expect(page.getByRole("heading", { name: "See how health services are used" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /^Compare facilities:/ }).click();
    await expect(page.getByRole("columnheader", { name: "Facility" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Geographic view" }).click();
    await page.waitForTimeout(800);
    await page.getByRole("tab", { name: "Trends over time" }).click();
    await page.waitForTimeout(800);

    expect(errors).toEqual([]);
  });
});
