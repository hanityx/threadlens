import { lazy, startTransition, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "./hooks/useAppData";
import { KpiCard } from "./components/KpiCard";
import { ThreadsTable } from "./components/ThreadsTable";
import { getMessages } from "./i18n";
import { formatDateTime } from "./lib/helpers";
import type { ConversationSearchHit, LayoutView, ProviderView } from "./types";

const SetupWizard = lazy(async () => {
  const mod = await import("./components/SetupWizard");
  return { default: mod.SetupWizard };
});

const SearchPanel = lazy(async () => {
  const mod = await import("./components/SearchPanel");
  return { default: mod.SearchPanel };
});

const ThreadDetail = lazy(async () => {
  const mod = await import("./components/ThreadDetail");
  return { default: mod.ThreadDetail };
});

const SessionDetail = lazy(async () => {
  const mod = await import("./components/SessionDetail");
  return { default: mod.SessionDetail };
});

const ProvidersPanel = lazy(async () => {
  const mod = await import("./components/ProvidersPanel");
  return { default: mod.ProvidersPanel };
});

const RoutingPanel = lazy(async () => {
  const mod = await import("./components/RoutingPanel");
  return { default: mod.RoutingPanel };
});

const ForensicsPanel = lazy(async () => {
  const mod = await import("./components/ForensicsPanel");
  return { default: mod.ForensicsPanel };
});

const preloadProvidersPanel = () => {
  void import("./components/ProvidersPanel");
};

const preloadSearchPanel = () => {
  void import("./components/SearchPanel");
};

const preloadThreadDetail = () => {
  void import("./components/ThreadDetail");
};

const preloadSessionDetail = () => {
  void import("./components/SessionDetail");
};

const preloadRoutingPanel = () => {
  void import("./components/RoutingPanel");
};

const preloadForensicsPanel = () => {
  void import("./components/ForensicsPanel");
};

const HIDDEN_PROVIDER_IDS = new Set(["chatgpt"]);
const OPTIONAL_PROVIDER_IDS = new Set(["copilot"]);
const PROVIDER_DISPLAY_ORDER = ["all", "codex", "claude", "gemini", "copilot"];

const providerFromSourceKey = (sourceKey: string): string | null => {
  const key = sourceKey.toLowerCase();
  if (key.startsWith("claude")) return "claude";
  if (key.startsWith("gemini")) return "gemini";
  if (key.startsWith("copilot")) return "copilot";
  if (key.startsWith("chat_")) return "chatgpt";
  if (
    key.startsWith("codex_") ||
    key === "sessions" ||
    key === "archived_sessions" ||
    key === "history" ||
    key === "global_state"
  ) {
    return "codex";
  }
  return null;
};

const normalizeDesktopRouteFilePath = (filePath: string): string => {
  const trimmed = String(filePath || "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("/.codex/sessions/")) {
    return trimmed.replace("/.codex/sessions/", "/.codex-cli/sessions/");
  }
  return trimmed;
};

type DesktopRouteState = {
  view: LayoutView | "";
  provider: ProviderView | "";
  filePath: string;
  threadId: string;
};

export function App() {
  const panelChunkWarmupStartedRef = useRef(false);
  const desktopRouteAppliedRef = useRef(false);
  const desktopRouteRef = useRef<DesktopRouteState>({
    view: "",
    provider: "",
    filePath: "",
    threadId: "",
  });
  const threadSearchInputRef = useRef<HTMLInputElement | null>(null);
  const detailLayoutRef = useRef<HTMLElement | null>(null);
  const [searchThreadContext, setSearchThreadContext] = useState<ConversationSearchHit | null>(null);
  const [providersDiagnosticsOpen, setProvidersDiagnosticsOpen] = useState(false);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const {
    theme,
    setTheme,
    density,
    setDensity,
    layoutView,
    setLayoutView,
    query,
    setQuery,
    filterMode,
    setFilterMode,
    providerView,
    setProviderView,
    providerDataDepth,
    setProviderDataDepth,
    selected,
    setSelected,
    selectedProviderFiles,
    setSelectedProviderFiles,
    selectedThreadId,
    setSelectedThreadId,
    selectedSessionPath,
    setSelectedSessionPath,

    runtime,
    smokeStatus,
    threads,
    recovery,
    providerMatrix,
    providerSessions,
    providerParserHealth,

    bulkPin,
    bulkUnpin,
    bulkArchive,
    analyzeDelete,
    cleanupDryRun,
    analyzeDeleteError,
    cleanupDryRunError,
    analyzeDeleteErrorMessage,
    cleanupDryRunErrorMessage,
    bulkActionError,
    bulkActionErrorMessage,
    providerSessionActionError,
    providerSessionActionErrorMessage,

    rows,
    filteredRows,
    visibleRows,
    selectedIds,
    allFilteredSelected,
    pinnedCount,
    highRiskCount,

    analysisRaw,
    cleanupRaw,
    smokeStatusLatest,
    cleanupData,
    selectedImpactRows,

    providers,
    providerTabs,
    allProviderSessionRows,
    slowProviderIds,
    slowProviderThresholdMs,
    setSlowProviderThresholdMs,
    providerSessionRows,
    providerSessionsLimit,
    providerRowsSampled,
    dataSourceRows,
    selectedProviderLabel,
    selectedProviderFilePaths,
    canRunProviderAction,
    canRunSelectedSessionAction,
    providerActionData,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    recoveryBackupExportData,
    allParserReports,
    parserReports,

    selectedThread,
    threadDetailLoading,
    selectedThreadDetail,
    threadTranscriptData,
    threadTranscriptLoading,
    threadTranscriptLimit,
    setThreadTranscriptLimit,
    selectedSession,
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    setSessionTranscriptLimit,

    executionGraphData,

    runtimeLoading,
    smokeStatusLoading,
    recoveryLoading,
    threadsLoading,
    dataSourcesLoading,
    providerMatrixLoading,
    providerSessionsLoading,
    parserLoading,
    executionGraphLoading,
    threadsFastBooting,
    threadsFetchMs,
    providersRefreshing,
    refreshingAllData,
    providersLastRefreshAt,
    providerFetchMetrics,

    busy,
    toggleSelectAllFiltered,
    toggleSelectAllProviderRows,
    runProviderAction,
    runSingleProviderAction,
    runRecoveryBackupExport,
    prefetchProvidersData,
    prefetchRoutingData,
    refreshProvidersData,
    refreshAllData,
  } = useAppData({ providersDiagnosticsOpen });

  const changeLayoutView = (nextView: LayoutView) => {
    startTransition(() => {
      setLayoutView(nextView);
    });
  };

  const changeProviderView = (nextView: ProviderView) => {
    startTransition(() => {
      setProviderView(nextView);
    });
  };

  const messages = getMessages("ko");
  const showOverviewChrome = layoutView === "overview";
  const runtimeBackend = runtime.data?.data?.runtime_backend;
  const smokeStatusValue =
    smokeStatusLoading
      ? "..."
      : smokeStatusLatest?.status === "pass"
        ? messages.kpi.smokePass
        : smokeStatusLatest?.status === "fail"
          ? messages.kpi.smokeFail
          : smokeStatusLatest?.status === "invalid"
            ? messages.kpi.smokeInvalid
            : messages.kpi.smokeMissing;
  const smokeStatusHint = smokeStatusLatest?.timestamp_utc
    ? `${messages.kpi.smokeAt} ${smokeStatusLatest.timestamp_utc}`
    : messages.kpi.smokeNoData;
  const showRuntimeBackendDegraded =
    runtime.isError || (!runtimeLoading && runtimeBackend?.reachable === false);
  const [acknowledgedForensicsErrorKeys, setAcknowledgedForensicsErrorKeys] = useState<{
    analyze: string;
    cleanup: string;
  }>({
    analyze: "",
    cleanup: "",
  });
  const analyzeErrorKey = analyzeDeleteError
    ? `analyze:${analyzeDeleteErrorMessage || "unknown"}`
    : "";
  const cleanupErrorKey = cleanupDryRunError
    ? `cleanup:${cleanupDryRunErrorMessage || "unknown"}`
    : "";
  const visibleProviderTabs = useMemo(() => {
    const filtered = providerTabs.filter(
      (tab) => tab.id === "all" || !HIDDEN_PROVIDER_IDS.has(tab.id),
    );
    return [...filtered].sort((left, right) => {
      const leftIndex = PROVIDER_DISPLAY_ORDER.indexOf(left.id);
      const rightIndex = PROVIDER_DISPLAY_ORDER.indexOf(right.id);
      if (leftIndex !== -1 || rightIndex !== -1) {
        const safeLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
        const safeRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
        if (safeLeft !== safeRight) return safeLeft - safeRight;
      }
      return left.name.localeCompare(right.name);
    });
  }, [providerTabs]);
  const visibleProviderIds = useMemo(
    () =>
      visibleProviderTabs
        .filter(
          (tab) =>
            tab.id !== "all" &&
            (providerView !== "all" || !OPTIONAL_PROVIDER_IDS.has(tab.id)),
        )
        .map((tab) => tab.id as Exclude<ProviderView, "all">),
    [providerView, visibleProviderTabs],
  );
  const visibleProviderIdSet = useMemo(() => new Set(visibleProviderIds), [visibleProviderIds]);
  const visibleProviders = useMemo(
    () => providers.filter((provider) => visibleProviderIdSet.has(provider.provider)),
    [providers, visibleProviderIdSet],
  );
  const visibleProviderSummary = useMemo(
    () => {
      const visibleTabs = visibleProviderTabs.filter((tab) => tab.id !== "all");
      const fallbackTotal = visibleTabs.length;
      const fallbackActive = visibleTabs.filter((tab) => tab.status === "active").length;
      const fallbackDetected = visibleTabs.filter((tab) => tab.status === "detected").length;
      if (visibleProviders.length === 0 && fallbackTotal > 0) {
        return {
          total: fallbackTotal,
          active: fallbackActive,
          detected: fallbackDetected,
        };
      }
      return {
        total: visibleProviders.length,
        active: visibleProviders.filter((provider) => provider.status === "active").length,
        detected: visibleProviders.filter((provider) => provider.status === "detected").length,
      };
    },
    [visibleProviderTabs, visibleProviders],
  );
  const visibleCleanupReadyProviders = useMemo(
    () =>
      visibleProviders
        .filter((provider) => provider.capabilities.safe_cleanup)
        .map((provider) => provider.name),
    [visibleProviders],
  );
  const cleanupReadyCount = visibleCleanupReadyProviders.length;
  const visibleReadOnlyProviders = useMemo(
    () =>
      visibleProviders
        .filter((provider) => provider.capability_level === "read-only")
        .map((provider) => provider.name),
    [visibleProviders],
  );
  const readOnlyCount = visibleReadOnlyProviders.length;
  const visibleSlowProviderIds = useMemo(
    () => slowProviderIds.filter((providerId) => visibleProviderIdSet.has(providerId)),
    [slowProviderIds, visibleProviderIdSet],
  );
  const visibleProviderSessionRows = useMemo(
    () => providerSessionRows.filter((row) => visibleProviderIdSet.has(row.provider)),
    [providerSessionRows, visibleProviderIdSet],
  );
  const allVisibleProviderSessionRows = useMemo(
    () => allProviderSessionRows.filter((row) => visibleProviderIdSet.has(row.provider)),
    [allProviderSessionRows, visibleProviderIdSet],
  );
  const visibleProviderSessionSummary = useMemo(() => {
    const providersInRows = new Set(visibleProviderSessionRows.map((row) => row.provider));
    const parseOk = visibleProviderSessionRows.filter((row) => row.probe.ok).length;
    return {
      providers: providerView === "all" ? providersInRows.size || visibleProviders.length : 1,
      rows: visibleProviderSessionRows.length,
      parse_ok: parseOk,
      parse_fail: visibleProviderSessionRows.length - parseOk,
    };
  }, [providerView, visibleProviderSessionRows, visibleProviders.length]);
  const visibleParserReports = useMemo(
    () => parserReports.filter((report) => visibleProviderIdSet.has(report.provider)),
    [parserReports, visibleProviderIdSet],
  );
  const allVisibleParserReports = useMemo(
    () => allParserReports.filter((report) => visibleProviderIdSet.has(report.provider)),
    [allParserReports, visibleProviderIdSet],
  );
  const visibleParserSummary = useMemo(() => {
    const scanned = visibleParserReports.reduce(
      (sum, report) => sum + Number(report.scanned || 0),
      0,
    );
    const parseOk = visibleParserReports.reduce(
      (sum, report) => sum + Number(report.parse_ok || 0),
      0,
    );
    const parseFail = visibleParserReports.reduce(
      (sum, report) => sum + Number(report.parse_fail || 0),
      0,
    );
    return {
      providers: visibleParserReports.length,
      scanned,
      parse_ok: parseOk,
      parse_fail: parseFail,
      parse_score: scanned ? Number(((parseOk / scanned) * 100).toFixed(1)) : null,
    };
  }, [visibleParserReports]);
  const visibleDataSourceRows = useMemo(
    () =>
      dataSourceRows.filter((row) => {
        const providerId = providerFromSourceKey(row.source_key);
        return providerId ? visibleProviderIdSet.has(providerId) : true;
      }),
    [dataSourceRows, visibleProviderIdSet],
  );
  const visibleAllProviderRowsSelected =
    visibleProviderSessionRows.length > 0 &&
    visibleProviderSessionRows.every((row) => Boolean(selectedProviderFiles[row.file_path]));
  const searchProviderOptions = useMemo(
    () =>
      visibleProviderTabs
        .filter((tab) => tab.id !== "all")
        .map((tab) => ({ id: tab.id, name: tab.name })),
    [visibleProviderTabs],
  );
  const showSearch = layoutView === "search";
  const showProviders = layoutView === "providers";
  const showThreadsTable = layoutView === "threads";
  const showForensics = layoutView === "threads";
  const showRouting = layoutView === "providers" && providersDiagnosticsOpen;
  const showThreadDetail = layoutView === "threads";
  const showSessionDetail = layoutView === "providers";
  const showDetails = showThreadDetail || showSessionDetail;
  const showGlobalAnalyzeDeleteError =
    !showForensics &&
    !showRuntimeBackendDegraded &&
    Boolean(analyzeErrorKey) &&
    acknowledgedForensicsErrorKeys.analyze !== analyzeErrorKey;
  const showGlobalCleanupDryRunError =
    !showForensics &&
    !showRuntimeBackendDegraded &&
    Boolean(cleanupErrorKey) &&
    acknowledgedForensicsErrorKeys.cleanup !== cleanupErrorKey;
  const hasGlobalErrorStack =
    runtime.isError ||
    smokeStatus.isError ||
    recovery.isError ||
    providerMatrix.isError ||
    providerSessions.isError ||
    providerParserHealth.isError ||
    Boolean(showGlobalAnalyzeDeleteError) ||
    Boolean(showGlobalCleanupDryRunError) ||
    Boolean(providerSessionActionError) ||
    Boolean(bulkActionError && !showRuntimeBackendDegraded);

  useEffect(() => {
    if (desktopRouteAppliedRef.current) return;
    if (typeof window === "undefined") return;

    desktopRouteAppliedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    const provider = params.get("provider");
    const filePath = params.get("filePath");
    const threadId = params.get("threadId");

    desktopRouteRef.current = {
      view:
        view === "overview" || view === "search" || view === "providers" || view === "threads"
          ? view
          : "",
      provider:
        provider === "all" ||
        provider === "codex" ||
        provider === "claude" ||
        provider === "gemini" ||
        provider === "copilot" ||
        provider === "chatgpt"
          ? provider
          : "",
      filePath: normalizeDesktopRouteFilePath(filePath ?? ""),
      threadId: threadId ?? "",
    };

    const hasRouteSignal = Boolean(view || provider || filePath || threadId);
    if (!hasRouteSignal) return;

    const routedView = desktopRouteRef.current.view;
    if (routedView) {
      startTransition(() => {
        setLayoutView(routedView);
      });
    }

    if (desktopRouteRef.current.provider) {
      startTransition(() => {
        setProviderView(desktopRouteRef.current.provider);
      });
    }

    if (desktopRouteRef.current.filePath) {
      setSelectedSessionPath(desktopRouteRef.current.filePath);
      if (desktopRouteRef.current.view !== "threads") {
        startTransition(() => {
          setLayoutView("providers");
        });
      }
    }

    if (desktopRouteRef.current.threadId) {
      setSelectedThreadId(desktopRouteRef.current.threadId);
      startTransition(() => {
        setLayoutView("threads");
      });
    }
  }, [setLayoutView, setProviderView, setSelectedSessionPath, setSelectedThreadId]);

  useEffect(() => {
    const routedProvider = desktopRouteRef.current.provider;
    if (!routedProvider || routedProvider === "all") return;
    const nonAllVisibleTabs = visibleProviderTabs.filter((tab) => tab.id !== "all");
    if (nonAllVisibleTabs.length === 0) return;
    const routeVisible = nonAllVisibleTabs.some((tab) => tab.id === routedProvider);
    if (!routeVisible || providerView === routedProvider) return;

    startTransition(() => {
      setProviderView(routedProvider);
    });
  }, [providerView, setProviderView, visibleProviderTabs]);

  const handleProvidersIntent = () => {
    prefetchProvidersData();
    preloadProvidersPanel();
    preloadSessionDetail();
  };
  const handleSearchIntent = () => {
    preloadSearchPanel();
  };
  const handleDiagnosticsIntent = () => {
    prefetchRoutingData();
    preloadRoutingPanel();
  };

  useEffect(() => {
    if (providerView === "all") return;
    if (visibleProviderIdSet.has(providerView)) return;
    const fallbackProvider =
      (visibleProviderTabs.find((tab) => tab.id !== "all")?.id as ProviderView | undefined) ??
      "all";
    startTransition(() => {
      setProviderView(fallbackProvider);
    });
  }, [providerView, visibleProviderIdSet, visibleProviderTabs]);

  useEffect(() => {
    if (!showForensics) return;
    setAcknowledgedForensicsErrorKeys((prev) => {
      const nextAnalyze = analyzeErrorKey || prev.analyze;
      const nextCleanup = cleanupErrorKey || prev.cleanup;
      if (nextAnalyze === prev.analyze && nextCleanup === prev.cleanup) {
        return prev;
      }
      return {
        analyze: nextAnalyze,
        cleanup: nextCleanup,
      };
    });
  }, [showForensics, analyzeErrorKey, cleanupErrorKey]);

  useEffect(() => {
    if (analyzeErrorKey) return;
    setAcknowledgedForensicsErrorKeys((prev) => {
      if (!prev.analyze) return prev;
      return {
        ...prev,
        analyze: "",
      };
    });
  }, [analyzeErrorKey]);

  useEffect(() => {
    if (cleanupErrorKey) return;
    setAcknowledgedForensicsErrorKeys((prev) => {
      if (!prev.cleanup) return prev;
      return {
        ...prev,
        cleanup: "",
      };
    });
  }, [cleanupErrorKey]);

  useEffect(() => {
    if (!showThreadDetail || !selectedThreadId) return;
    detailLayoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedThreadId, showThreadDetail]);

  useEffect(() => {
    if (!showSessionDetail || !selectedSessionPath) return;
    detailLayoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedSessionPath, showSessionDetail]);

  useEffect(() => {
    if (!searchThreadContext) return;
    if (searchThreadContext.thread_id === selectedThreadId) return;
    setSearchThreadContext(null);
  }, [searchThreadContext, selectedThreadId]);

  useEffect(() => {
    if (layoutView !== "threads") return;
    if (panelChunkWarmupStartedRef.current) return;
    if (typeof window === "undefined") return;

    panelChunkWarmupStartedRef.current = true;
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    const runWarmup = () => {
      if (cancelled) return;
      preloadForensicsPanel();
      preloadThreadDetail();
    };

    const w = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(runWarmup, { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(runWarmup, 1200);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
    };
  }, [layoutView]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return (
        target.isContentEditable ||
        tag === "input" ||
        tag === "textarea" ||
        tag === "select"
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "1") {
        event.preventDefault();
        changeLayoutView("overview");
        return;
      }
      if (event.key === "2") {
        event.preventDefault();
        changeLayoutView("search");
        return;
      }
      if (event.key === "3") {
        event.preventDefault();
        changeLayoutView("threads");
        return;
      }
      if (event.key === "4") {
        event.preventDefault();
        changeLayoutView("providers");
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        const input =
          layoutView === "threads"
            ? threadSearchInputRef.current
            : (document.querySelector(".search-panel .search-input") as HTMLInputElement | null);
        input?.focus();
        input?.select();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [layoutView]);

  const currentSurfaceLabel =
    layoutView === "overview"
      ? "Operator Workbench"
      : layoutView === "search"
        ? "Search Stage"
        : layoutView === "threads"
          ? "Cleanup Review"
          : "Original Sessions";

  return (
    <div className="app-shell">
      <aside className="shell-rail" aria-label="workspace navigation">
        <div className="shell-rail-brand">
          <span className="shell-rail-kicker">provider observatory</span>
          <strong>Operator Workbench</strong>
          <span>sessions / cleanup / backup</span>
        </div>
        <nav className="shell-rail-nav">
          <button
            type="button"
            className={`view-btn shell-rail-btn ${layoutView === "overview" ? "is-active" : ""}`}
            onClick={() => changeLayoutView("overview")}
          >
            {messages.nav.overview}
          </button>
          <button
            type="button"
            className={`view-btn shell-rail-btn ${layoutView === "search" ? "is-active" : ""}`}
            onClick={() => changeLayoutView("search")}
            onMouseEnter={handleSearchIntent}
            onFocus={handleSearchIntent}
          >
            {messages.nav.search}
          </button>
          <button
            type="button"
            className={`view-btn shell-rail-btn ${layoutView === "threads" ? "is-active" : ""}`}
            onClick={() => changeLayoutView("threads")}
          >
            {messages.nav.threads}
          </button>
          <button
            type="button"
            className={`view-btn shell-rail-btn ${layoutView === "providers" ? "is-active" : ""}`}
            onClick={() => changeLayoutView("providers")}
            onMouseEnter={handleProvidersIntent}
            onFocus={handleProvidersIntent}
            onTouchStart={handleProvidersIntent}
          >
            {messages.nav.providers}
          </button>
        </nav>
        <div className="shell-rail-status">
          <div className="shell-rail-status-card">
            <span className="overview-note-label">active</span>
            <strong>
              {visibleProviderSummary.active}/{visibleProviderSummary.total}
            </strong>
            <span>providers</span>
          </div>
          <div className="shell-rail-status-card">
            <span className="overview-note-label">review</span>
            <strong>{highRiskCount}</strong>
            <span>high risk</span>
          </div>
        </div>
      </aside>

      <main className="page page-shell-main">
        <section className="top-actions">
          <div className="top-actions-copy">
            <span className="top-actions-label">surface</span>
            <strong>{currentSurfaceLabel}</strong>
          </div>
          <div className="top-controls">
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                void refreshAllData();
              }}
              disabled={busy || refreshingAllData}
              title={messages.nav.syncHint}
            >
              {refreshingAllData ? messages.nav.syncing : messages.nav.syncNow}
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              title={theme === "dark" ? messages.nav.switchToLight : messages.nav.switchToDark}
            >
              {theme === "dark" ? messages.nav.light : messages.nav.dark}
            </button>
          </div>
        </section>

        {showOverviewChrome ? (
          <section className="hero">
            <div className="hero-shell">
              <div className="hero-copy">
                <div className="hero-top">
                  <h1>{messages.hero.title}</h1>
                  <span className="hero-badge">{messages.hero.badge}</span>
                </div>
                <p>원문 검색, 정리 검토, 백업 보호.</p>
                <div className="hero-meta">
                  <span className="meta-chip">
                    {messages.hero.active} {visibleProviderSummary.active}/{visibleProviderSummary.total}
                  </span>
                  <span className="meta-chip">
                    {messages.hero.safeCleanup} {cleanupReadyCount}
                  </span>
                  <span className="meta-chip">
                    {messages.hero.readOnly} {readOnlyCount}
                  </span>
                  <span className="meta-chip">
                    {messages.hero.highRisk} {highRiskCount}
                  </span>
                </div>
                <div className="hero-actions">
                  <button
                    type="button"
                    className="overview-header-btn is-primary"
                    onClick={() => changeLayoutView("search")}
                    onMouseEnter={handleSearchIntent}
                    onFocus={handleSearchIntent}
                  >
                    원문 세션 열기
                  </button>
                  <button
                    type="button"
                    className="overview-header-btn"
                    onClick={() => changeLayoutView("threads")}
                  >
                    정리 검토 열기
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}

      {showRuntimeBackendDegraded ? (
        <section className="degraded-banner" role="status" aria-live="polite">
          <strong>{messages.alerts.runtimeBackendDownTitle}</strong>
          <p>{messages.alerts.runtimeBackendDownBody}</p>
          <span>
            {messages.alerts.runtimeBackendDownHint} {runtimeBackend?.url ?? "ts-native"}
          </span>
        </section>
      ) : null}

        {layoutView === "overview" ? (
          <section className="overview-grid">
            <section className="panel overview-stage">
              <div className="overview-stage-header">
                <div className="overview-stage-title">
                  <span className="overview-note-label">main stage</span>
                  <h2>Session Workbench</h2>
                  <p>핵심 surface를 바로 연다.</p>
                </div>
                <div className="overview-header-actions">
                  <button
                    type="button"
                    className="overview-header-btn"
                    onClick={() => setSetupGuideOpen((prev) => !prev)}
                  >
                    {setupGuideOpen ? "설정 닫기" : "새 세션 설정"}
                  </button>
                  <button
                    type="button"
                    className="overview-header-btn is-primary"
                    onClick={() => changeLayoutView("search")}
                    onMouseEnter={handleSearchIntent}
                    onFocus={handleSearchIntent}
                  >
                    원문 세션 열기
                  </button>
                </div>
              </div>

              <div className="overview-stage-layout">
                <div className="overview-stage-main">
                  <section className="overview-command-shell" aria-label="workbench command shell">
                    <div className="overview-window-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="overview-command-meta">
                      <span className="overview-command-path">obs-node / sessions / active</span>
                      <span className="overview-command-runtime">
                        {runtimeLoading
                          ? "runtime syncing"
                          : runtime.data?.data?.runtime_backend.reachable
                            ? `runtime online · ${runtime.data?.data?.runtime_backend.latency_ms ?? "-"} ms`
                            : "runtime down"}
                      </span>
                    </div>
                    <div className="overview-command-pills">
                      <span className="overview-command-pill is-solid">obs inspect --scope original</span>
                      <span className="overview-command-pill">search {visibleProviderSessionSummary.rows}</span>
                      <span className="overview-command-pill">review {highRiskCount}</span>
                      <span className="overview-command-pill">backup {recovery.data?.summary?.backup_sets ?? 0}</span>
                    </div>
                  </section>

                  <section className="overview-editorial">
                    <div className="overview-editorial-head">
                      <div>
                        <span className="overview-note-label">open next</span>
                        <h3>바로 들어갈 surface</h3>
                        <p>지금 필요한 작업만 남겼다.</p>
                      </div>
                      <div className="overview-editorial-badges">
                        <span className="overview-editorial-badge">
                          providers {visibleProviderSummary.active}/{visibleProviderSummary.total}
                        </span>
                        <span className="overview-editorial-badge">threads {rows.length}</span>
                      </div>
                    </div>

                    <p className="overview-editorial-lead">
                      검색 {visibleProviderSessionSummary.rows} · 고위험 {highRiskCount} · 백업 세트{" "}
                      {recovery.data?.summary?.backup_sets ?? 0}
                    </p>

                    <div className="overview-primary-actions">
                      <button
                        type="button"
                        className="overview-primary-card"
                        onClick={() => changeLayoutView("search")}
                        onMouseEnter={handleSearchIntent}
                        onFocus={handleSearchIntent}
                      >
                        <span className="overview-note-label">검색</span>
                        <strong>원문 세션</strong>
                        <p>{visibleProviderSessionSummary.rows}개 세션 검색</p>
                      </button>
                      <button
                        type="button"
                        className="overview-primary-card"
                        onClick={() => changeLayoutView("threads")}
                      >
                        <span className="overview-note-label">정리</span>
                        <strong>Cleanup Review</strong>
                        <p>{highRiskCount}개 고위험 검토</p>
                      </button>
                      <button
                        type="button"
                        className="overview-primary-card"
                        onClick={() => changeLayoutView("providers")}
                        onMouseEnter={handleProvidersIntent}
                        onFocus={handleProvidersIntent}
                      >
                        <span className="overview-note-label">백업</span>
                        <strong>Original Sessions</strong>
                        <p>백업 세트 {recovery.data?.summary?.backup_sets ?? 0}</p>
                      </button>
                    </div>

                    <div className="overview-metric-grid">
                      <article className="overview-metric-card">
                        <span className="overview-note-label">cleanup load</span>
                        <strong>{highRiskCount}</strong>
                        <p>pinned {pinnedCount}/{rows.length}</p>
                      </article>
                      <article className="overview-metric-card">
                        <span className="overview-note-label">backup vault</span>
                        <strong>{recovery.data?.summary?.backup_sets ?? 0}</strong>
                        <p>
                          checklist {recovery.data?.summary?.checklist_done ?? 0}/
                          {recovery.data?.summary?.checklist_total ?? 0}
                        </p>
                      </article>
                    </div>
                  </section>
                </div>
              </div>
            </section>

            <details
              className="overview-secondary-panel"
              open={setupGuideOpen}
              onToggle={(event) => {
                setSetupGuideOpen((event.currentTarget as HTMLDetailsElement).open);
              }}
            >
              <summary>{setupGuideOpen ? "설정 닫기" : "새 세션 설정 열기"}</summary>
              <div className="overview-secondary-body">
                {setupGuideOpen ? (
                  <Suspense
                    fallback={
                      <div className="info-box compact">
                        <strong>{messages.common.loading}</strong>
                        <p>설정 stage 불러오는 중.</p>
                      </div>
                    }
                  >
                    <SetupWizard
                      providers={visibleProviders}
                      dataSourceRows={visibleDataSourceRows}
                      providerSessionRows={visibleProviderSessionRows}
                      parserReports={visibleParserReports}
                      providersRefreshing={providersRefreshing}
                      providersLastRefreshAt={providersLastRefreshAt}
                      onRefresh={refreshProvidersData}
                      onOpenProviders={(providerId) => {
                        if (providerId && visibleProviderIdSet.has(providerId)) {
                          changeProviderView(providerId as ProviderView);
                        } else {
                          changeProviderView("all");
                        }
                        changeLayoutView("providers");
                      }}
                      onOpenDiagnostics={() => changeLayoutView("providers")}
                    />
                  </Suspense>
                ) : (
                  <div className="info-box compact">
                    <strong>설정 stage는 필요할 때만 연다.</strong>
                    <p>기본 flow엔 숨겨 둔다.</p>
                  </div>
                )}
              </div>
            </details>
          </section>
        ) : null}

      {showSearch ? (
        <Suspense
          fallback={
            <section className="panel">
              <header>
                <h2>{messages.nav.search}</h2>
                <span>{messages.common.loading}</span>
              </header>
              <div className="sub-toolbar">
                <div className="skeleton-line" />
              </div>
            </section>
          }
        >
          <SearchPanel
            messages={messages}
            providerOptions={searchProviderOptions}
            onOpenSession={(hit: ConversationSearchHit) => {
              if (visibleProviderIdSet.has(hit.provider)) {
                changeProviderView(hit.provider as ProviderView);
              } else {
                changeProviderView("all");
              }
              setSearchThreadContext(null);
              setSelectedThreadId("");
              setSelectedSessionPath(hit.file_path);
              changeLayoutView("providers");
            }}
            onOpenThread={(hit: ConversationSearchHit) => {
              if (!hit.thread_id) return;
              setSearchThreadContext(hit);
              setSelectedSessionPath("");
              setSelectedThreadId(hit.thread_id);
              changeLayoutView("threads");
            }}
          />
        </Suspense>
      ) : null}

      {showProviders ? (
        <>
          <section className="provider-page-stack">
          <Suspense
            fallback={
              <section className="panel">
                <header>
                  <h2>{messages.nav.providers}</h2>
                  <span>{messages.common.loading}</span>
                </header>
                <div className="sub-toolbar">
                  <div className="skeleton-line" />
                </div>
              </section>
            }
          >
            <ProvidersPanel
              messages={messages}
              sessionDetailSlot={
                <Suspense
                  fallback={
                    <section className="panel">
                      <header>
                        <h2>{messages.sessionDetail.title}</h2>
                        <span>{messages.common.loading}</span>
                      </header>
                      <div className="sub-toolbar">
                        <div className="skeleton-line" />
                      </div>
                    </section>
                  }
                >
                  <SessionDetail
                    key={selectedSession?.file_path ?? "empty-session-detail"}
                    messages={messages}
                    selectedSession={selectedSession}
                    sessionTranscriptData={sessionTranscriptData}
                    sessionTranscriptLoading={sessionTranscriptLoading}
                    sessionTranscriptLimit={sessionTranscriptLimit}
                    setSessionTranscriptLimit={setSessionTranscriptLimit}
                    busy={busy}
                    canRunSessionAction={canRunSelectedSessionAction}
                    providerDeleteBackupEnabled={providerDeleteBackupEnabled}
                    setProviderDeleteBackupEnabled={setProviderDeleteBackupEnabled}
                    runSingleProviderAction={runSingleProviderAction}
                  />
                </Suspense>
              }
              providers={visibleProviders}
              providerSummary={visibleProviderSummary}
              providerMatrixLoading={providerMatrixLoading}
              providerTabs={visibleProviderTabs}
              slowProviderIds={visibleSlowProviderIds}
              slowProviderThresholdMs={slowProviderThresholdMs}
              setSlowProviderThresholdMs={setSlowProviderThresholdMs}
              providerView={providerView}
              setProviderView={setProviderView}
              providerDataDepth={providerDataDepth}
              setProviderDataDepth={setProviderDataDepth}
              providerSessionRows={visibleProviderSessionRows}
              allProviderSessionRows={allVisibleProviderSessionRows}
              providerSessionSummary={visibleProviderSessionSummary}
              providerSessionsLimit={providerSessionsLimit}
              providerRowsSampled={providerRowsSampled}
              dataSourceRows={visibleDataSourceRows}
              dataSourcesLoading={dataSourcesLoading}
              providerSessionsLoading={providerSessionsLoading}
              selectedProviderFiles={selectedProviderFiles}
              setSelectedProviderFiles={setSelectedProviderFiles}
              allProviderRowsSelected={visibleAllProviderRowsSelected}
              toggleSelectAllProviderRows={toggleSelectAllProviderRows}
              selectedProviderLabel={selectedProviderLabel}
              selectedProviderFilePaths={selectedProviderFilePaths}
              canRunProviderAction={canRunProviderAction}
              busy={busy}
              providerDeleteBackupEnabled={providerDeleteBackupEnabled}
              setProviderDeleteBackupEnabled={setProviderDeleteBackupEnabled}
              runProviderAction={runProviderAction}
              providerActionData={providerActionData}
              runRecoveryBackupExport={runRecoveryBackupExport}
              recoveryBackupExportData={recoveryBackupExportData}
              parserReports={visibleParserReports}
              allParserReports={allVisibleParserReports}
              parserLoading={parserLoading}
              parserSummary={visibleParserSummary}
              selectedSessionPath={selectedSessionPath}
              setSelectedSessionPath={setSelectedSessionPath}
              providersRefreshing={providersRefreshing}
              providersLastRefreshAt={providersLastRefreshAt}
              providerFetchMetrics={providerFetchMetrics}
              refreshProvidersData={refreshProvidersData}
            />
          </Suspense>

          <details
            className="panel panel-disclosure"
            open={providersDiagnosticsOpen}
            onToggle={(event) => {
              const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
              setProvidersDiagnosticsOpen(nextOpen);
              if (nextOpen) handleDiagnosticsIntent();
            }}
          >
            <summary>{providersDiagnosticsOpen ? "고급 진단 숨기기" : "고급 진단 열기"}</summary>
            <div className="panel-disclosure-body">
              {showRouting ? (
                <Suspense
                  fallback={
                    <section className="panel">
                      <header>
                        <h2>{messages.nav.routing}</h2>
                        <span>{messages.common.loading}</span>
                      </header>
                      <div className="sub-toolbar">
                        <div className="skeleton-line" />
                      </div>
                    </section>
                  }
                >
                  <RoutingPanel
                    messages={messages}
                    data={executionGraphData}
                    loading={executionGraphLoading}
                    providerView={providerView}
                    providerSessionRows={visibleProviderSessionRows}
                    parserReports={visibleParserReports}
                    visibleProviderIds={visibleProviderIds}
                  />
                </Suspense>
              ) : null}
            </div>
          </details>
          </section>
        </>
      ) : null}

      {showThreadsTable ? (
        <section className="panel cleanup-command-shell">
          <header>
            <h2>Cleanup review queue</h2>
            <span>impact와 dry-run을 먼저 본다.</span>
          </header>
          <div className="cleanup-command-body">
            <div className="thread-workflow-copy">
              <span className="overview-note-label">cleanup review workbench</span>
              <strong>정리 후보를 좁히고 바로 review rail에서 판단한다.</strong>
              <p>queue, impact, dry-run을 한 흐름으로 둔다.</p>
            </div>
            <div className="thread-status-grid">
              <article className="thread-status-card">
                <span>queue</span>
                <strong>{visibleRows.length}/{filteredRows.length}</strong>
                <p>visible / filtered</p>
              </article>
              <article className={`thread-status-card ${selectedIds.length > 0 ? "is-accent" : ""}`.trim()}>
                <span>selected</span>
                <strong>{selectedIds.length}</strong>
                <p>review rail 대상</p>
              </article>
              <article className={`thread-status-card ${cleanupData?.confirm_token_expected ? "is-ready" : ""}`.trim()}>
                <span>dry-run</span>
                <strong>{cleanupData?.confirm_token_expected ? "ready" : "pending"}</strong>
                <p>{selectedImpactRows.length > 0 ? `${selectedImpactRows.length} impact rows` : "impact 먼저"}</p>
              </article>
            </div>
            <section className="toolbar cleanup-toolbar">
              <input
                ref={threadSearchInputRef}
                placeholder={messages.toolbar.searchThreads}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                className="search-input"
              />
              <select
                className="filter-select"
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as "all" | "high-risk" | "pinned")}
              >
                <option value="all">{messages.toolbar.all}</option>
                <option value="high-risk">{messages.toolbar.highRisk}</option>
                <option value="pinned">{messages.toolbar.pinned}</option>
              </select>
              <span className="sub-hint">
                fetch {threadsFetchMs !== null ? `${threadsFetchMs}ms` : "-"}
              </span>
              {threadsFastBooting ? (
                <span className="sub-hint">fast boot</span>
              ) : null}
              <span className="sub-hint">review rail</span>
            </section>
          </div>
        </section>
      ) : null}

      {showThreadsTable ? (
        <section className={`${showForensics ? "ops-layout" : "ops-layout single"}`.trim()}>
          <ThreadsTable
            messages={messages}
            visibleRows={visibleRows}
            filteredRows={filteredRows}
            totalCount={threads.data?.total ?? rows.length}
            threadsLoading={threadsLoading}
            threadsError={threads.isError}
            selected={selected}
            setSelected={setSelected}
            selectedThreadId={selectedThreadId}
            setSelectedThreadId={setSelectedThreadId}
            allFilteredSelected={allFilteredSelected}
            toggleSelectAllFiltered={toggleSelectAllFiltered}
            selectedIds={selectedIds}
            selectedImpactCount={selectedImpactRows.length}
            cleanupData={cleanupData}
            busy={busy}
            threadActionsDisabled={showRuntimeBackendDegraded}
            bulkPin={bulkPin}
            bulkUnpin={bulkUnpin}
            bulkArchive={bulkArchive}
            analyzeDelete={analyzeDelete}
            cleanupDryRun={cleanupDryRun}
          />

          {showForensics ? (
            <Suspense
              fallback={
                <section className="panel">
                  <header>
                    <h2>{messages.nav.forensics}</h2>
                    <span>{messages.common.loading}</span>
                  </header>
                  <div className="sub-toolbar">
                    <div className="skeleton-line" />
                  </div>
                </section>
              }
            >
              <ForensicsPanel
                messages={messages}
                threadActionsDisabled={showRuntimeBackendDegraded}
                selectedIds={selectedIds}
                rows={rows}
                busy={busy}
                analyzeDelete={analyzeDelete}
                cleanupDryRun={cleanupDryRun}
                cleanupData={cleanupData}
                selectedImpactRows={selectedImpactRows}
                analysisRaw={analysisRaw}
                cleanupRaw={cleanupRaw}
                analyzeDeleteError={analyzeDeleteError}
                cleanupDryRunError={cleanupDryRunError}
                analyzeDeleteErrorMessage={analyzeDeleteErrorMessage}
                cleanupDryRunErrorMessage={cleanupDryRunErrorMessage}
              />
            </Suspense>
          ) : null}
        </section>
      ) : null}

      {showDetails ? (
        <section
          ref={detailLayoutRef}
          className={`detail-layout ${showThreadDetail && showSessionDetail ? "" : "single"}`.trim()}
        >
          {showThreadDetail ? (
            <Suspense
              fallback={
                <section className="panel">
                  <header>
                    <h2>{messages.threadDetail.title}</h2>
                    <span>{messages.common.loading}</span>
                  </header>
                  <div className="sub-toolbar">
                    <div className="skeleton-line" />
                  </div>
                </section>
              }
            >
              <ThreadDetail
                messages={messages}
                selectedThread={selectedThread}
                selectedThreadId={selectedThreadId}
                searchContext={searchThreadContext}
                threadDetailLoading={threadDetailLoading}
                selectedThreadDetail={selectedThreadDetail}
                threadTranscriptData={threadTranscriptData}
                threadTranscriptLoading={threadTranscriptLoading}
                threadTranscriptLimit={threadTranscriptLimit}
                setThreadTranscriptLimit={setThreadTranscriptLimit}
                busy={busy}
                threadActionsDisabled={showRuntimeBackendDegraded}
                bulkPin={bulkPin}
                bulkUnpin={bulkUnpin}
                bulkArchive={bulkArchive}
                analyzeDelete={analyzeDelete}
                cleanupDryRun={cleanupDryRun}
              />
            </Suspense>
          ) : null}

          {showSessionDetail && !showProviders ? (
            <Suspense
              fallback={
                <section className="panel">
                  <header>
                    <h2>{messages.sessionDetail.title}</h2>
                    <span>{messages.common.loading}</span>
                  </header>
                  <div className="sub-toolbar">
                    <div className="skeleton-line" />
                  </div>
                </section>
              }
            >
              <SessionDetail
                messages={messages}
                selectedSession={selectedSession}
                sessionTranscriptData={sessionTranscriptData}
                sessionTranscriptLoading={sessionTranscriptLoading}
                sessionTranscriptLimit={sessionTranscriptLimit}
                setSessionTranscriptLimit={setSessionTranscriptLimit}
                busy={busy}
                canRunSessionAction={canRunSelectedSessionAction}
                providerDeleteBackupEnabled={providerDeleteBackupEnabled}
                setProviderDeleteBackupEnabled={setProviderDeleteBackupEnabled}
                runSingleProviderAction={runSingleProviderAction}
              />
            </Suspense>
          ) : null}
        </section>
      ) : null}

        {hasGlobalErrorStack ? (
          <section className="error-stack" aria-live="polite">
            <div className="error-stack-head">
              <span className="overview-note-label">runtime issues</span>
            <strong>일부 runtime action이 막혀 있다.</strong>
            </div>
          <div className="error-stack-list">
            {runtime.isError ? <div className="error-box">{messages.errors.runtime}</div> : null}
            {smokeStatus.isError ? <div className="error-box">{messages.errors.smokeStatus}</div> : null}
            {recovery.isError ? <div className="error-box">{messages.errors.recovery}</div> : null}
            {providerMatrix.isError ? <div className="error-box">{messages.errors.providerMatrix}</div> : null}
            {providerSessions.isError ? <div className="error-box">{messages.errors.providerSessions}</div> : null}
            {providerParserHealth.isError ? <div className="error-box">{messages.errors.parserHealth}</div> : null}
            {showGlobalAnalyzeDeleteError ? (
              <div className="error-box">
                <div>{messages.errors.impactAnalysis}</div>
                {analyzeDeleteErrorMessage ? <div className="mono-sub">{analyzeDeleteErrorMessage}</div> : null}
              </div>
            ) : null}
            {showGlobalCleanupDryRunError ? (
              <div className="error-box">
                <div>{messages.errors.cleanupDryRun}</div>
                {cleanupDryRunErrorMessage ? <div className="mono-sub">{cleanupDryRunErrorMessage}</div> : null}
              </div>
            ) : null}
            {providerSessionActionError ? (
              <div className="error-box">
                <div>{messages.errors.providerAction}</div>
                {providerSessionActionErrorMessage ? <div className="mono-sub">{providerSessionActionErrorMessage}</div> : null}
              </div>
            ) : null}
            {bulkActionError && !showRuntimeBackendDegraded ? (
              <div className="error-box">
                <div>{messages.errors.threadAction}</div>
                {bulkActionErrorMessage ? <div className="mono-sub">{bulkActionErrorMessage}</div> : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
        {busy ? <div className="busy-indicator">{messages.busy}</div> : null}
      </main>
    </div>
  );
}
