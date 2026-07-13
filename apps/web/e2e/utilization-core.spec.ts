import { test, expect } from "@playwright/test";

test.describe("Utilization -- facility, geographic, and trend views", () => {
  test("facility view shows real Santa Clara facilities and a breakdown on selection", async ({ page }) => {
    await page.goto("/utilization");
    await expect(page.getByRole("heading", { name: "Utilization", level: 1 })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Facility" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("STANFORD HEALTH CARE")).toBeVisible();

    await page.getByRole("row", { name: /STANFORD HEALTH CARE/ }).click();
    await expect(page.getByText("Payer mix")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Disposition")).toBeVisible();
    await expect(page.getByText("Language")).toBeVisible();
  });

  test("geographic view distinguishes observed ZIP data from modeled tract data", async ({ page }) => {
    await page.goto("/utilization?tab=geographic");
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

  test("trends over time shows suppressed cells as a labeled gap, never a zero", async ({ page }) => {
    await page.goto("/utilization?tab=trends");
    await expect(page.getByRole("button", { name: "Disposition" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Suppressed (small count)").first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Expected payer" }).click();
    await expect(page.getByRole("columnheader", { name: "Category" })).toBeVisible({ timeout: 10_000 });
  });

  test("no console errors across all three tabs", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/utilization");
    await expect(page.getByRole("heading", { name: "Utilization" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "Geographic view" }).click();
    await page.waitForTimeout(800);
    await page.getByRole("tab", { name: "Trends over time" }).click();
    await page.waitForTimeout(800);

    expect(errors).toEqual([]);
  });
});
