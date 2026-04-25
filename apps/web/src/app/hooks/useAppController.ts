import type React from "react";
import { useQuery } from "@tanstack/react-query";
import { PROVIDER_IDS, type ApiEnvelope, type UpdateCheckStatus } from "@threadlens/shared-contracts";
import { AppContext, type AppContextValue } from "@/app/AppContext";
import { createAppContextValue } from "@/app/createAppContextValue";
import { useAppData } from "@/app/hooks/useAppData";
import { useAppShellState } from "@/app/hooks/useAppShellState";
import {
  resolveCanonicalExactProviderSessionMatch,
  resolvePreferredProvidersEntry,
  shouldLookupRemoteExactSessionTarget,
  shouldLookupRemoteExactThreadTarget,
  useAppShellBehavior,
} from "@/app/model/appShellBehavior";
import { useAppShellModel } from "@/app/model/appShellModel";
import { apiGet } from "@/api";
import { useLocale } from "@/i18n";
import { extractEnvelopeData } from "@/shared/lib/format";
import {
  readPersistedSetupState,
} from "@/shared/lib/appState";
import type { RecoveryResponse } from "@/shared/types";

function preloadChunk(loader: () => Promise<unknown>) {
  // Providers home prefetch is best-effort only.
  void loader().catch(() => undefined);
}

const preloadProvidersHomePanels = () => {
  preloadChunk(() => import("@/features/providers/components/ProvidersPanel"));
  preloadChunk(() => import("@/features/providers/session/SessionDetail"));
};

export function resolveShowUpdateBanner(
  updateCheckData: UpdateCheckStatus | null | undefined,
  dismissedUpdateVersion: string,
): boolean {
  return Boolean(
    updateCheckData?.has_update &&
      updateCheckData.latest_version &&
      updateCheckData.latest_version !== dismissedUpdateVersion,
  );
}

export function resolveRuntimeBackendDegraded(options: {
  runtimeError: boolean;
  runtimeLoading: boolean;
  runtimeBackendReachable: boolean | undefined;
}): boolean {
  const { runtimeError, runtimeLoading, runtimeBackendReachable } = options;
  return runtimeError || (!runtimeLoading && runtimeBackendReachable === false);
}

export function resolveRecoveryBackupSetCount(
  recoveryData: RecoveryResponse | null | undefined,
): number {
  return (
    recoveryData?.summary?.backup_sets ??
    recoveryData?.backup_total ??
    recoveryData?.backup_sets?.length ??
    0
  );
}

export function resolveForensicsErrorKey(
  prefix: "analyze" | "cleanup",
  hasError: boolean,
  message: string,
): string {
  return hasError ? `${prefix}:${message || "unknown"}` : "";
}

export function resolveEmptySessionScopeLabel(
  providerView: string,
  selectedProviderLabel: string | null | undefined,
  allAiLabel: string,
): string {
  return providerView === "all" ? allAiLabel : selectedProviderLabel ?? providerView;
}

export function useAppController(options: {
  appData: ReturnType<typeof useAppData>;
  shellState: ReturnType<typeof useAppShellState>;
  providersDiagnosticsOpen: boolean;
  setProvidersDiagnosticsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const {
    appData,
    shellState,
    providersDiagnosticsOpen,
    setProvidersDiagnosticsOpen,
  } = options;
  const {
    layoutView, setLayoutView,
    providerView, setProviderView,
    selectedThreadId, setSelectedThreadId,
    selectedSessionPath, setSelectedSessionPath,
    selectedProviderFiles,
    providerTabs, providers, slowProviderIds,
    providerSessionRows, allProviderSessionRows,
    parserReports, allParserReports, dataSourceRows,
    highRiskCount, visibleRows, selectedProviderLabel,
    runtime, smokeStatus, recovery, providerMatrix, providerSessions, providerParserHealth,
    analyzeDeleteError, cleanupDryRunError, analyzeDeleteErrorMessage, cleanupDryRunErrorMessage,
    bulkActionError, providerSessionActionError,
    runtimeLoading, recoveryLoading, threadsLoading, dataSourcesLoading,
    providerMatrixLoading, providerSessionsLoading, parserLoading, threadsFastBooting,
    providersRefreshing, refreshingAllData, providersLastRefreshAt,
    prefetchProvidersData, prefetchRoutingData,
  } = appData;
  const {
    panelChunkWarmupStartedRef,
    desktopRouteAppliedRef,
    desktopRouteHydratingRef,
    desktopRouteRef,
    threadSearchInputRef,
    detailLayoutRef,
    searchThreadContext,
    setSearchThreadContext,
    providerProbeFilterIntent,
    setProviderProbeFilterIntent,
    setupGuideOpen,
    setSetupGuideOpen,
    dismissedUpdateVersion,
    setDismissedUpdateVersion,
    headerSearchDraft,
    setHeaderSearchDraft,
    headerSearchSeed,
    setHeaderSearchSeed,
    acknowledgedForensicsErrorKeys,
    setAcknowledgedForensicsErrorKeys,
    changeLayoutView,
    changeProviderView,
  } = shellState;
  const { locale, setLocale, messages } = useLocale();
  const updateCheck = useQuery({
    queryKey: ["update-check"],
    queryFn: ({ signal }) =>
      apiGet<ApiEnvelope<UpdateCheckStatus>>("/api/update-check", { signal }),
    staleTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const updateCheckData = extractEnvelopeData<UpdateCheckStatus>(updateCheck.data);
  const showUpdateBanner = resolveShowUpdateBanner(updateCheckData, dismissedUpdateVersion);
  const runtimeBackend = runtime.data?.data?.runtime_backend;
  const showRuntimeBackendDegraded = resolveRuntimeBackendDegraded({
    runtimeError: runtime.isError,
    runtimeLoading,
    runtimeBackendReachable: runtimeBackend?.reachable,
  });
  const analyzeErrorKey = resolveForensicsErrorKey(
    "analyze",
    Boolean(analyzeDeleteError),
    analyzeDeleteErrorMessage,
  );
  const cleanupErrorKey = resolveForensicsErrorKey(
    "cleanup",
    Boolean(cleanupDryRunError),
    cleanupDryRunErrorMessage,
  );

  const {
    visibleProviderTabs,
    visibleProviderIds,
    visibleProviderIdSet,
    visibleProviders,
    visibleProviderSummary,
    visibleSlowProviderIds,
    visibleProviderSessionRows,
    allVisibleProviderSessionRows,
    visibleProviderSessionSummary,
    overviewBooting,
    activeSummaryText,
    searchRowsText,
    reviewRowsText,
    syncStatusText,
    recentSessionPreview,
    focusSession,
    focusSessionTitle,
    focusSessionMeta,
    focusSessionCommandId,
    focusSessionStatus,
    emptySessionNextTitle,
    emptySessionNextPath,
    visibleParserReports,
    allVisibleParserReports,
    visibleParserSummary,
    focusReviewThread,
    focusReviewTitle,
    focusReviewMeta,
    secondaryFlaggedPreview,
    recentThreadGroups,
    recentThreadTitle,
    recentThreadSummary,
    activeProviderSummaryLine,
    visibleDataSourceRows,
    visibleAllProviderRowsSelected,
    searchProviderOptions,
    showSearch,
    showProviders,
    showThreadsTable,
    showForensics,
    showRouting,
    showThreadDetail,
    showSessionDetail,
    showDetails,
    showGlobalAnalyzeDeleteError,
    showGlobalCleanupDryRunError,
    hasGlobalErrorStack,
    parserScoreText,
    runtimeLatencyText,
    runtimeStatusText,
    backupSetsCount,
  } = useAppShellModel({
    layoutView,
    providerView,
    providersDiagnosticsOpen,
    providerTabs,
    providers,
    slowProviderIds,
    providerSessionRows,
    allProviderSessionRows,
    parserReports,
    allParserReports,
    dataSourceRows,
    selectedProviderFiles,
    runtimeLoading,
    recoveryLoading,
    threadsLoading,
    dataSourcesLoading,
    providerMatrixLoading,
    providerSessionsLoading,
    parserLoading,
    threadsFastBooting,
    providersRefreshing,
    refreshingAllData,
    providersLastRefreshAt,
    highRiskCount,
    visibleRows,
    selectedProviderLabel,
    runtimeBackendReachable: runtimeBackend?.reachable,
    runtimeBackendLatencyMs: runtimeBackend?.latency_ms,
    runtimeBackendUrl: runtimeBackend?.url,
    analyzeErrorKey,
    cleanupErrorKey,
    acknowledgedForensicsErrorKeys,
    runtimeError: runtime.isError,
    smokeStatusError: smokeStatus.isError,
    recoveryError: recovery.isError,
    providerMatrixError: providerMatrix.isError,
    providerSessionsError: providerSessions.isError,
    providerParserHealthError: providerParserHealth.isError,
    providerSessionActionError: Boolean(providerSessionActionError),
    bulkActionError: Boolean(bulkActionError),
    showRuntimeBackendDegraded,
    recoveryBackupSets: resolveRecoveryBackupSetCount(recovery.data ?? null),
    messages,
  });
  const knownProviderIdSet = new Set(
    [...PROVIDER_IDS, ...providerTabs.map((tab) => String(tab.id || "").trim())]
      .filter((id) => id && id !== "all"),
  );

  const {
    handleProvidersIntent,
    handleSearchIntent,
    handleDiagnosticsIntent,
    handleHeaderSearchSubmit,
  } = useAppShellBehavior({
    layoutView,
    providerView,
    visibleProviderTabs,
    visibleProviderIdSet,
    providerSessionRows: allProviderSessionRows,
    visibleRows,
    showForensics,
    showThreadDetail,
    showSessionDetail,
    selectedThreadId,
    selectedSessionPath,
    searchThreadContext,
    analyzeErrorKey,
    cleanupErrorKey,
    headerSearchDraft,
    threadSearchInputRef,
    detailLayoutRef,
    panelChunkWarmupStartedRef,
    desktopRouteAppliedRef,
    desktopRouteHydratingRef,
    desktopRouteRef,
    changeLayoutView,
    setLayoutView,
    setProviderView,
    setSelectedSessionPath,
    setSelectedThreadId,
    setAcknowledgedForensicsErrorKeys,
    setSearchThreadContext,
    setHeaderSearchDraft,
    setHeaderSearchSeed,
    prefetchProvidersData,
    prefetchRoutingData,
    lookupExactThreadTarget: async (query: string) => {
      if (!shouldLookupRemoteExactThreadTarget(query)) return null;
      const data = await apiGet<{ rows?: Array<{ thread_id?: string }> }>(
        `/api/threads?offset=0&limit=2&q=${encodeURIComponent(query)}&sort=updated_desc`,
      );
      const normalizedQuery = query.trim().toLowerCase();
      const exactMatches = (data.rows ?? []).filter(
        (row) => String(row.thread_id || "").trim().toLowerCase() === normalizedQuery,
      );
      if (exactMatches.length !== 1) return null;
      return { threadId: String(exactMatches[0]?.thread_id || "") };
    },
    lookupExactSessionTarget: async (query: string) => {
      if (!shouldLookupRemoteExactSessionTarget(query)) return null;
      const data = await apiGet<{
        rows?: Array<{ provider?: string; session_id?: string; file_path?: string }>;
      }>(`/api/provider-sessions?limit=2000`);
      const normalizedQuery = query.trim().toLowerCase();
      const match = resolveCanonicalExactProviderSessionMatch(
        normalizedQuery,
        (data.rows ?? []).map((row) => ({
          provider: String(row.provider || ""),
          source: String((row as { source?: string }).source || ""),
          session_id: String(row.session_id || ""),
          file_path: String(row.file_path || ""),
        })),
      );
      if (!match) return null;
      const providerId = String(match?.provider || "").trim();
      return {
        sessionId: String(match?.session_id || ""),
        filePath: String(match?.file_path || ""),
        providerView:
          knownProviderIdSet.has(providerId) && providerId
            ? (providerId as typeof providerView)
            : "all",
      };
    },
  });

  const openProvidersHome = () => {
    prefetchProvidersData();
    preloadProvidersHomePanels();
    const persistedSetupState = readPersistedSetupState();
    const preferredProvider = resolvePreferredProvidersEntry({
      preferredProviderId: persistedSetupState?.preferredProviderId ?? null,
      storedProviderView: persistedSetupState?.providerView ?? null,
      visibleProviderIdSet,
    });
    setSelectedSessionPath("");
    changeProviderView(preferredProvider);
    changeLayoutView("providers");
  };

  const emptySessionScopeLabel = resolveEmptySessionScopeLabel(
    providerView,
    selectedProviderLabel,
    messages.common.allAi,
  );

  const ctx: AppContextValue = createAppContextValue({
    appData,
    shellModel: {
      visibleProviderTabs, visibleProviderIds, visibleProviderIdSet, visibleProviders,
      visibleProviderSummary, visibleSlowProviderIds, visibleProviderSessionRows,
      allVisibleProviderSessionRows, visibleProviderSessionSummary,
      overviewBooting, activeSummaryText, searchRowsText, reviewRowsText, syncStatusText,
      recentSessionPreview, focusSession, focusSessionTitle, focusSessionMeta, focusSessionCommandId, focusSessionStatus,
      emptySessionNextTitle, emptySessionNextPath, visibleParserReports, allVisibleParserReports, visibleParserSummary,
      focusReviewThread, focusReviewTitle, focusReviewMeta, secondaryFlaggedPreview, recentThreadGroups,
      recentThreadTitle, recentThreadSummary, activeProviderSummaryLine, visibleDataSourceRows,
      visibleAllProviderRowsSelected, searchProviderOptions,
      showSearch, showProviders, showThreadsTable, showForensics, showRouting,
      showThreadDetail, showSessionDetail, showDetails,
      showGlobalAnalyzeDeleteError, showGlobalCleanupDryRunError, hasGlobalErrorStack,
      parserScoreText, runtimeLatencyText, runtimeStatusText, backupSetsCount,
    },
    shellBehavior: {
      handleProvidersIntent,
      handleSearchIntent,
      handleDiagnosticsIntent,
      handleHeaderSearchSubmit,
    },
    localState: {
      messages,
      locale,
      setLocale,
      providersDiagnosticsOpen,
      setProvidersDiagnosticsOpen,
      setupGuideOpen,
      setSetupGuideOpen,
      headerSearchDraft,
      setHeaderSearchDraft,
      headerSearchSeed,
      setHeaderSearchSeed,
      searchThreadContext,
      setSearchThreadContext,
      providerProbeFilterIntent,
      setProviderProbeFilterIntent,
      acknowledgedForensicsErrorKeys,
      setAcknowledgedForensicsErrorKeys,
      changeLayoutView,
      changeProviderView,
      openProvidersHome,
      showRuntimeBackendDegraded,
      emptySessionScopeLabel,
      analyzeErrorKey,
      cleanupErrorKey,
      runtimeBackend,
      threadSearchInputRef,
      detailLayoutRef,
    },
  });

  return {
    ctx,
    shellProps: {
      messages,
      layoutView,
      showSearch,
      showProviders,
      showThreadsTable,
      topShellProps: {
        layoutView,
        changeLayoutView,
        openProvidersHome,
        handleSearchIntent,
        handleProvidersIntent,
        headerSearchDraft,
        setHeaderSearchDraft,
        handleHeaderSearchSubmit,
        syncStatusText,
        theme: appData.theme,
        setTheme: appData.setTheme,
        refreshAllData: appData.refreshAllData,
        busy: appData.busy,
        refreshingAllData: appData.refreshingAllData,
        locale,
        setLocale,
        messages,
      },
      runtimeFeedbackProps: {
        messages,
        hasGlobalErrorStack,
        runtime: appData.runtime,
        smokeStatus: appData.smokeStatus,
        recovery: appData.recovery,
        providerMatrix: appData.providerMatrix,
        providerSessions: appData.providerSessions,
        providerParserHealth: appData.providerParserHealth,
        showGlobalAnalyzeDeleteError,
        analyzeDeleteErrorMessage: appData.analyzeDeleteErrorMessage,
        showGlobalCleanupDryRunError,
        cleanupDryRunErrorMessage: appData.cleanupDryRunErrorMessage,
        providerSessionActionError: appData.providerSessionActionError,
        providerSessionActionErrorMessage: appData.providerSessionActionErrorMessage,
        bulkActionError: appData.bulkActionError,
        bulkActionErrorMessage: appData.bulkActionErrorMessage,
        showRuntimeBackendDegraded,
        busy: appData.busy,
      },
      showRuntimeBackendDegraded,
      runtimeBackend,
      showUpdateBanner,
      updateCheckData: updateCheckData ?? null,
      onDismissUpdate: setDismissedUpdateVersion,
    },
  };
}
