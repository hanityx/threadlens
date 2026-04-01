import { startTransition, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ApiEnvelope, UpdateCheckStatus } from "@threadlens/shared-contracts";
import { AppContext, type AppContextValue } from "./app/AppContext";
import { DetailShell } from "./app/DetailShell";
import { OverviewWorkbench } from "./features/overview/OverviewWorkbench";
import { ProvidersWorkspace } from "./features/providers/ProvidersWorkspace";
import { RuntimeFeedbackStack } from "./app/RuntimeFeedbackStack";
import { SearchRoute } from "./features/search/SearchRoute";
import { ThreadsWorkbench } from "./features/threads/ThreadsWorkbench";
import { TopShell } from "./app/TopShell";
import {
  resolvePreferredProvidersEntry,
  useAppShellBehavior,
  type DesktopRouteState,
} from "./app/appShellBehavior";
import { useAppShellModel } from "./app/appShellModel";
import {
  PROVIDER_VIEW_STORAGE_KEY,
  readStorageValue,
  SEARCH_DRAFT_STORAGE_KEY,
  SETUP_PREFERRED_PROVIDER_STORAGE_KEY,
  writeStorageValue,
} from "./hooks/appDataUtils";
import { useAppData } from "./hooks/useAppData";
import { useLocale } from "./i18n";
import { apiGet } from "./api";
import { extractEnvelopeData } from "./lib/helpers";
import type { ConversationSearchHit, LayoutView, ProviderView } from "./types";
import type { ProviderProbeFilter } from "./features/providers/sessionTableModel";
import { UpdateBanner } from "./app/UpdateBanner";

export function App() {
  const panelChunkWarmupStartedRef = useRef(false);
  const desktopRouteAppliedRef = useRef(false);
  const desktopRouteHydratingRef = useRef(false);
  const desktopRouteRef = useRef<DesktopRouteState>({
    view: "",
    provider: "",
    filePath: "",
    threadId: "",
  });
  const threadSearchInputRef = useRef<HTMLInputElement | null>(null);
  const detailLayoutRef = useRef<HTMLElement | null>(null);
  const pendingLayoutScrollRestoreRef = useRef<number | null>(null);
  const [searchThreadContext, setSearchThreadContext] = useState<ConversationSearchHit | null>(null);
  const [providerProbeFilterIntent, setProviderProbeFilterIntent] = useState<ProviderProbeFilter | null>(null);
  const [providersDiagnosticsOpen, setProvidersDiagnosticsOpen] = useState(false);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState("");
  const [headerSearchDraft, setHeaderSearchDraft] = useState("");
  const [headerSearchSeed, setHeaderSearchSeed] = useState(() => {
    return readStorageValue([SEARCH_DRAFT_STORAGE_KEY]) ?? "";
  });
  const appData = useAppData({ providersDiagnosticsOpen });
  const updateCheck = useQuery({
    queryKey: ["update-check"],
    queryFn: ({ signal }) =>
      apiGet<ApiEnvelope<UpdateCheckStatus>>("/api/update-check", { signal }),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  // Destructure only what's needed for hook calls and derived values below.
  // Everything else is available via ...appData spread into ctx.
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

  const changeLayoutView = (nextView: LayoutView) => {
    if (typeof window !== "undefined" && nextView !== layoutView) {
      pendingLayoutScrollRestoreRef.current = window.scrollY;
    }
    startTransition(() => {
      setLayoutView(nextView);
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pendingLayoutScrollRestoreRef.current === null) return;

    const targetY = pendingLayoutScrollRestoreRef.current;
    pendingLayoutScrollRestoreRef.current = null;

    const restore = () => {
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(targetY, maxScrollY));
    };

    let rafTwo = 0;
    let timeoutOne = 0;
    let timeoutTwo = 0;
    const rafOne = window.requestAnimationFrame(() => {
      rafTwo = window.requestAnimationFrame(() => {
        restore();
        timeoutOne = window.setTimeout(restore, 80);
        timeoutTwo = window.setTimeout(restore, 240);
      });
    });

    return () => {
      window.cancelAnimationFrame(rafOne);
      if (rafTwo) window.cancelAnimationFrame(rafTwo);
      if (timeoutOne) window.clearTimeout(timeoutOne);
      if (timeoutTwo) window.clearTimeout(timeoutTwo);
    };
  }, [layoutView]);

  useEffect(() => {
    writeStorageValue(SEARCH_DRAFT_STORAGE_KEY, headerSearchSeed);
  }, [headerSearchSeed]);

  const changeProviderView = (nextView: ProviderView) => {
    startTransition(() => {
      setProviderView(nextView);
    });
  };

  const openProvidersHome = () => {
    const preferredProvider = resolvePreferredProvidersEntry({
      preferredProviderId: readStorageValue([SETUP_PREFERRED_PROVIDER_STORAGE_KEY]),
      storedProviderView: readStorageValue([PROVIDER_VIEW_STORAGE_KEY]),
      visibleProviderIdSet,
    });
    startTransition(() => {
      setProviderView(preferredProvider);
    });
    changeLayoutView("providers");
  };

  const { messages } = useLocale();
  const updateCheckData = extractEnvelopeData<UpdateCheckStatus>(updateCheck.data);
  const showUpdateBanner = Boolean(
    updateCheckData?.has_update &&
      updateCheckData.latest_version &&
      updateCheckData.latest_version !== dismissedUpdateVersion,
  );
  const runtimeBackend = runtime.data?.data?.runtime_backend;
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
    setHeaderSearchSeed,
    prefetchProvidersData,
    prefetchRoutingData,
  });

  const emptySessionScopeLabel = selectedProviderLabel;

  const ctx: AppContextValue = {
    ...appData,
    ...{
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
    ...{ handleProvidersIntent, handleSearchIntent, handleDiagnosticsIntent, handleHeaderSearchSubmit },
    messages,
    providersDiagnosticsOpen, setProvidersDiagnosticsOpen,
    setupGuideOpen, setSetupGuideOpen,
    headerSearchDraft, setHeaderSearchDraft,
    headerSearchSeed, setHeaderSearchSeed,
    searchThreadContext, setSearchThreadContext,
    providerProbeFilterIntent, setProviderProbeFilterIntent,
    acknowledgedForensicsErrorKeys, setAcknowledgedForensicsErrorKeys,
    changeLayoutView, changeProviderView, openProvidersHome,
    showRuntimeBackendDegraded,
    emptySessionScopeLabel,
    analyzeErrorKey, cleanupErrorKey,
    runtimeBackend,
    threadSearchInputRef,
    detailLayoutRef,
  };

  return (
    <AppContext.Provider value={ctx}>
      <div className="app-shell">
        <main className="page page-shell-main">
          <TopShell />
          {showRuntimeBackendDegraded ? (
            <section className="degraded-banner" role="status" aria-live="polite">
              <strong>{messages.alerts.runtimeBackendDownTitle}</strong>
              <p>{messages.alerts.runtimeBackendDownBody}</p>
              <span>
                {messages.alerts.runtimeBackendDownHint} {runtimeBackend?.url ?? "ts-native"}
              </span>
            </section>
          ) : null}
          {showUpdateBanner && updateCheckData?.latest_version ? (
            <UpdateBanner
              messages={messages.alerts}
              currentVersion={updateCheckData.current_version}
              latestVersion={updateCheckData.latest_version}
              releaseSummary={updateCheckData.release_summary}
              releaseUrl={updateCheckData.release_url}
              onDismiss={() => setDismissedUpdateVersion(updateCheckData.latest_version ?? "")}
            />
          ) : null}
          {layoutView === "overview" ? <OverviewWorkbench /> : null}
          {showSearch ? <SearchRoute /> : null}
          {showProviders ? <ProvidersWorkspace /> : null}
          {showThreadsTable ? <ThreadsWorkbench /> : null}
          <DetailShell />
          <RuntimeFeedbackStack />
        </main>
      </div>
    </AppContext.Provider>
  );
}
