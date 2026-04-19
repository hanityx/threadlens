import { lazy, Suspense, useMemo } from "react";
import { PanelHeader } from "@/shared/ui/components/PanelHeader";
import type { ProvidersPanelProps } from "@/features/providers/components/ProvidersPanel";
import { useAppContext } from "@/app/AppContext";
import { buildProvidersWorkspaceState } from "@/features/providers/model/providersWorkspaceModel";

const ProvidersPanel = lazy(async () => {
  const mod = await import("./ProvidersPanel");
  return { default: mod.ProvidersPanel };
});

const SessionDetail = lazy(async () => {
  const mod = await import("@/features/providers/session/SessionDetail");
  return { default: mod.SessionDetail };
});

const RoutingPanel = lazy(async () => {
  const mod = await import("@/features/providers/routing/RoutingPanel");
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
    providerActionProvider,
    canRunProviderAction,
    busy,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    runProviderAction,
    runProviderHardDelete,
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
    emptySessionNextPath,
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    setSessionTranscriptLimit,
    canRunSelectedSessionAction,
    runSingleProviderAction,
    runSingleProviderHardDelete,
    providersDiagnosticsOpen,
    setProvidersDiagnosticsOpen,
    handleDiagnosticsIntent,
    showRouting,
    executionGraphData,
    executionGraphLoading,
    visibleProviderIds,
    providerProbeFilterIntent,
    setProviderProbeFilterIntent,
  } = useAppContext();

  const {
    selectedSessionCount,
    emptyNextSessions,
    selectedSessionActionResult,
    sessionDetailKey,
  } = useMemo(
    () =>
      buildProvidersWorkspaceState({
        messages,
        providerSessionRows,
        selectedProviderFiles,
        emptySessionNextTitle,
        emptySessionNextPath,
        selectedSession,
        providerActionData,
        providerActionSelection,
      }),
    [
      messages,
      providerSessionRows,
      selectedProviderFiles,
      emptySessionNextTitle,
      emptySessionNextPath,
      selectedSession,
      providerActionData,
      providerActionSelection,
    ],
  );

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
    providerActionProvider,
    canRunProviderAction,
    busy,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    runProviderAction,
    runProviderHardDelete,
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
    providerProbeFilterIntent,
    setProviderProbeFilterIntent,
  };

  const sessionDetailProps = {
    messages,
    selectedSession,
    selectedCount: selectedSessionCount,
    sessionActionResult: selectedSessionActionResult,
    emptyScopeLabel: emptySessionScopeLabel,
    emptyNextSessions,
    onOpenSessionPath: setSelectedSessionPath,
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    setSessionTranscriptLimit,
    busy,
    canRunSessionAction: canRunSelectedSessionAction,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    runSingleProviderAction,
    runSingleProviderHardDelete,
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
                  <span className="session-routing-disclosure-kicker">{messages.routing.sessionSurfaceKicker}</span>
                  <span className="session-routing-disclosure-summary">
                    <strong>{messages.nav.routing}</strong>
                    <span className="session-routing-disclosure-bodycopy">
                      {providersDiagnosticsOpen
                        ? messages.routing.sessionSurfaceBodyOpen
                        : messages.routing.sessionSurfaceBodyClosed}
                    </span>
                  </span>
                </span>
                <span className="session-routing-disclosure-pill">
                  {providersDiagnosticsOpen
                    ? messages.routing.sessionSurfacePillHide
                    : messages.routing.sessionSurfacePillOpen}
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
