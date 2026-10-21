import { test, expect } from "@playwright/test";

// Every destination is a real, built page -- see each page's own
// *-core.spec.ts for functional coverage. This file confirms the four
// top-bar destinations are present and reachable, none marked "coming soon",
// and that the old direct addresses still resolve.
const DESTINATIONS = [
  { name: "Map", href: "/" },
  { name: "Getting to care", href: "/access-lab" },
  { name: "Take action", href: "/advocate" },
  { name: "About the data", href: "/validate" },
];

test.describe("Primary navigation is truthful, not broken", () => {
  test("the top bar offers four real destinations (none marked coming-soon)", async ({ page }) => {
    await page.goto("/");

    // Below the desktop breakpoint the links live in the menu button's drawer.
    const menuButton = page.getByRole("button", { name: "Open navigation menu" });
    if (await menuButton.isVisible()) await menuButton.click();

    const nav = page.getByRole("navigation", { name: "Primary" }).first();
    for (const d of DESTINATIONS) {
      await expect(nav.getByRole("link", { name: new RegExp(`^${d.name}`) })).toHaveAttribute("href", d.href);
    }
    await expect(nav.getByRole("link")).toHaveCount(DESTINATIONS.length);
    await expect(nav.getByText(/Soon$/)).toHaveCount(0);
  });

  test("destinations with several pages show sibling tabs, and every old address still works", async ({ page }) => {
    await page.goto("/access-lab");
    const care = page.getByRole("list", { name: "Getting to care sections" });
    await expect(care.getByRole("link", { name: "Travel to care" })).toHaveAttribute("aria-current", "page");
    await care.getByRole("link", { name: "Emergency visits" }).click();
    await expect(page).toHaveURL(/\/utilization$/);

    for (const path of ["/advocate", "/copilot", "/validate", "/data", "/prioritize"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
    }
  });

  test("the footer links go to real, distinct pages", async ({ page }) => {
    await page.goto("/data");
    const footer = page.getByRole("navigation", { name: "Footer" });

    await footer.getByRole("link", { name: "Accessibility" }).click();
    await expect(page).toHaveURL(/\/accessibility$/);
    await expect(page.getByRole("heading", { name: "Accessibility", level: 1 })).toBeVisible();

    await footer.getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();

    await footer.getByRole("link", { name: "Data & methods" }).click();
    await expect(page).toHaveURL(/\/data$/);
    await expect(page.getByRole("heading", { name: "Explore data sources and coverage", level: 1 })).toBeVisible();

    await expect(footer.getByRole("link", { name: "Contact / report an issue" })).toHaveAttribute(
      "href",
      "https://github.com/carhanc/scc-health-intelligence/issues",
    );
  });
});
