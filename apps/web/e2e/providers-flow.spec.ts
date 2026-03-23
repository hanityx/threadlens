import { expect, type Page, test } from "@playwright/test";

const SCHEMA_VERSION = "2026-02-27";
const threadsTabLabel = /^(Threads|Cleanup|Codex Cleanup|스레드|정리|Codex 정리실)$/i;
const providersTabLabel = /^(Providers|Sessions|Source Sessions|Session Vault|프로바이더|AI 관리|원본 세션실)$/i;
const selectAllInTabLabel = /^(Select all in tab|Select all in current tab|현재 탭 전체 선택)$/i;
const selectAllFilteredLabel = /^(Select all filtered|Select all in current filter|현재 필터 전체 선택)$/i;
const deleteDryRunLabel = /^(Delete dry-run|Delete source files \(dry-run\)|원본 파일 삭제 드라이런|삭제 드라이런)$/i;
const deleteLabel = /^(Delete|Delete source files|Delete locally|삭제|원본 파일 삭제)$/i;
const bulkPinLabel = /^(Bulk Pin|Pin selected|일괄 고정)$/i;
const threadDetailTitle = /^(Thread Detail|Selected Thread Detail|스레드 상세|선택한 스레드 상세)$/i;
const impactAnalysisLabel = /^(Impact Analysis|영향 분석)$/i;
const cleanupDryRunLabel = /^(Cleanup Dry-Run|정리 드라이런)$/i;
const originalSessionsTitle = /^(Sessions|Original Sessions|Source Sessions|Session Vault|원본 세션)$/i;
const backupSelectedLabel = /^(Backup Selected Sessions|Back up selected sessions|선택 세션 백업)$/i;
const bundleAllBackupsLabel = /^(Bundle All Backups|Export backup bundle|Export full backup bundle|통 백업 묶기)$/i;
const searchTabLabel = /^(Search|Conversation Search|원문 검색|전체 대화 검색)$/i;
const searchPlaceholder = /^(Search your own words, filenames, or keywords|내가 했던 말, 파일명, 키워드를 검색)/i;
const codexSearchResultLabel = /Fix token flow/i;
const claudeSearchResultLabel = /Claude notes/i;
const openThreadLabel = /^(Open Codex Cleanup|Codex 정리 열기)$/i;
const openSessionLabel = /^(Open Source Session|원본 세션 열기)$/i;

type MockApiOptions = {
  providerActionCalls?: Array<Record<string, unknown>>;
  bulkActionCalls?: Array<Record<string, unknown>>;
  analyzeDeleteCalls?: Array<Record<string, unknown>>;
  cleanupDryRunCalls?: Array<Record<string, unknown>>;
  threadsRows?: Array<Record<string, unknown>>;
  searchResults?: Array<Record<string, unknown>>;
};

function envelope<T>(data: T) {
  return {
    ok: true,
    schema_version: SCHEMA_VERSION,
    data,
    error: null,
  };
}

async function openPrimaryView(page: Page, label: "Threads" | "Providers") {
  const target = label === "Threads" ? threadsTabLabel : providersTabLabel;
  const nav = page.locator(".layout-nav");
  const button = nav.getByRole("button", { name: target }).first();
  await button.click();
  await expect(button).toHaveClass(/is-active/);
}

async function selectProviderChip(page: Page, label: RegExp) {
  const workspaceBar = page.locator(".provider-workspace-bar");
  const button = workspaceBar.getByRole("button", { name: label }).first();
  await button.click();
  await expect(button).toHaveClass(/is-active/);
}

async function setupMockApi(page: Page, options: MockApiOptions = {}) {
  const providerActionCalls = options.providerActionCalls ?? [];
  const bulkActionCalls = options.bulkActionCalls ?? [];
  const analyzeDeleteCalls = options.analyzeDeleteCalls ?? [];
  const cleanupDryRunCalls = options.cleanupDryRunCalls ?? [];
  const threadsRows = options.threadsRows ?? [];
  const searchResults = options.searchResults ?? [];

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;

    if (path === "/api/provider-session-action" && req.method() === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      providerActionCalls.push(body);
      const dryRun = Boolean(body.dry_run);
      const action = String(body.action ?? "delete_local");
      const response = dryRun
        ? {
            ok: true,
            provider: "codex",
            action,
            dry_run: true,
            target_count: 1,
            valid_count: 1,
            applied_count: 0,
            confirm_token_expected: "tok-1",
            confirm_token_accepted: false,
          }
        : {
            ok: true,
            provider: "codex",
            action,
            dry_run: false,
            target_count: 1,
            valid_count: 1,
            applied_count: 1,
            confirm_token_expected: "",
            confirm_token_accepted: String(body.confirm_token || "") === "tok-1",
          };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope(response)),
      });
      return;
    }

    if (path === "/api/bulk-thread-action" && req.method() === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      bulkActionCalls.push(body);
      const action = String(body.action ?? "pin");
      const threadIds = Array.isArray(body.thread_ids) ? body.thread_ids.map(String) : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            action,
            total: threadIds.length,
            success: threadIds.length,
            failed: 0,
            results: threadIds.map((thread_id) => ({
              thread_id,
              ok: true,
              status: 200,
              error: null,
            })),
          }),
        ),
      });
      return;
    }

    if (path === "/api/analyze-delete" && req.method() === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      analyzeDeleteCalls.push(body);
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            count: ids.length,
            reports: ids.map((id) => ({
              id,
              title: `Thread ${id}`,
              risk_level: "low",
              risk_score: 10,
              summary: "mock summary",
              parents: [],
              impacts: [],
            })),
          }),
        ),
      });
      return;
    }

    if (path === "/api/local-cleanup" && req.method() === "POST") {
      const body = req.postDataJSON() as Record<string, unknown>;
      cleanupDryRunCalls.push(body);
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            ok: true,
            mode: "dry_run",
            confirm_token_expected: "cleanup-mock-token",
            target_file_count: ids.length,
            requested_ids: ids.length,
            confirm_help: "mock token ready",
          }),
        ),
      });
      return;
    }

    if (path === "/api/threads") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          rows: threadsRows,
          total: threadsRows.length,
          schema_version: SCHEMA_VERSION,
        }),
      });
      return;
    }

    if (path === "/api/conversation-search") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            q: url.searchParams.get("q") ?? "",
            searched_sessions: searchResults.length,
            available_sessions: searchResults.length,
            results: searchResults,
          }),
        ),
      });
      return;
    }

    if (path === "/api/agent-runtime") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            runtime_backend: { reachable: true, latency_ms: 10, url: "ts-native" },
            process: { pid: 111, uptime_sec: 123, node: "test" },
            tmux: { sessions: [] },
          }),
        ),
      });
      return;
    }

    if (path === "/api/smoke-status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            generated_at: "2026-03-05T07:00:00Z",
            latest: {
              status: "pass",
              result: "PASS",
              ok: true,
              timestamp_utc: "2026-03-05T07:00:00Z",
            },
            history: [],
          }),
        ),
      });
      return;
    }

    if (path === "/api/recovery-center") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          summary: {
            backup_sets: 1,
            checklist_done: 0,
            checklist_total: 0,
          },
          generated_at: "2026-03-05T07:00:00Z",
        }),
      });
      return;
    }

    if (path === "/api/data-sources") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            generated_at: "2026-03-05T07:00:00Z",
            sources: {
              codex_sessions: {
                path: "$HOME/.codex/sessions",
                present: true,
                file_count: 1,
                dir_count: 1,
                total_bytes: 2048,
                latest_mtime: "2026-03-05T07:00:00Z",
              },
            },
          }),
        ),
      });
      return;
    }

    if (path === "/api/provider-matrix") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            summary: {
              total: 1,
              active: 1,
              detected: 0,
              read_analyze_ready: 1,
              safe_cleanup_ready: 1,
              hard_delete_ready: 1,
            },
            providers: [
              {
                provider: "codex",
                name: "Codex CLI",
                status: "active",
                capability_level: "full",
                capabilities: {
                  read_sessions: true,
                  analyze_context: true,
                  safe_cleanup: true,
                  hard_delete: true,
                },
                evidence: {
                  session_log_count: 1,
                  notes: "mock",
                  roots: ["$HOME/.codex/sessions"],
                },
              },
            ],
          }),
        ),
      });
      return;
    }

    if (path === "/api/provider-sessions") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            summary: {
              providers: 1,
              rows: 1,
              parse_ok: 1,
              parse_fail: 0,
            },
            providers: [
              {
                provider: "codex",
                name: "Codex CLI",
                status: "active",
                scanned: 1,
                truncated: false,
                scan_ms: 120,
              },
            ],
            rows: [
              {
                provider: "codex",
                source: "sessions",
                session_id: "session-1",
                display_title: "Token flow test thread",
                file_path: "/tmp/codex/session-1.jsonl",
                size_bytes: 1024,
                mtime: "2026-03-05T07:00:00Z",
                probe: {
                  ok: true,
                  format: "jsonl",
                  error: null,
                  detected_title: "Token flow test thread",
                  title_source: "mock",
                },
              },
            ],
          }),
        ),
      });
      return;
    }

    if (path === "/api/provider-parser-health") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            summary: {
              providers: 1,
              scanned: 1,
              parse_ok: 1,
              parse_fail: 0,
              parse_score: 100,
            },
            reports: [
              {
                provider: "codex",
                name: "Codex CLI",
                status: "active",
                scanned: 1,
                parse_ok: 1,
                parse_fail: 0,
                parse_score: 100,
                truncated: false,
                scan_ms: 120,
                sample_errors: [],
              },
            ],
          }),
        ),
      });
      return;
    }

    if (path === "/api/execution-graph") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            generated_at: "2026-03-05T07:00:00Z",
            nodes: [],
            edges: [],
            findings: [],
            evidence: {
              codex_config_path: "$HOME/.codex/config.toml",
              global_state_path: "$HOME/.codex/state.json",
              trusted_projects: [],
            },
          }),
        ),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope({})),
    });
  });
}

test("providers workspace surfaces backup-first controls", async ({ page }, testInfo) => {
  const providerActionCalls: Array<Record<string, unknown>> = [];
  await setupMockApi(page, { providerActionCalls });

  await page.goto("/");
  await openPrimaryView(page, "Providers");
  const sessionsPanel = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: originalSessionsTitle }) })
    .last();
  await expect(sessionsPanel.getByRole("heading", { name: originalSessionsTitle }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: backupSelectedLabel }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: bundleAllBackupsLabel })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("providers-flow-en.png"), fullPage: true });
});

test("backup action executes in one click for selected provider sessions", async ({ page }) => {
  const providerActionCalls: Array<Record<string, unknown>> = [];
  await setupMockApi(page, { providerActionCalls });

  await page.goto("/");
  await openPrimaryView(page, "Providers");
  await selectProviderChip(page, /^Codex/i);
  const sessionsPanel = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: originalSessionsTitle }) })
    .last();
  await sessionsPanel.locator("tbody input[type='checkbox']").first().check();

  await page.getByRole("button", { name: backupSelectedLabel }).first().click();
  await expect.poll(() => providerActionCalls.length).toBe(1);
  expect(providerActionCalls[0]?.action).toBe("backup_local");
  expect(providerActionCalls[0]?.dry_run).toBe(false);
});

test("delete action enforces dry-run token flow", async ({ page }) => {
  const providerActionCalls: Array<Record<string, unknown>> = [];
  await setupMockApi(page, { providerActionCalls });

  await page.goto("/");
  await openPrimaryView(page, "Providers");
  await selectProviderChip(page, /^Codex/i);
  await expect(page.getByText("Token flow test thread")).toBeVisible();
  const sessionsPanel = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: originalSessionsTitle }) })
    .last();
  await sessionsPanel.locator("tbody input[type='checkbox']").first().check();

  const deleteDryRunButton = sessionsPanel.getByRole("button", { name: deleteDryRunLabel }).first();
  const deleteButton = sessionsPanel.getByRole("button", { name: deleteLabel }).last();
  await deleteDryRunButton.click();
  await expect.poll(() => providerActionCalls.length).toBe(1);

  expect(providerActionCalls[0]?.dry_run).toBe(true);
  expect(providerActionCalls[0]?.confirm_token).toBe("");

  await deleteButton.click();
  await expect
    .poll(() =>
      providerActionCalls.some(
        (call) => call?.dry_run === false && call?.confirm_token === "tok-1",
      ),
    )
    .toBe(true);

  const finalDeleteCall = [...providerActionCalls]
    .reverse()
    .find((call) => call?.dry_run === false);
  expect(finalDeleteCall?.confirm_token).toBe("tok-1");
});

test("providers tab switches within performance budget", async ({ page }) => {
  const providerActionCalls: Array<Record<string, unknown>> = [];
  await setupMockApi(page, { providerActionCalls });

  await page.goto("/");
  const startedAt = Date.now();
  await openPrimaryView(page, "Providers");
  const sessionsPanel = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: originalSessionsTitle }) })
    .last();
  await expect(sessionsPanel.getByRole("heading", { name: originalSessionsTitle }).first()).toBeVisible();
  const elapsedMs = Date.now() - startedAt;

  expect(elapsedMs).toBeLessThan(2500);
});

test("threads bulk pin action sends selected thread ids", async ({ page }) => {
  const bulkActionCalls: Array<Record<string, unknown>> = [];
  await setupMockApi(page, {
    bulkActionCalls,
    threadsRows: [
      {
        id: "thread-1",
        thread_id: "thread-1",
        title: "Bulk pin test",
        risk_score: 15,
        is_pinned: false,
        source: "sessions",
      },
    ],
  });

  await page.goto("/");
  await openPrimaryView(page, "Threads");
  await expect(page.getByText("Bulk pin test")).toBeVisible();
  await page.getByRole("checkbox", { name: selectAllFilteredLabel }).check();
  await page.getByRole("button", { name: bulkPinLabel }).click();

  await expect.poll(() => bulkActionCalls.length).toBe(1);
  expect(bulkActionCalls[0]?.action).toBe("pin");
  expect(bulkActionCalls[0]?.thread_ids).toEqual(["thread-1"]);
});

test("thread detail forensics actions send selected ids", async ({ page }) => {
  const analyzeDeleteCalls: Array<Record<string, unknown>> = [];
  const cleanupDryRunCalls: Array<Record<string, unknown>> = [];
  await setupMockApi(page, {
    analyzeDeleteCalls,
    cleanupDryRunCalls,
    threadsRows: [
      {
        id: "thread-2",
        thread_id: "thread-2",
        title: "Forensics action test",
        risk_score: 28,
        is_pinned: false,
        source: "sessions",
      },
    ],
  });

  await page.goto("/");
  await openPrimaryView(page, "Threads");
  await expect(page.getByText("Forensics action test")).toBeVisible();
  await page.getByText("Forensics action test").first().click();

  const threadDetailPanel = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: threadDetailTitle }) });
  await expect(threadDetailPanel).toBeVisible();

  await threadDetailPanel
    .getByRole("button", { name: impactAnalysisLabel })
    .click();
  await expect.poll(() => analyzeDeleteCalls.length).toBe(1);
  expect(analyzeDeleteCalls[0]?.ids).toEqual(["thread-2"]);

  await threadDetailPanel
    .getByRole("button", { name: cleanupDryRunLabel })
    .click();
  await expect.poll(() => cleanupDryRunCalls.length).toBe(1);
  expect(cleanupDryRunCalls[0]?.ids).toEqual(["thread-2"]);
  expect(cleanupDryRunCalls[0]?.dry_run).toBe(true);
});

test("search groups results and routes into sessions and threads", async ({ page }) => {
  await setupMockApi(page, {
    searchResults: [
      {
        provider: "codex",
        session_id: "session-1",
        thread_id: "thread-search-1",
        display_title: "Fix token flow",
        file_path: "/tmp/codex/session-1.jsonl",
        mtime: "2026-03-05T07:00:00Z",
        match_kind: "message",
        snippet: "cleanup token failed once and then recovered",
        role: "user",
        source: "sessions",
      },
      {
        provider: "claude",
        session_id: "claude-session-9",
        display_title: "Claude notes",
        file_path: "/tmp/claude/claude-session-9.jsonl",
        mtime: "2026-03-05T07:05:00Z",
        match_kind: "title",
        snippet: "notes about refactor",
        role: "assistant",
        source: "transcripts",
      },
    ],
    threadsRows: [
      {
        id: "thread-search-1",
        thread_id: "thread-search-1",
        title: "Fix token flow",
        risk_score: 18,
        is_pinned: false,
        source: "sessions",
      },
    ],
  });

  await page.goto("/");
  await page.getByRole("button", { name: searchTabLabel }).first().click();
  await page.getByPlaceholder(searchPlaceholder).fill("token");
  await expect(page.locator(".search-result-list").getByText(codexSearchResultLabel).first()).toBeVisible();
  await expect(page.locator(".search-result-list").getByText(claudeSearchResultLabel).first()).toBeVisible();

  await page.getByRole("button", { name: openThreadLabel }).first().click();
  await expect(page.getByRole("heading", { name: threadDetailTitle })).toBeVisible();

  await page.getByRole("button", { name: searchTabLabel }).first().click();
  await page.getByPlaceholder(searchPlaceholder).fill("token");
  await page.getByRole("button", { name: openSessionLabel }).first().click();
  await expect(
    page
      .locator("section.panel")
      .filter({ has: page.getByRole("heading", { name: originalSessionsTitle }) })
      .last()
      .getByRole("heading", { name: originalSessionsTitle })
      .first(),
  ).toBeVisible();
});
