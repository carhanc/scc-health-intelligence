import { test, expect } from "@playwright/test";

// These tests run against the real API and real live warehouse data (no
// mocking, matching PLAN.md's "never fabricate data" rule end to end) --
// they require `make data` to have populated warehouse/scc_health.duckdb
// with Phase 4 analytics tables before running.

test.describe("Overview", () => {
  test("loads real countywide data, not placeholders", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Find where health needs/i })).toBeVisible();

    const snapshot = page.locator("section", { has: page.getByRole("heading", { name: "Countywide snapshot" }) });
    await expect(snapshot).toBeVisible();

    // The three SnapshotFact numbers must resolve to real digits, not stay
    // stuck on a loading skeleton.
    await expect(snapshot.getByText(/tracts in the top quartile/)).toBeVisible({ timeout: 15_000 });
    await expect(snapshot.getByText(/of 408 tracts scored/)).toBeVisible();

    const priority = page.locator("section", {
      has: page.getByRole("heading", { name: "Where might action be most urgent?" }),
    });
    await expect(priority.getByRole("link", { name: /^Tract \d{11}$/ }).first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(/data sources tracked/)).toBeVisible({ timeout: 15_000 });
  });

  test("primary task cards navigate to the correct Explore states", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Explore a community" }).click();
    await expect(page).toHaveURL(/\/explore$/);

    await page.goto("/");
    await page.getByRole("link", { name: "See where concerns overlap" }).click();
    await expect(page).toHaveURL(/\/explore\?tab=table/);
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });

    await page.goto("/");
    await page.getByRole("link", { name: "Compare two places" }).click();
    await expect(page).toHaveURL(/\/explore\?compare=1/);
  });

  test("footer and nav links work and stay on real routes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Data & methods" }).click();
    await expect(page).toHaveURL(/\/data$/);
    await expect(page.getByRole("heading", { name: "Data", exact: true })).toBeVisible();
  });
});
