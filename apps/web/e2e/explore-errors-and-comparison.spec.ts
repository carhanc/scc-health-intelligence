import { test, expect } from "@playwright/test";

const KNOWN_TRACT_A = "06085500100";
const KNOWN_TRACT_B = "06085503112";

test.describe("Explore -- invalid input, comparison, and evidence disclosure", () => {
  test("a well-formed but nonexistent tract number produces a clear, recoverable error", async ({ page }) => {
    await page.goto("/explore?geography=tract&id=06085999999");

    const error = page.getByRole("alert").filter({ has: page.getByRole("heading", { name: "We couldn't load this place" }) });
    await expect(error).toBeVisible({ timeout: 10_000 });
    await expect(error).toContainText("couldn’t load census tract 06085999999");
    // The raw technical error must stay behind a disclosure, not appear
    // as the primary message.
    await expect(error.getByText("Technical details")).toBeVisible();
    await expect(error.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(error.getByRole("button", { name: "Clear selection" })).toBeVisible();

    // Clear selection must actually clear the URL and return to the
    // empty state, not merely be decorative.
    await error.getByRole("button", { name: "Clear selection" }).click();
    await expect(page).toHaveURL("http://localhost:3000/explore");
    await expect(page.getByText("No place selected yet")).toBeVisible();
  });

  test("a malformed identifier (the literal geography-type string) never reaches the API -- shows the empty state instead", async ({
    page,
  }) => {
    // Regression test for the Phase 5 map-selection defect: this exact
    // URL shape was what a broken map click used to silently produce.
    await page.goto("/explore?geography=tract&id=tract");

    await expect(page.getByText("No place selected yet")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/not found/)).not.toBeVisible();
  });

  test("comparison workflow: compare two real tracts and see a plain-language difference", async ({ page }) => {
    await page.goto(`/explore?geography=tract&id=${KNOWN_TRACT_A}`);
    await expect(page.getByRole("heading", { name: `Tract ${KNOWN_TRACT_A}` })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Compare" }).click();
    await expect(page).toHaveURL(/compare=1/);

    const comparisonPanel = page.getByRole("region", { name: "Compare with another place" });
    await comparisonPanel.getByLabel("Find a place").fill(KNOWN_TRACT_B);
    await comparisonPanel.getByRole("button", { name: "Search" }).click();
    await comparisonPanel.getByRole("button", { name: new RegExp(KNOWN_TRACT_B) }).click();

    await expect(page.getByText(`Comparing tract ${KNOWN_TRACT_A} with tract ${KNOWN_TRACT_B}`)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/scores.*(higher|lower).*than tract/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Domain-by-domain comparison" })).toBeVisible();
  });

  test("evidence disclosure opens on click, is keyboard-dismissable, and returns focus", async ({ page }) => {
    await page.goto(`/explore?geography=tract&id=${KNOWN_TRACT_A}`);
    await expect(page.getByRole("heading", { name: `Tract ${KNOWN_TRACT_A}` })).toBeVisible({ timeout: 10_000 });

    const trigger = page.getByRole("button", { name: "View sources & evidence" });
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Sources and evidence" });
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText("Every metric used in this score")).toBeVisible();

    // Native <dialog> traps focus; Escape must close it.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });
});
