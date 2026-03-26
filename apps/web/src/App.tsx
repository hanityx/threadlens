import { startTransition, useEffect, useRef, useState } from "react";
import { AppContext, type AppContextValue } from "./app/AppContext";
import { DetailShell } from "./app/DetailShell";
import { OverviewWorkbench } from "./features/overview/OverviewWorkbench";
import { ProvidersWorkspace } from "./features/providers/ProvidersWorkspace";
import { RuntimeFeedbackStack } from "./app/RuntimeFeedbackStack";
import { SearchRoute } from "./features/search/SearchRoute";
import { ThreadsWorkbench } from "./features/threads/ThreadsWorkbench";
import { TopShell } from "./app/TopShell";
import { useAppShellBehavior, type DesktopRouteState } from "./app/appShellBehavior";
import { useAppShellModel } from "./app/appShellModel";
import { useAppData } from "./hooks/useAppData";
import { useLocale } from "./i18n";
import type { ConversationSearchHit, LayoutView, ProviderView } from "./types";

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
  const pendingLayoutScrollRestoreRef = useRef<number | null>(null);
  const [searchThreadContext, setSearchThreadContext] = useState<ConversationSearchHit | null>(null);
  const [providersDiagnosticsOpen, setProvidersDiagnosticsOpen] = useState(false);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [headerSearchDraft, setHeaderSearchDraft] = useState("");
  const [headerSearchSeed, setHeaderSearchSeed] = useState("");
  const appData = useAppData({ providersDiagnosticsOpen });
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

  const changeProviderView = (nextView: ProviderView) => {
    startTransition(() => {
      setProviderView(nextView);
    });
  };

  const { messages } = useLocale();
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
    focusSessionTitle,
    focusSessionMeta,
    focusSessionCommandId,
    focusSessionStatus,
    emptySessionNextTitle,
    visibleParserReports,
    allVisibleParserReports,
    visibleParserSummary,
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

  const emptySessionScopeLabel =
    providerView === "all" ? messages.common.allAi : selectedProviderLabel;

  const ctx: AppContextValue = {
    ...appData,
    ...{
      visibleProviderTabs, visibleProviderIds, visibleProviderIdSet, visibleProviders,
      visibleProviderSummary, visibleSlowProviderIds, visibleProviderSessionRows,
      allVisibleProviderSessionRows, visibleProviderSessionSummary,
      overviewBooting, activeSummaryText, searchRowsText, reviewRowsText, syncStatusText,
      recentSessionPreview, focusSessionTitle, focusSessionMeta, focusSessionCommandId, focusSessionStatus,
      emptySessionNextTitle, visibleParserReports, allVisibleParserReports, visibleParserSummary,
      focusReviewTitle, focusReviewMeta, secondaryFlaggedPreview, recentThreadGroups,
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
    headerSearchSeed,
    searchThreadContext, setSearchThreadContext,
    acknowledgedForensicsErrorKeys, setAcknowledgedForensicsErrorKeys,
    changeLayoutView, changeProviderView,
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
