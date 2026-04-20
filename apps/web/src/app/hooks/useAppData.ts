import { useCallback, useMemo } from "react";
import type {
  LayoutView,
  ProviderSessionRow,
} from "@/shared/types";
import { usePreferences } from "@/shared/hooks/usePreferences";
import { useThreadsData } from "@/features/threads/hooks/useThreadsData";
import { useProvidersData } from "@/features/providers/hooks/useProvidersData";
import { useDetailData } from "@/app/hooks/useDetailData";
import { useMutations } from "@/app/hooks/useMutations";

/* ------------------------------------------------------------------ */
/*  useAppData – compositor hook                                       */
/*  Composes domain hooks and exposes the same public API as before.   */
/* ------------------------------------------------------------------ */

export function selectSessionByPath(rows: ProviderSessionRow[], selectedSessionPath: string) {
  return rows.find((row) => row.file_path === selectedSessionPath) ?? null;
}

export function selectThreadById<TRow extends { thread_id: string }>(
  rows: TRow[],
  selectedThreadId: string,
) {
  return rows.find((row) => row.thread_id === selectedThreadId) ?? null;
}

export function buildProviderById(
  providers: Array<{ provider: string; capabilities?: { safe_cleanup?: boolean } }> | null | undefined,
) {
  return new Map<string, { capabilities?: { safe_cleanup?: boolean } }>(
    (providers ?? []).map((p) => [p.provider, p]),
  );
}

export function computeLayoutFlags(layoutView: LayoutView) {
  return {
    showProviders: layoutView === "providers",
    showThreadsTable: layoutView === "threads",
    showForensics: layoutView === "threads",
    showRouting: layoutView === "providers",
    showDetails: layoutView === "threads" || layoutView === "providers",
  };
}

export function selectImpactRows(selectedIds: string[], reports: Array<{ id: string }> | undefined) {
  const selectedSet = new Set(selectedIds);
  return (reports ?? []).filter((row) => selectedSet.has(row.id));
}

export function shouldRefreshExecutionGraph(layoutView: LayoutView) {
  return layoutView === "providers";
}

export function shouldRefreshProvidersAfterGlobalRefresh(layoutView: LayoutView) {
  return layoutView === "providers" || layoutView === "overview";
}

type RefreshRefetcher = {
  refetch: (options: { cancelRefetch: false }) => Promise<unknown>;
};

export function buildRefreshAllDataJobs(
  layoutView: LayoutView,
  refetchers: {
    runtime: RefreshRefetcher;
    threads: RefreshRefetcher;
    smokeStatus: RefreshRefetcher;
    recovery: RefreshRefetcher;
    executionGraph: RefreshRefetcher;
  },
) {
  const refreshJobs: Array<Promise<unknown>> = [
    refetchers.runtime.refetch({ cancelRefetch: false }),
    refetchers.threads.refetch({ cancelRefetch: false }),
    refetchers.smokeStatus.refetch({ cancelRefetch: false }),
    refetchers.recovery.refetch({ cancelRefetch: false }),
  ];
  if (shouldRefreshExecutionGraph(layoutView)) {
    refreshJobs.push(refetchers.executionGraph.refetch({ cancelRefetch: false }));
  }
  return refreshJobs;
}

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
    () => selectSessionByPath(providersData.providerSessionRows, providersData.selectedSessionPath),
    [providersData.providerSessionRows, providersData.selectedSessionPath],
  );
  const selectedThread = useMemo(
    () => selectThreadById(threadsData.rows, threadsData.selectedThreadId),
    [threadsData.rows, threadsData.selectedThreadId],
  );
  const providerById = useMemo(
    () => buildProviderById(providersData.providers),
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
    providerActionProvider: providersData.providerActionProvider,
    selectedProviderFilePaths: providersData.selectedProviderFilePaths,
  });

  const selectedImpactRows = selectImpactRows(
    threadsData.selectedIds,
    mutations.analysisData?.reports as Array<{ id: string }> | undefined,
  );

  /* ---- computed UI flags ---- */
  const { showProviders, showThreadsTable, showForensics, showRouting, showDetails } =
    computeLayoutFlags(prefs.layoutView);

  /* ---- refreshAllData ---- */
  const refreshAllData = useCallback(async () => {
    if (providersData.globalRefreshPending) return;
    providersData.setGlobalRefreshPending(true);
    try {
      const refreshJobs = buildRefreshAllDataJobs(prefs.layoutView, {
        runtime: mutations.runtime,
        threads: threadsData.threads,
        smokeStatus: mutations.smokeStatus,
        recovery: mutations.recovery,
        executionGraph: providersData.executionGraph,
      });
      await Promise.allSettled(refreshJobs);
      if (shouldRefreshProvidersAfterGlobalRefresh(prefs.layoutView)) {
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
    providerActionProvider: providersData.providerActionProvider,
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
    runProviderHardDelete: mutations.runProviderHardDelete,
    runSingleProviderAction: mutations.runSingleProviderAction,
    runSingleProviderHardDelete: mutations.runSingleProviderHardDelete,
    runRecoveryBackupExport: mutations.runRecoveryBackupExport,
    recoveryBackupExportError: mutations.recoveryBackupExportError,
    recoveryBackupExportErrorMessage: mutations.recoveryBackupExportErrorMessage,
    prefetchProvidersData: providersData.prefetchProvidersData,
    prefetchRoutingData: providersData.prefetchRoutingData,
    refreshProvidersData: providersData.refreshProvidersData,
    refreshAllData,
  };
}
