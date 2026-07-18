import { test, expect, type Page } from "@playwright/test";

/** Starts a brand-new project from the landing state and picks a place,
 * landing on the Evidence stage with real evidence loaded -- the entry
 * flow every core-workflow test below builds on. */
async function startProjectFromPlace(page: Page, placeQuery: string) {
  await page.goto("/advocate");
  await expect(page.getByRole("heading", { name: "Start an advocacy project" })).toBeVisible();
  await page.getByLabel("Find a place").fill(placeQuery);
  await page.getByRole("button", { name: "Search" }).click();
  const result = page.getByRole("button", { name: new RegExp(placeQuery, "i") }).first();
  await expect(result).toBeVisible({ timeout: 10_000 });
  await result.click();
  await expect(page.getByRole("button", { name: /^Evidence,/ })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /^Evidence,/ }).click();
  await expect(page.getByText(/facts? found for/)).toBeVisible({ timeout: 15_000 });
}

/** Selecting an evidence card relocates its checkbox into a different
 * list ("Evidence you're using"), which unmounts the original DOM node --
 * a plain `.first().check()` re-resolves against a shifting target and
 * spins through the whole list. Reading the label once (a query, not an
 * action) and clicking a name-anchored locator exactly once avoids that
 * retry loop. Returns the plain-language evidence label that was
 * selected, so callers can assert on it later if needed. */
async function selectNthAvailableEvidenceItem(page: Page, index: number): Promise<string> {
  const includeCheckboxes = page.locator('input[type="checkbox"][aria-label^="Include"]');
  const fullLabel = await includeCheckboxes.nth(index).getAttribute("aria-label");
  if (!fullLabel) throw new Error(`No unselected evidence checkbox at index ${index}`);
  await page.getByRole("checkbox", { name: fullLabel, exact: true }).click();
  // fullLabel is "Include <item label> in this project" -- return just
  // the item label for readable assertions.
  return fullLabel.replace(/^Include /, "").replace(/ in this project$/, "");
}

async function selectFirstAvailableEvidenceItem(page: Page): Promise<string> {
  return selectNthAvailableEvidenceItem(page, 0);
}

test.describe("Advocate -- core project workflow", () => {
  test("starting from Sunnyvale surfaces real, cited evidence in plain language", async ({ page }) => {
    await startProjectFromPlace(page, "Sunnyvale");
    await expect(page.getByRole("heading", { name: "Evidence for this project" })).toBeVisible();
    // A real publisher and a plain-language "Calculated estimate" /
    // "Modeled estimate" status badge must appear -- never a raw
    // internal data_status word like "derived" or "modeled" shown bare.
    await expect(page.getByText(/Centers for Disease Control/).first()).toBeVisible();
    await expect(page.getByText(/Calculated estimate|Modeled estimate|Reported measurement/).first()).toBeVisible();
  });

  test("selecting and removing evidence updates the plain-language count and moves the card between sections", async ({
    page,
  }) => {
    await startProjectFromPlace(page, "Gilroy");

    const label = await selectFirstAvailableEvidenceItem(page);
    await expect(page.getByRole("heading", { name: "Evidence you're using" })).toBeVisible();
    await expect(page.getByText("1 fact selected").first()).toBeVisible();

    await page.getByRole("checkbox", { name: `Remove ${label} from this project`, exact: true }).click();
    await expect(page.getByRole("heading", { name: "Evidence you're using" })).not.toBeVisible();
  });

  test("reordering selected evidence with the up/down controls changes its order", async ({ page }) => {
    await startProjectFromPlace(page, "Gilroy");

    await selectNthAvailableEvidenceItem(page, 0);
    await selectNthAvailableEvidenceItem(page, 0); // the list shifts after each selection

    const selectedHeading = page.getByRole("heading", { name: "Evidence you're using" });
    await expect(selectedHeading).toBeVisible();
    const firstLabelBefore = await selectedHeading.locator("xpath=following::ul[1]//li[1]").innerText();

    await page.getByRole("button", { name: /Move .* later/ }).first().click();

    const firstLabelAfter = await selectedHeading.locator("xpath=following::ul[1]//li[1]").innerText();
    expect(firstLabelAfter).not.toBe(firstLabelBefore);
  });

  test("creating a one-page brief produces cited, non-causal content with no raw internal identifiers", async ({
    page,
  }) => {
    await startProjectFromPlace(page, "Sunnyvale");
    await selectFirstAvailableEvidenceItem(page);

    await page.getByRole("button", { name: /^Draft,/ }).click();
    await expect(page.getByRole("heading", { name: "What do you want to create?" })).toBeVisible();
    await page.getByRole("button", { name: "Create draft" }).click();

    await expect(page.getByText("What is happening?")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("What does the evidence not prove?")).toBeVisible();
    await expect(
      page.getByText("This draft organizes screening evidence. It does not prove causation or make a final policy determination."),
    ).toBeVisible();
    // The old internal "Configuration hash: <hex>" footer must never
    // appear in the normal interface (docs/design/advocate-intuitive-
    // workspace-research.md -- no raw internal identifiers in the UI).
    await expect(page.getByText(/Configuration hash:/)).not.toBeVisible();
  });

  test("deterministic meeting questions are generated from real evidence", async ({ page }) => {
    await startProjectFromPlace(page, "Sunnyvale");
    await selectFirstAvailableEvidenceItem(page);
    await page.getByRole("button", { name: /^Draft,/ }).click();
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByText("Questions for decision-makers")).toBeVisible({ timeout: 15_000 });
  });

  test("every generated factual claim traces to a real, cited source -- never a bare uncited statement", async ({
    page,
  }) => {
    await startProjectFromPlace(page, "Sunnyvale");
    await selectNthAvailableEvidenceItem(page, 0);
    await selectNthAvailableEvidenceItem(page, 0);
    await page.getByRole("button", { name: /^Draft,/ }).click();
    await page.getByRole("button", { name: "Create draft" }).click();

    await expect(page.getByText(/facts? · \d+ sources? · all selected claims have citations/)).toBeVisible({
      timeout: 15_000,
    });
    const sourcesText = await page.locator("#advocate-output-print-area").innerText();
    expect(sourcesText).toContain("Centers for Disease Control");
    expect(sourcesText).toMatch(/retrieved|release/);
  });

  test("downloading a project backup and restoring it preserves the project's state", async ({ page }) => {
    await startProjectFromPlace(page, "Sunnyvale");
    await selectFirstAvailableEvidenceItem(page);

    await page.getByText("Project options").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download project backup" }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    await page.getByRole("button", { name: "+ Start a new project" }).click();
    await expect(page.getByRole("heading", { name: "Start an advocacy project" })).toBeVisible();

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByText("Project options").click();
    await page.getByRole("button", { name: "Restore a project backup" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath!);

    // Two projects now exist (the empty landing one plus the restored
    // Sunnyvale one), so the project switcher renders as a labeled
    // <select> ("Switch project") rather than a plain title -- and the
    // summary panel's own heading is collapsed behind an explicit toggle
    // on narrow viewports, so check the select's selected option
    // directly instead of relying on a heading that isn't always shown.
    await expect(page.locator("#project-switcher option:checked")).toHaveText(/Sunnyvale/, {
      timeout: 10_000,
    });
    await expect(page.getByText("1 fact selected").first()).toBeVisible();
  });

  test("restoring a file that isn't a valid backup shows a plain-language error, not a stack trace", async ({
    page,
  }) => {
    await page.goto("/advocate");
    await page.getByText("Project options").click();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Restore a project backup" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "not-a-backup.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ this is not valid JSON"),
    });

    await expect(
      page.getByText("This file isn't a valid Advocate project backup. It couldn't be read as a backup file at all. Nothing was changed."),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("reloading the browser resumes at the furthest stage already reached, not the empty entry form", async ({
    page,
  }) => {
    await startProjectFromPlace(page, "Gilroy");
    await selectFirstAvailableEvidenceItem(page);
    await page.waitForTimeout(1200); // allow the 500ms autosave debounce to fire

    await page.reload({ waitUntil: "networkidle" });
    // A project that already has a place and evidence must resume on the
    // Draft stage, not silently reset to the empty search form -- a real
    // bug found and fixed during this pass (advocate-client.tsx
    // resumeStageFor).
    await expect(page.getByRole("heading", { name: "What do you want to create?" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("1 fact selected").first()).toBeVisible();
  });

  test("no console errors across the full place-to-draft workflow", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await startProjectFromPlace(page, "Sunnyvale");
    await selectFirstAvailableEvidenceItem(page);
    await page.getByRole("button", { name: /^Draft,/ }).click();
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByText("What is happening?")).toBeVisible({ timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
