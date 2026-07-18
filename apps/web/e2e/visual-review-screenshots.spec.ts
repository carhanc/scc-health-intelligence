import { test } from "@playwright/test";

/**
 * Not a pass/fail test suite -- a real screenshot-generation tool for
 * manual visual review (docs/design/health-equity-ux-visual-review.md),
 * matching the same breakpoints as e2e/responsive.spec.ts. Screenshots
 * land in docs/design/screenshots/ and are .gitignored except for the
 * small curated set referenced directly from the review doc, to avoid
 * bloating the repository with ~60 regenerable PNGs on every run. Run
 * with: `npx playwright test e2e/visual-review-screenshots.spec.ts`
 * (dev server must already be running).
 */
const BREAKPOINTS = [
  { name: "1440-desktop", width: 1440, height: 900 },
  { name: "1280-desktop", width: 1280, height: 900 },
  { name: "1024-tablet-landscape", width: 1024, height: 900 },
  { name: "768-tablet-portrait", width: 768, height: 1000 },
  { name: "390-mobile", width: 390, height: 900 },
  { name: "320-mobile-small", width: 320, height: 900 },
];

const PAGES = [
  { slug: "overview", path: "/" },
  { slug: "explore-map", path: "/explore" },
  { slug: "explore-tract-detail", path: "/explore?geography=tract&id=06085503112&scenario=default_integrated_screen_v1" },
  { slug: "prioritize", path: "/prioritize" },
  { slug: "access-lab", path: "/access-lab" },
  { slug: "utilization", path: "/utilization" },
  { slug: "validate", path: "/validate" },
  { slug: "advocate", path: "/advocate" },
  { slug: "copilot", path: "/copilot" },
  { slug: "data", path: "/data" },
];

for (const bp of BREAKPOINTS) {
  for (const p of PAGES) {
    test(`${p.slug} @ ${bp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto(`http://localhost:3000${p.path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(bp.name.includes("explore") || p.slug.includes("explore") ? 2000 : 800);
      if (p.slug === "explore-tract-detail" && bp.width < 1280) {
        // Below the app's own xl breakpoint the profile opens behind a
        // collapsed summary bar (MobileSelectedSheet) -- open it so the
        // screenshot captures the actual profile, not just the bar.
        const collapsedButton = page.getByRole("button", {
          name: /Tap to view its full profile|combined concern/,
        });
        if (await collapsedButton.isVisible().catch(() => false)) {
          await collapsedButton.click();
          await page.waitForTimeout(400);
        }
      }
      await page.screenshot({
        path: `../../docs/design/screenshots/${p.slug}__${bp.name}.png`,
        fullPage: true,
      });
    });
  }
}
