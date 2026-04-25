import { useEffect, useMemo, useRef } from "react";
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
  RecoveryResponse,
} from "@/shared/types";
import type { GroupedBackupProgress } from "@/app/hooks/useProviderMutationActions";
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
  getProviderFlowStateLabel,
  getProviderStatusLabel,
} from "@/features/providers/model/providerPanelPresentationModel";
import {
  clearDesktopRouteProviderFilePath,
  pruneSelectedProviderFilesForFilteredScope,
  resolveProviderViewSwitch,
  shouldClearFilteredSessionPath,
  shouldShowProviderSessionDetailSlot,
} from "@/features/providers/model/providersPanelScopeModel";

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
  allProviderSessionProviders?: Array<{
    provider: string;
    total_bytes?: number;
  }>;
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
  providerSessionActionPending: boolean;
  recoveryBackupExportPending: boolean;
  groupedBackupProgress?: GroupedBackupProgress | null;
  providerDeleteBackupEnabled: boolean;
  setProviderDeleteBackupEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  backupRoot: string;
  setBackupRoot: (value: string) => void;
  exportRoot: string;
  setExportRoot: (value: string) => void;
  latestExportArchivePath: string;
  runProviderAction: (
    action: "backup_local" | "archive_local" | "unarchive_local" | "delete_local",
    dryRun: boolean,
    options?: { backup_before_delete?: boolean },
    filePathsOverride?: string[],
  ) => void;
  runProviderConfirmedAction?: (
    action: "archive_local" | "unarchive_local",
    options?: { backup_before_delete?: boolean },
    filePathsOverride?: string[],
  ) => Promise<ProviderSessionActionResult | null>;
  runPreparedProviderAction?: (
    selection: ProviderActionSelection,
  ) => Promise<ProviderSessionActionResult | null>;
  runProviderHardDelete: (filePathsOverride?: string[]) => Promise<ProviderSessionActionResult | null>;
  providerActionData: ProviderSessionActionResult | null;
  providerActionSelection: ProviderActionSelection | null;
  runRecoveryBackupExport: (backupIds: string[]) => void;
  runGroupedProviderBackup: (
    groups: Array<{ provider: string; file_paths: string[] }>,
  ) => Promise<ProviderSessionActionResult | null>;
  runGroupedProviderBackupExport: (
    groups: Array<{ provider: string; file_paths: string[] }>,
  ) => Promise<ProviderSessionActionResult | null>;
  recoveryBackupExportData: RecoveryBackupExportResponse | null;
  recoveryData: RecoveryResponse | null;

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
    busy,
  } = props;
  const sourceFilterOptions = useMemo(
    () => buildSourceFilterOptions(props.providerSessionRows),
    [props.providerSessionRows],
  );
  const actionEligibleFilePaths = useMemo(
    () =>
      props.providerSessionRows
        .filter(
          (row) =>
            Boolean(props.selectedProviderFiles[row.file_path]) &&
            row.source !== "cleanup_backups" &&
            row.source !== "archived_sessions",
        )
        .map((row) => row.file_path),
    [props.providerSessionRows, props.selectedProviderFiles],
  );
  const unarchiveEligibleFilePaths = useMemo(
    () =>
      props.providerSessionRows
        .filter(
          (row) =>
            Boolean(props.selectedProviderFiles[row.file_path]) &&
            row.source === "archived_sessions",
        )
        .map((row) => row.file_path),
    [props.providerSessionRows, props.selectedProviderFiles],
  );
  const backupDeleteEligibleFilePaths = useMemo(
    () =>
      props.providerSessionRows
        .filter(
          (row) =>
            Boolean(props.selectedProviderFiles[row.file_path]) &&
            row.source === "cleanup_backups",
        )
        .map((row) => row.file_path),
    [props.providerSessionRows, props.selectedProviderFiles],
  );
  const hasActionEligibleSelection = useMemo(
    () =>
      actionEligibleFilePaths.length > 0 ||
      unarchiveEligibleFilePaths.length > 0 ||
      backupDeleteEligibleFilePaths.length > 0,
    [actionEligibleFilePaths, backupDeleteEligibleFilePaths, unarchiveEligibleFilePaths],
  );
  const groupedBackupEligibleSelections = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const row of props.providerSessionRows) {
      if (
        !props.selectedProviderFiles[row.file_path] ||
        row.source === "cleanup_backups" ||
        row.source === "archived_sessions"
      ) continue;
      const provider = String(row.provider || "").trim();
      if (!provider) continue;
      const bucket = grouped.get(provider) ?? [];
      bucket.push(row.file_path);
      grouped.set(provider, bucket);
    }
    return Array.from(grouped.entries()).map(([provider, file_paths]) => ({
      provider,
      file_paths,
    }));
  }, [props.providerSessionRows, props.selectedProviderFiles]);
  const state = useProvidersPanelState({
    providerView,
    sessionFilter: "",
    sessionSort: "mtime_desc",
    probeFilter: "all",
    sourceFilter: "all",
    sourceFilterOptions,
    providerProbeFilterIntent,
    setProviderProbeFilterIntent,
    canRunProviderAction: props.canRunProviderAction && hasActionEligibleSelection,
    busy,
    runProviderHardDelete: (view) =>
      props.runProviderHardDelete(
        view.showBackupRows
          ? backupDeleteEligibleFilePaths
          : view.showArchivedRows
            ? unarchiveEligibleFilePaths
            : actionEligibleFilePaths,
      ),
  });
  const backupSourceFilterRef = useRef(state.sourceFilter);
  const model = useProvidersPanelModel({ props, state });
  const showSessionDetailSlot = shouldShowProviderSessionDetailSlot({
    selectedSessionPath: props.selectedSessionPath,
    filteredProviderFilePaths: model.sessionModel.filteredProviderFilePaths,
    sessionFilter: state.sessionFilter,
    probeFilter: state.probeFilter,
    sourceFilter: state.sourceFilter,
    backupViewScoped: state.showBackupRows,
    archivedViewScoped: state.showArchivedRows,
  });
  const statusLabel = (status: "active" | "detected" | "missing") =>
    getProviderStatusLabel(messages, status);
  const flowStateLabel = (stateLabel: ProviderFlowState) =>
    getProviderFlowStateLabel(messages, stateLabel);
  const capabilityLevelLabel = (level: string) => getCapabilityLevelLabel(messages, level);
  const groupedBackupProgressLabel = useMemo(() => {
    if (!props.groupedBackupProgress) return null;
    const providerLabel =
      props.providerTabs.find((tab) => tab.id === props.groupedBackupProgress?.provider)?.name ??
      props.groupedBackupProgress.provider;
    return {
      current: props.groupedBackupProgress.current,
      total: props.groupedBackupProgress.total,
      providerLabel,
    };
  }, [props.groupedBackupProgress, props.providerTabs]);

  useEffect(() => {
    props.setSelectedProviderFiles((prev) =>
      pruneSelectedProviderFilesForFilteredScope({
        selectedProviderFiles: prev,
        filteredProviderFilePaths: model.sessionModel.filteredProviderFilePaths,
        sessionFilter: state.sessionFilter,
        probeFilter: state.probeFilter,
        sourceFilter: state.sourceFilter,
        backupViewScoped: state.showBackupRows,
        archivedViewScoped: state.showArchivedRows,
      }),
    );
  }, [
    model.sessionModel.filteredProviderFilePaths,
    props.setSelectedProviderFiles,
    state.probeFilter,
    state.sessionFilter,
    state.sourceFilter,
    state.showBackupRows,
    state.showArchivedRows,
  ]);

  useEffect(() => {
    if (state.showBackupRows) return;
    if (state.sourceFilter === "all") return;
    backupSourceFilterRef.current = state.sourceFilter;
  }, [state.showBackupRows, state.sourceFilter]);

  useEffect(() => {
    if (
      !shouldClearFilteredSessionPath({
        selectedSessionPath: props.selectedSessionPath,
        filteredProviderFilePaths: model.sessionModel.filteredProviderFilePaths,
        sessionFilter: state.sessionFilter,
        probeFilter: state.probeFilter,
        sourceFilter: state.sourceFilter,
        backupViewScoped: state.showBackupRows,
        archivedViewScoped: state.showArchivedRows,
      })
    ) {
      return;
    }
    clearDesktopRouteProviderFilePath(props.providerView);
    props.setSelectedSessionPath("");
  }, [
    model.sessionModel.filteredProviderFilePaths,
    props.providerView,
    props.selectedSessionPath,
    props.setSelectedSessionPath,
    state.probeFilter,
    state.sessionFilter,
    state.sourceFilter,
    state.showBackupRows,
    state.showArchivedRows,
  ]);

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

  const runSelectedProviderBackup = () => {
    if (props.providerView === "all" && groupedBackupEligibleSelections.length > 1) {
      void props.runGroupedProviderBackup(groupedBackupEligibleSelections);
      return;
    }
    props.runProviderAction(
      "backup_local",
      false,
      undefined,
      model.sessionModel.backupEligibleFilePaths,
    );
  };
  return (
    <>
      <ProviderWorkspaceBar
        messages={messages}
        providerLabel={model.presentationModel.providerLabel}
        providerView={props.providerView}
        coreProviderTabs={model.workbenchModel.coreProviderTabs}
        optionalProviderTabs={model.workbenchModel.optionalProviderTabs}
        onSelectProviderView={(nextView) => {
          const next = resolveProviderViewSwitch(
            props.providerView,
            nextView,
            props.selectedSessionPath,
          );
          props.setProviderView(next.providerView);
          if (next.selectedSessionPath !== props.selectedSessionPath) {
            props.setSelectedSessionPath(next.selectedSessionPath);
          }
        }}
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
        sessionDetailSlot={showSessionDetailSlot ? sessionDetailSlot : null}
        sessionTableProps={{
          messages,
          data: {
            providerSessionSummary: {
              rows: props.providerSessionSummary.rows ?? props.providerSessionRows.length,
              parse_ok: props.providerSessionSummary.parse_ok ?? 0,
            },
            providerSessionRows: model.sessionModel.scopedProviderSessionRows,
            providerSessionsLimit: props.providerSessionsLimit,
            providerRowsSampled: props.providerRowsSampled,
            showProviderSessionsZeroState: model.workbenchModel.showProviderSessionsZeroState,
            selectedProviderHasPresentSource: model.workbenchModel.selectedProviderHasPresentSource,
            sortedRows: model.sessionModel.sortedProviderSessionRows,
            renderedRows: model.sessionModel.renderedProviderSessionRows,
            providerSessionsLoading: props.providerSessionsLoading,
            hasMoreRows:
              model.sessionModel.sortedProviderSessionRows.length >
              model.sessionModel.renderedProviderSessionRows.length,
            csvExportedRows: state.csvExportedRows,
            selectedSessionProvider: model.parserModel.selectedSessionProvider,
            selectedSessionParseFailCount: model.parserModel.selectedSessionParseFailCount,
            slowProviderSet: model.workbenchModel.slowProviderSet,
          },
          selection: {
            selectedSessionPath: props.selectedSessionPath,
            selectedProviderFiles: props.selectedProviderFiles,
            allProviderRowsSelected: props.allProviderRowsSelected,
            allFilteredProviderRowsSelected: model.sessionModel.allFilteredProviderRowsSelected,
            staleOnlyActive: model.sessionModel.allStaleProviderRowsSelected,
            canSelectStaleOnly: model.sessionModel.staleProviderFilePaths.length > 0,
            showBackupRows: state.showBackupRows,
            canShowBackupRows: model.sessionModel.hasBackupRows,
            showArchivedRows: state.showArchivedRows,
            canShowArchivedRows: true,
          },
          filters: {
            sourceFilter: state.sourceFilter,
            sourceFilterOptions: model.sourceFilterOptions,
            sessionSort: state.sessionSort,
            enabledCsvColumnsCount: model.sessionModel.enabledCsvColumns.length,
            totalCsvColumns: model.constants.csvColumnKeys.length,
            csvColumnItems: model.presentationModel.csvColumnItems,
          },
          actions: {
            onPromoteDepthRefresh: () => {
              props.setProviderDataDepth("deep");
              props.refreshProvidersData();
            },
            onRunArchiveDryRun: () =>
              void props.runProviderConfirmedAction?.(
                state.showArchivedRows ? "unarchive_local" : "archive_local",
                undefined,
                state.showArchivedRows
                  ? model.sessionModel.unarchiveEligibleFilePaths
                  : model.sessionModel.actionEligibleFilePaths,
              ),
            onRunArchiveExecute: () =>
              props.runProviderAction(
                state.showArchivedRows ? "unarchive_local" : "archive_local",
                false,
                undefined,
                state.showArchivedRows
                  ? model.sessionModel.unarchiveEligibleFilePaths
                  : model.sessionModel.actionEligibleFilePaths,
              ),
            onRunDeleteDryRun: () =>
              props.runProviderAction("delete_local", true, {
                backup_before_delete: props.providerDeleteBackupEnabled,
              }, model.sessionModel.actionEligibleFilePaths),
            onRequestHardDeleteConfirm: state.openHardDeleteConfirm,
            onToggleHardDeleteSkipConfirmChecked: state.setHardDeleteSkipConfirmChecked,
            onConfirmHardDelete: state.confirmHardDelete,
            onCancelHardDeleteConfirm: state.resetHardDeleteConfirmState,
            onJumpToParserProvider: model.actions.jumpToParserProvider,
            onSourceFilterChange: (value) => state.setSourceFilter(value as typeof state.sourceFilter),
            onSessionSortChange: (value) => state.setSessionSort(value as typeof state.sessionSort),
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
            onToggleShowBackupRows: () => {
              const nextShowBackupRows = !state.showBackupRows;
              if (nextShowBackupRows) {
                backupSourceFilterRef.current = state.sourceFilter;
                state.setSourceFilter("all");
                state.setShowArchivedRows(false);
              } else {
                state.setSourceFilter(backupSourceFilterRef.current);
              }
              state.setShowBackupRows(nextShowBackupRows);
            },
            onToggleShowArchivedRows: () => {
              const nextShowArchivedRows = !state.showArchivedRows;
              if (nextShowArchivedRows) {
                backupSourceFilterRef.current = state.sourceFilter;
                state.setSourceFilter("all");
                state.setShowBackupRows(false);
              } else {
                state.setSourceFilter(backupSourceFilterRef.current);
              }
              state.setShowArchivedRows(nextShowArchivedRows);
            },
            onRunBackupSelected: runSelectedProviderBackup,
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
            onCsvColumnChange: (key, checked) =>
              state.setCsvColumns((prev) => ({ ...prev, [key as CsvColumnKey]: checked })),
            onProviderDeleteBackupEnabledChange: props.setProviderDeleteBackupEnabled,
            onSelectSessionPath: props.setSelectedSessionPath,
            onSetParserDetailProvider: (providerId) =>
              state.dispatchParserWorkspace({
                type: "set_parser_detail_provider",
                providerId,
              }),
            toggleSelectAllProviderRows: (checked) =>
              props.toggleSelectAllProviderRows(checked, model.sessionModel.filteredProviderFilePaths),
            onSelectedProviderFileChange: (filePath, checked) =>
              props.setSelectedProviderFiles((prev) => ({ ...prev, [filePath]: checked })),
            onLoadMoreRows: () => state.setRenderLimit((prev) => prev + model.constants.chunkSize),
          },
          workflow: {
            canRunProviderAction:
              props.canRunProviderAction && (
                state.showBackupRows
                  ? model.sessionModel.backupDeleteEligibleFilePaths.length > 0
                  : state.showArchivedRows
                    ? model.sessionModel.unarchiveEligibleFilePaths.length > 0
                    : model.sessionModel.actionEligibleFilePaths.length > 0
              ),
            busy: props.busy,
            hardDeleteConfirmOpen: state.hardDeleteConfirmOpen,
            hardDeleteSkipConfirmChecked: state.hardDeleteSkipConfirmChecked,
            canRunProviderBackup: model.presentationModel.canRunProviderBackup,
            actionSelectionHint: model.presentationModel.actionSelectionHint,
            providerDeleteBackupEnabled: props.providerDeleteBackupEnabled,
            showReadOnlyHint:
              !model.presentationModel.providerSupportsCleanup && props.providerView !== "all",
            archiveStage: model.presentationModel.archiveStage,
            archiveCanExecute:
              model.presentationModel.sessionFileActionCanExecute &&
              model.presentationModel.sessionFileActionResult?.action ===
                (state.showArchivedRows ? "unarchive_local" : "archive_local"),
            deleteStage: model.presentationModel.deleteStage,
          },
          display: {
            showProviderColumn: model.presentationModel.showProviderColumn,
          },
          sectionRef: state.providerSessionsSectionRef,
        }}
        sideStackProps={{
          messages,
          advancedOpen: state.advancedOpen,
          sectionRef: state.providerSideStackRef,
        }}
        backupHubProps={{
          messages,
          selectedProviderFilePathsCount: model.sessionModel.backupEligibleFilePaths.length,
          availableBackupSets: model.presentationModel.availableBackupSets,
          canRunProviderBackup: model.presentationModel.canRunProviderBackup,
          backupPending: props.providerSessionActionPending,
          exportPending: props.recoveryBackupExportPending,
          onRunBackupSelected: runSelectedProviderBackup,
          onRunBackupSelectedExport: () => props.runGroupedProviderBackupExport(groupedBackupEligibleSelections),
          onRunRecoveryBackupExport: () => props.runRecoveryBackupExport([]),
          backupRoot: model.presentationModel.latestBackupFolder,
          exportRoot: model.presentationModel.exportFolder,
          onBackupRootChange: props.setBackupRoot,
          onExportRootChange: props.setExportRoot,
          onResetBackupRoot: () => props.setBackupRoot(""),
          onResetExportRoot: () => props.setExportRoot(""),
          latestBackupPath: model.presentationModel.latestBackupPath,
          backupFolderHint: model.presentationModel.backupFolderHint,
          latestExportPath: model.presentationModel.latestExportPath,
          backupSelectionHint: model.presentationModel.backupSelectionHint,
          backupActionResult: model.presentationModel.backupActionResult,
          legacyBackupSets: model.presentationModel.legacyBackupSets,
          groupedBackupProgress: groupedBackupProgressLabel,
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
          providerView: props.providerView,
          allViewHiddenCount: model.flowModel.allViewHiddenCount,
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
          providerSessionProviders: props.allProviderSessionProviders ?? [],
          detectedDataSourceCount: model.workbenchModel.detectedDataSourceCount,
          canOpenProviderById: model.canOpenProviderById,
          onOpenProviderSessions: model.actions.jumpToProviderSessions,
        }}
      />
    </>
  );
}
