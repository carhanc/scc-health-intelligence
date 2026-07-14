import { test, expect } from "@playwright/test";

// Every nav destination shipped as a real, built page by Phase 9 (Access
// Lab in Phase 6, Prioritize/Utilization/Validate in Phase 7,
// Advocate/Copilot in Phase 8) -- see each page's own *-core.spec.ts for
// its functional coverage. This file's only remaining job is confirming
// none of them ever regresses back into an unbuilt "coming soon" state.
test.describe("Primary navigation is truthful, not broken", () => {
  test("every primary nav destination is real and reachable (none marked coming-soon)", async ({
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
