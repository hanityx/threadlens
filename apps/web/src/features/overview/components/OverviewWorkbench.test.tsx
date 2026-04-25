import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { AppContext, type AppContextValue } from "@/app/AppContext";
import type { Locale } from "@/i18n";
import { getMessages } from "@/i18n/catalog";
import { OverviewWorkbench } from "@/features/overview/components/OverviewWorkbench";
import { SETUP_COMMITTED_STORAGE_KEY, SETUP_PREFERRED_PROVIDER_STORAGE_KEY, SETUP_SELECTION_STORAGE_KEY } from "@/shared/lib/appState";
import type { ProviderSessionRow } from "@/shared/types";

function renderOverview(locale: Locale, overrides?: Partial<AppContextValue>) {
  const messages = getMessages(locale);
  const ctx = {
    setupGuideOpen: false,
    setSetupGuideOpen: vi.fn(),
    changeLayoutView: vi.fn(),
    changeProviderView: vi.fn(),
    openProvidersHome: vi.fn(),
    setProviderView: vi.fn(),
    handleProvidersIntent: vi.fn(),
    runtimeLatencyText: "42ms",
    runtimeStatusText: "local",
    focusSessionCommandId: "session-1",
    focusSessionStatus: "ready",
    visibleProviderSessionSummary: { rows: 0, parse_ok: 0, parse_fail: 0 },
    syncStatusText: "Synced just now",
    focusSessionTitle: "No session",
    focusSessionMeta: "No meta",
    overviewBooting: false,
    visibleProviderSummary: { active: 0 },
    searchRowsText: "0 rows",
    reviewRowsText: "0 review",
    recentSessionPreview: [],
    focusSession: null,
    focusReviewTitle: "No review",
    focusReviewMeta: "No review meta",
    focusReviewThread: null,
    secondaryFlaggedPreview: [],
    activeSummaryText: "active 0/0",
    activeProviderSummaryLine: "No active AI",
    parserScoreText: "0%",
    backupSetsCount: 0,
    recentThreadGroups: [],
    recentThreadTitle: () => "No thread",
    recentThreadSummary: () => "No summary",
    visibleProviders: [],
    providers: [],
    visibleDataSourceRows: [],
    dataSourceRows: [],
    visibleProviderSessionRows: [],
    allProviderSessionRows: [],
    visibleParserReports: [],
    allParserReports: [],
    providersRefreshing: false,
    providersLastRefreshAt: "",
    refreshProvidersData: vi.fn(),
    providerView: "all",
    visibleProviderIdSet: new Set<string>(),
    setSelectedSessionPath: vi.fn(),
    setSelectedThreadId: vi.fn(),
    setProviderProbeFilterIntent: vi.fn(),
    locale,
    setLocale: vi.fn(),
    messages,
    ...overrides,
  } as unknown as AppContextValue;

  const queryClient = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={ctx}>
        <OverviewWorkbench />
      </AppContext.Provider>
    </QueryClientProvider>,
  );
}

describe("OverviewWorkbench", () => {
  it("renders localized hero controls in English", () => {
    const html = renderOverview("en");
    expect(html).toContain("Review sessions. Clear backup queue.");
    expect(html).toContain("Setup");
    expect(html).toContain("Recent Activity");
    expect(html).toContain("Waiting for threads.");
  });

  it("keeps the review queue card semantic-safe while preserving direct actions", () => {
    const html = renderOverview("en", {
      focusReviewTitle: "Need review",
      focusReviewMeta: "sessions / medium",
      focusReviewThread: {
        thread_id: "thread-1",
        title: "Need review",
        source: "sessions",
        risk_score: 48,
        risk_level: "medium",
        is_pinned: false,
      },
      secondaryFlaggedPreview: [
        {
          thread_id: "thread-2",
          title: "Secondary review",
          source: "history",
          risk_score: 77,
          risk_level: "high",
          is_pinned: false,
        },
      ],
    } as Partial<AppContextValue>);

    expect(html).not.toContain("overview-insight-card is-review is-clickable");
    expect(html).toContain("overview-review-pill overview-review-pill-button");
    expect(html).toContain("overview-review-focus overview-review-focus-button");
  });

  it("renders localized hero controls in Spanish", () => {
    const messages = getMessages("es");
    const html = renderOverview("es");
    expect(html).toContain(messages.overview.heroBody);
    expect(html).toContain("Setup");
    expect(html).toContain("Thread");
    expect(html).toContain("Sessions");
    expect(html).toContain(messages.overview.recentActivity);
    expect(html).toContain(messages.overview.waitingThreads);
    expect(html).toContain(messages.overview.activeSession);
    expect(html).toContain(messages.overview.noRecentSessions);
    expect(html).toContain(messages.overview.reviewQueue);
  });

  it("keeps workbench breadcrumb IA copy in English for Portuguese", () => {
    const html = renderOverview("pt-BR");
    expect(html).toContain(">sessions<");
    expect(html).toContain(">active<");
  });

  it("renders localized hero controls in Russian with mixed-mode nouns", () => {
    const messages = getMessages("ru");
    const html = renderOverview("ru");
    expect(html).toContain(messages.overview.heroBody);
    expect(html).toContain("Setup");
    expect(html).toContain("Thread");
    expect(html).toContain("Sessions");
    expect(html).toContain(messages.overview.recentActivity);
    expect(html).toContain(messages.overview.waitingThreads);
  });

  it("renders localized hero controls in Japanese with mixed-mode nouns", () => {
    const messages = getMessages("ja");
    const html = renderOverview("ja");
    expect(html).toContain(messages.overview.heroBody);
    expect(html).toContain("Setup");
    expect(html).toContain("Thread");
    expect(html).toContain("Sessions");
    expect(html).toContain(messages.overview.recentActivity);
    expect(html).toContain(messages.overview.waitingThreads);
  });

  it("renders localized hero controls in Simplified Chinese with mixed-mode nouns", () => {
    const messages = getMessages("zh-CN");
    const html = renderOverview("zh-CN");
    expect(html).toContain(messages.overview.heroBody);
    expect(html).toContain("Setup");
    expect(html).toContain("Thread");
    expect(html).toContain("Sessions");
    expect(html).toContain(messages.overview.recentActivity);
    expect(html).toContain(messages.overview.waitingThreads);
  });

  it("keeps overview status glossary in English for Portuguese", () => {
    const html = renderOverview("pt-BR");
    expect(html).toContain("ready");
    expect(html).toContain("fail");
    expect(html).not.toContain("preparardy");
    expect(html).not.toContain("falharil");
  });

  it("renders immediate recent-session dot status copy in the markup", () => {
    const row: ProviderSessionRow = {
      provider: "codex",
      source: "session",
      session_id: "session-1",
      display_title: "Recent session",
      file_path: "/tmp/recent.jsonl",
      size_bytes: 42 * 1024 * 1024,
      mtime: new Date().toISOString(),
      probe: {
        ok: true,
        format: "jsonl",
        error: null,
        detected_title: "Recent session",
        title_source: "detected",
      },
    };
    const messages = getMessages("ko");
    const html = renderOverview("ko", {
      providerView: "codex",
      recentSessionPreview: [row],
      visibleProviderSessionRows: [row],
      allProviderSessionRows: [row],
      providers: [
        {
          provider: "codex",
          name: "Codex",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
        },
      ],
      visibleProviders: [
        {
          provider: "codex",
          name: "Codex",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
        },
      ],
    } as Partial<AppContextValue>);
    expect(html).toContain("overview-side-item-dot-tooltip");
    expect(html).toContain(messages.overview.dotReadableSession);
    expect(html).toContain(messages.overview.dotFreshLast24Hours);
    expect(html).toContain("세션 크기 큼 42MB");
  });

  it("renders recent-thread dot tooltips in the markup", () => {
    const messages = getMessages("ko");
    const html = renderOverview("ko", {
      recentThreadGroups: [
        {
          label: messages.overview.today,
          rows: [
            {
              thread_id: "thread-1",
              title: "크몽 사진스레드",
              source: "sessions",
              risk_level: "high",
              risk_score: 54,
              is_pinned: true,
              activity_status: "active",
              timestamp: new Date().toISOString(),
            },
          ],
        },
      ],
    } as Partial<AppContextValue>);
    expect(html).toContain("overview-side-item-dot-tooltip");
    expect(html).toContain(messages.overview.dotThreadRiskHigh);
    expect(html).toContain(messages.overview.dotThreadPinned);
    expect(html).toContain(messages.overview.dotThreadActive);
  });

  it("ignores stale setup selection when no saved preferred provider exists", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem(key: string) {
            if (key === SETUP_SELECTION_STORAGE_KEY) return JSON.stringify(["claude"]);
            if (key === SETUP_PREFERRED_PROVIDER_STORAGE_KEY) return null;
            return null;
          },
        },
      },
    });

    const html = renderOverview("en", {
      providerView: "all",
      providers: [
        {
          provider: "codex",
          name: "Codex",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
          evidence: { session_log_count: 3 },
        },
        {
          provider: "claude",
          name: "Claude",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
          evidence: { session_log_count: 4 },
        },
      ] as Partial<AppContextValue["providers"]>,
      visibleProviders: [
        {
          provider: "codex",
          name: "Codex",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
          evidence: { session_log_count: 3 },
        },
        {
          provider: "claude",
          name: "Claude",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
          evidence: { session_log_count: 4 },
        },
      ] as Partial<AppContextValue["visibleProviders"]>,
      visibleProviderIdSet: new Set(["codex", "claude"]),
      activeSummaryText: "active 2/2",
      activeProviderSummaryLine: "Codex · Claude",
    } as Partial<AppContextValue>);

    expect(html).toContain("active 2/2");
    expect(html).toContain("Codex · Claude");
  });

  it("restores committed setup selection from the canonical payload when legacy keys are missing", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem(key: string) {
            if (key === SETUP_COMMITTED_STORAGE_KEY) {
              return JSON.stringify({
                selectedProviderIds: ["claude"],
                preferredProviderId: "claude",
                providerView: "claude",
                searchProvider: "claude",
              });
            }
            return null;
          },
        },
      },
    });

    const html = renderOverview("en", {
      providerView: "all",
      providers: [
        {
          provider: "codex",
          name: "Codex",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
          evidence: { session_log_count: 3 },
        },
        {
          provider: "claude",
          name: "Claude",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
          evidence: { session_log_count: 4 },
        },
      ] as Partial<AppContextValue["providers"]>,
      visibleProviders: [
        {
          provider: "codex",
          name: "Codex",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
          evidence: { session_log_count: 3 },
        },
        {
          provider: "claude",
          name: "Claude",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
          evidence: { session_log_count: 4 },
        },
      ] as Partial<AppContextValue["visibleProviders"]>,
      visibleProviderIdSet: new Set(["codex", "claude"]),
      activeSummaryText: "active 1/1",
      activeProviderSummaryLine: "Claude",
    } as Partial<AppContextValue>);

    expect(html).toContain("active 1/1");
    expect(html).toContain(">Claude<");
  });

  it("matches setup-style provider bytes for committed overview selection", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem(key: string) {
            if (key === SETUP_COMMITTED_STORAGE_KEY) {
              return JSON.stringify({
                selectedProviderIds: ["claude"],
                preferredProviderId: "claude",
                providerView: "claude",
                searchProvider: "claude",
              });
            }
            return null;
          },
        },
      },
    });

    const codexRow: ProviderSessionRow = {
      provider: "codex",
      source: "sessions",
      session_id: "codex-session",
      display_title: "Codex session",
      file_path: "/tmp/codex.jsonl",
      size_bytes: 50 * 1024 * 1024,
      mtime: "2026-04-22T10:00:00.000Z",
      probe: {
        ok: true,
        format: "jsonl",
        error: null,
        detected_title: "Codex session",
        title_source: "detected",
      },
    };
    const claudeRow: ProviderSessionRow = {
      provider: "claude",
      source: "projects",
      session_id: "claude-session",
      display_title: "Claude session",
      file_path: "/tmp/claude.jsonl",
      size_bytes: Math.round(1.2 * 1024 * 1024),
      mtime: "2026-04-23T10:00:00.000Z",
      probe: {
        ok: true,
        format: "jsonl",
        error: null,
        detected_title: "Claude session",
        title_source: "detected",
      },
    };

    const html = renderOverview("en", {
      providerView: "all",
      providers: [
        {
          provider: "codex",
          name: "Codex",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
          evidence: { session_log_count: 3 },
        },
        {
          provider: "claude",
          name: "Claude",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
          evidence: { session_log_count: 4 },
        },
      ] as Partial<AppContextValue["providers"]>,
      visibleProviders: [
        {
          provider: "codex",
          name: "Codex",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
        },
        {
          provider: "claude",
          name: "Claude",
          status: "active",
          capability_level: "full",
          capabilities: {
            read_sessions: true,
            analyze_context: true,
            safe_cleanup: true,
            hard_delete: true,
          },
        },
      ] as Partial<AppContextValue["visibleProviders"]>,
      visibleProviderIdSet: new Set(["codex", "claude"]),
      dataSourceRows: [
        { source_key: "history", present: true, total_bytes: 50 * 1024 * 1024 },
        { source_key: "claude_projects", present: true, total_bytes: Math.round(0.7 * 1024 * 1024) },
        { source_key: "claude_transcript_store", present: true, total_bytes: Math.round(0.3 * 1024 * 1024) },
      ] as Partial<AppContextValue["dataSourceRows"]>,
      visibleDataSourceRows: [
        { source_key: "history", present: true, total_bytes: 50 * 1024 * 1024 },
        { source_key: "claude_projects", present: true, total_bytes: Math.round(0.7 * 1024 * 1024) },
        { source_key: "claude_transcript_store", present: true, total_bytes: Math.round(0.3 * 1024 * 1024) },
      ] as Partial<AppContextValue["visibleDataSourceRows"]>,
      allProviderSessionProviders: [
        { provider: "codex", total_bytes: 50 * 1024 * 1024 },
        { provider: "claude", total_bytes: Math.round(1.7 * 1024 * 1024) },
      ] as Partial<AppContextValue["allProviderSessionProviders"]>,
      visibleProviderSessionRows: [codexRow, claudeRow],
      allProviderSessionRows: [codexRow, claudeRow],
      activeSummaryText: "active 2/2",
      activeProviderSummaryLine: "Codex · Claude",
    } as Partial<AppContextValue>);

    expect(html).toContain(">1.7 MB<");
    expect(html).toContain("Claude session");
    expect(html).not.toContain("Codex session");
    expect(html).not.toContain(">50 MB<");
  });
});
