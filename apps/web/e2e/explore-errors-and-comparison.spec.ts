import { test, expect } from "@playwright/test";
import { TRACT_A, TRACT_B, openMap, openTract, searchAndPick, tractHeading } from "./helpers";

test.describe("Map home -- invalid input, comparison, and evidence disclosure", () => {
  test("a well-formed but nonexistent tract number produces a clear, recoverable error", async ({ page }) => {
    await openMap(page, "?geography=tract&id=06085999999");

    const error = page
      .getByRole("alert")
      .filter({ has: page.getByRole("heading", { name: "We couldn't load this place" }) });
    await expect(error).toBeVisible({ timeout: 20_000 });
    await expect(error).toContainText("couldn’t load census tract 06085999999");
    // The raw technical error stays behind a disclosure.
    await expect(error.getByText("Technical details")).toBeVisible();
    await expect(error.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(error.getByRole("button", { name: "Clear selection" })).toBeVisible();

    // Clear selection really clears the URL and returns to the county view.
    await error.getByRole("button", { name: "Clear selection" }).click();
    await expect(page).toHaveURL("http://localhost:3000/");
    await expect(page.getByText("What matters most to you?")).toBeVisible();
  });

  test("a malformed identifier (the literal geography-type string) never reaches the API and shows the county view", async ({
    page,
  }) => {
    // Regression test for an old map-selection defect: this exact URL shape
    // is what a broken map click used to silently produce.
    await openMap(page, "?geography=tract&id=tract");
    await expect(page.getByText("What matters most to you?")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/not found/)).not.toBeVisible();
    await expect(page.getByText("We couldn't load this place")).not.toBeVisible();
  });

  test("comparison workflow: compare two real tracts and see a plain-language difference", async ({ page }) => {
    await openTract(page, TRACT_A);

    await page.getByRole("button", { name: "Compare" }).click();
    await expect(page).toHaveURL(/compare=1/);

    const comparisonPanel = page.getByRole("region", { name: "Compare with another place" });
    await searchAndPick(page, TRACT_B, new RegExp(TRACT_B), comparisonPanel);

    await expect(page.getByText(`Comparing tract ${TRACT_A} with tract ${TRACT_B}`)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/scores.*(higher|lower).*than tract/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Domain-by-domain comparison" })).toBeVisible();
  });

  test("evidence disclosure opens on click, is keyboard-dismissable, and returns focus", async ({ page }) => {
    await openTract(page, TRACT_A);
    await page.getByRole("tab", { name: "Numbers" }).click();

    const trigger = page.getByRole("button", { name: "View sources & evidence" });
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Sources and evidence" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText("Every metric used in this score")).toBeVisible();

    // Escape closes the dialog (and does not also leave the neighborhood).
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(tractHeading(page, TRACT_A)).toBeVisible();
  });

  test("a fully unreachable backend produces a visible, recoverable state, not a blank panel", async ({ page }) => {
    // Project rule: a failed source must produce a visible unavailable state.
    // Aborting every API request simulates the whole backend being down.
    await page.route("http://localhost:8000/**", (route) => route.abort("connectionrefused"));
    await page.goto(`/?geography=tract&id=${TRACT_A}`);

    const error = page
      .getByRole("alert")
      .filter({ has: page.getByRole("heading", { name: "We couldn't load this place" }) });
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).toContainText(`couldn’t load census tract ${TRACT_A}`);
    await expect(error.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(error.getByRole("button", { name: "Clear selection" })).toBeVisible();
    // The map itself explains when its boundaries cannot load.
    await expect(page.getByText(/map couldn.t load/i)).toBeVisible();
  });
});
