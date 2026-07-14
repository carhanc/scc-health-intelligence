import { test, expect } from "@playwright/test";

// Access Lab moved from "coming soon" to a real, built page in Phase 6,
// Prioritize/Utilization/Validate in Phase 7, and Advocate/Copilot in
// Phase 8 -- see e2e/access-lab-core.spec.ts, e2e/prioritize-core.spec.ts,
// e2e/utilization-core.spec.ts, e2e/validate-core.spec.ts,
// e2e/advocate-core.spec.ts, and e2e/copilot-core.spec.ts for their own
// coverage. Every nav destination in the current build is now real --
// this list is intentionally empty rather than deleted, since it is the
// established place a future phase's still-unbuilt nav items belong.
const COMING_SOON_ROUTES: { path: string; title: string }[] = [];

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

  test("every primary nav destination is real and reachable (none still marked coming-soon)", async ({
    page,
  }) => {
    await page.goto("/");

    // Below the desktop breakpoint, navigation lives inside a
    // hamburger-triggered drawer rather than an always-visible sidebar.
    const menuButton = page.getByRole("button", { name: "Open navigation menu" });
    if (await menuButton.isVisible()) {
      await menuButton.click();
    }

    const nav = page.getByRole("navigation", { name: "Primary" }).first();
    await expect(nav.getByRole("link", { name: /^Explore$/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Advocate$/ })).toBeVisible();
    await expect(nav.getByRole("link", { name: /^Copilot$/ })).toBeVisible();
    // No nav link should carry the "Soon" suffix used for coming-soon items.
    await expect(nav.getByText(/Soon$/)).toHaveCount(0);
  });
});
