import { lazy, Suspense } from "react";
import { PanelHeader } from "../../design-system/PanelHeader";
import type { ProvidersPanelProps } from "./ProvidersPanel";
import { useAppContext } from "../../app/AppContext";

const ProvidersPanel = lazy(async () => {
  const mod = await import("./ProvidersPanel");
  return { default: mod.ProvidersPanel };
});

const SessionDetail = lazy(async () => {
  const mod = await import("./SessionDetail");
  return { default: mod.SessionDetail };
});

const RoutingPanel = lazy(async () => {
  const mod = await import("./routing/RoutingPanel");
  return { default: mod.RoutingPanel };
});

export function ProvidersWorkspace() {
  const {
    messages,
    visibleProviders: providers,
    visibleProviderSummary: providerSummary,
    providerMatrixLoading,
    visibleProviderTabs: providerTabs,
    visibleSlowProviderIds: slowProviderIds,
    slowProviderThresholdMs,
    setSlowProviderThresholdMs,
    providerView,
    setProviderView,
    providerDataDepth,
    setProviderDataDepth,
    visibleProviderSessionRows: providerSessionRows,
    allVisibleProviderSessionRows: allProviderSessionRows,
    visibleProviderSessionSummary,
    visibleProviderSessionSummary: providerSessionSummary,
    providerSessionsLimit,
    providerRowsSampled,
    visibleDataSourceRows: dataSourceRows,
    dataSourcesLoading,
    providerSessionsLoading,
    selectedProviderFiles,
    setSelectedProviderFiles,
    visibleAllProviderRowsSelected: allProviderRowsSelected,
    toggleSelectAllProviderRows,
    selectedProviderLabel,
    selectedProviderFilePaths,
    canRunProviderAction,
    busy,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    runProviderAction,
    providerActionData,
    providerActionSelection,
    runRecoveryBackupExport,
    recoveryBackupExportData,
    visibleParserReports: parserReports,
    allVisibleParserReports: allParserReports,
    parserLoading,
    visibleParserSummary: parserSummary,
    selectedSessionPath,
    setSelectedSessionPath,
    providersRefreshing,
    providersLastRefreshAt,
    providerFetchMetrics,
    refreshProvidersData,
    selectedSession,
    emptySessionScopeLabel,
    emptySessionNextTitle,
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    setSessionTranscriptLimit,
    canRunSelectedSessionAction,
    runSingleProviderAction,
    providersDiagnosticsOpen,
    setProvidersDiagnosticsOpen,
    handleDiagnosticsIntent,
    showRouting,
    executionGraphData,
    executionGraphLoading,
    visibleProviderIds,
  } = useAppContext();

  const panelProps: Omit<ProvidersPanelProps, "sessionDetailSlot" | "diagnosticsSlot"> = {
    messages,
    providers,
    providerSummary,
    providerMatrixLoading,
    providerTabs,
    slowProviderIds,
    slowProviderThresholdMs,
    setSlowProviderThresholdMs,
    providerView,
    setProviderView,
    providerDataDepth,
    setProviderDataDepth,
    providerSessionRows,
    allProviderSessionRows,
    providerSessionSummary,
    providerSessionsLimit,
    providerRowsSampled,
    dataSourceRows,
    dataSourcesLoading,
    providerSessionsLoading,
    selectedProviderFiles,
    setSelectedProviderFiles,
    allProviderRowsSelected,
    toggleSelectAllProviderRows,
    selectedProviderLabel,
    selectedProviderFilePaths,
    canRunProviderAction,
    busy,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    runProviderAction,
    providerActionData,
    providerActionSelection,
    runRecoveryBackupExport,
    recoveryBackupExportData,
    parserReports,
    allParserReports,
    parserLoading,
    parserSummary,
    selectedSessionPath,
    setSelectedSessionPath,
    providersRefreshing,
    providersLastRefreshAt,
    providerFetchMetrics,
    refreshProvidersData,
  };

  const selectedSessionActionResult =
    selectedSession &&
    providerActionData &&
    providerActionSelection?.file_paths?.length === 1 &&
    providerActionSelection.file_paths[0] === selectedSession.file_path
      ? providerActionData
      : null;

  const sessionDetailProps = {
    messages,
    selectedSession,
    sessionActionResult: selectedSessionActionResult,
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
  };

  const routingPanelProps = {
    messages,
    data: executionGraphData,
    loading: executionGraphLoading,
    providerView,
    providerSessionRows,
    parserReports,
    visibleProviderIds,
  };

  const sessionDetailKey = selectedSession?.file_path ?? "empty-session-detail";

  const onToggleDiagnostics = (nextOpen: boolean) => {
    setProvidersDiagnosticsOpen(nextOpen);
    if (nextOpen) handleDiagnosticsIntent();
  };

  return (
    <section className="provider-page-stack">
      <Suspense
        fallback={
          <section className="panel">
            <PanelHeader title={messages.nav.providers} subtitle={messages.common.loading} />
            <div className="sub-toolbar">
              <div className="skeleton-line" />
            </div>
          </section>
        }
      >
        <ProvidersPanel
          {...panelProps}
          sessionDetailSlot={
            <Suspense
              fallback={
                <section className="panel">
                  <PanelHeader title={messages.sessionDetail.title} subtitle={messages.common.loading} />
                  <div className="sub-toolbar">
                    <div className="skeleton-line" />
                  </div>
                </section>
              }
            >
              <SessionDetail key={sessionDetailKey} {...sessionDetailProps} />
            </Suspense>
          }
          diagnosticsSlot={
            <details
              className="panel panel-disclosure session-routing-disclosure"
              open={providersDiagnosticsOpen}
              onToggle={(event) => {
                onToggleDiagnostics((event.currentTarget as HTMLDetailsElement).open);
              }}
            >
              <summary>
                <span className="session-routing-disclosure-copy">
                  <span className="session-routing-disclosure-kicker">Session surface</span>
                  <span className="session-routing-disclosure-summary">
                    <strong>{messages.nav.routing}</strong>
                    <span className="session-routing-disclosure-bodycopy">
                      {providersDiagnosticsOpen
                        ? "Paths, findings, and execution flow for the current AI."
                        : "Open paths, findings, and execution flow without leaving Sessions."}
                    </span>
                  </span>
                </span>
                <span className="session-routing-disclosure-pill">
                  {providersDiagnosticsOpen ? "Hide" : "Open"}
                </span>
              </summary>
              <div className="panel-disclosure-body">
                {showRouting ? (
                  <Suspense
                    fallback={
                      <section className="panel">
                        <PanelHeader title={messages.nav.routing} subtitle={messages.common.loading} />
                        <div className="sub-toolbar">
                          <div className="skeleton-line" />
                        </div>
                      </section>
                    }
                  >
                    <RoutingPanel {...routingPanelProps} />
                  </Suspense>
                ) : null}
              </div>
            </details>
          }
        />
      </Suspense>
    </section>
  );
}
