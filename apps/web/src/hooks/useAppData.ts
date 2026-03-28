import { useCallback, useMemo } from "react";
import type {
  LayoutView,
  ProviderSessionRow,
} from "../types";
import { usePreferences } from "./usePreferences";
import { useThreadsData } from "./useThreadsData";
import { useProvidersData } from "./useProvidersData";
import { useDetailData } from "./useDetailData";
import { useMutations } from "./useMutations";

/* ------------------------------------------------------------------ */
/*  useAppData – compositor hook                                       */
/*  Composes domain hooks and exposes the same public API as before.   */
/* ------------------------------------------------------------------ */

export function useAppData(options?: { providersDiagnosticsOpen?: boolean }) {
  const providersDiagnosticsOpen = options?.providersDiagnosticsOpen ?? false;

  /* ---- domain hooks ---- */
  const prefs = usePreferences();
  const threadsData = useThreadsData(prefs.layoutView);
  const providersData = useProvidersData({
    layoutView: prefs.layoutView,
    providerView: prefs.providerView,
    setProviderView: prefs.setProviderView,
    providerDataDepth: prefs.providerDataDepth,
    slowProviderThresholdMs: prefs.slowProviderThresholdMs,
    providersDiagnosticsOpen,
  });

  const selectedSession = useMemo(
    () => providersData.providerSessionRows.find((row: ProviderSessionRow) => row.file_path === providersData.selectedSessionPath) ?? null,
    [providersData.providerSessionRows, providersData.selectedSessionPath],
  );
  const selectedThread = useMemo(
    () => threadsData.rows.find((row) => row.thread_id === threadsData.selectedThreadId) ?? null,
    [threadsData.rows, threadsData.selectedThreadId],
  );
  const providerById = useMemo(
    () => new Map((providersData.providers ?? []).map((p: { provider: string; capabilities?: { safe_cleanup?: boolean } }) => [p.provider, p])),
    [providersData.providers],
  );

  const detailData = useDetailData({
    selectedThreadId: threadsData.selectedThreadId,
    selectedSession,
    rows: threadsData.rows,
    providerSessionRows: providersData.providerSessionRows,
    selectedSessionPath: providersData.selectedSessionPath,
    providerById,
  });

  const mutations = useMutations({
    layoutView: prefs.layoutView,
    providerView: prefs.providerView,
    selectedProviderFilePaths: providersData.selectedProviderFilePaths,
  });

  const selectedSet = new Set(threadsData.selectedIds);
  const selectedImpactRows = (mutations.analysisData?.reports ?? []).filter((r: { id: string }) => selectedSet.has(r.id));

  /* ---- computed UI flags ---- */
  const showProviders = prefs.layoutView === "providers";
  const showThreadsTable = prefs.layoutView === "threads";
  const showForensics = prefs.layoutView === "threads";
  const showRouting = prefs.layoutView === "providers";
  const showDetails = prefs.layoutView === "threads" || prefs.layoutView === "providers";

  /* ---- refreshAllData ---- */
  const refreshAllData = useCallback(async () => {
    if (providersData.globalRefreshPending) return;
    providersData.setGlobalRefreshPending(true);
    try {
      const refreshJobs: Array<Promise<unknown>> = [
        mutations.runtime.refetch({ cancelRefetch: false }),
        threadsData.threads.refetch({ cancelRefetch: false }),
        mutations.smokeStatus.refetch({ cancelRefetch: false }),
        mutations.recovery.refetch({ cancelRefetch: false }),
      ];
      if (prefs.layoutView === "providers") {
        refreshJobs.push(providersData.executionGraph.refetch({ cancelRefetch: false }));
      }
      await Promise.allSettled(refreshJobs);
      if (prefs.layoutView === "providers" || prefs.layoutView === "overview") {
        await providersData.refreshProvidersData();
      }
    } finally {
      providersData.setGlobalRefreshPending(false);
    }
  }, [
    providersData.globalRefreshPending,
    providersData.setGlobalRefreshPending,
    providersData.executionGraph,
    providersData.refreshProvidersData,
    mutations.runtime,
    threadsData.threads,
    mutations.smokeStatus,
    mutations.recovery,
    prefs.layoutView,
  ]);

  /* ---- public API (identical shape to original) ---- */
  return {
    /* UI state */
    theme: prefs.theme, setTheme: prefs.setTheme,
    density: prefs.density, setDensity: prefs.setDensity,
    layoutView: prefs.layoutView, setLayoutView: prefs.setLayoutView,
    query: threadsData.query, setQuery: threadsData.setQuery,
    filterMode: threadsData.filterMode, setFilterMode: threadsData.setFilterMode,
    providerView: prefs.providerView, setProviderView: prefs.setProviderView,
    providerDataDepth: prefs.providerDataDepth, setProviderDataDepth: prefs.setProviderDataDepth,
    slowProviderThresholdMs: prefs.slowProviderThresholdMs, setSlowProviderThresholdMs: prefs.setSlowProviderThresholdMs,
    selected: threadsData.selected, setSelected: threadsData.setSelected,
    selectedProviderFiles: providersData.selectedProviderFiles, setSelectedProviderFiles: providersData.setSelectedProviderFiles,
    selectedThreadId: threadsData.selectedThreadId, setSelectedThreadId: threadsData.setSelectedThreadId,
    selectedSessionPath: providersData.selectedSessionPath, setSelectedSessionPath: providersData.setSelectedSessionPath,

    /* query results */
    runtime: mutations.runtime, smokeStatus: mutations.smokeStatus,
    threads: threadsData.threads, recovery: mutations.recovery,
    dataSources: providersData.dataSources,
    providerMatrix: providersData.providerMatrix,
    providerSessions: providersData.providerSessions,
    providerParserHealth: providersData.providerParserHealth,
    executionGraph: providersData.executionGraph,

    /* mutations */
    bulkPin: mutations.bulkPin, bulkUnpin: mutations.bulkUnpin, bulkArchive: mutations.bulkArchive,
    analyzeDelete: mutations.analyzeDelete, cleanupDryRun: mutations.cleanupDryRun, cleanupExecute: mutations.cleanupExecute,
    analyzeDeleteError: mutations.analyzeDeleteError, cleanupDryRunError: mutations.cleanupDryRunError, cleanupExecuteError: mutations.cleanupExecuteError,
    analyzeDeleteErrorMessage: mutations.analyzeDeleteErrorMessage, cleanupDryRunErrorMessage: mutations.cleanupDryRunErrorMessage, cleanupExecuteErrorMessage: mutations.cleanupExecuteErrorMessage,
    bulkActionError: mutations.bulkActionError, bulkActionErrorMessage: mutations.bulkActionErrorMessage,
    providerSessionActionError: mutations.providerSessionActionError, providerSessionActionErrorMessage: mutations.providerSessionActionErrorMessage,

    /* derived – threads */
    rows: threadsData.rows, filteredRows: threadsData.filteredRows, visibleRows: threadsData.visibleRows,
    selectedIds: threadsData.selectedIds, allFilteredSelected: threadsData.allFilteredSelected,
    pinnedCount: threadsData.pinnedCount, highRiskCount: threadsData.highRiskCount,

    /* derived – analysis / cleanup */
    analysisRaw: mutations.analysisRaw, cleanupRaw: mutations.cleanupRaw,
    analysisData: mutations.analysisData, cleanupData: mutations.cleanupData, pendingCleanup: mutations.pendingCleanup,
    smokeStatusLatest: mutations.smokeStatusLatest,
    selectedImpactRows,

    /* derived – providers */
    providers: providersData.providers, providerSummary: providersData.providerSummary,
    providerTabs: providersData.providerTabs, providerSessionRows: providersData.providerSessionRows,
    allProviderSessionRows: providersData.allProviderSessionRows,
    slowProviderIds: providersData.slowProviderIds,
    providerSessionSummary: providersData.providerSessionSummary,
    providerSessionsLimit: providersData.providerSessionsLimit,
    providerRowsSampled: providersData.providerRowsSampled,
    dataSourceRows: providersData.dataSourceRows,
    allProviderRowsSelected: providersData.allProviderRowsSelected,
    selectedProviderLabel: providersData.selectedProviderLabel,
    selectedProviderFilePaths: providersData.selectedProviderFilePaths,
    canRunProviderAction: providersData.canRunProviderAction,
    canRunSelectedSessionAction: detailData.canRunSelectedSessionAction,
    providerActionData: mutations.providerActionData,
    providerActionSelection: mutations.providerActionSelection,
    providerDeleteBackupEnabled: mutations.providerDeleteBackupEnabled, setProviderDeleteBackupEnabled: mutations.setProviderDeleteBackupEnabled,
    recoveryBackupExportData: mutations.recoveryBackupExportData,
    allParserReports: providersData.allParserReports,
    parserReports: providersData.parserReports, parserSummary: providersData.parserSummary,
    readOnlyProviders: providersData.readOnlyProviders, cleanupReadyProviders: providersData.cleanupReadyProviders,

    /* derived – detail / transcripts */
    selectedThread, selectedSession,
    threadDetailLoading: detailData.threadDetailLoading, selectedThreadDetail: detailData.selectedThreadDetail,
    threadTranscriptData: detailData.threadTranscriptData, threadTranscriptLoading: detailData.threadTranscriptLoading,
    threadTranscriptLimit: detailData.threadTranscriptLimit, setThreadTranscriptLimit: detailData.setThreadTranscriptLimit,
    sessionTranscriptData: detailData.sessionTranscriptData, sessionTranscriptLoading: detailData.sessionTranscriptLoading,
    sessionTranscriptLimit: detailData.sessionTranscriptLimit, setSessionTranscriptLimit: detailData.setSessionTranscriptLimit,

    /* derived – execution graph */
    executionGraphData: providersData.executionGraphData,

    /* loading flags */
    runtimeLoading: mutations.runtimeLoading, smokeStatusLoading: mutations.smokeStatusLoading,
    recoveryLoading: mutations.recoveryLoading, threadsLoading: threadsData.threadsLoading,
    dataSourcesLoading: providersData.dataSourcesLoading,
    providerMatrixLoading: providersData.providerMatrixLoading, providerSessionsLoading: providersData.providerSessionsLoading,
    parserLoading: providersData.parserLoading, executionGraphLoading: providersData.executionGraphLoading,
    threadsFastBooting: threadsData.threadsFastBooting,
    threadsFetchMs: threadsData.threadsFetchMs,
    providersRefreshing: providersData.providersRefreshing,
    refreshingAllData: providersData.globalRefreshPending,
    providersLastRefreshAt: providersData.providersLastRefreshAt,
    providerFetchMetrics: providersData.providerFetchMetrics,

    /* computed UI flags */
    busy: mutations.busy,
    showProviders, showThreadsTable, showForensics, showRouting, showDetails,

    /* action dispatchers */
    toggleSelectAllFiltered: threadsData.toggleSelectAllFiltered,
    toggleSelectAllProviderRows: providersData.toggleSelectAllProviderRows,
    runProviderAction: mutations.runProviderAction,
    runSingleProviderAction: mutations.runSingleProviderAction,
    runRecoveryBackupExport: mutations.runRecoveryBackupExport,
    recoveryBackupExportError: mutations.recoveryBackupExportError,
    recoveryBackupExportErrorMessage: mutations.recoveryBackupExportErrorMessage,
    prefetchProvidersData: providersData.prefetchProvidersData,
    prefetchRoutingData: providersData.prefetchRoutingData,
    refreshProvidersData: providersData.refreshProvidersData,
    refreshAllData,
  };
}
