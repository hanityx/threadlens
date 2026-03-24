import { expect, test, type Page } from "@playwright/test";

async function ensureTheme(page: Page, target: "light" | "dark") {
  const lightToggle = page.getByRole("button", { name: /light/i }).first();
  const darkToggle = page.getByRole("button", { name: /dark/i }).first();

  if (target === "light") {
    if (await lightToggle.count()) {
      await lightToggle.click();
      await expect(darkToggle).toBeVisible();
      return;
    }
    await expect(darkToggle).toBeVisible();
    return;
  }

  if (await darkToggle.count()) {
    await darkToggle.click();
    await expect(lightToggle).toBeVisible();
    return;
  }
  await expect(lightToggle).toBeVisible();
}

async function openDiagnostics(page: Page) {
  const summary = page.locator("summary").filter({ hasText: /diagnostics/i }).first();
  await summary.click();
  await expect(page.locator("details.session-routing-disclosure[open]").first()).toBeVisible();
}

function surfaceTabs(page: Page) {
  return page.getByRole("navigation", { name: /surface tabs/i }).first();
}

async function runFullPageSmoke(page: Page, suffix: string, testInfo: { outputPath: (path: string) => string }) {
  await page.goto("/");

  await expect(page.getByText(/session workbench/i)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`overview-${suffix}.png`),
    fullPage: true,
  });

  await surfaceTabs(page).getByRole("button", { name: /^search$/i }).click();
  await expect(page.getByRole("heading", { name: /^search$/i })).toBeVisible();
  await expect(page.locator("input.search-input-stage")).toBeVisible();
  await page.getByRole("button", { name: /^agent$/i }).first().click();
  await expect(page.getByText(/hits/i).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`search-${suffix}.png`),
    fullPage: true,
  });

  await surfaceTabs(page).getByRole("button", { name: /^sessions$/i }).click();
  await expect(page.getByRole("heading", { name: /^sessions$/i }).first()).toBeVisible();
  await openDiagnostics(page);
  await page.screenshot({
    path: testInfo.outputPath(`sessions-${suffix}.png`),
    fullPage: true,
  });

  await surfaceTabs(page).getByRole("button", { name: /^(review|cleanup)$/i }).click();
  await expect(page.getByRole("heading", { name: /review|cleanup/i }).first()).toBeVisible();
  const firstCheckbox = page.locator("tbody input[type='checkbox']").first();
  if (await firstCheckbox.count()) {
    await firstCheckbox.check();
  }
  await expect(page.getByText(/impact/i).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`review-${suffix}.png`),
    fullPage: true,
  });

  await surfaceTabs(page).getByRole("button", { name: /^overview$/i }).click();
  const setupButton = page.getByRole("button", { name: /^setup$/i }).first();
  await setupButton.click();
  await expect(page.getByText(/setup workspace|provider observatory/i).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`setup-${suffix}.png`),
    fullPage: true,
  });
}

test("full page smoke in light theme", async ({ page }, testInfo) => {
  await page.goto("/");
  await ensureTheme(page, "light");
  await runFullPageSmoke(page, "light", testInfo);
});

test("full page smoke in dark theme", async ({ page }, testInfo) => {
  await page.goto("/");
  await ensureTheme(page, "dark");
  await runFullPageSmoke(page, "dark", testInfo);
});
