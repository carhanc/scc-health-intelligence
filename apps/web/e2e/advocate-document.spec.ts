import path from "node:path";
import { test, expect } from "@playwright/test";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

/** From the empty landing state, "Start with a document" is a link, not
 * a tab -- the tabbed Project-stage view only exists once a project has
 * already started (a place chosen or a document already uploaded). */
async function goToDocumentEntryFromLanding(page: import("@playwright/test").Page) {
  await page.goto("/advocate");
  await expect(page.getByRole("heading", { name: "Start an advocacy project" })).toBeVisible();
  await page.getByRole("button", { name: /Find useful evidence in a document/ }).click();
  await expect(page.getByRole("heading", { name: "Find useful evidence in a document" })).toBeVisible();
}

test.describe("Advocate -- find evidence in a document", () => {
  test("uploading a valid agenda finds relevant passages and detects geography", async ({ page }) => {
    await goToDocumentEntryFromLanding(page);

    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Upload a meeting document")
      .setInputFiles(path.join(FIXTURES_DIR, "sample-agenda.txt"));

    await expect(page.getByText("sample-agenda.txt")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/We found \d+ potentially relevant passage/)).toBeVisible();
    await expect(page.getByText(/Diabetes prevention/).first()).toBeVisible();
    await expect(page.getByText(/Gilroy/).first()).toBeVisible();
    // Plain-language processing disclosure -- never a raw payload dump.
    await expect(page.getByText(/processed in memory, server-side/)).toBeVisible();
  });

  test("a document with no clearly-matching passage shows the plain-language no-match message, not an empty silence", async ({
    page,
  }) => {
    await goToDocumentEntryFromLanding(page);
    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Upload a meeting document")
      .setInputFiles({
        name: "unrelated-notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Notes on the office holiday party schedule and parking lot repaving."),
      });

    await expect(page.getByText("unrelated-notes.txt")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(
        "We didn't find a passage that clearly matches this project. You can try a different document or add a note manually.",
      ),
    ).toBeVisible();
  });

  test("a document with instruction-like text is flagged, never followed", async ({ page }) => {
    await goToDocumentEntryFromLanding(page);
    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Upload a meeting document")
      .setInputFiles(path.join(FIXTURES_DIR, "prompt-injection.txt"));

    await expect(page.getByText(/instruction-like text/i)).toBeVisible({ timeout: 15_000 });
    // An injected instruction must never alter the app's own behavior --
    // the page is still the real Advocate page with its real heading.
    await expect(page.getByRole("heading", { name: "Turn evidence into action" })).toBeVisible();
  });

  test("rejects a file with an unsupported extension with a plain-language message", async ({ page }) => {
    await goToDocumentEntryFromLanding(page);
    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Upload a meeting document")
      .setInputFiles(path.join(FIXTURES_DIR, "malicious.exe"));

    await expect(page.getByText(/could not analyze|unsupported/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("clearing uploaded-document data removes it from the project", async ({ page }) => {
    await goToDocumentEntryFromLanding(page);
    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Upload a meeting document")
      .setInputFiles(path.join(FIXTURES_DIR, "sample-agenda.txt"));
    await expect(page.getByText("sample-agenda.txt")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Clear all uploaded-document data" }).click();
    await expect(page.getByText("sample-agenda.txt")).not.toBeVisible();
  });

  test("upload is blocked until the authorization checkbox is checked", async ({ page }) => {
    await goToDocumentEntryFromLanding(page);
    await expect(page.getByRole("button", { name: "Choose a file to upload" })).toBeDisabled();
    await page.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Choose a file to upload" })).toBeEnabled();
  });
});
