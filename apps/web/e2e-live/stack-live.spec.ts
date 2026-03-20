import { expect, test } from "@playwright/test";

const providersTabLabel = /Providers|프로바이더/i;
const routingTabLabel = /Routing|라우팅/i;
const forensicsTabLabel = /Forensics|포렌식/i;
const providersFlowBoardTitle = /Provider Config \+ Cleanup Flow Board|프로바이더 설정 \+ 정리 플로우 보드/;
const routingTitle = /Codex Execution Routing Graph|Codex 실행 라우팅 그래프/;
const selectAllFilteredLabel = /Select all filtered|필터 결과 전체 선택/;
const bulkImpactLabel = /Bulk Impact Analysis|일괄 영향 분석/;
const bulkCleanupDryRunLabel = /Bulk Cleanup Dry-Run|일괄 정리 드라이런/;
const selectedThreadsLabel = /Selected Threads|선택한 스레드/;
const forensicsErrorLabel = /Analysis\/dry-run request failed|영향 분석\/드라이런 요청 실패/;

test("live stack renders providers and routing views", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: providersTabLabel }).click();
  await expect(page.getByText(providersFlowBoardTitle)).toBeVisible();

  await page.getByRole("button", { name: routingTabLabel }).click();
  await expect(page.getByText(routingTitle)).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("live-stack-core.png"), fullPage: true });
});

test("live stack executes safe forensics dry-run flow when threads exist", async ({ page }) => {
  await page.goto("/");

  const threadsPanel = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: /Threads|스레드/i }) });
  await expect(threadsPanel).toBeVisible();

  const rowCount = await threadsPanel.locator("tbody tr").count();
  test.skip(rowCount === 0, "no thread rows available for live dry-run smoke");

  const selectAllCheckbox = threadsPanel.getByRole("checkbox", { name: selectAllFilteredLabel });

  await selectAllCheckbox.check();
  await threadsPanel.getByRole("button", { name: bulkImpactLabel }).click();
  await threadsPanel.getByRole("button", { name: bulkCleanupDryRunLabel }).click();

  await page.getByRole("button", { name: forensicsTabLabel }).click();
  await expect(page.getByText(selectedThreadsLabel)).toBeVisible();
  await expect(page.getByText(forensicsErrorLabel)).toHaveCount(0);
});
