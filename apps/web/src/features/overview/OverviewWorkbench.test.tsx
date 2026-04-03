import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { AppContext, type AppContextValue } from "../../app/AppContext";
import { getMessages, type Locale } from "../../i18n";
import { OverviewWorkbench } from "./OverviewWorkbench";

function renderOverview(locale: Locale) {
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
});
