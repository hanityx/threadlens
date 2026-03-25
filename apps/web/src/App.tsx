import { startTransition, useEffect, useRef, useState } from "react";
import { DetailShell } from "./app-shell/DetailShell";
import { OverviewSetupStage } from "./app-shell/OverviewSetupStage";
import { OverviewWorkbench } from "./app-shell/OverviewWorkbench";
import { ProvidersWorkspace } from "./app-shell/ProvidersWorkspace";
import { RuntimeFeedbackStack } from "./app-shell/RuntimeFeedbackStack";
import { SearchRoute } from "./app-shell/SearchRoute";
import { ThreadDetailSlot } from "./app-shell/ThreadDetailSlot";
import { ThreadsWorkbench } from "./app-shell/ThreadsWorkbench";
import { TopShell } from "./app-shell/TopShell";
import { useAppShellBehavior, type DesktopRouteState } from "./app-shell/appShellBehavior";
import { useAppShellModel } from "./app-shell/appShellModel";
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

  const { locale, messages, setLocale } = useLocale();
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
            setupStageContent={
              <OverviewSetupStage
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
            }
          />
        ) : null}

        {showSearch ? (
          <SearchRoute
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
            forensicsSlot={
              <ThreadDetailSlot
                messages={messages}
                selectedThread={selectedThread}
                selectedThreadId={selectedThreadId}
                visibleThreadCount={visibleRows.length}
                filteredThreadCount={filteredRows.length}
                highRiskCount={highRiskCount}
                nextThreadTitle={selectedThreadId
                  ? recentThreadTitle(visibleRows[0] ?? { thread_id: selectedThreadId, title: "", risk_score: 0, is_pinned: false, source: "" })
                  : recentThreadTitle(visibleRows[0] ?? { thread_id: "", title: "", risk_score: 0, is_pinned: false, source: "" })}
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
            }
          />
        ) : null}

        <DetailShell
          messages={messages}
          detailLayoutRef={detailLayoutRef}
          showDetails={showDetails && !showForensics}
          showThreadDetail={showThreadDetail && !showForensics}
          showSessionDetail={showSessionDetail}
          showProviders={showProviders}
          threadDetailProps={{
            messages,
            selectedThread,
            selectedThreadId,
            visibleThreadCount: visibleRows.length,
            filteredThreadCount: filteredRows.length,
            highRiskCount,
            nextThreadTitle: selectedThreadId
              ? recentThreadTitle(visibleRows[0] ?? { thread_id: selectedThreadId, title: "", risk_score: 0, is_pinned: false, source: "" })
              : recentThreadTitle(visibleRows[0] ?? { thread_id: "", title: "", risk_score: 0, is_pinned: false, source: "" }),
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
