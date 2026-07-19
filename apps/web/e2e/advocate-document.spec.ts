import path from "node:path";
import { test, expect } from "@playwright/test";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

/** From the empty landing state, "Review a document" leads to the
 * two-screen document flow: "Choose a document" then "Review useful
 * passages" (docs/design/advocate-flow-simplification-visual-review.md
 * "DOCUMENT FLOW"). */
async function goToChooseDocument(page: import("@playwright/test").Page) {
  await page.goto("/advocate");
  await expect(page.getByText("Where would you like to start?")).toBeVisible();
  await page.getByRole("button", { name: /^Review a document:/ }).click();
  await expect(page.getByRole("heading", { name: "Choose a document" })).toBeVisible();
}

test.describe("Advocate -- find evidence in a document", () => {
  test("uploading a document finds relevant passages with real excerpts and page references", async ({ page }) => {
    await goToChooseDocument(page);

    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Upload a meeting document")
      .setInputFiles(path.join(FIXTURES_DIR, "sample-agenda.txt"));

    await expect(page.getByRole("heading", { name: "Review useful passages" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/We found \d+ passages? that may be useful/)).toBeVisible();
    await expect(page.getByText(/Diabetes prevention/).first()).toBeVisible();
    // A real page reference next to the excerpt, not just a bare topic label.
    await expect(page.getByText(/Page \d+/).first()).toBeVisible();
  });

  test("a document with no clearly relevant passage shows the plain-language no-match message", async ({
    page,
  }) => {
    await goToChooseDocument(page);
    await page.getByRole("checkbox").check();
    await page.getByLabel("Upload a meeting document").setInputFiles({
      name: "unrelated-notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Notes on the office holiday party schedule and parking lot repaving."),
    });

    await expect(page.getByText("unrelated-notes.txt")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(
        "We didn't find a clearly relevant passage. You can try another document or continue with evidence from the platform.",
      ),
    ).toBeVisible();
  });

  test("a document with instruction-like text is flagged, never followed", async ({ page }) => {
    await goToChooseDocument(page);
    await page.getByRole("checkbox").check();
    await page.getByLabel("Upload a meeting document").setInputFiles(path.join(FIXTURES_DIR, "prompt-injection.txt"));

    await expect(page.getByText(/instruction-like text/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Turn evidence into action" })).toBeVisible();
  });

  test("rejects a file with an unsupported extension with a plain-language message", async ({ page }) => {
    await goToChooseDocument(page);
    await page.getByRole("checkbox").check();
    await page.getByLabel("Upload a meeting document").setInputFiles(path.join(FIXTURES_DIR, "malicious.exe"));

    await expect(page.getByText(/could not analyze|unsupported/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("upload is blocked until the authorization checkbox is checked", async ({ page }) => {
    await goToChooseDocument(page);
    await expect(page.getByRole("button", { name: "Choose a file to upload" })).toBeDisabled();
    await page.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Choose a file to upload" })).toBeEnabled();
  });

  test("including a passage and continuing carries it into the generated draft as a note", async ({ page }) => {
    await goToChooseDocument(page);
    await page.getByRole("checkbox").check();
    await page.getByLabel("Upload a meeting document").setInputFiles(path.join(FIXTURES_DIR, "sample-agenda.txt"));
    await expect(page.getByRole("heading", { name: "Review useful passages" })).toBeVisible({ timeout: 15_000 });

    const includeButtons = page.locator('button[aria-label^="Include passage:"]');
    await includeButtons.first().click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "What would you like to create?" })).toBeVisible();
    await page.getByRole("button", { name: /^Detailed advocacy memo:/ }).click();
    await page.getByRole("button", { name: "Commissioner / staff" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Create draft" }).click();

    await expect(page.getByText("What is happening?")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Relevant passage from/)).toBeVisible();
  });
});
