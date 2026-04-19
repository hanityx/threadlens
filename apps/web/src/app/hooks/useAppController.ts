import type React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ApiEnvelope, UpdateCheckStatus } from "@threadlens/shared-contracts";
import { AppContext, type AppContextValue } from "@/app/AppContext";
import { createAppContextValue } from "@/app/createAppContextValue";
import { useAppData } from "@/app/hooks/useAppData";
import { useAppShellState } from "@/app/hooks/useAppShellState";
import {
  resolvePreferredProvidersEntry,
  useAppShellBehavior,
} from "@/app/model/appShellBehavior";
import { useAppShellModel } from "@/app/model/appShellModel";
import { apiGet } from "@/api";
import { useLocale } from "@/i18n";
import { extractEnvelopeData } from "@/shared/lib/format";
import {
  PROVIDER_VIEW_STORAGE_KEY,
  readStorageValue,
  SETUP_PREFERRED_PROVIDER_STORAGE_KEY,
} from "@/shared/lib/appState";

const preloadProvidersHomePanels = () => {
  void import("@/features/providers/components/ProvidersPanel");
  void import("@/features/providers/session/SessionDetail");
};

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
  const showUpdateBanner = Boolean(
    updateCheckData?.has_update &&
      updateCheckData.latest_version &&
      updateCheckData.latest_version !== dismissedUpdateVersion,
  );
  const runtimeBackend = runtime.data?.data?.runtime_backend;
  const showRuntimeBackendDegraded =
    runtime.isError || (!runtimeLoading && runtimeBackend?.reachable === false);
  const analyzeErrorKey = analyzeDeleteError
    ? `analyze:${analyzeDeleteErrorMessage || "unknown"}`
    : "";
  const cleanupErrorKey = cleanupDryRunError
    ? `cleanup:${cleanupDryRunErrorMessage || "unknown"}`
    : "";

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
    recoveryBackupSets: recovery.data?.summary?.backup_sets ?? 0,
    messages,
  });

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
    providerSessionRows: allVisibleProviderSessionRows,
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
  });

  const openProvidersHome = () => {
    prefetchProvidersData();
    preloadProvidersHomePanels();
    const preferredProvider = resolvePreferredProvidersEntry({
      preferredProviderId: readStorageValue([SETUP_PREFERRED_PROVIDER_STORAGE_KEY]),
      storedProviderView: readStorageValue([PROVIDER_VIEW_STORAGE_KEY]),
      visibleProviderIdSet,
    });
    changeProviderView(preferredProvider);
    changeLayoutView("providers");
  };

  const emptySessionScopeLabel =
    providerView === "all"
      ? messages.common.allAi
      : selectedProviderLabel ?? providerView;

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
      parserScoreText, runtimeLatencyText, backupSetsCount,
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
      showRuntimeBackendDegraded,
      runtimeBackend,
      showUpdateBanner,
      updateCheckData: updateCheckData ?? null,
      onDismissUpdate: setDismissedUpdateVersion,
    },
  };
}
