import { test, expect } from "@playwright/test";

// Access Lab moved from "coming soon" to a real, built page in Phase 6 --
// see e2e/access-lab-core.spec.ts for its own coverage, and
// nav-coming-soon's own "nav marks unavailable destinations distinctly"
// test below for the (still coming-soon) remainder.
const COMING_SOON_ROUTES = [
  { path: "/prioritize", title: "Prioritize" },
  { path: "/utilization", title: "Utilization" },
  { path: "/validate", title: "Validate" },
  { path: "/advocate", title: "Advocate" },
  { path: "/copilot", title: "Copilot" },
];

test.describe("Coming-soon nav destinations are truthful, not broken", () => {
  for (const route of COMING_SOON_ROUTES) {
    test(`${route.path} loads (never a 404) and never exposes an internal phase number`, async ({ page }) => {
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);

      await expect(page.getByRole("heading", { name: route.title, level: 1 })).toBeVisible();
      await expect(page.getByText("Coming soon")).toBeVisible();
      await expect(page.getByText(/Phase \d/)).not.toBeVisible();

      // It must state plainly what it will do, and point somewhere real.
      await expect(page.getByRole("heading", { name: "What this page will do" })).toBeVisible();
      await expect(page.getByRole("link", { name: "explore a community" })).toHaveAttribute("href", "/explore");
      await expect(page.getByRole("link", { name: "return to the overview" })).toHaveAttribute("href", "/");
    });
  }

  test("nav marks unavailable destinations distinctly from available ones", async ({ page }) => {
    await page.goto("/");

    // Below the desktop breakpoint, navigation lives inside a
    // hamburger-triggered drawer rather than an always-visible sidebar.
    const menuButton = page.getByRole("button", { name: "Open navigation menu" });
    if (await menuButton.isVisible()) {
      await menuButton.click();
    }

    const nav = page.getByRole("navigation", { name: "Primary" }).first();
    await expect(nav.getByRole("link", { name: "Prioritize Soon" })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Explore$/ })).toBeVisible();
  });
});
