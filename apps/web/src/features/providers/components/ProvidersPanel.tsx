import { useMemo } from "react";
import type { Messages } from "@/i18n";
import type {
  ProviderMatrixProvider,
  ProviderDataDepth,
  ProviderView,
  DataSourceInventoryRow,
  ProviderActionSelection,
  ProviderSessionRow,
  ProviderSessionActionResult,
  RecoveryBackupExportResponse,
} from "@/shared/types";
import {
  ProviderAdvancedTools,
} from "@/features/providers/components/ProviderAdvancedTools";
import { ProviderMainPanels } from "@/features/providers/components/ProviderMainPanels";
import { ProviderWorkspaceBar } from "@/features/providers/components/ProviderWorkspaceBar";
import { useProvidersPanelState } from "@/features/providers/hooks/useProvidersPanelState";
import { useProvidersPanelModel } from "@/features/providers/hooks/useProvidersPanelModel";
import {
  buildSourceFilterOptions,
  type ProviderProbeFilter,
} from "@/features/providers/model/sessionTableModel";
import type { CsvColumnKey } from "@/features/providers/lib/helpers";
import {
  getCapabilityLevelLabel,
  getProviderActionLabel,
  getProviderFlowStateLabel,
  getProviderStatusLabel,
} from "@/features/providers/model/providerPanelPresentationModel";

export { resolveSessionPanelHeight } from "@/features/providers/hooks/useProvidersPanelModel";

type ProviderFlowState = "done" | "pending" | "blocked";

export interface ProvidersPanelProps {
  messages: Messages;
  sessionDetailSlot?: React.ReactNode;
  diagnosticsSlot?: React.ReactNode;

  providers: ProviderMatrixProvider[];
  providerSummary?: { total: number; active: number; detected: number } | undefined;
  providerMatrixLoading: boolean;

  providerTabs: Array<{
    id: ProviderView;
    name: string;
    status: "active" | "detected" | "missing";
    scanned: number;
    scan_ms: number | null;
    is_slow: boolean;
  }>;
  slowProviderIds: string[];
  slowProviderThresholdMs: number;
  setSlowProviderThresholdMs: (value: number) => void;
  providerView: ProviderView;
  setProviderView: (v: ProviderView) => void;
  providerDataDepth: ProviderDataDepth;
  setProviderDataDepth: (v: ProviderDataDepth) => void;

  providerSessionRows: ProviderSessionRow[];
  allProviderSessionRows: ProviderSessionRow[];
  providerSessionSummary: {
    providers: number;
    rows: number;
    parse_ok: number;
    parse_fail: number;
  };
  dataSourceRows: DataSourceInventoryRow[];
  dataSourcesLoading: boolean;
  providerSessionsLimit: number;
  providerRowsSampled: boolean;
  providerSessionsLoading: boolean;
  selectedProviderFiles: Record<string, boolean>;
  setSelectedProviderFiles: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  allProviderRowsSelected: boolean;
  toggleSelectAllProviderRows: (checked: boolean, scopeFilePaths?: string[]) => void;
  selectedProviderLabel: string | null;
  selectedProviderFilePaths: string[];
  providerActionProvider: string;
  canRunProviderAction: boolean;
  busy: boolean;
  providerDeleteBackupEnabled: boolean;
  setProviderDeleteBackupEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  runProviderAction: (
    action: "backup_local" | "archive_local" | "delete_local",
    dryRun: boolean,
    options?: { backup_before_delete?: boolean },
  ) => void;
  runProviderHardDelete: () => Promise<ProviderSessionActionResult | null>;
  providerActionData: ProviderSessionActionResult | null;
  providerActionSelection: ProviderActionSelection | null;
  runRecoveryBackupExport: (backupIds: string[]) => void;
  recoveryBackupExportData: RecoveryBackupExportResponse | null;

  parserReports: Array<{
    provider: string;
    name: string;
    status: "active" | "detected" | "missing";
    scanned: number;
    parse_ok: number;
    parse_fail: number;
    parse_score: number | null;
    truncated: boolean;
    scan_ms?: number;
    sample_errors?: Array<{ session_id: string; format: string; error: string | null }>;
  }>;
  allParserReports: Array<{
    provider: string;
    name: string;
    status: "active" | "detected" | "missing";
    scanned: number;
    parse_ok: number;
    parse_fail: number;
    parse_score: number | null;
    truncated: boolean;
    scan_ms?: number;
    sample_errors?: Array<{ session_id: string; format: string; error: string | null }>;
  }>;
  parserLoading: boolean;
  parserSummary: {
    providers: number;
    scanned: number;
    parse_ok: number;
    parse_fail: number;
    parse_score: number | null;
  };

  selectedSessionPath: string;
  setSelectedSessionPath: (path: string) => void;
  providersRefreshing: boolean;
  providersLastRefreshAt: string;
  providerFetchMetrics: {
    data_sources: number | null;
    matrix: number | null;
    sessions: number | null;
    parser: number | null;
  };
  refreshProvidersData: () => void;
  providerProbeFilterIntent: ProviderProbeFilter | null;
  setProviderProbeFilterIntent: (value: ProviderProbeFilter | null) => void;
}

export function ProvidersPanel(props: ProvidersPanelProps) {
  const {
    messages,
    sessionDetailSlot,
    diagnosticsSlot,
    providerView,
    providerProbeFilterIntent,
    setProviderProbeFilterIntent,
    canRunProviderAction,
    busy,
  } = props;
  const sourceFilterOptions = useMemo(
    () => buildSourceFilterOptions(props.providerSessionRows),
    [props.providerSessionRows],
  );
  const state = useProvidersPanelState({
    providerView,
    sessionFilter: "",
    sessionSort: "mtime_desc",
    probeFilter: "all",
    sourceFilter: "all",
    sourceFilterOptions,
    providerProbeFilterIntent,
    setProviderProbeFilterIntent,
    canRunProviderAction,
    busy,
    runProviderHardDelete: props.runProviderHardDelete,
  });
  const model = useProvidersPanelModel({ props, state });
  const statusLabel = (status: "active" | "detected" | "missing") =>
    getProviderStatusLabel(messages, status);
  const actionLabel = (action: "backup_local" | "archive_local" | "delete_local") =>
    getProviderActionLabel(messages, action);
  const flowStateLabel = (stateLabel: ProviderFlowState) =>
    getProviderFlowStateLabel(messages, stateLabel);
  const capabilityLevelLabel = (level: string) => getCapabilityLevelLabel(level);

  const searchSlot = (
    <div className="sub-toolbar cleanup-toolbar">
      <div className="toolbar-search-shell is-input">
        <span className="toolbar-search-prompt" aria-hidden="true">
          &gt;
        </span>
        <input
          className="search-input toolbar-search-input"
          placeholder={messages.providers.sessionSearchPlaceholder}
          value={state.sessionFilter}
          onChange={(e) => state.setSessionFilter(e.target.value)}
        />
      </div>
      <div className="toolbar-search-shell is-select">
        <select
          className="filter-select toolbar-search-select"
          aria-label={messages.providers.probeFilterLabel}
          value={state.probeFilter}
          onChange={(e) => state.setProbeFilter(e.target.value as ProviderProbeFilter)}
        >
          <option value="all">{messages.providers.probeAll}</option>
          <option value="ok">{messages.providers.probeOk}</option>
          <option value="fail">{messages.providers.probeFail}</option>
        </select>
        <span className="toolbar-search-chevron" aria-hidden="true">
          ▾
        </span>
      </div>
    </div>
  );

  return (
    <>
      <ProviderWorkspaceBar
        messages={messages}
        providerLabel={model.presentationModel.providerLabel}
        providerView={props.providerView}
        coreProviderTabs={model.workbenchModel.coreProviderTabs}
        optionalProviderTabs={model.workbenchModel.optionalProviderTabs}
        onSelectProviderView={props.setProviderView}
        summary={{
          sessions: props.providerSessionSummary.rows ?? props.providerSessionRows.length,
          sources: model.workbenchModel.detectedDataSourceCount,
          transcriptReady: props.providerSessionSummary.parse_ok ?? 0,
          parseFail: props.providerSessionSummary.parse_fail ?? 0,
          archived: model.sessionModel.archivedSessionCount,
          lastRefreshAt: props.providersLastRefreshAt,
        }}
        searchSlot={searchSlot}
      />

      <ProviderMainPanels
        selectedSessionPath={props.selectedSessionPath}
        activeSessionPanelHeight={state.activeSessionPanelHeight}
        sessionDetailSlot={sessionDetailSlot}
        sessionTableProps={{
          messages,
          providerSessionSummary: {
            rows: props.providerSessionSummary.rows ?? props.providerSessionRows.length,
            parse_ok: props.providerSessionSummary.parse_ok ?? 0,
          },
          providerSessionRows: props.providerSessionRows,
          providerSessionsLimit: props.providerSessionsLimit,
          providerRowsSampled: props.providerRowsSampled,
          showProviderSessionsZeroState: model.workbenchModel.showProviderSessionsZeroState,
          selectedProviderHasPresentSource: model.workbenchModel.selectedProviderHasPresentSource,
          onPromoteDepthRefresh: () => {
            props.setProviderDataDepth("deep");
            props.refreshProvidersData();
          },
          sortedProviderSessionRows: model.sessionModel.sortedProviderSessionRows,
          renderedProviderSessionRows: model.sessionModel.renderedProviderSessionRows,
          canRunProviderAction: props.canRunProviderAction,
          busy: props.busy,
          onRunArchiveDryRun: () => props.runProviderAction("archive_local", true),
          onRunArchive: () => props.runProviderAction("archive_local", false),
          onRunDeleteDryRun: () =>
            props.runProviderAction("delete_local", true, {
              backup_before_delete: props.providerDeleteBackupEnabled,
            }),
          onRunDelete: () =>
            props.runProviderAction("delete_local", false, {
              backup_before_delete: props.providerDeleteBackupEnabled,
            }),
          onRequestHardDeleteConfirm: state.openHardDeleteConfirm,
          hardDeleteConfirmOpen: state.hardDeleteConfirmOpen,
          hardDeleteSkipConfirmChecked: state.hardDeleteSkipConfirmChecked,
          onToggleHardDeleteSkipConfirmChecked: state.setHardDeleteSkipConfirmChecked,
          onConfirmHardDelete: state.confirmHardDelete,
          onCancelHardDeleteConfirm: state.resetHardDeleteConfirmState,
          selectedSessionProvider: model.parserModel.selectedSessionProvider,
          selectedSessionParseFailCount: model.parserModel.selectedSessionParseFailCount,
          onJumpToParserProvider: model.actions.jumpToParserProvider,
          sourceFilter: state.sourceFilter,
          onSourceFilterChange: (value) => state.setSourceFilter(value as typeof state.sourceFilter),
          sourceFilterOptions: model.sourceFilterOptions,
          sessionSort: state.sessionSort,
          onSessionSortChange: (value) => state.setSessionSort(value as typeof state.sessionSort),
          staleOnlyActive: model.sessionModel.allStaleProviderRowsSelected,
          canSelectStaleOnly: model.sessionModel.staleProviderFilePaths.length > 0,
          onToggleSelectStaleOnly: () =>
            props.setSelectedProviderFiles((prev) => {
              const next = { ...prev };
              if (model.sessionModel.allStaleProviderRowsSelected) {
                model.sessionModel.staleProviderFilePaths.forEach((filePath) => {
                  delete next[filePath];
                });
              } else {
                model.sessionModel.staleProviderFilePaths.forEach((filePath) => {
                  next[filePath] = true;
                });
              }
              return next;
            }),
          enabledCsvColumnsCount: model.sessionModel.enabledCsvColumns.length,
          totalCsvColumns: model.constants.csvColumnKeys.length,
          onExportCsv: model.actions.exportFilteredSessionsCsv,
          onSetCsvColumnsPreset: (preset) => {
            if (preset === "all") {
              state.setCsvColumns({ ...model.constants.csvPresets.all });
              return;
            }
            if (preset === "compact") {
              state.setCsvColumns({ ...model.constants.csvPresets.compact });
              return;
            }
            state.setCsvColumns({ ...model.constants.csvPresets.forensics });
          },
          csvColumnItems: model.presentationModel.csvColumnItems,
          onCsvColumnChange: (key, checked) =>
            state.setCsvColumns((prev) => ({ ...prev, [key as CsvColumnKey]: checked })),
          showReadOnlyHint:
            !model.presentationModel.providerSupportsCleanup && props.providerView !== "all",
          showProviderColumn: model.presentationModel.showProviderColumn,
          selectedSessionPath: props.selectedSessionPath,
          slowProviderSet: model.workbenchModel.slowProviderSet,
          onSelectSessionPath: props.setSelectedSessionPath,
          onSetParserDetailProvider: (providerId) =>
            state.dispatchParserWorkspace({
              type: "set_parser_detail_provider",
              providerId,
            }),
          selectedProviderFiles: props.selectedProviderFiles,
          allProviderRowsSelected: props.allProviderRowsSelected,
          allFilteredProviderRowsSelected: model.sessionModel.allFilteredProviderRowsSelected,
          toggleSelectAllProviderRows: (checked) =>
            props.toggleSelectAllProviderRows(checked, model.sessionModel.filteredProviderFilePaths),
          onSelectedProviderFileChange: (filePath, checked) =>
            props.setSelectedProviderFiles((prev) => ({ ...prev, [filePath]: checked })),
          providerSessionsLoading: props.providerSessionsLoading,
          onLoadMoreRows: () => state.setRenderLimit((prev) => prev + model.constants.chunkSize),
          hasMoreRows:
            model.sessionModel.sortedProviderSessionRows.length >
            model.sessionModel.renderedProviderSessionRows.length,
          archiveStage: model.presentationModel.archiveStage,
          deleteStage: model.presentationModel.deleteStage,
          sessionFileActionResult: model.presentationModel.sessionFileActionResult,
          sessionFileActionCanExecute: model.presentationModel.sessionFileActionCanExecute,
          actionLabel,
          csvExportedRows: state.csvExportedRows,
          sectionRef: state.providerSessionsSectionRef,
        }}
        sideStackProps={{
          messages,
          advancedOpen: state.advancedOpen,
          sectionRef: state.providerSideStackRef,
        }}
        backupHubProps={{
          messages,
          selectedProviderFilePathsCount: props.selectedProviderFilePaths.length,
          latestBackupCount: model.presentationModel.latestBackupCount,
          latestExportCount: model.presentationModel.latestExportCount,
          providerDeleteBackupEnabled: props.providerDeleteBackupEnabled,
          onProviderDeleteBackupEnabledChange: (checked) =>
            props.setProviderDeleteBackupEnabled(checked),
          canRunProviderBackup: model.presentationModel.canRunProviderBackup,
          busy: props.busy,
          onRunBackupSelected: () => props.runProviderAction("backup_local", false),
          onRunRecoveryBackupExport: () => props.runRecoveryBackupExport([]),
          latestBackupPath: model.presentationModel.latestBackupPath,
          backupFlowHint: model.presentationModel.backupFlowHint,
          deleteBackupModeLabel: model.presentationModel.deleteBackupModeLabel,
          selectedSessionPreview: model.presentationModel.selectedSessionPreview,
          backupActionResult: model.presentationModel.backupActionResult,
        }}
        parserTableProps={{
          messages,
          parserSummary: props.parserSummary,
          linkedSession: {
            provider: model.parserModel.selectedSessionProvider,
            visibleInParser: model.parserModel.selectedSessionProviderVisibleInParser,
          },
          overview: {
            parserFailOnly: state.parserWorkspace.parserFailOnly,
            onParserFailOnlyChange: (value) =>
              state.dispatchParserWorkspace({ type: "set_parser_fail_only", value }),
            filteredParserReportsCount: model.parserModel.filteredParserReports.length,
            totalParserReportsCount: props.parserReports.length,
            parserSort: state.parserWorkspace.parserSort,
            onParserSortChange: (value) =>
              state.dispatchParserWorkspace({
                type: "set_parser_sort",
                value: value as typeof state.parserWorkspace.parserSort,
              }),
            sortedParserReports: model.parserModel.sortedParserReports,
            parserLoading: props.parserLoading,
            slowProviderSet: model.workbenchModel.slowProviderSet,
            statusLabel,
            onJumpToProviderSessions: model.actions.jumpToProviderSessions,
          },
          detail: {
            parserReportsWithErrors: model.parserModel.parserReportsWithErrors,
            parserDetailProvider: state.parserWorkspace.parserDetailProvider,
            onParserDetailProviderChange: (providerId) =>
              state.dispatchParserWorkspace({
                type: "set_parser_detail_provider",
                providerId,
              }),
            parserJumpStatus: state.parserWorkspace.parserJumpStatus,
            parserDetailReport: model.parserModel.parserDetailReport,
            onJumpToSessionFromParserError: model.actions.jumpToSessionFromParserError,
          },
          detailsRef: state.parserSectionRef,
        }}
      />

      <ProviderAdvancedTools
        diagnosticsSlot={diagnosticsSlot}
        advancedShellProps={{
          messages,
          advancedOpen: state.advancedOpen,
          onAdvancedOpenChange: state.setAdvancedOpen,
          onRefreshProvidersData: props.refreshProvidersData,
          providersRefreshing: props.providersRefreshing,
          providersLastRefreshAt: props.providersLastRefreshAt,
          providerDataDepth: props.providerDataDepth,
          onProviderDataDepthChange: props.setProviderDataDepth,
          slowProviderThresholdMs: props.slowProviderThresholdMs,
          slowThresholdOptions: model.workbenchModel.slowThresholdOptions,
          onSlowProviderThresholdChange: props.setSlowProviderThresholdMs,
          canReturnHotspotScope: model.presentationModel.canReturnHotspotScope,
          hotspotOriginLabel: model.presentationModel.hotspotOriginLabel,
          onReturnHotspotScope: () => {
            if (!state.hotspotScopeOrigin) return;
            props.setProviderView(state.hotspotScopeOrigin);
            state.setHotspotScopeOrigin(null);
          },
          providerFetchMetrics: props.providerFetchMetrics,
          slowProviderIdsCount: props.slowProviderIds.length,
          providerTabCount: model.workbenchModel.providerTabCount,
          slowProviderSummary: model.workbenchModel.slowProviderSummary,
          hasSlowProviderFetch: model.workbenchModel.hasSlowProviderFetch,
        }}
        matrixProps={{
          messages,
          providerSummary: props.providerSummary,
          providers: props.providers,
          providerMatrixLoading: props.providerMatrixLoading,
          providerScanMsById: new Map(
            props.providerTabs
              .filter((tab) => tab.id !== "all")
              .map((tab) => [tab.id, tab.scan_ms ?? null]),
          ),
          slowProviderSet: model.workbenchModel.slowProviderSet,
          statusLabel,
          capabilityLevelLabel,
          onJumpToProviderSessions: model.actions.jumpToProviderSessions,
          slowHotspotCards: model.flowModel.slowHotspotCards,
          providerTabCount: model.workbenchModel.providerTabCount,
          slowFocusActive: model.presentationModel.slowFocusActive,
          onFocusSlowProviders: model.actions.focusSlowProviders,
          onClearSlowFocus: model.actions.clearSlowFocus,
          onJumpToParserProvider: model.actions.jumpToParserProvider,
          visibleFlowCards: model.flowModel.visibleFlowCards,
          flowStateLabel,
        }}
        dataSourcesListProps={{
          copy: {
            disclosure: messages.providers.dataSourcesDisclosure,
            detected: messages.providers.dataSourcesDetected,
            files: messages.providers.dataSourcesFiles,
            dirs: messages.providers.dataSourcesDirs,
            size: messages.providers.dataSourcesSize,
            updated: messages.providers.dataSourcesUpdated,
            openSessions: messages.providers.openSessions,
            ok: messages.common.ok,
            fail: messages.common.fail,
          },
          dataSourcesLoading: props.dataSourcesLoading,
          dataSourceRows: props.dataSourceRows,
          detectedDataSourceCount: model.workbenchModel.detectedDataSourceCount,
          canOpenProviderById: model.canOpenProviderById,
          onOpenProviderSessions: model.actions.jumpToProviderSessions,
        }}
      />
    </>
  );
}
