import { lazy, startTransition, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { normalizeDesktopRouteFilePath } from "./app-shell/desktopRoute";
import { DetailShell } from "./app-shell/DetailShell";
import { OverviewWorkbench } from "./app-shell/OverviewWorkbench";
import { ProvidersWorkspace } from "./app-shell/ProvidersWorkspace";
import { RuntimeFeedbackStack } from "./app-shell/RuntimeFeedbackStack";
import { TopShell } from "./app-shell/TopShell";
import { ThreadsWorkbench } from "./app-shell/ThreadsWorkbench";
import {
  compactWorkbenchId,
  formatWorkbenchGroupLabel,
  formatWorkbenchRailDay,
  formatWorkbenchRailTime,
  normalizeWorkbenchSessionTitle,
  normalizeWorkbenchTitle,
  providerFromSourceKey,
} from "./app-shell/workbenchFormat";
import { useAppData } from "./hooks/useAppData";
import { KpiCard } from "./components/KpiCard";
import { ThreadsTable } from "./components/ThreadsTable";
import { useLocale } from "./i18n";
import { compactPath, formatDateTime } from "./lib/helpers";
import type { ConversationSearchHit, LayoutView, ProviderView } from "./types";

const SetupWizard = lazy(async () => {
  const mod = await import("./components/SetupWizard");
  return { default: mod.SetupWizard };
});

const SearchPanel = lazy(async () => {
  const mod = await import("./components/SearchPanel");
  return { default: mod.SearchPanel };
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
  const [headerSearchDraft, setHeaderSearchDraft] = useState("");
  const [headerSearchSeed, setHeaderSearchSeed] = useState("");
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

  const { locale, messages, setLocale } = useLocale();
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
  const overviewCountsLoading =
    runtimeLoading ||
    recoveryLoading ||
    threadsLoading ||
    dataSourcesLoading ||
    providerMatrixLoading ||
    providerSessionsLoading ||
    parserLoading ||
    threadsFastBooting ||
    providersRefreshing ||
    refreshingAllData;
  const overviewBooting =
    overviewCountsLoading &&
    visibleProviderSessionRows.length === 0 &&
    visibleProviderSummary.total === 0 &&
    visibleProviderSessionSummary.rows === 0;
  const activeSummaryText =
    visibleProviderSummary.total > 0
      ? `active ${visibleProviderSummary.active}/${visibleProviderSummary.total}`
      : overviewBooting
        ? "syncing"
        : overviewCountsLoading
          ? "active ..."
        : "active 0/0";
  const reviewSummaryText =
    highRiskCount > 0 ? `review ${highRiskCount}` : overviewCountsLoading ? "review ..." : "review 0";
  const backupSummaryText =
    (recovery.data?.summary?.backup_sets ?? 0) > 0
      ? `backup ${recovery.data?.summary?.backup_sets ?? 0}`
      : overviewCountsLoading
        ? "backup ..."
        : "backup 0";
  const searchRowsText =
    visibleProviderSessionSummary.rows > 0
      ? `${visibleProviderSessionSummary.rows} rows`
      : overviewCountsLoading
        ? "... rows"
        : "0 rows";
  const reviewRowsText =
    highRiskCount > 0 ? `${highRiskCount} flagged` : overviewCountsLoading ? "... flagged" : "0 flagged";
  const syncStatusText = refreshingAllData
    ? "Syncing now"
    : providersRefreshing
      ? "Refreshing providers"
      : providersLastRefreshAt
        ? `Updated ${formatDateTime(providersLastRefreshAt)}`
        : "Idle";
  const recentSessionPreview = useMemo(
    () =>
      [...visibleProviderSessionRows]
        .sort((left, right) => Date.parse(right.mtime || "") - Date.parse(left.mtime || ""))
        .slice(0, 4),
    [visibleProviderSessionRows],
  );
  const focusSession = recentSessionPreview[0] ?? null;
  const focusSessionTitle = focusSession
    ? normalizeWorkbenchSessionTitle(
        focusSession.display_title,
        compactWorkbenchId(focusSession.session_id, "session"),
      )
    : overviewBooting
      ? "Syncing sessions"
      : "Live archive ready";
  const focusSessionMeta = focusSession
    ? `${focusSession.provider} / ${formatWorkbenchRailTime(focusSession.mtime)} / ready`
    : overviewBooting
      ? "providers / parser / runtime"
      : "archive / live / ready";
  const focusSessionCommandId = focusSession
    ? compactWorkbenchId(focusSession.session_id, "session")
    : overviewBooting
      ? "session sync"
      : "session live";
  const focusSessionStatus = focusSession
    ? `${focusSession.provider} active · ${formatWorkbenchRailTime(focusSession.mtime)}`
    : overviewBooting
      ? "hydrating providers"
      : "archive ready";
  const emptySessionScopeLabel = providerView === "all" ? messages.common.allAi : selectedProviderLabel;
  const emptySessionNextTitle = focusSession
    ? normalizeWorkbenchSessionTitle(
        focusSession.display_title,
        compactWorkbenchId(focusSession.session_id, "session"),
      )
    : "";
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
  const flaggedThreadPreview = useMemo(
    () =>
      [...visibleRows]
        .sort((left, right) => {
          const riskDiff = Number(right.risk_score || 0) - Number(left.risk_score || 0);
          if (riskDiff !== 0) return riskDiff;
          return Date.parse(right.timestamp || "") - Date.parse(left.timestamp || "");
        })
        .slice(0, 4),
    [visibleRows],
  );
  const focusReviewThread = flaggedThreadPreview[0] ?? null;
  const focusReviewTitle = focusReviewThread
    ? normalizeWorkbenchTitle(
        focusReviewThread.title,
        compactWorkbenchId(focusReviewThread.thread_id, "thread"),
      )
    : "Review queue idle";
  const focusReviewMeta = focusReviewThread
    ? `${focusReviewThread.source || "thread"} / ${focusReviewThread.risk_level || "review"} / ${formatWorkbenchRailDay(focusReviewThread.timestamp)}`
    : "review / quiet / recent";
  const secondaryFlaggedPreview = flaggedThreadPreview.slice(1, 3);
  const recentThreadPreview = useMemo(
    () =>
      [...visibleRows]
        .sort((left, right) => Date.parse(right.timestamp || "") - Date.parse(left.timestamp || ""))
        .slice(0, 4),
    [visibleRows],
  );
  const recentThreadSummary = (row: (typeof recentThreadPreview)[number]): string => {
    const tags = new Set(row.risk_tags ?? []);
    const noWorkspace = tags.has("no-cwd");
    const orphanCandidate = tags.has("orphan-candidate");
    const contextHigh = tags.has("ctx-high");
    const contextMedium = tags.has("ctx-medium");
    const activity = row.activity_status || "recent";

    if (activity === "running" && contextHigh) {
      return "High-context session with active review work.";
    }
    if (row.risk_level === "high" && noWorkspace) {
      return "No cwd found. Check archive safety before cleanup.";
    }
    if (row.risk_level === "medium" && orphanCandidate) {
      return "Older session trail with weak workspace links.";
    }
    if (row.is_pinned) {
      return "Pinned for follow-up before archive or cleanup.";
    }
    if (contextMedium) {
      return "Workspace context drifted, but the thread still resolves.";
    }
    if (row.source === "sessions") {
      return "Session archive trace with local review context.";
    }
    return "Recent review trail from the local archive.";
  };
  const recentThreadTitle = (row: (typeof recentThreadPreview)[number]): string => {
    const normalized = normalizeWorkbenchTitle(row.title, "");
    if (normalized) return normalized;
    const tags = new Set(row.risk_tags ?? []);
    if (row.activity_status === "running" && tags.has("ctx-high")) return "Running Review Session";
    if (row.risk_level === "high" && tags.has("no-cwd")) return "No-Workspace Review";
    if (row.is_pinned && row.risk_level === "high") return "Pinned Risk Thread";
    if (tags.has("orphan-candidate")) return "Archive Candidate";
    if (tags.has("ctx-medium")) return "Context Drift Note";
    if (row.risk_level === "high") return "Flagged Session Trace";
    if (row.risk_level === "medium") return "Review Candidate";
    return compactWorkbenchId(row.thread_id, "thread");
  };
  const recentThreadGroups = useMemo(() => {
    const groups: Array<{ label: string; rows: typeof recentThreadPreview }> = [];
    for (const row of recentThreadPreview) {
      const label = formatWorkbenchGroupLabel(row.timestamp);
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.rows.push(row);
      } else {
        groups.push({ label, rows: [row] });
      }
    }
    return groups;
  }, [recentThreadPreview]);
  const activeProviderPreview = useMemo(
    () => visibleProviders.filter((provider) => provider.status === "active").slice(0, 4),
    [visibleProviders],
  );
  const activeProviderSummaryLine = activeProviderPreview.length
    ? activeProviderPreview.map((provider) => provider.name).join(" · ")
    : visibleProviderSummary.active > 0
      ? `${visibleProviderSummary.active} active providers`
      : overviewBooting
        ? "Loading provider status."
        : "Waiting for live providers.";
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
  const parserScoreText = overviewBooting
    ? "syncing"
    : overviewCountsLoading
      ? "syncing"
    : visibleParserSummary.parse_score != null
      ? `${visibleParserSummary.parse_score}%`
      : "n/a";
  const runtimeLatencyText = overviewBooting
    ? "sync"
    : overviewCountsLoading
      ? "sync"
    : runtime.data?.data?.runtime_backend.reachable
      ? `${runtime.data?.data?.runtime_backend.latency_ms ?? "-"} ms`
      : "down";
  const backupSetsCount = recovery.data?.summary?.backup_sets ?? 0;

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

  const handleHeaderSearchSubmit = () => {
    const nextQuery = headerSearchDraft.trim();
    if (!nextQuery) return;
    setHeaderSearchSeed(nextQuery);
    startTransition(() => changeLayoutView("search"));
    window.setTimeout(() => {
      const input = document.querySelector(".search-panel .search-input") as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 120);
  };

  const overviewSetupStage = (
    <Suspense
      fallback={
        <div className="info-box compact">
          <strong>{messages.common.loading}</strong>
          <p>Loading setup stage.</p>
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
  );

  const threadsForensicsSlot = (
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
  );

  return (
    <div className="app-shell">
      <main className="page page-shell-main">
        <TopShell
          layoutView={layoutView}
          onChangeLayoutView={changeLayoutView}
          onSearchIntent={handleSearchIntent}
          onProvidersIntent={handleProvidersIntent}
          headerSearchDraft={headerSearchDraft}
          onHeaderSearchDraftChange={setHeaderSearchDraft}
          onHeaderSearchSubmit={handleHeaderSearchSubmit}
          syncStatusText={syncStatusText}
          locale={locale}
          onToggleLocale={() => setLocale(locale === "en" ? "ko" : "en")}
          theme={theme}
          onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          onRefresh={() => {
            void refreshAllData();
          }}
          refreshDisabled={busy || refreshingAllData}
          refreshingAllData={refreshingAllData}
          labels={{
            overview: messages.nav.overview,
            search: messages.nav.search,
            threads: messages.nav.threads,
            providers: messages.nav.providers,
            light: messages.nav.light,
            dark: messages.nav.dark,
            switchToLight: messages.nav.switchToLight,
            switchToDark: messages.nav.switchToDark,
            syncHint: messages.nav.syncHint,
          }}
        />

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
          <OverviewWorkbench
            setupGuideOpen={setupGuideOpen}
            onToggleSetupGuide={() => setSetupGuideOpen((prev) => !prev)}
            onCloseSetupGuide={() => setSetupGuideOpen(false)}
            onOpenThreads={() => changeLayoutView("threads")}
            onOpenProviders={() => changeLayoutView("providers")}
            onProvidersIntent={handleProvidersIntent}
            onOpenSearch={() => changeLayoutView("search")}
            onSearchIntent={handleSearchIntent}
            onOpenRecentSession={(row) => {
              changeProviderView(visibleProviderIdSet.has(row.provider) ? (row.provider as ProviderView) : "all");
              setSelectedSessionPath(row.file_path);
              changeLayoutView("providers");
            }}
            onOpenRecentThread={(threadId) => {
              setSelectedThreadId(threadId);
              changeLayoutView("threads");
            }}
            runtimeLatencyText={runtimeLatencyText}
            focusSessionCommandId={focusSessionCommandId}
            focusSessionStatus={focusSessionStatus}
            visibleProviderSessionSummary={visibleProviderSessionSummary}
            highRiskCount={highRiskCount}
            syncStatusText={syncStatusText}
            focusSessionTitle={focusSessionTitle}
            focusSessionMeta={focusSessionMeta}
            overviewBooting={overviewBooting}
            visibleProviderSummary={visibleProviderSummary}
            searchRowsText={searchRowsText}
            reviewRowsText={reviewRowsText}
            recentSessionPreview={recentSessionPreview}
            focusReviewTitle={focusReviewTitle}
            focusReviewMeta={focusReviewMeta}
            secondaryFlaggedPreview={secondaryFlaggedPreview}
            activeSummaryText={activeSummaryText}
            activeProviderSummaryLine={activeProviderSummaryLine}
            parserScoreText={parserScoreText}
            backupSetsCount={backupSetsCount}
            recentThreadGroups={recentThreadGroups}
            getRecentThreadTitle={recentThreadTitle}
            getRecentThreadSummary={recentThreadSummary}
            setupStageContent={overviewSetupStage}
          />
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
            initialQuery={headerSearchSeed}
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
        <ProvidersWorkspace
          messages={messages}
          panelProps={{
            messages,
            providers: visibleProviders,
            providerSummary: visibleProviderSummary,
            providerMatrixLoading,
            providerTabs: visibleProviderTabs,
            slowProviderIds: visibleSlowProviderIds,
            slowProviderThresholdMs,
            setSlowProviderThresholdMs,
            providerView,
            setProviderView,
            providerDataDepth,
            setProviderDataDepth,
            providerSessionRows: visibleProviderSessionRows,
            allProviderSessionRows: allVisibleProviderSessionRows,
            providerSessionSummary: visibleProviderSessionSummary,
            providerSessionsLimit,
            providerRowsSampled,
            dataSourceRows: visibleDataSourceRows,
            dataSourcesLoading,
            providerSessionsLoading,
            selectedProviderFiles,
            setSelectedProviderFiles,
            allProviderRowsSelected: visibleAllProviderRowsSelected,
            toggleSelectAllProviderRows,
            selectedProviderLabel,
            selectedProviderFilePaths,
            canRunProviderAction,
            busy,
            providerDeleteBackupEnabled,
            setProviderDeleteBackupEnabled,
            runProviderAction,
            providerActionData,
            runRecoveryBackupExport,
            recoveryBackupExportData,
            parserReports: visibleParserReports,
            allParserReports: allVisibleParserReports,
            parserLoading,
            parserSummary: visibleParserSummary,
            selectedSessionPath,
            setSelectedSessionPath,
            providersRefreshing,
            providersLastRefreshAt,
            providerFetchMetrics,
            refreshProvidersData,
          }}
          sessionDetailKey={selectedSession?.file_path ?? "empty-session-detail"}
          sessionDetailProps={{
            messages,
            selectedSession,
            emptyScopeLabel: emptySessionScopeLabel,
            emptyScopeRows: visibleProviderSessionSummary.rows,
            emptyScopeReady: visibleProviderSessionSummary.parse_ok,
            emptyNextSessionTitle: emptySessionNextTitle,
            sessionTranscriptData,
            sessionTranscriptLoading,
            sessionTranscriptLimit,
            setSessionTranscriptLimit,
            busy,
            canRunSessionAction: canRunSelectedSessionAction,
            providerDeleteBackupEnabled,
            setProviderDeleteBackupEnabled,
            runSingleProviderAction,
          }}
          providersDiagnosticsOpen={providersDiagnosticsOpen}
          onToggleDiagnostics={(nextOpen) => {
            setProvidersDiagnosticsOpen(nextOpen);
            if (nextOpen) handleDiagnosticsIntent();
          }}
          showRouting={showRouting}
          routingPanelProps={{
            messages,
            data: executionGraphData,
            loading: executionGraphLoading,
            providerView,
            providerSessionRows: visibleProviderSessionRows,
            parserReports: visibleParserReports,
            visibleProviderIds,
          }}
        />
      ) : null}

      {showThreadsTable ? (
        <ThreadsWorkbench
          messages={messages}
          threadSearchInputRef={threadSearchInputRef}
          query={query}
          onQueryChange={setQuery}
          filterMode={filterMode}
          onFilterModeChange={setFilterMode}
          threadsFetchMs={threadsFetchMs}
          threadsFastBooting={threadsFastBooting}
          visibleCount={visibleRows.length}
          filteredCount={filteredRows.length}
          selectedCount={selectedIds.length}
          dryRunReady={Boolean(cleanupData?.confirm_token_expected)}
          selectedImpactCount={selectedImpactRows.length}
          showForensics={showForensics}
          threadsTableProps={{
            messages,
            visibleRows,
            filteredRows,
            totalCount: threads.data?.total ?? rows.length,
            threadsLoading,
            threadsError: threads.isError,
            selected,
            setSelected,
            selectedThreadId,
            setSelectedThreadId,
            allFilteredSelected,
            toggleSelectAllFiltered,
            selectedIds,
            selectedImpactCount: selectedImpactRows.length,
            cleanupData,
            busy,
            threadActionsDisabled: showRuntimeBackendDegraded,
            bulkPin,
            bulkUnpin,
            bulkArchive,
            analyzeDelete,
            cleanupDryRun,
          }}
          forensicsSlot={threadsForensicsSlot}
        />
      ) : null}

      <DetailShell
        messages={messages}
        detailLayoutRef={detailLayoutRef}
        showDetails={showDetails}
        showThreadDetail={showThreadDetail}
        showSessionDetail={showSessionDetail}
        showProviders={showProviders}
        threadDetailProps={{
          messages,
          selectedThread,
          selectedThreadId,
          visibleThreadCount: visibleRows.length,
          filteredThreadCount: filteredRows.length,
          highRiskCount,
          nextThreadTitle: normalizeWorkbenchTitle(
            visibleRows[0]?.title,
            visibleRows[0]?.thread_id ? `thread ${visibleRows[0].thread_id.slice(0, 8)}` : "",
          ),
          nextThreadSource: visibleRows[0]?.source || "open from threads or recent review rows",
          searchContext: searchThreadContext,
          threadDetailLoading,
          selectedThreadDetail,
          threadTranscriptData,
          threadTranscriptLoading,
          threadTranscriptLimit,
          setThreadTranscriptLimit,
          busy,
          threadActionsDisabled: showRuntimeBackendDegraded,
          bulkPin,
          bulkUnpin,
          bulkArchive,
          analyzeDelete,
          cleanupDryRun,
        }}
        sessionDetailProps={{
          messages,
          selectedSession,
          emptyScopeLabel: emptySessionScopeLabel,
          emptyScopeRows: visibleProviderSessionSummary.rows,
          emptyScopeReady: visibleProviderSessionSummary.parse_ok,
          emptyNextSessionTitle: emptySessionNextTitle,
          sessionTranscriptData,
          sessionTranscriptLoading,
          sessionTranscriptLimit,
          setSessionTranscriptLimit,
          busy,
          canRunSessionAction: canRunSelectedSessionAction,
          providerDeleteBackupEnabled,
          setProviderDeleteBackupEnabled,
          runSingleProviderAction,
        }}
      />

      <RuntimeFeedbackStack
        messages={messages}
        hasGlobalErrorStack={hasGlobalErrorStack}
        runtimeError={runtime.isError}
        smokeStatusError={smokeStatus.isError}
        recoveryError={recovery.isError}
        providerMatrixError={providerMatrix.isError}
        providerSessionsError={providerSessions.isError}
        providerParserHealthError={providerParserHealth.isError}
        showGlobalAnalyzeDeleteError={showGlobalAnalyzeDeleteError}
        analyzeDeleteErrorMessage={analyzeDeleteErrorMessage}
        showGlobalCleanupDryRunError={showGlobalCleanupDryRunError}
        cleanupDryRunErrorMessage={cleanupDryRunErrorMessage}
        providerSessionActionError={Boolean(providerSessionActionError)}
        providerSessionActionErrorMessage={providerSessionActionErrorMessage}
        bulkActionError={Boolean(bulkActionError)}
        bulkActionErrorMessage={bulkActionErrorMessage}
        showRuntimeBackendDegraded={showRuntimeBackendDegraded}
        busy={busy}
      />
      </main>
    </div>
  );
}
