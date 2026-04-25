import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateCheckStatus } from "@threadlens/shared-contracts";
import {
  resolveEmptySessionScopeLabel,
  resolveForensicsErrorKey,
  resolveRecoveryBackupSetCount,
  resolveRuntimeBackendDegraded,
  resolveShowUpdateBanner,
  useAppController,
} from "@/app/hooks/useAppController";
import type { AppContextValue } from "@/app/AppContext";
import {
  PROVIDER_VIEW_STORAGE_KEY,
  SETUP_COMMITTED_STORAGE_KEY,
  SETUP_PREFERRED_PROVIDER_STORAGE_KEY,
} from "@/shared/lib/appState";

const CLAUDE_SENTINEL_PATH =
  "/__threadlens_fixture__/.claude/projects/-fixture-threadlens/b8792a1a-7606-4247-abec-819b25dddf65.jsonl";

const mockUseQuery = vi.fn();
const mockUseLocale = vi.fn();
const mockUseAppShellModel = vi.fn();
const mockUseAppShellBehavior = vi.fn();
const mockReadStorageValue = vi.fn();
const mockApiGet = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("@/i18n", () => ({
  useLocale: () => mockUseLocale(),
}));

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

vi.mock("@/app/model/appShellModel", () => ({
  useAppShellModel: (...args: unknown[]) => mockUseAppShellModel(...args),
}));

vi.mock("@/app/model/appShellBehavior", async () => {
  const actual = await vi.importActual<typeof import("@/app/model/appShellBehavior")>(
    "@/app/model/appShellBehavior",
  );
  return {
    ...actual,
    useAppShellBehavior: (...args: unknown[]) => mockUseAppShellBehavior(...args),
  };
});

vi.mock("@/features/providers/components/ProvidersPanel", () => ({
  ProvidersPanel: () => null,
}));

vi.mock("@/features/providers/session/SessionDetail", () => ({
  SessionDetail: () => null,
}));

vi.mock("@/shared/lib/appState", async () => {
  const actual = await vi.importActual<typeof import("@/shared/lib/appState")>(
    "@/shared/lib/appState",
  );
  return {
    ...actual,
    readStorageValue: (...args: unknown[]) => mockReadStorageValue(...args),
  };
});

function makeUpdateCheckStatus(
  overrides: Partial<UpdateCheckStatus>,
): UpdateCheckStatus {
  return {
    source: "github-releases",
    status: "available",
    checked_at: "2026-04-20T00:00:00.000Z",
    current_version: "0.2.2",
    latest_version: "0.3.0",
    release_title: "ThreadLens 0.3.0",
    release_summary: "summary",
    has_update: true,
    release_url: "https://example.com/release",
    error: null,
    ...overrides,
  };
}

function makeAppData(overrides: Record<string, unknown> = {}) {
  return {
    layoutView: "overview",
    setLayoutView: vi.fn(),
    providerView: "all",
    setProviderView: vi.fn(),
    selectedThreadId: "",
    setSelectedThreadId: vi.fn(),
    selectedSessionPath: "",
    setSelectedSessionPath: vi.fn(),
    selectedProviderFiles: {},
    providerTabs: [{ id: "all" }, { id: "claude" }],
    providers: [],
    slowProviderIds: [],
    providerSessionRows: [],
    allProviderSessionRows: [],
    parserReports: [],
    allParserReports: [],
    dataSourceRows: [],
    highRiskCount: 0,
    visibleRows: [],
    selectedProviderLabel: "Claude",
    runtime: {
      isError: false,
      data: { data: { runtime_backend: { reachable: true, latency_ms: 120 } } },
    },
    smokeStatus: { isError: false },
    recovery: { isError: false, data: { summary: { backup_sets: 0 } } },
    providerMatrix: { isError: false },
    providerSessions: { isError: false },
    providerParserHealth: { isError: false },
    analyzeDeleteError: false,
    cleanupDryRunError: false,
    analyzeDeleteErrorMessage: "",
    cleanupDryRunErrorMessage: "",
    bulkActionError: false,
    providerSessionActionError: false,
    providerSessionActionErrorMessage: "",
    bulkActionErrorMessage: "",
    runtimeLoading: false,
    recoveryLoading: false,
    threadsLoading: false,
    dataSourcesLoading: false,
    providerMatrixLoading: false,
    providerSessionsLoading: false,
    parserLoading: false,
    threadsFastBooting: false,
    providersRefreshing: false,
    refreshingAllData: false,
    providersLastRefreshAt: "",
    prefetchProvidersData: vi.fn(),
    prefetchRoutingData: vi.fn(),
    theme: "system",
    setTheme: vi.fn(),
    refreshAllData: vi.fn(),
    busy: false,
    ...overrides,
  };
}

function makeShellState(overrides: Record<string, unknown> = {}) {
  return {
    panelChunkWarmupStartedRef: { current: false },
    desktopRouteAppliedRef: { current: false },
    desktopRouteHydratingRef: { current: false },
    desktopRouteRef: {
      current: { view: "", provider: "", sessionId: "", filePath: "", threadId: "" },
    },
    threadSearchInputRef: { current: null },
    detailLayoutRef: { current: null },
    searchThreadContext: null,
    setSearchThreadContext: vi.fn(),
    providerProbeFilterIntent: null,
    setProviderProbeFilterIntent: vi.fn(),
    setupGuideOpen: false,
    setSetupGuideOpen: vi.fn(),
    dismissedUpdateVersion: "",
    setDismissedUpdateVersion: vi.fn(),
    headerSearchDraft: "",
    setHeaderSearchDraft: vi.fn(),
    headerSearchSeed: "",
    setHeaderSearchSeed: vi.fn(),
    acknowledgedForensicsErrorKeys: { analyze: "", cleanup: "" },
    setAcknowledgedForensicsErrorKeys: vi.fn(),
    changeLayoutView: vi.fn(),
    changeProviderView: vi.fn(),
    ...overrides,
  };
}

function makeShellModel(overrides: Record<string, unknown> = {}) {
  return {
    visibleProviderTabs: [{ id: "all" }, { id: "claude" }],
    visibleProviderIds: ["all", "claude"],
    visibleProviderIdSet: new Set(["all", "claude"]),
    visibleProviders: [],
    visibleProviderSummary: "",
    visibleSlowProviderIds: [],
    visibleProviderSessionRows: [],
    allVisibleProviderSessionRows: [],
    visibleProviderSessionSummary: "",
    overviewBooting: false,
    activeSummaryText: "",
    searchRowsText: "",
    reviewRowsText: "",
    syncStatusText: "Synced",
    recentSessionPreview: [],
    focusSession: null,
    focusSessionTitle: "",
    focusSessionMeta: "",
    focusSessionCommandId: "",
    focusSessionStatus: "",
    emptySessionNextTitle: "",
    emptySessionNextPath: "",
    visibleParserReports: [],
    allVisibleParserReports: [],
    visibleParserSummary: "",
    focusReviewThread: null,
    focusReviewTitle: "",
    focusReviewMeta: "",
    secondaryFlaggedPreview: [],
    recentThreadGroups: [],
    recentThreadTitle: "",
    recentThreadSummary: "",
    activeProviderSummaryLine: "",
    visibleDataSourceRows: [],
    visibleAllProviderRowsSelected: false,
    searchProviderOptions: [],
    showSearch: true,
    showProviders: true,
    showThreadsTable: true,
    showForensics: false,
    showRouting: false,
    showThreadDetail: false,
    showSessionDetail: false,
    showDetails: false,
    showGlobalAnalyzeDeleteError: false,
    showGlobalCleanupDryRunError: false,
    hasGlobalErrorStack: false,
    parserScoreText: "",
    runtimeLatencyText: "",
    runtimeStatusText: "",
    backupSetsCount: 0,
    ...overrides,
  };
}

function renderController(options: {
  appData?: Record<string, unknown>;
  shellState?: Record<string, unknown>;
}) {
  let latest:
    | ReturnType<typeof useAppController>
    | undefined;

  function Harness() {
    latest = useAppController({
      appData: makeAppData(options.appData) as never,
      shellState: makeShellState(options.shellState) as never,
      providersDiagnosticsOpen: false,
      setProvidersDiagnosticsOpen: vi.fn(),
    });
    return createElement("div", null, "hook");
  }

  renderToStaticMarkup(createElement(Harness));
  return latest as ReturnType<typeof useAppController>;
}

describe("useAppController helpers", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseLocale.mockReset();
    mockUseAppShellModel.mockReset();
    mockUseAppShellBehavior.mockReset();
    mockReadStorageValue.mockReset();
    mockApiGet.mockReset();

    mockUseQuery.mockReturnValue({
      data: { data: makeUpdateCheckStatus({ has_update: false, latest_version: "0.2.2" }) },
    });
    mockUseLocale.mockReturnValue({
      locale: "en",
      setLocale: vi.fn(),
      messages: { common: { allAi: "All AI" }, nav: { providers: "Sessions" } },
    });
    mockUseAppShellModel.mockReturnValue(makeShellModel());
    mockUseAppShellBehavior.mockReturnValue({
      handleProvidersIntent: vi.fn(),
      handleSearchIntent: vi.fn(),
      handleDiagnosticsIntent: vi.fn(),
      handleHeaderSearchSubmit: vi.fn(),
    });
    mockApiGet.mockResolvedValue({ rows: [] });
    mockReadStorageValue.mockImplementation((keys: string[]) => {
      if (keys.includes(SETUP_PREFERRED_PROVIDER_STORAGE_KEY)) return null;
      if (keys.includes(PROVIDER_VIEW_STORAGE_KEY)) return null;
      return null;
    });
  });

  describe("resolveShowUpdateBanner", () => {
    it("shows banner only when update exists and is not dismissed", () => {
      expect(
        resolveShowUpdateBanner(
          makeUpdateCheckStatus({ has_update: true, latest_version: "0.3.0" }),
          "0.2.0",
        ),
      ).toBe(true);
      expect(
        resolveShowUpdateBanner(
          makeUpdateCheckStatus({ has_update: true, latest_version: "0.3.0" }),
          "0.3.0",
        ),
      ).toBe(false);
      expect(
        resolveShowUpdateBanner(
          makeUpdateCheckStatus({ has_update: false, latest_version: "0.3.0" }),
          "",
        ),
      ).toBe(false);
    });
  });

  describe("resolveRuntimeBackendDegraded", () => {
    it("marks runtime as degraded on explicit error or unreachable backend", () => {
      expect(
        resolveRuntimeBackendDegraded({
          runtimeError: true,
          runtimeLoading: false,
          runtimeBackendReachable: true,
        }),
      ).toBe(true);
      expect(
        resolveRuntimeBackendDegraded({
          runtimeError: false,
          runtimeLoading: false,
          runtimeBackendReachable: false,
        }),
      ).toBe(true);
      expect(
        resolveRuntimeBackendDegraded({
          runtimeError: false,
          runtimeLoading: true,
          runtimeBackendReachable: false,
        }),
      ).toBe(false);
    });
  });

  describe("resolveRecoveryBackupSetCount", () => {
    it("uses the live recovery backup inventory when summary is absent", () => {
      expect(
        resolveRecoveryBackupSetCount({
          backup_total: 20,
          backup_sets: [{ backup_id: "set-1" } as never],
        }),
      ).toBe(20);
      expect(
        resolveRecoveryBackupSetCount({
          backup_sets: [{ backup_id: "set-1" } as never, { backup_id: "set-2" } as never],
        }),
      ).toBe(2);
      expect(
        resolveRecoveryBackupSetCount({
          summary: { backup_sets: 3, checklist_done: 0, checklist_total: 0 },
          backup_total: 20,
        }),
      ).toBe(3);
    });
  });

  describe("resolveForensicsErrorKey", () => {
    it("returns stable keys with unknown fallback only when error exists", () => {
      expect(resolveForensicsErrorKey("analyze", true, "boom")).toBe("analyze:boom");
      expect(resolveForensicsErrorKey("cleanup", true, "")).toBe("cleanup:unknown");
      expect(resolveForensicsErrorKey("analyze", false, "ignored")).toBe("");
    });
  });

  describe("resolveEmptySessionScopeLabel", () => {
    it("prefers all-ai label, then selected provider label, then raw provider id", () => {
      expect(resolveEmptySessionScopeLabel("all", "Claude", "All AI")).toBe("All AI");
      expect(resolveEmptySessionScopeLabel("claude", "Claude", "All AI")).toBe("Claude");
      expect(resolveEmptySessionScopeLabel("codex", null, "All AI")).toBe("codex");
    });
  });

  describe("hook integration", () => {
    it("opens providers home with the committed setup provider even when dedicated keys are stale", () => {
      const prefetchProvidersData = vi.fn();
      const changeProviderView = vi.fn();
      const changeLayoutView = vi.fn();
      const setSelectedSessionPath = vi.fn();

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

      mockReadStorageValue.mockImplementation((keys: string[]) => {
        if (keys.includes(PROVIDER_VIEW_STORAGE_KEY)) return "codex";
        if (keys.includes(SETUP_PREFERRED_PROVIDER_STORAGE_KEY)) return "codex";
        return null;
      });
      mockUseAppShellModel.mockReturnValue(
        makeShellModel({
          visibleProviderIdSet: new Set(["all", "claude"]),
          visibleProviderTabs: [{ id: "all" }, { id: "claude" }],
          visibleProviderIds: ["all", "claude"],
        }),
      );

      const result = renderController({
        appData: { prefetchProvidersData, setSelectedSessionPath },
        shellState: { changeProviderView, changeLayoutView },
      });

      (result.ctx as AppContextValue).openProvidersHome();

      expect(prefetchProvidersData).toHaveBeenCalledTimes(1);
      expect(setSelectedSessionPath).toHaveBeenCalledWith("");
      expect(changeProviderView).toHaveBeenCalledWith("claude");
      expect(changeLayoutView).toHaveBeenCalledWith("providers");
    });

    it("falls back to all providers when only stale provider-view keys remain", () => {
      const prefetchProvidersData = vi.fn();
      const changeProviderView = vi.fn();
      const changeLayoutView = vi.fn();
      const setSelectedSessionPath = vi.fn();

      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          localStorage: {
            getItem() {
              return null;
            },
          },
        },
      });

      mockReadStorageValue.mockImplementation((keys: string[]) => {
        if (keys.includes(PROVIDER_VIEW_STORAGE_KEY)) return "codex";
        if (keys.includes(SETUP_PREFERRED_PROVIDER_STORAGE_KEY)) return null;
        return null;
      });
      mockUseAppShellModel.mockReturnValue(
        makeShellModel({
          visibleProviderIdSet: new Set(["all", "codex", "claude"]),
          visibleProviderTabs: [{ id: "all" }, { id: "codex" }, { id: "claude" }],
          visibleProviderIds: ["all", "codex", "claude"],
        }),
      );

      const result = renderController({
        appData: { prefetchProvidersData, setSelectedSessionPath },
        shellState: { changeProviderView, changeLayoutView },
      });

      (result.ctx as AppContextValue).openProvidersHome();

      expect(prefetchProvidersData).toHaveBeenCalledTimes(1);
      expect(setSelectedSessionPath).toHaveBeenCalledWith("");
      expect(changeProviderView).toHaveBeenCalledWith("all");
      expect(changeLayoutView).toHaveBeenCalledWith("providers");
    });

    it("exposes update/runtime/session scope state through shell props and context", () => {
      mockUseQuery.mockReturnValue({
        data: { data: makeUpdateCheckStatus({ has_update: true, latest_version: "0.3.0" }) },
      });

      const result = renderController({
        appData: {
          providerView: "all",
          selectedProviderLabel: "Claude",
          runtime: {
            isError: false,
            data: { data: { runtime_backend: { reachable: false, latency_ms: 420 } } },
          },
        },
      });

      expect(result.shellProps.showUpdateBanner).toBe(true);
      expect(result.shellProps.showRuntimeBackendDegraded).toBe(true);
      expect(result.shellProps.runtimeBackend).toEqual({ reachable: false, latency_ms: 420 });
      expect((result.ctx as AppContextValue).emptySessionScopeLabel).toBe("All AI");
    });

    it("keeps the exact session provider when current visible provider scope is collapsed", async () => {
      mockUseAppShellModel.mockReturnValue(
        makeShellModel({
          visibleProviderIdSet: new Set(["all"]),
          visibleProviderTabs: [{ id: "all" }],
          visibleProviderIds: ["all"],
        }),
      );
      mockApiGet.mockResolvedValue({
        rows: [
          {
            provider: "claude",
            source: "projects",
            session_id: "b8792a1a-7606-4247-abec-819b25dddf65",
            file_path: CLAUDE_SENTINEL_PATH,
          },
        ],
      });

      renderController({
        appData: {
          layoutView: "threads",
          providerTabs: [{ id: "all" }, { id: "codex" }, { id: "claude" }, { id: "gemini" }],
        },
      });

      const behaviorArgs = mockUseAppShellBehavior.mock.calls.at(-1)?.[0] as {
        lookupExactSessionTarget?: (query: string) => Promise<{
          sessionId: string;
          filePath: string;
          providerView: string;
        } | null>;
      };

      const target = await behaviorArgs.lookupExactSessionTarget?.(
        "b8792a1a-7606-4247-abec-819b25dddf65",
      );

      expect(target).toEqual({
        sessionId: "b8792a1a-7606-4247-abec-819b25dddf65",
        filePath: CLAUDE_SENTINEL_PATH,
        providerView: "claude",
      });
    });
  });
});
