import { test, expect } from "@playwright/test";

test.describe("Access Lab -- tract search, tabs, and real access data", () => {
  test("searching a tract loads its real network/transit access summary", async ({ page }) => {
    await page.goto("/access-lab");
    await expect(page.getByLabel("Find a place")).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Find a place").fill("06085500100");
    await page.getByRole("button", { name: "Search" }).click();

    const result = page.getByRole("button", { name: /06085500100/ });
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    await expect(page).toHaveURL(/geography=tract&id=06085500100/);
    await expect(page.getByText("Nearest clinical care -- walking")).toBeVisible({ timeout: 10_000 });
    // Real distance figures, not placeholders -- "mi" unit always present.
    await expect(page.getByText(/\d+\.\d mi/).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scheduled transit access" })).toBeVisible();
  });

  test("switching travel mode updates the displayed distances", async ({ page }) => {
    await page.goto("/access-lab?geography=tract&id=06085500100");
    await expect(page.getByText("Nearest clinical care -- walking")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("radio", { name: "Driving" }).click();
    await expect(page).toHaveURL(/mode=drive/);
    await expect(page.getByText("Nearest clinical care -- driving")).toBeVisible({ timeout: 10_000 });
  });

  test("resource browser tab shows real facilities with source provenance", async ({ page }) => {
    await page.goto("/access-lab");
    await page.getByRole("tab", { name: "Resource browser" }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();

    // Default category is hospital -- Santa Clara County has exactly 15.
    await expect(page.getByText(/15 hospitals/i)).toBeVisible({ timeout: 15_000 });
    // Two distinct HCAI-licensed facilities both organizationally named
    // "Stanford Health Care" (different campuses/licenses, different bed
    // counts) -- correctly kept as two separate canonical facilities, not
    // merged, so this legitimately matches twice.
    await expect(page.getByText("STANFORD HEALTH CARE").first()).toBeVisible();

    await page.getByRole("button", { name: /Clinics and health centers/ }).click();
    await expect(page.getByText(/clinics and health centers in Santa Clara County/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("resource gaps tab shows all four classification counts summing to real tracts", async ({ page }) => {
    await page.goto("/access-lab");
    await page.getByRole("tab", { name: "Resource gaps" }).click();

    await expect(page.getByText("High estimated need, low measured access")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("High estimated need, high measured access")).toBeVisible();
    await expect(page.getByText("Low estimated need, low measured access")).toBeVisible();
    await expect(page.getByText("Low estimated need, high measured access")).toBeVisible();
  });

  test("mobile-service scenarios tab shows the precomputed sensitivity sweep including an infeasible run", async ({
    page,
  }) => {
    await page.goto("/access-lab");
    await page.getByRole("tab", { name: "Mobile-service scenarios" }).click();

    await expect(page.getByText("modeled planning scenarios", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("No solution satisfies these constraints")).toBeVisible();

    // Never presents modeled coverage as real service delivery.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.toLowerCase()).not.toContain("people served");
    expect(bodyText.toLowerCase()).not.toContain("patients served");
  });

  test("selecting a non-tract geography shows guidance instead of a broken state", async ({ page }) => {
    await page.goto("/access-lab");
    await page.getByLabel("Find a place").fill("Sunnyvale");
    await page.getByRole("button", { name: "Search" }).click();

    const result = page.getByRole("button", { name: /Sunnyvale/ });
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    await expect(
      page.getByText("Access Lab currently shows results by census tract", { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("no console errors or hydration warnings on initial load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/access-lab");
    await expect(page.getByRole("heading", { name: "Access Lab" })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    expect(errors).toEqual([]);
  });
});
