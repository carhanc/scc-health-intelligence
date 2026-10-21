import { expect, type Locator, type Page } from "@playwright/test";

export const TRACT_A = "06085500100";
export const TRACT_B = "06085503112";
export const TRACT_GEOID_PATTERN = /^06085\d{6}$/;

/** The county map, which is the home page. */
export function mapRegion(page: Page): Locator {
  return page.getByRole("application", { name: /Map of Santa Clara County/ });
}

/** Opens the home page and waits for the map to exist. The first request of
 * a run pays Next.js dev mode's on-demand compile, hence the long timeout. */
export async function openMap(page: Page, query = ""): Promise<void> {
  await page.goto(`/${query}`);
  await expect(mapRegion(page)).toBeVisible({ timeout: 30_000 });
}

/** The place search box (a type-ahead combobox). */
export function searchBox(page: Page, scope?: Locator): Locator {
  return (scope ?? page).getByRole("combobox", { name: "Find a place" });
}

/** Types into the search box and picks the first matching suggestion. */
export async function searchAndPick(
  page: Page,
  text: string,
  optionName: RegExp | string,
  scope?: Locator,
): Promise<void> {
  const box = searchBox(page, scope);
  await expect(box).toBeVisible({ timeout: 30_000 });
  await box.fill(text);
  const option = (scope ?? page).getByRole("option", { name: optionName }).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await option.click();
}

/** The neighborhood panel's title for a tract (its visible name plus a
 * screen-reader-only "Tract <GEOID>:" prefix). */
export function tractHeading(page: Page, geoid: string): Locator {
  return page.getByRole("heading", { name: new RegExp(`Tract ${geoid}`) });
}

/** Opens a tract's panel straight from a link. */
export async function openTract(page: Page, geoid: string, extraQuery = ""): Promise<void> {
  await openMap(page, `?geography=tract&id=${geoid}${extraQuery}`);
  await expect(tractHeading(page, geoid)).toBeVisible({ timeout: 30_000 });
}

/** The numeric screening score shown in the open neighborhood panel. */
export async function readScore(page: Page): Promise<number> {
  const label = await page
    .getByRole("img", { name: /screening score: [\d.]+ of 100/i })
    .first()
    .getAttribute("aria-label");
  const match = label?.match(/score: ([\d.]+) of 100/i);
  if (!match) throw new Error(`could not read a score from "${label}"`);
  return Number(match[1]);
}

/** Collects page errors and console errors for a "no console errors" check.
 * Requests under /_vercel/ (Vercel Analytics and Speed Insights) only exist on
 * Vercel, so on a local production server they 404; that is the environment,
 * not the app, and is ignored. Every other error counts. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    if (msg.location().url.includes("/_vercel/")) return;
    errors.push(msg.text());
  });
  return errors;
}
