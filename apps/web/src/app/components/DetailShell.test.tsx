import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppContext, type AppContextValue } from "@/app/AppContext";
import { DetailShell } from "@/app/components/DetailShell";
import { getMessages } from "@/i18n/catalog";

function buildContext(overrides: Partial<AppContextValue> = {}): AppContextValue {
  const messages = getMessages("en");
  return {
    messages,
    locale: "en",
    setLocale: () => undefined,
    providersDiagnosticsOpen: false,
    setProvidersDiagnosticsOpen: () => undefined,
    setupGuideOpen: false,
    setSetupGuideOpen: () => undefined,
    headerSearchDraft: "",
    setHeaderSearchDraft: () => undefined,
    headerSearchSeed: "",
    setHeaderSearchSeed: () => undefined,
    searchThreadContext: null,
    setSearchThreadContext: () => undefined,
    providerProbeFilterIntent: null,
    setProviderProbeFilterIntent: () => undefined,
    acknowledgedForensicsErrorKeys: { analyze: "", cleanup: "" },
    setAcknowledgedForensicsErrorKeys: () => ({ analyze: "", cleanup: "" }),
    changeLayoutView: () => undefined,
    changeProviderView: () => undefined,
    openProvidersHome: () => undefined,
    showRuntimeBackendDegraded: false,
    emptySessionScopeLabel: "All Providers",
    analyzeErrorKey: "",
    cleanupErrorKey: "",
    runtimeBackend: undefined,
    threadSearchInputRef: { current: null },
    detailLayoutRef: { current: null },
    showDetails: true,
    showThreadDetail: true,
    showSessionDetail: true,
    showProviders: false,
    showForensics: false,
    selectedThread: null,
    selectedThreadId: "",
    setSelectedThreadId: () => undefined,
    selectedIds: [],
    visibleRows: [],
    filteredRows: [],
    recentThreadTitle: () => "",
    threadDetailLoading: false,
    selectedThreadDetail: null,
    threadTranscriptData: null,
    threadTranscriptLoading: false,
    threadTranscriptLimit: 40,
    setThreadTranscriptLimit: () => undefined,
    busy: false,
    bulkPin: () => undefined,
    bulkUnpin: () => undefined,
    bulkArchive: () => undefined,
    bulkUnarchive: () => undefined,
    analyzeDelete: () => undefined,
    cleanupDryRun: () => undefined,
    selectedSession: null,
    setSelectedSessionPath: () => undefined,
    visibleProviderSessionSummary: null,
    emptySessionNextTitle: "Next session",
    emptySessionNextPath: "/tmp/next.jsonl",
    sessionTranscriptData: null,
    sessionTranscriptLoading: false,
    sessionTranscriptLimit: 40,
    setSessionTranscriptLimit: () => undefined,
    canRunSelectedSessionAction: false,
    providerDeleteBackupEnabled: false,
    setProviderDeleteBackupEnabled: () => undefined,
    runSingleProviderAction: () => undefined,
    runSingleProviderHardDelete: () => undefined,
    rows: [],
    ...overrides,
  } as unknown as AppContextValue;
}

describe("DetailShell", () => {
  it("renders both lazy fallbacks when thread and session detail panes are active", () => {
    const html = renderToStaticMarkup(
      <AppContext.Provider
        value={buildContext({
          visibleProviderSessionSummary: { providers: 1, rows: 1, parse_ok: 1, parse_fail: 0 },
        })}
      >
        <DetailShell />
      </AppContext.Provider>,
    );

    expect(html).toContain('class="detail-layout"');
    expect(html).toContain("surface-slot-skeleton");
    expect(html).not.toContain("skeleton-line");
    expect(html).not.toContain("sub-toolbar");
  });

  it("returns nothing when details are hidden or forensics owns the side area", () => {
    const hiddenHtml = renderToStaticMarkup(
      <AppContext.Provider value={buildContext({ showDetails: false })}>
        <DetailShell />
      </AppContext.Provider>,
    );
    const forensicsHtml = renderToStaticMarkup(
      <AppContext.Provider value={buildContext({ showForensics: true })}>
        <DetailShell />
      </AppContext.Provider>,
    );

    expect(hiddenHtml).toBe("");
    expect(forensicsHtml).toBe("");
  });

  it("hides empty session detail when filtered session rows collapse to zero", () => {
    const html = renderToStaticMarkup(
      <AppContext.Provider
        value={buildContext({
          showThreadDetail: false,
          showProviders: true,
          selectedSession: null,
          visibleProviderSessionSummary: { providers: 0, rows: 0, parse_ok: 0, parse_fail: 0 },
        })}
      >
        <DetailShell />
      </AppContext.Provider>,
    );

    expect(html).not.toContain("Session Detail");
  });
});
