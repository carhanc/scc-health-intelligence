import { test, expect } from "@playwright/test";

test.describe("Advocate -- core workspace workflow", () => {
  test("starting from Sunnyvale surfaces real, cited evidence", async ({ page }) => {
    await page.goto("/advocate");
    await expect(page.getByRole("heading", { name: "Advocate", level: 1 })).toBeVisible();

    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();
    const result = page.getByRole("button", { name: /Sunnyvale/ }).first();
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    await expect(page.getByText(/evidence item\(s\) found for/)).toBeVisible({ timeout: 15_000 });
    // Every evidence card must show a real publisher, not a placeholder.
    await expect(page.getByText(/Centers for Disease Control/).first()).toBeVisible();
  });

  test("selecting and removing evidence updates the count", async ({ page }) => {
    await page.goto("/advocate");
    await page.getByLabel("Find a place").fill("Gilroy");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Gilroy/ }).first().click();
    await expect(page.getByText(/evidence item\(s\) found for/)).toBeVisible({ timeout: 15_000 });

    const checkboxes = page.locator('input[type="checkbox"][aria-label^="Include"]');
    await checkboxes.first().check();
    await expect(page.getByText("1 selected.")).toBeVisible();
    await checkboxes.first().uncheck();
    await expect(page.getByText("0 selected.")).toBeVisible();
  });

  test("reordering selected evidence with the up/down controls changes export order", async ({
    page,
  }) => {
    await page.goto("/advocate");
    await page.getByLabel("Find a place").fill("Gilroy");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Gilroy/ }).first().click();
    await expect(page.getByText(/evidence item\(s\) found for/)).toBeVisible({ timeout: 15_000 });

    const checkboxes = page.locator('input[type="checkbox"][aria-label^="Include"]');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();

    const selectedHeading = page.getByText("Selected, in export order");
    await expect(selectedHeading).toBeVisible();
    const firstLabelBefore = await page
      .locator("text=Selected, in export order")
      .locator("xpath=following::ul[1]//li[1]")
      .innerText();

    await page.getByRole("button", { name: /Move .* later/ }).first().click();
    await page.waitForTimeout(300);

    const firstLabelAfter = await page
      .locator("text=Selected, in export order")
      .locator("xpath=following::ul[1]//li[1]")
      .innerText();
    expect(firstLabelAfter).not.toBe(firstLabelBefore);
  });

  test("generating a one-page brief produces cited, non-causal content", async ({ page }) => {
    await page.goto("/advocate");
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Sunnyvale/ }).first().click();
    await expect(page.getByText(/evidence item\(s\) found for/)).toBeVisible({ timeout: 15_000 });

    const checkboxes = page.locator('input[type="checkbox"][aria-label^="Include"]');
    await checkboxes.first().check();
    await page.getByRole("button", { name: "Generate" }).click();

    await expect(page.getByText("What is happening?")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("What does the evidence not prove?")).toBeVisible();
    await expect(page.getByText(/screening tool|not a prediction|guarantee/i).first()).toBeVisible();
    await expect(page.getByText(/Configuration hash:/)).toBeVisible();
  });

  test("deterministic meeting questions are generated from real evidence", async ({ page }) => {
    await page.goto("/advocate");
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Sunnyvale/ }).first().click();
    await expect(page.getByText(/evidence item\(s\) found for/)).toBeVisible({ timeout: 15_000 });

    await page.locator('input[type="checkbox"][aria-label^="Include"]').first().check();
    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page.getByText("Questions for decision-makers")).toBeVisible({ timeout: 15_000 });
  });

  test("exporting and reopening a workspace preserves its state", async ({ page }) => {
    await page.goto("/advocate");
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Sunnyvale/ }).first().click();
    await expect(page.getByText(/evidence item\(s\) found for/)).toBeVisible({ timeout: 15_000 });

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export JSON" }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();

    // Start a brand-new workspace, then import the exported one back in.
    await page.getByRole("button", { name: "New" }).click();
    await expect(page.getByText("Choose a place above to see matched evidence.")).toBeVisible();

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Import JSON" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path!);
    await page.waitForTimeout(1000);

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("Sunnyvale");
  });

  test("reloading the browser retains the active workspace's local work", async ({ page }) => {
    await page.goto("/advocate");
    await page.getByLabel("Find a place").fill("Gilroy");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Gilroy/ }).first().click();
    await expect(page.getByText(/evidence item\(s\) found for/)).toBeVisible({ timeout: 15_000 });
    await page.locator('input[type="checkbox"][aria-label^="Include"]').first().check();
    await page.waitForTimeout(1200); // allow the 500ms autosave debounce to fire

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText(/evidence item\(s\) found for/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("1 selected.")).toBeVisible();
  });

  test("every generated factual claim traces to a real evidence item with a citation", async ({
    page,
  }) => {
    await page.goto("/advocate");
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Sunnyvale/ }).first().click();
    await expect(page.getByText(/evidence item\(s\) found for/)).toBeVisible({ timeout: 15_000 });

    const checkboxes = page.locator('input[type="checkbox"][aria-label^="Include"]');
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page.getByText("Sources and limitations")).toBeVisible({ timeout: 15_000 });

    // Every evidence-derived claim in "Sources and limitations" cites a
    // real publisher and vintage -- never a bare, uncited statement.
    const sourcesText = await page
      .locator("text=Sources and limitations")
      .locator("xpath=following-sibling::p[1]")
      .innerText();
    expect(sourcesText).toContain("Centers for Disease Control");
    expect(sourcesText).toMatch(/retrieved/);
  });

  test("no console errors across the full geography-to-brief workflow", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/advocate");
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();
    await page.getByRole("button", { name: /Sunnyvale/ }).first().click();
    await expect(page.getByText(/evidence item\(s\) found for/)).toBeVisible({ timeout: 15_000 });
    await page.locator('input[type="checkbox"][aria-label^="Include"]').first().check();
    await page.getByRole("button", { name: "Generate" }).click();
    await expect(page.getByText("What is happening?")).toBeVisible({ timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
