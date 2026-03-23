import { lazy, startTransition, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "./hooks/useAppData";
import { KpiCard } from "./components/KpiCard";
import { ThreadsTable } from "./components/ThreadsTable";
import { getMessages } from "./i18n";
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

const compactWorkbenchId = (value?: string | null, prefix = "item"): string => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return prefix;
  const normalized = trimmed.toLowerCase().startsWith(`${prefix.toLowerCase()}-`)
    ? trimmed.slice(prefix.length + 1)
    : trimmed;
  const useTail = /^\d{4}-\d{2}-/.test(normalized);
  if (normalized.length <= 18) return `${prefix} ${normalized}`;
  return `${prefix} ${useTail ? normalized.slice(-8) : normalized.slice(0, 8)}`;
};

const normalizeWorkbenchTitle = (value?: string | null, fallback?: string | null): string => {
  const trimmed = String(value || "").trim();
  const fallbackText = String(fallback || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "none") {
    return fallbackText;
  }
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  if (uuidLike && fallbackText) {
    return fallbackText;
  }
  return trimmed;
};

const normalizeWorkbenchSessionTitle = (value?: string | null, fallback?: string | null): string => {
  const normalized = normalizeWorkbenchTitle(value, fallback);
  const fallbackText = String(fallback || "").trim();
  const lower = normalized.toLowerCase();
  const looksGenerated =
    lower.startsWith("rollout-") ||
    normalized.includes("AGENTS.md") ||
    normalized.includes("<INSTRUCTIONS>") ||
    normalized.includes("/user-root/") ||
    normalized.length > 72;
  return looksGenerated && fallbackText ? fallbackText : normalized;
};

const formatWorkbenchRailDay = (value?: string | null): string => {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
};

const formatWorkbenchRailTime = (value?: string | null): string => {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatWorkbenchGroupLabel = (value?: string | null): string => {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date).toUpperCase();
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

  const messages = getMessages("ko");
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

  return (
    <div className="app-shell">
      <main className="page page-shell-main">
        <section className="top-actions">
          <div className="top-actions-main">
            <div className="top-actions-copy">
              <span className="top-actions-label">observatory ai</span>
              <strong>Provider Observatory</strong>
            </div>
            <nav className="top-surface-nav" aria-label="surface tabs">
              <button
                type="button"
                className={`top-surface-btn ${layoutView === "overview" ? "is-active" : ""}`}
                onClick={() => changeLayoutView("overview")}
              >
                {messages.nav.overview}
              </button>
              <button
                type="button"
                className={`top-surface-btn ${layoutView === "search" ? "is-active" : ""}`}
                onClick={() => changeLayoutView("search")}
                onMouseEnter={handleSearchIntent}
                onFocus={handleSearchIntent}
              >
                {messages.nav.search}
              </button>
              <button
                type="button"
                className={`top-surface-btn ${layoutView === "threads" ? "is-active" : ""}`}
                onClick={() => changeLayoutView("threads")}
              >
                {messages.nav.threads}
              </button>
              <button
                type="button"
                className={`top-surface-btn ${layoutView === "providers" ? "is-active" : ""}`}
                onClick={() => changeLayoutView("providers")}
                onMouseEnter={handleProvidersIntent}
                onFocus={handleProvidersIntent}
              >
                {messages.nav.providers}
              </button>
            </nav>
          </div>
          <div className="top-actions-tools">
            <form
              className="top-search-shell"
              onSubmit={(event) => {
                event.preventDefault();
                const nextQuery = headerSearchDraft.trim();
                if (!nextQuery) return;
                setHeaderSearchSeed(nextQuery);
                startTransition(() => changeLayoutView("search"));
                window.setTimeout(() => {
                  const input = document.querySelector(".search-panel .search-input") as HTMLInputElement | null;
                  input?.focus();
                  input?.select();
                }, 120);
              }}
            >
              <span className="top-search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                type="search"
                className="top-search-input"
                placeholder="Jump to sessions, threads, keywords..."
                value={headerSearchDraft}
                onChange={(event) => setHeaderSearchDraft(event.target.value)}
              />
            </form>
            <div className="top-controls">
              <span className="top-sync-status" aria-live="polite">
                {syncStatusText}
              </span>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                title={theme === "dark" ? messages.nav.switchToLight : messages.nav.switchToDark}
              >
                {theme === "dark" ? messages.nav.light : messages.nav.dark}
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  void refreshAllData();
                }}
                disabled={busy || refreshingAllData}
                title={messages.nav.syncHint}
              >
                {refreshingAllData ? "Syncing" : "Sync"}
              </button>
            </div>
          </div>
        </section>

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
          <section className="overview-workbench">
            {!setupGuideOpen ? (
              <div className="overview-workbench-grid">
              <section className="panel overview-stage overview-main-canvas">
                <div className="overview-stage-header overview-main-head">
                  <div className="overview-stage-title overview-main-title">
                    <span className="overview-note-label">session workbench</span>
                    <h1>Provider Observatory</h1>
                    <p>Sessions, review, archive.</p>
                  </div>
                  <div className="overview-header-actions">
                    <button
                      type="button"
                      className="overview-header-btn is-quiet"
                      onClick={() => setSetupGuideOpen((prev) => !prev)}
                    >
                      {setupGuideOpen ? "Close setup" : "Setup"}
                    </button>
                    <button
                      type="button"
                      className="overview-header-btn"
                      onClick={() => changeLayoutView("threads")}
                    >
                      Review
                    </button>
                    <button
                      type="button"
                      className="overview-header-btn is-primary"
                      onClick={() => changeLayoutView("providers")}
                      onMouseEnter={handleProvidersIntent}
                      onFocus={handleProvidersIntent}
                    >
                      Sessions
                    </button>
                  </div>
                </div>

                <div className="overview-stage-layout overview-stage-layout-workbench">
                  <section className="overview-command-shell" aria-label="workbench command shell">
                    <div className="overview-window-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="overview-command-breadcrumb">
                      <span className="overview-command-path is-brand">obs-node</span>
                      <span className="overview-command-slash">/</span>
                      <span className="overview-command-path">sessions</span>
                      <span className="overview-command-slash">/</span>
                      <span className="overview-command-path is-active">active</span>
                      <span className="overview-command-runtime">{runtimeLatencyText}</span>
                    </div>
                    <div className="overview-command-strip">
                      <div className="overview-command-summary">
                        <strong>{focusSessionCommandId}</strong>
                        <span>{focusSessionStatus}</span>
                      </div>
                      <div className="overview-command-metrics" aria-label="workbench status">
                        <span>
                          <strong>{visibleProviderSessionSummary.parse_ok}</strong> ready
                        </span>
                        <span>
                          <strong>{highRiskCount}</strong> flagged
                        </span>
                        <span>{syncStatusText}</span>
                      </div>
                    </div>
                  </section>

                  <div className="overview-insight-grid">
                    <article className="overview-insight-card is-primary">
                      <div className="overview-primary-panel-grid">
                        <div className="overview-primary-copy">
                          <span className="overview-note-label">session focus</span>
                          <strong className="overview-primary-focus-title">{focusSessionTitle}</strong>
                          <div className="overview-primary-focus-meta">{focusSessionMeta}</div>
                          <p className="overview-primary-summary">
                            {overviewBooting
                              ? "Loading recent sessions, parser health, and active providers."
                              : `${visibleProviderSessionSummary.parse_ok}/${visibleProviderSessionSummary.rows || "..."} ready across ${visibleProviderSummary.active || "..."} active AI. Search, review, or open the archive next.`}
                          </p>
                          <div className="overview-primary-focus-kpis" aria-label="focus session summary">
                            <article>
                              <span>rows</span>
                              <strong>{searchRowsText}</strong>
                            </article>
                            <article>
                              <span>review</span>
                              <strong>{reviewRowsText}</strong>
                            </article>
                          </div>
                          <div className="overview-card-actions" aria-label="workbench quick actions">
                            <button
                              type="button"
                              className="overview-card-action is-quiet"
                              onClick={() => changeLayoutView("search")}
                              onMouseEnter={handleSearchIntent}
                              onFocus={handleSearchIntent}
                            >
                              <span>Search</span>
                            </button>
                            <button
                              type="button"
                              className="overview-card-action"
                              onClick={() => changeLayoutView("threads")}
                            >
                              <span>Review</span>
                            </button>
                            <button
                              type="button"
                              className="overview-card-action is-primary"
                              onClick={() => changeLayoutView("providers")}
                              onMouseEnter={handleProvidersIntent}
                              onFocus={handleProvidersIntent}
                            >
                              <span>Sessions</span>
                            </button>
                          </div>
                        </div>
                        <div className="overview-primary-list">
                          <span className="overview-note-label">ready now</span>
                          <div className="overview-primary-list-items">
                            {recentSessionPreview.length ? (
                              recentSessionPreview.slice(0, 3).map((row) => (
                                <button
                                  key={`overview-primary-ready-${row.file_path}`}
                                  type="button"
                                  className="overview-primary-list-item"
                                  onClick={() => {
                                    changeProviderView(visibleProviderIdSet.has(row.provider) ? (row.provider as ProviderView) : "all");
                                    setSelectedSessionPath(row.file_path);
                                    changeLayoutView("providers");
                                  }}
                                >
                                  <strong>
                                    {normalizeWorkbenchSessionTitle(
                                      row.display_title,
                                      compactWorkbenchId(row.session_id, "session"),
                                    )}
                                  </strong>
                                  <span>
                                    {row.provider} · {formatWorkbenchRailTime(row.mtime)}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <div className="overview-primary-list-empty">
                                {overviewBooting ? "Syncing recent rows." : "No recent sessions yet."}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                    <div className="overview-support-stack">
                      <article className="overview-insight-card is-review">
                        <div className="overview-review-head">
                          <span className="overview-note-label">review queue</span>
                          <span className="overview-review-pill">{reviewRowsText}</span>
                        </div>
                        <div className="overview-review-focus">
                          <span className="overview-review-kicker">focus thread</span>
                          <div className="overview-review-title">{focusReviewTitle}</div>
                          <div className="overview-review-meta">{focusReviewMeta}</div>
                        </div>
                        {secondaryFlaggedPreview.length ? (
                          <div className="overview-review-list">
                            {secondaryFlaggedPreview.map((row) => (
                              <div key={`overview-review-secondary-${row.thread_id}`} className="overview-review-list-item">
                                <strong>
                                  {normalizeWorkbenchTitle(
                                    row.title,
                                    compactWorkbenchId(row.thread_id, "thread"),
                                  )}
                                </strong>
                                <span>
                                  {row.source || "thread"} / {row.risk_level || compactWorkbenchId(row.thread_id, "thread")}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p>No additional flagged threads.</p>
                        )}
                      </article>
                      <div className="overview-support-mini-grid">
                        <article className="overview-insight-card is-mini">
                          <span className="overview-note-label">active ai</span>
                          <strong>{activeSummaryText}</strong>
                          <p>{activeProviderSummaryLine}</p>
                        </article>
                        <article className="overview-insight-card is-mini">
                          <span className="overview-note-label">vault health</span>
                          <strong>{parserScoreText}</strong>
                          <p>
                            {overviewBooting
                              ? "Loading parser and runtime."
                              : `${backupSetsCount} backups · runtime ${runtimeLatencyText}`}
                          </p>
                        </article>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <aside className="overview-side-rail">
                <section className="overview-side-card overview-side-card-history">
                  <div className="overview-side-head is-history">
                    <div className="overview-side-headline">
                      <span className="overview-side-head-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" focusable="false">
                          <path
                            d="M12 8v5l3 2m5-3a8 8 0 1 1-2.34-5.66M20 4v4h-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <strong>Recent Threads</strong>
                    </div>
                  </div>
                  <div className="overview-side-list overview-side-list-history">
                    {recentThreadGroups.length ? (
                      recentThreadGroups.map((group) => (
                        <section key={`overview-thread-group-${group.label}`} className="overview-side-group">
                          <div className="overview-side-group-head">
                            <span>{group.label}</span>
                          </div>
                          <div className="overview-side-group-list">
                            {group.rows.map((row) => (
                              <button
                                key={`overview-thread-${row.thread_id}`}
                                type="button"
                                className="overview-side-item overview-side-item-history"
                                onClick={() => {
                                  setSelectedThreadId(row.thread_id);
                                  changeLayoutView("threads");
                                }}
                              >
                                <div className="overview-side-item-meta">
                                  <span>{formatWorkbenchRailTime(row.timestamp)}</span>
                                </div>
                                <div className="overview-side-item-copy">
                                  <strong>
                                    {recentThreadTitle(row)}
                                  </strong>
                                  <p>{recentThreadSummary(row)}</p>
                                </div>
                                <div className="overview-side-item-dots" aria-hidden="true">
                                  <span className={row.risk_level === "high" ? "is-active" : ""} />
                                  <span className={row.is_pinned ? "is-active" : ""} />
                                  <span className={row.activity_status === "active" ? "is-active" : ""} />
                                </div>
                              </button>
                            ))}
                          </div>
                        </section>
                      ))
                    ) : (
                      <div className="overview-side-empty">Waiting for threads.</div>
                    )}
                  </div>
                </section>

                <section className="overview-side-card overview-side-card-status">
                  <div className="overview-side-head">
                    <span className="overview-note-label">system</span>
                    <strong>{syncStatusText}</strong>
                  </div>
                  <div className="overview-side-status-list">
                    <article className="overview-side-status-item">
                      <span>runtime</span>
                      <strong>{runtimeLatencyText}</strong>
                    </article>
                    <article className="overview-side-status-item">
                      <span>parser</span>
                      <strong>{parserScoreText}</strong>
                    </article>
                    <article className="overview-side-status-item">
                      <span>backups</span>
                      <strong>{backupSetsCount}</strong>
                    </article>
                    <article className="overview-side-status-item">
                      <span>ready rows</span>
                      <strong>{visibleProviderSessionSummary.parse_ok}</strong>
                    </article>
                  </div>
                </section>
              </aside>
              </div>
            ) : (
              <section className="overview-secondary-panel overview-setup-stage" aria-label="setup stage">
                <div className="overview-secondary-head">
                  <span className="overview-note-label">setup stage</span>
                  <button
                    type="button"
                    className="overview-secondary-close"
                    onClick={() => setSetupGuideOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <div className="overview-secondary-body">
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
                </div>
              </section>
            )}
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
                    emptyScopeLabel={emptySessionScopeLabel}
                    emptyScopeRows={visibleProviderSessionSummary.rows}
                    emptyScopeReady={visibleProviderSessionSummary.parse_ok}
                    emptyNextSessionTitle={emptySessionNextTitle}
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
              diagnosticsSlot={
                <details
                  className="panel panel-disclosure session-routing-disclosure"
                  open={providersDiagnosticsOpen}
                  onToggle={(event) => {
                    const nextOpen = (event.currentTarget as HTMLDetailsElement).open;
                    setProvidersDiagnosticsOpen(nextOpen);
                    if (nextOpen) handleDiagnosticsIntent();
                  }}
                >
                  <summary>
                    <span className="session-routing-disclosure-copy">
                      <strong>{messages.nav.routing}</strong>
                      <span>{providersDiagnosticsOpen ? "paths / findings" : "scan / flow"}</span>
                    </span>
                    <span className="session-routing-disclosure-state">
                      {providersDiagnosticsOpen ? "Hide" : "Open"}
                    </span>
                  </summary>
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
          </section>
        </>
      ) : null}

      {showThreadsTable ? (
        <section className="panel cleanup-command-shell">
          <header>
            <h2>Review</h2>
            <span>impact / dry-run</span>
          </header>
          <div className="cleanup-command-body">
            <div className="thread-workflow-copy">
              <span className="overview-note-label">review workbench</span>
              <strong>pick threads and review</strong>
              <p>impact / dry-run / rail</p>
            </div>
            <div className="thread-status-grid">
              <article className="thread-status-card">
                <span>visible</span>
                <strong>{visibleRows.length}/{filteredRows.length}</strong>
                <p>rows</p>
              </article>
              <article className={`thread-status-card ${selectedIds.length > 0 ? "is-accent" : ""}`.trim()}>
                <span>selected</span>
                <strong>{selectedIds.length}</strong>
                <p>review rail</p>
              </article>
              <article className={`thread-status-card ${cleanupData?.confirm_token_expected ? "is-ready" : ""}`.trim()}>
                <span>dry-run</span>
                <strong>{cleanupData?.confirm_token_expected ? "ready" : "pending"}</strong>
                <p>{selectedImpactRows.length > 0 ? `${selectedImpactRows.length} impact` : "impact first"}</p>
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
                visibleThreadCount={visibleRows.length}
                filteredThreadCount={filteredRows.length}
                highRiskCount={highRiskCount}
                nextThreadTitle={normalizeWorkbenchTitle(
                  visibleRows[0]?.title,
                  visibleRows[0]?.thread_id ? `thread ${visibleRows[0].thread_id.slice(0, 8)}` : "",
                )}
                nextThreadSource={visibleRows[0]?.source || "open from threads or recent review rows"}
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
                emptyScopeLabel={emptySessionScopeLabel}
                emptyScopeRows={visibleProviderSessionSummary.rows}
                emptyScopeReady={visibleProviderSessionSummary.parse_ok}
                emptyNextSessionTitle={emptySessionNextTitle}
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
            <strong>Some runtime actions are blocked.</strong>
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
