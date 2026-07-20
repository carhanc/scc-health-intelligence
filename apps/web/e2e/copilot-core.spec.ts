import { test, expect } from "@playwright/test";

/** Copilot was rebuilt as a guided evidence-explanation flow: choose an
 * action, choose a place (skipped if arriving with one already known),
 * choose a focus, optionally add an instruction, then a result-dominant
 * answer view (docs/design/product-wide-flow-simplification-visual-
 * review.md "COPILOT"). Deterministic-mode status now lives in a
 * collapsed "About how answers are created" disclosure, never as the
 * page's first line. */

async function chooseActionAndPlace(page: import("@playwright/test").Page, actionLabelPrefix: string, placeQuery: string) {
  await page.goto("/copilot");
  await page.getByRole("button", { name: new RegExp(`^${actionLabelPrefix}:`) }).click();
  await expect(page.getByRole("heading", { name: "Which community?" })).toBeVisible();
  await page.getByLabel("Find a place").fill(placeQuery);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: new RegExp(placeQuery, "i") }).first().click();
}

test.describe("Copilot -- guided evidence-explanation flow", () => {
  test("the first screen asks one question with action cards, no place search or provider status visible", async ({
    page,
  }) => {
    await page.goto("/copilot");
    await expect(page.getByRole("heading", { name: "Understand the evidence" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What would you like help with?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Explain a community:/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Compare two places:/ })).toBeVisible();
    // No permanent search field, no scenario grid, no disabled form, and
    // no leading "Deterministic mode" status before the user has done
    // anything -- all moved behind "About how answers are created."
    await expect(page.getByLabel("Find a place")).not.toBeVisible();
    await expect(page.getByText("Deterministic mode")).not.toBeVisible();
  });

  test("explaining a community produces a grounded, cited, non-AI-labeled answer with real sources", async ({
    page,
  }) => {
    await chooseActionAndPlace(page, "Explain a community", "Sunnyvale");
    await expect(page.getByRole("heading", { name: "What should the explanation focus on?" })).toBeVisible();
    await page.getByRole("button", { name: /^Health equity overview, recommended:/ }).click();
    await expect(page.getByRole("heading", { name: "Anything else to include?" })).toBeVisible();
    await page.getByRole("button", { name: "Create explanation" }).click();

    const resultHeading = page.getByRole("heading", { name: "Sunnyvale city" });
    await expect(resultHeading).toBeVisible({ timeout: 15_000 });
    // "Grounded in platform evidence" also appears, correctly, inside the
    // collapsed "About how answers are created" disclosure -- scope to
    // the result heading's own row to avoid that legitimate duplicate.
    await expect(resultHeading.locator("..").getByText("Grounded in platform evidence")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
    await expect(page.getByText(/Centers for Disease Control/).first()).toBeVisible();
    // The deterministic template's generic evidence-bullet-dump branch
    // (used by summarize_geography) prepends a static "[Deterministic
    // mode -- ...]" disclaimer line -- it must never lead the answer body
    // itself, only the collapsed "About how answers are created" section.
    await expect(page.getByText("[Deterministic mode")).not.toBeVisible();

    // A blind usability review found this ~30-line bullet-dump answer,
    // duplicated a second time as a numbered Sources list, read as an
    // unreadable wall of text rather than "a clear, sourced explanation."
    // Confirm the body starts collapsed with a "Show all" disclosure, and
    // that the Sources list no longer repeats each fact's full value a
    // second time in a row.
    const showAllButton = page.getByRole("button", { name: /^Show all \d+ facts/ });
    await expect(showAllButton).toBeVisible();
    const bulletLinesBefore = (await page.locator("main").innerText())
      .split("\n")
      .filter((line) => line.trim().startsWith("- "));
    expect(bulletLinesBefore.length).toBeLessThanOrEqual(8);

    await showAllButton.click();
    const bulletLinesAfter = (await page.locator("main").innerText())
      .split("\n")
      .filter((line) => line.trim().startsWith("- "));
    expect(bulletLinesAfter.length).toBeGreaterThan(8);

    const firstSource = page.getByText(/^\[1\]/);
    await expect(firstSource).toBeVisible();
    await expect(firstSource).not.toContainText("percentile");
  });

  test("identifying limitations produces the distinct limitations template, not a bullet dump", async ({
    page,
  }) => {
    await chooseActionAndPlace(page, "Identify important limitations", "Gilroy");
    await page.getByRole("button", { name: /^Health equity overview, recommended:/ }).click();
    await page.getByRole("button", { name: "Create explanation" }).click();
    await expect(page.getByRole("heading", { name: "Gilroy city" })).toBeVisible({ timeout: 15_000 });
    // The real backend template for this action never starts with the
    // generic evidence bullet dump's deterministic-mode disclaimer line.
    await expect(page.getByText("[Deterministic mode")).not.toBeVisible();
  });

  test("turning evidence into questions produces real evidence-grounded questions", async ({ page }) => {
    await chooseActionAndPlace(page, "Turn evidence into questions", "Sunnyvale");
    await page.getByRole("button", { name: /^Health equity overview, recommended:/ }).click();
    await page.getByRole("button", { name: "Create explanation" }).click();
    await expect(page.getByRole("heading", { name: "Sunnyvale city" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/\?/).first()).toBeVisible();
  });

  test("comparing two places asks for a second community and labels the answer with both names", async ({
    page,
  }) => {
    await chooseActionAndPlace(page, "Compare two places", "Sunnyvale");
    await expect(page.getByRole("heading", { name: "Which community would you like to compare it with?" })).toBeVisible();
    await page.getByLabel("Find a place").fill("Gilroy");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Gilroy/ }).first().click();
    await expect(page.getByRole("heading", { name: "What should the explanation focus on?" })).toBeVisible();
    await page.getByRole("button", { name: /^Health equity overview, recommended:/ }).click();
    await page.getByRole("button", { name: "Create explanation" }).click();

    await expect(page.getByRole("heading", { name: "Sunnyvale city vs. Gilroy city" })).toBeVisible({
      timeout: 15_000,
    });
    // Each source line is relabeled with its own real place name so a
    // reader can tell which community a given fact belongs to.
    await expect(page.getByText(/Sunnyvale city --/).first()).toBeVisible();
    await expect(page.getByText(/Gilroy city --/).first()).toBeVisible();
  });

  test("the result view offers to add the evidence to an advocacy project", async ({ page }) => {
    await chooseActionAndPlace(page, "Explain a community", "Sunnyvale");
    await page.getByRole("button", { name: /^Health equity overview, recommended:/ }).click();
    await page.getByRole("button", { name: "Create explanation" }).click();
    await expect(page.getByRole("heading", { name: "Sunnyvale city" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Add to advocacy project" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ask another question" })).toBeVisible();
  });

  test("arriving from Explore with a place already chosen skips straight to focus, never re-prompting for a place", async ({
    page,
  }) => {
    await page.goto("/copilot?geography=tract&id=06085500100&name=Census%20Tract%205001&scenario=default_integrated_screen_v1");
    await page.getByRole("button", { name: /^Explain a community:/ }).click();
    await expect(page.getByRole("heading", { name: "What should the explanation focus on?" })).toBeVisible();
    await expect(page.getByText("Census Tract 5001")).toBeVisible();
  });

  test("the deterministic-mode status is available on request, not shown by default", async ({ page }) => {
    await page.goto("/copilot");
    await expect(page.getByText("Deterministic mode")).not.toBeVisible();
    await page.getByText("About how answers are created").click();
    await expect(page.getByText(/No AI provider is configured|AI drafting enabled/)).toBeVisible();
  });

  test("no console errors across a full ask cycle", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await chooseActionAndPlace(page, "Explain a community", "Gilroy");
    await page.getByRole("button", { name: /^Health equity overview, recommended:/ }).click();
    await page.getByRole("button", { name: "Create explanation" }).click();
    await expect(page.getByRole("heading", { name: "Gilroy city" })).toBeVisible({ timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
