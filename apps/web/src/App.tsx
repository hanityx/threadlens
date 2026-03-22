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

  return (
    <main className="page">
      <section className="top-actions">
        <div className="layout-nav">
          <button
            type="button"
            className={`view-btn ${layoutView === "overview" ? "is-active" : ""}`}
            onClick={() => changeLayoutView("overview")}
          >
            {messages.nav.overview}
          </button>
          <button
            type="button"
            className={`view-btn ${layoutView === "search" ? "is-active" : ""}`}
            onClick={() => changeLayoutView("search")}
            onMouseEnter={handleSearchIntent}
            onFocus={handleSearchIntent}
          >
            {messages.nav.search}
          </button>
          <button
            type="button"
            className={`view-btn ${layoutView === "threads" ? "is-active" : ""}`}
            onClick={() => changeLayoutView("threads")}
          >
            {messages.nav.threads}
          </button>
          <button
            type="button"
            className={`view-btn ${layoutView === "providers" ? "is-active" : ""}`}
            onClick={() => changeLayoutView("providers")}
            onMouseEnter={handleProvidersIntent}
            onFocus={handleProvidersIntent}
            onTouchStart={handleProvidersIntent}
          >
            {messages.nav.providers}
          </button>
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
              <p>{messages.hero.description}</p>
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
                  {messages.hero.threads} {rows.length}
                </span>
                <span className="meta-chip">
                  {messages.hero.highRisk} {highRiskCount}
                </span>
              </div>
            </div>
            <aside className="hero-console">
              <div className="hero-console-head">
                <span className="overview-note-label">핵심 흐름</span>
                <strong>검색. 정리. 백업.</strong>
                <p>대화를 찾고, 정리 단계를 검토한 뒤, 원본 세션을 먼저 보호해.</p>
              </div>
              <div className="hero-console-steps">
                <article className="hero-console-step">
                  <div>
                    <strong>검색</strong>
                    <p>{visibleProviderSessionSummary.rows}개 세션을 바로 검색해서 맞는 작업 화면으로 이동할 수 있어.</p>
                  </div>
                </article>
                <article className="hero-console-step">
                  <div>
                    <strong>정리</strong>
                    <p>{highRiskCount}개의 고위험 스레드가 드라이런 검토를 기다리고 있어.</p>
                  </div>
                </article>
                <article className="hero-console-step">
                  <div>
                    <strong>백업 보관함</strong>
                    <p>{recovery.data?.summary?.backup_sets ?? 0}개의 백업 세트를 선택 백업이나 전체 export에 바로 쓸 수 있어.</p>
                  </div>
                </article>
              </div>
            </aside>
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
          <section className="panel overview-spotlight">
            <header>
              <h2>워크벤치 런처</h2>
              <span>지금 필요한 작업 surface로 바로 진입해.</span>
            </header>
            <div className="overview-launcher-layout">
              <div className="overview-launcher-main">
                <div className="overview-status-strip">
                  <span>
                    런타임{" "}
                    {runtimeLoading
                      ? "..."
                      : runtime.data?.data?.runtime_backend.reachable
                        ? `${messages.kpi.reachable} · ${runtime.data?.data?.runtime_backend.latency_ms ?? "-"} ms`
                        : messages.kpi.down}
                  </span>
                  <span>
                    정리{" "}
                    {threadsLoading
                      ? "..."
                      : `${highRiskCount} 고위험 · ${messages.kpi.pinned} ${pinnedCount}/${rows.length}`}
                  </span>
                  <span>
                    복구{" "}
                    {recoveryLoading
                      ? "..."
                      : `${recovery.data?.summary?.checklist_done ?? 0}/${recovery.data?.summary?.checklist_total ?? 0} ready · ${messages.kpi.backupSets} ${recovery.data?.summary?.backup_sets ?? 0}`}
                  </span>
                </div>
                <div className="overview-resume-grid">
                  <button
                    type="button"
                    className="overview-resume-card"
                    onClick={() => changeLayoutView("search")}
                    onMouseEnter={handleSearchIntent}
                    onFocus={handleSearchIntent}
                  >
                    <span className="overview-note-label">검색</span>
                    <strong>원문 세션 전체에서 문구 찾기</strong>
                    <p>{visibleProviderSessionSummary.rows}개 세션을 바로 찾고 상세로 들어갈 수 있어.</p>
                  </button>
                  <button
                    type="button"
                    className="overview-resume-card"
                    onClick={() => changeLayoutView("threads")}
                  >
                    <span className="overview-note-label">정리</span>
                    <strong>고위험 Codex 스레드 검토</strong>
                    <p>{highRiskCount}개의 고위험 스레드가 드라이런 검토를 기다리고 있어.</p>
                  </button>
                  <button
                    type="button"
                    className="overview-resume-card"
                    onClick={() => changeLayoutView("providers")}
                    onMouseEnter={handleProvidersIntent}
                    onFocus={handleProvidersIntent}
                  >
                    <span className="overview-note-label">백업</span>
                    <strong>원본 세션부터 보호</strong>
                    <p>{recovery.data?.summary?.backup_sets ?? 0}개의 백업 세트를 바로 쓸 수 있어.</p>
                  </button>
                </div>
              </div>
              <aside className="overview-operator-rail" aria-label="operator guide">
                <div className="overview-operator-card">
                  <span className="overview-note-label">메인 surface</span>
                  <strong>TUI가 daily operator surface</strong>
                  <p>GUI는 먼저 찾고 검토하는 workbench고, 반복 조작은 TUI에서 더 빠르게 처리하는 방향으로 가져가.</p>
                </div>
                <div className="overview-operator-card">
                  <span className="overview-note-label">제품 경계</span>
                  <strong>CLI는 engine, Electron은 local value</strong>
                  <p>CLI는 자동화와 JSON entry만 유지하고, Electron은 Finder reveal, preview, multi-window 같은 로컬 기능만 붙여.</p>
                </div>
                <div className="overview-operator-card">
                  <span className="overview-note-label">지금 backlog</span>
                  <strong>Quartz Mono dark-first 먼저 고정</strong>
                  <p>라이트모드는 구조 파생으로만 만들고, Search와 Sessions는 카드보다 작업 밀도를 우선해서 다듬어.</p>
                </div>
              </aside>
            </div>
          </section>

          <details
            className="overview-secondary-panel"
            open={setupGuideOpen}
            onToggle={(event) => {
              setSetupGuideOpen((event.currentTarget as HTMLDetailsElement).open);
            }}
          >
            <summary>{setupGuideOpen ? "설정 도우미 숨기기" : "선택 설정 도우미"}</summary>
            <div className="overview-secondary-body">
              {setupGuideOpen ? (
                <Suspense
                  fallback={
                    <div className="info-box compact">
                      <strong>{messages.common.loading}</strong>
                      <p>설정 도우미 불러오는 중.</p>
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
                  <strong>워크스페이스를 이미 알면 건너뛰어도 돼.</strong>
                  <p>검색, 정리, 세션으로 바로 가고, 프로바이더 감지나 경로를 다시 확인할 때만 열어.</p>
                </div>
              )}
            </div>
          </details>
          <p className="overview-secondary-note">프로바이더 경로나 감지가 이상할 때만 이 도우미를 열어.</p>
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
            <span>선택, 영향 분석, 드라이런 순서로 검토해.</span>
          </header>
          <div className="cleanup-command-body">
            <div className="thread-workflow-copy">
              <span className="overview-note-label">cleanup workbench</span>
              <strong>고위험 Codex 스레드를 list + review rail로 다뤄.</strong>
              <p>먼저 queue를 좁히고, 영향 분석과 드라이런 토큰을 확인한 뒤 실제 정리 여부를 결정하는 흐름으로 가져가.</p>
            </div>
            <div className="thread-status-grid">
              <article className="thread-status-card">
                <span>queue</span>
                <strong>{visibleRows.length}/{filteredRows.length}</strong>
                <p>현재 렌더링된 스레드 / 필터 결과</p>
              </article>
              <article className={`thread-status-card ${selectedIds.length > 0 ? "is-accent" : ""}`.trim()}>
                <span>selected</span>
                <strong>{selectedIds.length}</strong>
                <p>현재 review 대상에 올린 스레드 수</p>
              </article>
              <article className={`thread-status-card ${cleanupData?.confirm_token_expected ? "is-ready" : ""}`.trim()}>
                <span>dry-run</span>
                <strong>{cleanupData?.confirm_token_expected ? "ready" : "pending"}</strong>
                <p>{selectedImpactRows.length > 0 ? `${selectedImpactRows.length} impact rows ready` : "영향 분석부터 먼저 실행"}</p>
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
                {messages.toolbar.threadsFetchMs} {threadsFetchMs !== null ? `${threadsFetchMs}ms` : "-"}
              </span>
              {threadsFastBooting ? (
                <span className="sub-hint">{messages.toolbar.threadsBootMode}</span>
              ) : null}
              <span className="sub-hint">{messages.toolbar.shortcuts}</span>
              <span className="sub-hint">{messages.toolbar.detailHint}</span>
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
      {busy ? <div className="busy-indicator">{messages.busy}</div> : null}
    </main>
  );
}
