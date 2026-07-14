import { test, expect } from "@playwright/test";

test.describe("Copilot -- deterministic (no-key) mode", () => {
  test("the page works fully without any AI provider key configured", async ({ page }) => {
    await page.goto("/copilot");
    await expect(page.getByRole("heading", { name: "Copilot", level: 1 })).toBeVisible();
    await expect(page.getByText(/Deterministic mode/)).toBeVisible({ timeout: 15_000 });
  });

  test("asking a question about a real place returns a grounded, non-AI-labeled answer", async ({
    page,
  }) => {
    await page.goto("/copilot");
    await page.getByLabel("Find a place").fill("Gilroy");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Gilroy/ }).first().click();
    await page.waitForTimeout(500);

    await page.selectOption("#copilot-action", "list_what_cannot_be_concluded");
    await page.getByRole("button", { name: "Ask Copilot" }).click();

    await expect(page.getByText("Deterministic (not AI-generated)")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Evidence used")).toBeVisible();
  });

  test("prepare-questions action produces real evidence-based questions", async ({ page }) => {
    await page.goto("/copilot");
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Sunnyvale/ }).first().click();
    await page.waitForTimeout(500);

    await page.selectOption("#copilot-action", "prepare_questions");
    await page.getByRole("button", { name: "Ask Copilot" }).click();
    await expect(page.getByText("Deterministic (not AI-generated)")).toBeVisible({ timeout: 15_000 });
  });

  test("the Ask button is disabled until a place is selected", async ({ page }) => {
    await page.goto("/copilot");
    await expect(page.getByRole("button", { name: "Ask Copilot" })).toBeDisabled();
  });

  test("no console errors during a full ask cycle", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/copilot");
    await page.getByLabel("Find a place").fill("Gilroy");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Gilroy/ }).first().click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Ask Copilot" }).click();
    await expect(page.getByText("Evidence used")).toBeVisible({ timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
