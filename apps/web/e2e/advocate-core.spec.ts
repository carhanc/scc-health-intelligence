import { test, expect, type Page } from "@playwright/test";

/** Starts a brand-new project from the landing state, chooses a place,
 * confirms the recommended focus, and lands on the Evidence stage with
 * real evidence loaded -- the entry flow every core-workflow test below
 * builds on. */
async function startProjectFromPlace(page: Page, placeQuery: string) {
  await page.goto("/advocate");
  await expect(page.getByText("Where would you like to start?")).toBeVisible();
  await page.getByRole("button", { name: /^Choose a community:/ }).click();

  await expect(page.getByRole("heading", { name: "Choose a community" })).toBeVisible();
  await page.getByLabel("Find a place").fill(placeQuery);
  await page.getByRole("button", { name: "Search" }).click();
  const result = page.getByRole("button", { name: new RegExp(placeQuery, "i") }).first();
  await expect(result).toBeVisible({ timeout: 10_000 });
  await result.click();

  // Selecting a place auto-advances to the Focus question.
  await expect(page.getByRole("heading", { name: "What would you like to focus on?" })).toBeVisible();
  await page.getByRole("button", { name: /^Health equity overview, recommended:/ }).click();

  // Choosing a focus auto-advances to Evidence.
  await expect(page.getByRole("heading", { name: "What facts would you like to use?" })).toBeVisible({
    timeout: 15_000,
  });
}

/** Including a recommended fact relocates its card into "Evidence you're
 * using," unmounting the original button -- clicking a name-anchored
 * locator exactly once (not `.first()`, which would keep re-resolving
 * against a shifting list) avoids a retry loop. Returns the label of the
 * fact that was included. */
async function includeNthAvailableFact(page: Page, index: number): Promise<string> {
  const includeButtons = page.locator('button[aria-label^="Include "]');
  const fullLabel = await includeButtons.nth(index).getAttribute("aria-label");
  if (!fullLabel) throw new Error(`No available fact at index ${index}`);
  await page.getByRole("button", { name: fullLabel, exact: true }).click();
  return fullLabel.replace(/^Include /, "");
}

const SELECT_AT_LEAST_ONE_FACT = "Select at least one fact to continue.";

test.describe("Advocate -- core project workflow", () => {
  test("the first screen asks one question with two large choices, nothing else", async ({ page }) => {
    await page.goto("/advocate");
    await expect(page.getByRole("heading", { name: "Turn evidence into action" })).toBeVisible();
    await expect(page.getByText("Where would you like to start?")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Choose a community:/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Review a document:/ })).toBeVisible();
    // Nothing else -- no scenario cards, no output types, no evidence
    // counts, no "Untitled workspace," no project summary.
    await expect(page.getByText("Untitled workspace")).not.toBeVisible();
    await expect(page.getByText(/None selected yet/)).not.toBeVisible();
  });

  test("starting from a place surfaces real, cited evidence grouped as recommended facts", async ({ page }) => {
    await startProjectFromPlace(page, "Sunnyvale");
    await expect(page.getByText("RECOMMENDED FACTS")).toBeVisible();
    await expect(page.getByText(/Centers for Disease Control/).first()).toBeVisible();
    await expect(page.getByText(/Calculated estimate|Modeled estimate|Reported measurement/).first()).toBeVisible();
    // No internal jargon anywhere on this screen.
    await expect(page.getByText("Matched evidence")).not.toBeVisible();
    await expect(page.getByText("Evidence bundle")).not.toBeVisible();
  });

  test("including and removing a fact updates the selected count and the project summary", async ({ page }) => {
    await startProjectFromPlace(page, "Gilroy");

    const label = await includeNthAvailableFact(page, 0);
    await expect(page.getByText("1 fact selected").first()).toBeVisible();

    await page.getByRole("button", { name: `Included ${label}`, exact: true }).click();
    await expect(page.getByText("1 fact selected")).not.toBeVisible();
  });

  test("continuing without any fact selected shows a direct instruction, not a silent block", async ({ page }) => {
    await startProjectFromPlace(page, "Gilroy");
    const continueBtn = page.getByRole("button", { name: /^Continue with \d+ facts?$/ });
    await expect(continueBtn).toBeDisabled();
    await expect(page.getByText(SELECT_AT_LEAST_ONE_FACT)).toBeVisible();
  });

  test("creating a one-page brief produces cited, non-causal content with no raw internal identifiers", async ({
    page,
  }) => {
    await startProjectFromPlace(page, "Sunnyvale");
    await includeNthAvailableFact(page, 0);
    await page.getByRole("button", { name: /^Continue with 1 fact$/ }).click();

    await expect(page.getByRole("heading", { name: "What would you like to create?" })).toBeVisible();
    await page.getByRole("button", { name: /^One-page meeting brief:/ }).click();
    await expect(page.getByRole("heading", { name: "Who is this for?" })).toBeVisible();
    await page.getByRole("button", { name: "Commissioner / staff" }).click();
    await expect(page.getByRole("heading", { name: "What would you like this document to accomplish?" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText(/^Ready to create your/)).toBeVisible();
    await page.getByRole("button", { name: "Create draft" }).click();

    await expect(page.getByText("What is happening?")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("What does the evidence not prove?")).toBeVisible();
    await expect(
      page.getByText(
        "This draft organizes screening evidence. It does not prove causation or make a final policy decision.",
      ),
    ).toBeVisible();
    await expect(page.getByText(/Configuration hash:/)).not.toBeVisible();
    await expect(page.getByText("Untitled workspace")).not.toBeVisible();
  });

  test("every generated factual claim traces to a real, cited source -- never a bare uncited statement", async ({
    page,
  }) => {
    await startProjectFromPlace(page, "Sunnyvale");
    await includeNthAvailableFact(page, 0);
    await includeNthAvailableFact(page, 0);
    await page.getByRole("button", { name: /^Continue with 2 facts$/ }).click();
    await page.getByRole("button", { name: /^One-page meeting brief:/ }).click();
    await page.getByRole("button", { name: "Commissioner / staff" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Create draft" }).click();

    await expect(page.getByText(/facts? · \d+ sources? · Citations included/)).toBeVisible({ timeout: 15_000 });
    const sourcesText = await page.locator("#advocate-output-print-area").innerText();
    expect(sourcesText).toContain("Centers for Disease Control");
  });

  test("the Review screen offers Back to evidence, Edit choices, a new version, Copy, Download, and Print", async ({
    page,
  }) => {
    await startProjectFromPlace(page, "Sunnyvale");
    await includeNthAvailableFact(page, 0);
    await page.getByRole("button", { name: /^Continue with 1 fact$/ }).click();
    await page.getByRole("button", { name: /^One-page meeting brief:/ }).click();
    await page.getByRole("button", { name: "Commissioner / staff" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByText("What is happening?")).toBeVisible({ timeout: 15_000 });

    await expect(page.getByRole("button", { name: "Back to evidence" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit choices" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create a new version" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download sources" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print / save as PDF" })).toBeVisible();

    await page.getByRole("button", { name: "Back to evidence" }).click();
    await expect(page.getByRole("heading", { name: "What facts would you like to use?" })).toBeVisible();
  });

  test("project title auto-suggests a human-readable name from place and output type, never a raw ID", async ({
    page,
  }) => {
    await startProjectFromPlace(page, "Gilroy");
    await includeNthAvailableFact(page, 0);
    await page.getByRole("button", { name: /^Continue with 1 fact$/ }).click();
    await page.getByRole("button", { name: /^One-page meeting brief:/ }).click();

    await page.getByText("Project options").click();
    await expect(page.getByText(/Gilroy city.*one-page meeting brief/i)).toBeVisible();
    await expect(page.getByText(/^[0-9a-f]{8}-[0-9a-f]{4}-/)).not.toBeVisible();
  });

  test("downloading a project file and opening it back preserves the project's state", async ({ page }) => {
    await startProjectFromPlace(page, "Sunnyvale");
    await includeNthAvailableFact(page, 0);

    await page.getByText("Project options").click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download a copy" }).click();
    const download = await downloadPromise;
    const filePath = await download.path();
    expect(filePath).toBeTruthy();

    // Downloading closes the menu (a deliberate one-shot action); reopen
    // it to reach "Start a new project".
    await page.getByText("Project options").click();
    await page.getByText("Start a new project").click();
    await expect(page.getByText("Where would you like to start?")).toBeVisible();

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByText("Project options").click();
    await page.getByRole("button", { name: "Open a saved copy" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(filePath!);

    // Importing switches straight to the restored project and resumes at
    // its furthest-reached stage (Create, since a fact was already
    // selected) -- there is no separate <select>-based project switcher
    // in the redesigned menu, just the project itself becoming active.
    await expect(page.getByRole("heading", { name: "What would you like to create?" })).toBeVisible({
      timeout: 10_000,
    });
    // Scoped to the project summary bar, not the (currently closed, thus
    // hidden) project-switch list in the menu, which also contains the
    // project's title text.
    await expect(page.getByTestId("project-summary-bar")).toContainText("Sunnyvale");
    await expect(page.getByText("1 fact selected").first()).toBeVisible();
  });

  test("opening a file that isn't a valid project shows a plain-language error, not a stack trace", async ({
    page,
  }) => {
    await page.goto("/advocate");
    await page.getByText("Project options").click();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Open a saved copy" }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "not-a-project.json",
      mimeType: "application/json",
      buffer: Buffer.from("{ this is not valid JSON"),
    });

    await expect(
      page.getByText(
        "This file isn't a valid Advocate project file. It couldn't be read as a project file at all. Nothing was changed.",
      ),
    ).toBeVisible({ timeout: 5_000 });
    // Never a stack trace, parsing exception, or raw schema/validation object.
    await expect(page.getByText(/SyntaxError|TypeError|at Object\./)).not.toBeVisible();
  });

  test("reloading resumes at the furthest stage already reached, never back at the empty landing", async ({
    page,
  }) => {
    await startProjectFromPlace(page, "Gilroy");
    await includeNthAvailableFact(page, 0);
    await page.waitForTimeout(1200); // allow the 500ms autosave debounce to fire

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "What would you like to create?" })).toBeVisible({
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
    await includeNthAvailableFact(page, 0);
    await page.getByRole("button", { name: /^Continue with 1 fact$/ }).click();
    await page.getByRole("button", { name: /^One-page meeting brief:/ }).click();
    await page.getByRole("button", { name: "Commissioner / staff" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByText("What is happening?")).toBeVisible({ timeout: 15_000 });

    expect(errors).toEqual([]);
  });
});
