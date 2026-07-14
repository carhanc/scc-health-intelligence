import path from "node:path";
import { test, expect } from "@playwright/test";

const FIXTURES_DIR = path.join(__dirname, "fixtures");

test.describe("Advocate -- document intelligence", () => {
  test("uploading a valid agenda detects geography, topics, and agenda items", async ({ page }) => {
    await page.goto("/advocate");
    await page.getByRole("tab", { name: "Start from a document" }).click();

    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Upload a meeting document")
      .setInputFiles(path.join(FIXTURES_DIR, "sample-agenda.txt"));

    await expect(page.getByText("sample-agenda.txt")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Board of Supervisors/i)).toBeVisible();
    await expect(page.getByText(/Diabetes prevention/).first()).toBeVisible();
    await expect(page.getByText(/Gilroy/).first()).toBeVisible();
  });

  test("a document with instruction-like text is flagged, never followed", async ({ page }) => {
    await page.goto("/advocate");
    await page.getByRole("tab", { name: "Start from a document" }).click();
    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Upload a meeting document")
      .setInputFiles(path.join(FIXTURES_DIR, "prompt-injection.txt"));

    await expect(page.getByText(/instruction-like text/i)).toBeVisible({ timeout: 15_000 });
    // The page itself must still be the real Advocate page -- an
    // injected instruction must never alter the app's own behavior.
    await expect(page.getByRole("heading", { name: "Advocate", level: 1 })).toBeVisible();
  });

  test("rejects a file with an unsupported extension", async ({ page }) => {
    await page.goto("/advocate");
    await page.getByRole("tab", { name: "Start from a document" }).click();
    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Upload a meeting document")
      .setInputFiles(path.join(FIXTURES_DIR, "malicious.exe"));

    await expect(page.getByText(/could not analyze|unsupported/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("clearing uploaded-document data removes it from the workspace", async ({ page }) => {
    await page.goto("/advocate");
    await page.getByRole("tab", { name: "Start from a document" }).click();
    await page.getByRole("checkbox").check();
    await page
      .getByLabel("Upload a meeting document")
      .setInputFiles(path.join(FIXTURES_DIR, "sample-agenda.txt"));
    await expect(page.getByText("sample-agenda.txt")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Clear all uploaded-document data" }).click();
    await expect(page.getByText("sample-agenda.txt")).not.toBeVisible();
  });

  test("upload is blocked until the PHI acknowledgement is checked", async ({ page }) => {
    await page.goto("/advocate");
    await page.getByRole("tab", { name: "Start from a document" }).click();
    await expect(page.getByRole("button", { name: "Choose a file to upload" })).toBeDisabled();
    await page.getByRole("checkbox").check();
    await expect(page.getByRole("button", { name: "Choose a file to upload" })).toBeEnabled();
  });
});
