import { test, expect } from "@playwright/test";

// These tests run against the real API and real live warehouse data (no
// mocking, matching PLAN.md's "never fabricate data" rule end to end) --
// they require `make data` to have populated warehouse/scc_health.duckdb
// with Phase 4 analytics tables before running.

test.describe("Overview", () => {
  test("loads real countywide data, not placeholders", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: /Understand health equity/i })).toBeVisible();

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
    await page.getByRole("link", { name: "See county priorities" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });

    await page.goto("/");
    await page.getByRole("link", { name: "Compare places" }).click();
    await expect(page).toHaveURL(/\/explore\?compare=1/);
  });

  test("footer and nav links work and stay on real routes", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Data & methods" }).click();
    await expect(page).toHaveURL(/\/data$/);
    await expect(page.getByRole("heading", { name: "Explore data sources and coverage", level: 1 })).toBeVisible();
  });

  test("every footer link points somewhere real and distinct -- Phase 9 regression: Accessibility/Privacy previously both silently pointed at /validate", async ({
    page,
  }) => {
    await page.goto("/");
    const footer = page.getByRole("navigation", { name: "Footer" });

    await footer.getByRole("link", { name: "Accessibility" }).click();
    await expect(page).toHaveURL(/\/accessibility$/);
    await expect(page.getByRole("heading", { name: "Accessibility", level: 1 })).toBeVisible();

    await page.goto("/");
    await footer.getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();

    await page.goto("/");
    const contactLink = footer.getByRole("link", { name: "Contact / report an issue" });
    await expect(contactLink).toHaveAttribute(
      "href",
      "https://github.com/carhanc/scc-health-intelligence/issues",
    );
  });
});
