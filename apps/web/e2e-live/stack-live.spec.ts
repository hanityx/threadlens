import { expect, test } from "@playwright/test";

const providersTabLabel = /^(Providers|Sessions|Source Sessions|Session Vault|프로바이더|AI 관리|원본 세션실)$/i;
const threadsTabLabel = /^(Threads|Cleanup|Codex Cleanup|스레드|정리|Codex 정리실)$/i;
const providersHubTitle = /^(Sessions|Original Sessions|Source Sessions|Session Vault|AI 운영실|원본 세션|원본 세션실)$/i;
const openDiagnosticsLabel = /^(Open Advanced Diagnostics|AI Diagnostics|고급 진단 보기|고급 진단 열기)$/i;
const routingTitle = /^(AI Diagnostics|AI Diagnostics \/ Execution Flow|Execution Routing Graph|AI 진단 \/ 실행 흐름|고급 진단 \/ 실행 흐름)$/i;
const bulkImpactLabel = /^(Bulk Impact Analysis|Run impact analysis|일괄 영향 분석)$/i;
const bulkCleanupDryRunLabel = /^(Bulk Cleanup Dry-Run|Run cleanup dry-run|일괄 정리 드라이런)$/i;
const selectAllFilteredLabel = /^(Select all filtered|현재 필터 전체 선택)$/i;
const selectedThreadsLabel = /^(Selected Threads|선택한 스레드)$/i;
const forensicsErrorLabel = /^(Analysis\/dry-run request failed|분석\/드라이런 요청 실패)$/i;
const threadsHeading = /^(Cleanup|Threads|Codex Cleanup|스레드|정리 대상 스레드|Codex 정리 스레드|Codex 정리실)$/i;

test("live stack renders providers and routing views", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: providersTabLabel }).first().click();
  await expect(page.getByRole("heading", { name: providersHubTitle }).first()).toBeVisible();
  await page.locator("summary").filter({ hasText: openDiagnosticsLabel }).first().click();
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
  await expect(page.getByText(selectedThreadsLabel)).toBeVisible();
  await expect(page.getByText(forensicsErrorLabel)).toHaveCount(0);
});
