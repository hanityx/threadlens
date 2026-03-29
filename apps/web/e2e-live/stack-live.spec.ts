import { expect, test } from "@playwright/test";

const providersTabLabel = /^(Providers|Sessions|Source Sessions|Session Vault)$/i;
const threadsTabLabel = /^(Threads|Cleanup|Codex Cleanup)$/i;
const providersHubTitle = /^(Sessions|Original Sessions|Source Sessions|Session Vault)$/i;
const routingTitle = /^(AI Diagnostics|AI Diagnostics \/ Execution Flow|Execution Routing Graph|Diagnostics map)$/i;
const bulkImpactLabel = /^(Bulk Impact Analysis|Run impact analysis)$/i;
const bulkCleanupDryRunLabel = /^(Bulk Cleanup Dry-Run|Run cleanup dry-run)$/i;
const selectAllFilteredLabel = /^(Select all filtered)$/i;
const forensicsErrorLabel = /^(Analysis\/dry-run request failed)$/i;
const threadsHeading = /^(Cleanup|Threads|Codex Cleanup)$/i;
const forensicsTitle = /^(Cleanup Check \/ Next Steps)$/i;
const tokenLabel = /^(Token)$/i;

test("live stack renders providers and routing views", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: providersTabLabel }).first().click();
  await expect(page.getByRole("heading", { name: providersHubTitle }).first()).toBeVisible();
  const diagnosticsSummary = page
    .locator("details.session-routing-disclosure summary")
    .filter({ hasText: /Session surface/i })
    .first();
  await expect(diagnosticsSummary).toContainText(/Open|Hide/i);
  await diagnosticsSummary.click();
  await expect(page.getByRole("heading", { name: routingTitle })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("live-stack-core.png"), fullPage: true });
});

test("live stack executes safe forensics dry-run flow when threads exist", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: threadsTabLabel }).first().click();

  const threadsPanel = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: threadsHeading }) });
  await expect(threadsPanel).toBeVisible();

  const rowCount = await threadsPanel.locator("tbody tr").count();
  test.skip(rowCount === 0, "no thread rows available for live dry-run smoke");

  await threadsPanel.locator("tbody input[type='checkbox']").first().check();
  await threadsPanel.getByRole("button", { name: bulkImpactLabel }).click();
  await threadsPanel.getByRole("button", { name: bulkCleanupDryRunLabel }).click();

  await expect(page.locator(".impact-panel").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: forensicsTitle }).first()).toBeVisible();
  await expect(page.getByText(tokenLabel)).toBeVisible();
  await expect(page.getByText(forensicsErrorLabel)).toHaveCount(0);
});
