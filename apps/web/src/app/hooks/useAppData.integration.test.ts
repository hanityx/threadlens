import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderSessionRow, ThreadRow } from "@/shared/types";

const mockUsePreferences = vi.fn();
const mockUseThreadsData = vi.fn();
const mockUseProvidersData = vi.fn();
const mockUseDetailData = vi.fn();
const mockUseMutations = vi.fn();

vi.mock("@/shared/hooks/usePreferences", () => ({
  usePreferences: () => mockUsePreferences(),
}));

vi.mock("@/features/threads/hooks/useThreadsData", () => ({
  useThreadsData: (...args: unknown[]) => mockUseThreadsData(...args),
}));

vi.mock("@/features/providers/hooks/useProvidersData", () => ({
  useProvidersData: (...args: unknown[]) => mockUseProvidersData(...args),
}));

vi.mock("@/app/hooks/useDetailData", () => ({
  useDetailData: (...args: unknown[]) => mockUseDetailData(...args),
}));

vi.mock("@/app/hooks/useMutations", () => ({
  useMutations: (...args: unknown[]) => mockUseMutations(...args),
}));

import { useAppData } from "@/app/hooks/useAppData";

function makeThreadRow(id: string): ThreadRow {
  return {
    thread_id: id,
    title: `Thread ${id}`,
    risk_score: 80,
    is_pinned: false,
    source: "codex",
  };
}

function makeSession(filePath: string, provider = "codex"): ProviderSessionRow {
  return {
    provider,
    source: "sessions",
    session_id: `session-${filePath}`,
    display_title: `Session ${filePath}`,
    file_path: filePath,
    size_bytes: 1024,
    mtime: "2026-04-20T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: `Session ${filePath}`,
      title_source: "header",
    },
  };
}

function makePreferences(overrides: Record<string, unknown> = {}) {
  return {
    theme: "dark",
    setTheme: vi.fn(),
    density: "comfortable",
    setDensity: vi.fn(),
    layoutView: "providers",
    setLayoutView: vi.fn(),
    providerView: "codex",
    setProviderView: vi.fn(),
    providerDataDepth: "balanced",
    setProviderDataDepth: vi.fn(),
    slowProviderThresholdMs: 1200,
    setSlowProviderThresholdMs: vi.fn(),
    ...overrides,
  };
}

function makeThreadsData(overrides: Record<string, unknown> = {}) {
  const rows = [makeThreadRow("thread-1"), makeThreadRow("thread-2")];
  const threads = { refetch: vi.fn().mockResolvedValue("threads-refetched") };
  return {
    query: "",
    setQuery: vi.fn(),
    filterMode: "all",
    setFilterMode: vi.fn(),
    selected: { "thread-1": true },
    setSelected: vi.fn(),
    selectedThreadId: "thread-1",
    setSelectedThreadId: vi.fn(),
    threads,
    deferredQuery: "",
    rows,
    filteredRows: rows,
    visibleRows: rows,
    selectedIds: ["thread-1"],
    allFilteredSelected: false,
    pinnedCount: 0,
    highRiskCount: 1,
    threadsLoading: false,
    threadsFastBooting: false,
    threadsFetchMs: 24,
    toggleSelectAllFiltered: vi.fn(),
    ...overrides,
  };
}

function makeProvidersData(overrides: Record<string, unknown> = {}) {
  const providerSessionRows = [makeSession("/tmp/codex-session.jsonl", "codex")];
  const allProviderSessionRows = [
    ...providerSessionRows,
    makeSession("/tmp/claude-session.jsonl", "claude"),
  ];
  return {
    selectedProviderFiles: { "/tmp/codex-session.jsonl": true },
    setSelectedProviderFiles: vi.fn(),
    selectedSessionPath: "/tmp/codex-session.jsonl",
    setSelectedSessionPath: vi.fn(),
    providers: [
      { provider: "codex", capabilities: { safe_cleanup: true } },
      { provider: "claude", capabilities: { safe_cleanup: false } },
    ],
    providerSummary: { total: 2, active: 1, detected: 1 },
    providerTabs: [{ id: "all" }, { id: "codex" }, { id: "claude" }],
    providerSessionRows,
    allProviderSessionRows,
    slowProviderIds: ["claude"],
    providerSessionSummary: { providers: 2, rows: 2, parse_ok: 1, parse_fail: 1 },
    providerSessionsLimit: 60,
    providerRowsSampled: false,
    dataSourceRows: [{ source_key: "codex:history" }],
    allProviderRowsSelected: false,
    selectedProviderLabel: "Codex",
    selectedProviderFilePaths: ["/tmp/codex-session.jsonl"],
    providerActionProvider: "codex",
    canRunProviderAction: true,
    providerActionData: null,
    allParserReports: [],
    parserReports: [],
    parserSummary: { providers: 0, scanned: 0, parse_ok: 0, parse_fail: 0, parse_score: null },
    readOnlyProviders: [],
    cleanupReadyProviders: ["codex"],
    dataSources: { data: { sources: {} } },
    providerMatrix: { data: { data: { providers: [] } } },
    providerSessions: { data: { data: { rows: providerSessionRows } } },
    providerParserHealth: { data: { data: { reports: [] } } },
    executionGraph: { refetch: vi.fn().mockResolvedValue("graph-refetched") },
    executionGraphData: null,
    dataSourcesLoading: false,
    providerMatrixLoading: false,
    providerSessionsLoading: false,
    parserLoading: false,
    executionGraphLoading: false,
    providersRefreshing: false,
    globalRefreshPending: false,
    setGlobalRefreshPending: vi.fn(),
    providersLastRefreshAt: "2026-04-20T10:00:00.000Z",
    providerFetchMetrics: { data_sources: 20, matrix: 30, sessions: 40, parser: 50 },
    prefetchProvidersData: vi.fn(),
    prefetchRoutingData: vi.fn(),
    refreshProvidersData: vi.fn().mockResolvedValue("providers-refreshed"),
    toggleSelectAllProviderRows: vi.fn(),
    ...overrides,
  };
}

function makeDetailData(overrides: Record<string, unknown> = {}) {
  return {
    threadDetailLoading: false,
    selectedThreadDetail: { thread_id: "thread-1", findings: [] },
    threadTranscriptData: { lines: [] },
    threadTranscriptLoading: false,
    threadTranscriptLimit: 250,
    setThreadTranscriptLimit: vi.fn(),
    sessionTranscriptData: { lines: [] },
    sessionTranscriptLoading: false,
    sessionTranscriptLimit: 40,
    setSessionTranscriptLimit: vi.fn(),
    canRunSelectedSessionAction: true,
    ...overrides,
  };
}

function makeMutations(overrides: Record<string, unknown> = {}) {
  return {
    runtime: { refetch: vi.fn().mockResolvedValue("runtime-refetched") },
    smokeStatus: { refetch: vi.fn().mockResolvedValue("smoke-refetched") },
    recovery: { refetch: vi.fn().mockResolvedValue("recovery-refetched") },
    runtimeLoading: false,
    smokeStatusLoading: false,
    recoveryLoading: false,
    analysisRaw: null,
    cleanupRaw: null,
    analysisData: { reports: [{ id: "thread-1" }, { id: "thread-x" }] },
    cleanupData: null,
    pendingCleanup: null,
    smokeStatusLatest: null,
    bulkPin: {},
    bulkUnpin: {},
    bulkArchive: {},
    bulkUnarchive: {},
    analyzeDelete: {},
    cleanupDryRun: {},
    cleanupExecute: {},
    analyzeDeleteError: false,
    cleanupDryRunError: false,
    cleanupExecuteError: false,
    analyzeDeleteErrorMessage: "",
    cleanupDryRunErrorMessage: "",
    cleanupExecuteErrorMessage: "",
    bulkActionError: false,
    bulkActionErrorMessage: "",
    providerSessionActionError: false,
    providerSessionActionErrorMessage: "",
    busy: false,
    runProviderAction: vi.fn(),
    runProviderHardDelete: vi.fn(),
    runSingleProviderAction: vi.fn(),
    runSingleProviderHardDelete: vi.fn(),
    runRecoveryBackupExport: vi.fn(),
    recoveryBackupExportRaw: null,
    recoveryBackupExportData: null,
    recoveryBackupExportError: false,
    recoveryBackupExportErrorMessage: "",
    providerActionData: null,
    providerActionSelection: null,
    providerDeleteBackupEnabled: true,
    setProviderDeleteBackupEnabled: vi.fn(),
    ...overrides,
  };
}

function renderHookResult() {
  let latest: ReturnType<typeof useAppData> | undefined;

  function Harness() {
    latest = useAppData({ providersDiagnosticsOpen: true });
    return createElement("div", null, "hook");
  }

  renderToStaticMarkup(createElement(Harness));
  return latest as ReturnType<typeof useAppData>;
}

describe("useAppData integration", () => {
  beforeEach(() => {
    mockUsePreferences.mockReset();
    mockUseThreadsData.mockReset();
    mockUseProvidersData.mockReset();
    mockUseDetailData.mockReset();
    mockUseMutations.mockReset();

    mockUsePreferences.mockReturnValue(makePreferences());
    mockUseThreadsData.mockReturnValue(makeThreadsData());
    mockUseProvidersData.mockReturnValue(makeProvidersData());
    mockUseDetailData.mockReturnValue(makeDetailData());
    mockUseMutations.mockReturnValue(makeMutations());
  });

  it("composes selected entities, derived flags, and selected impact rows from domain hooks", () => {
    const result = renderHookResult();

    expect(result.selectedThread?.thread_id).toBe("thread-1");
    expect(result.selectedSession?.file_path).toBe("/tmp/codex-session.jsonl");
    expect(result.selectedImpactRows).toEqual([{ id: "thread-1" }]);
    expect(result.showProviders).toBe(true);
    expect(result.showThreadsTable).toBe(false);
    expect(result.showForensics).toBe(false);
    expect(result.showRouting).toBe(true);
    expect(result.showDetails).toBe(true);
    expect(result.canRunSelectedSessionAction).toBe(true);
  });

  it("passes a fallback selected session into detail data when the routed provider row is missing", () => {
    mockUsePreferences.mockReturnValue(
      makePreferences({ layoutView: "providers", providerView: "gemini" }),
    );
    mockUseProvidersData.mockReturnValue(
      makeProvidersData({
        providerSessionRows: [],
        selectedSessionPath: "/Users/example/.gemini/tmp/react-spectrum/chats/session-123.json",
      }),
    );

    const result = renderHookResult();
    const detailArgs = mockUseDetailData.mock.calls.at(-1)?.[0] as {
      selectedSession: ProviderSessionRow | null;
    };

    expect(result.selectedSession?.provider).toBe("gemini");
    expect(result.selectedSession?.source).toBe("search_result");
    expect(result.selectedSession?.file_path).toBe(
      "/Users/example/.gemini/tmp/react-spectrum/chats/session-123.json",
    );
    expect(detailArgs.selectedSession).toMatchObject({
      provider: "gemini",
      source: "search_result",
      file_path: "/Users/example/.gemini/tmp/react-spectrum/chats/session-123.json",
    });
  });

  it("refreshes runtime domains and provider data for providers layout", async () => {
    const threads = { refetch: vi.fn().mockResolvedValue("threads-refetched") };
    const runtime = { refetch: vi.fn().mockResolvedValue("runtime-refetched") };
    const smokeStatus = { refetch: vi.fn().mockResolvedValue("smoke-refetched") };
    const recovery = { refetch: vi.fn().mockResolvedValue("recovery-refetched") };
    const executionGraph = { refetch: vi.fn().mockResolvedValue("graph-refetched") };
    const refreshProvidersData = vi.fn().mockResolvedValue("providers-refreshed");
    const setGlobalRefreshPending = vi.fn();

    mockUseThreadsData.mockReturnValue(makeThreadsData({ threads }));
    mockUseProvidersData.mockReturnValue(
      makeProvidersData({ executionGraph, refreshProvidersData, setGlobalRefreshPending }),
    );
    mockUseMutations.mockReturnValue(makeMutations({ runtime, smokeStatus, recovery }));

    const result = renderHookResult();
    await result.refreshAllData();

    expect(setGlobalRefreshPending).toHaveBeenNthCalledWith(1, true);
    expect(runtime.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(threads.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(smokeStatus.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(recovery.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(executionGraph.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(refreshProvidersData).toHaveBeenCalledTimes(1);
    expect(setGlobalRefreshPending).toHaveBeenLastCalledWith(false);
  });

  it("skips provider refresh follow-up for threads layout while preserving thread surface flags", async () => {
    const refreshProvidersData = vi.fn().mockResolvedValue("providers-refreshed");
    const setGlobalRefreshPending = vi.fn();

    mockUsePreferences.mockReturnValue(makePreferences({ layoutView: "threads", providerView: "all" }));
    mockUseProvidersData.mockReturnValue(
      makeProvidersData({ refreshProvidersData, setGlobalRefreshPending }),
    );

    const result = renderHookResult();
    await result.refreshAllData();

    expect(result.showProviders).toBe(false);
    expect(result.showThreadsTable).toBe(true);
    expect(result.showForensics).toBe(true);
    expect(result.showRouting).toBe(false);
    expect(result.showDetails).toBe(true);
    expect(refreshProvidersData).not.toHaveBeenCalled();
    expect(setGlobalRefreshPending).toHaveBeenNthCalledWith(1, true);
    expect(setGlobalRefreshPending).toHaveBeenLastCalledWith(false);
  });
});
