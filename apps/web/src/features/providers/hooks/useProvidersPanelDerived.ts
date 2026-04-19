import { useMemo } from "react";
import type { ProviderView } from "@/shared/types";
import { CHUNK_SIZE } from "@/shared/types";
import {
  COMPACT_CSV_COLUMNS,
  CSV_COLUMN_KEYS,
  DEFAULT_CSV_COLUMNS,
  FORENSICS_CSV_COLUMNS,
} from "@/features/providers/lib/helpers";
import {
  buildProviderSessionComputedIndex,
  buildSourceFilterOptions,
  filterProviderSessionRows,
  sortProviderSessionRows,
} from "@/features/providers/model/sessionTableModel";
import { buildProviderFlowModel } from "@/features/providers/model/providerFlowModel";
import { buildParserWorkspaceView } from "@/features/providers/parser/parserWorkspaceModel";
import { buildProviderWorkbenchModel } from "@/features/providers/model/providerWorkbenchModel";
import {
  buildProviderCsvColumnItems,
} from "@/features/providers/model/providerCsvModel";
import { providerActionSelectionKey } from "@/shared/lib/appState";
import {
  buildProviderPanelPresentationModel,
  getProviderWorkflowStage,
} from "@/features/providers/model/providerPanelPresentationModel";
import type { useProvidersPanelState } from "@/features/providers/hooks/useProvidersPanelState";
import type { ProvidersPanelProps } from "@/features/providers/components/ProvidersPanel";

export function useProvidersPanelDerived(options: {
  props: ProvidersPanelProps;
  state: ReturnType<typeof useProvidersPanelState>;
}) {
  const { props, state } = options;
  const sourceFilterOptions = useMemo(
    () => buildSourceFilterOptions(props.providerSessionRows),
    [props.providerSessionRows],
  );
  const canOpenProviderById = (providerId: ProviderView | null): providerId is ProviderView =>
    Boolean(providerId && props.providerTabs.some((tab) => tab.id === providerId));
  const canApplySlowOnly = props.providerView === "all";
  const effectiveSlowOnly = canApplySlowOnly && state.slowOnly;
  const workbenchModel = useMemo(
    () =>
      buildProviderWorkbenchModel({
        providerTabs: props.providerTabs,
        slowProviderIds: props.slowProviderIds,
        slowProviderThresholdMs: props.slowProviderThresholdMs,
        providerView: props.providerView,
        dataSourceRows: props.dataSourceRows,
        providerSessionsLoading: props.providerSessionsLoading,
        providerSessionRows: props.providerSessionRows,
        providerFetchMetrics: props.providerFetchMetrics,
      }),
    [
      props.providerTabs,
      props.slowProviderIds,
      props.slowProviderThresholdMs,
      props.providerView,
      props.dataSourceRows,
      props.providerSessionsLoading,
      props.providerSessionRows,
      props.providerFetchMetrics,
    ],
  );
  const providerSessionComputedIndex = useMemo(
    () => buildProviderSessionComputedIndex(props.providerSessionRows),
    [props.providerSessionRows],
  );
  const providerTitleCollator = useMemo(
    () => new Intl.Collator(undefined, { sensitivity: "base" }),
    [],
  );
  const filteredProviderSessionRows = useMemo(
    () =>
      filterProviderSessionRows(props.providerSessionRows, providerSessionComputedIndex, {
        query: state.deferredSessionFilter,
        sourceFilter: state.sourceFilter,
        probeFilter: state.probeFilter,
        effectiveSlowOnly,
        slowProviderSet: workbenchModel.slowProviderSet,
      }),
    [
      props.providerSessionRows,
      providerSessionComputedIndex,
      state.deferredSessionFilter,
      state.probeFilter,
      state.sourceFilter,
      effectiveSlowOnly,
      workbenchModel.slowProviderSet,
    ],
  );
  const sortedProviderSessionRows = useMemo(
    () =>
      sortProviderSessionRows(
        filteredProviderSessionRows,
        providerSessionComputedIndex,
        providerTitleCollator,
        state.sessionSort,
      ),
    [filteredProviderSessionRows, providerSessionComputedIndex, providerTitleCollator, state.sessionSort],
  );
  const renderedProviderSessionRows = useMemo(
    () => sortedProviderSessionRows.slice(0, state.renderLimit),
    [sortedProviderSessionRows, state.renderLimit],
  );
  const archivedSessionCount = useMemo(
    () => props.providerSessionRows.filter((row) => row.source === "archived_sessions").length,
    [props.providerSessionRows],
  );
  const filteredProviderFilePaths = useMemo(
    () => sortedProviderSessionRows.map((row) => row.file_path),
    [sortedProviderSessionRows],
  );
  const staleProviderFilePaths = useMemo(() => {
    const staleCutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return sortedProviderSessionRows
      .filter((row) => {
        const ts = providerSessionComputedIndex.mtimeTs.get(row.file_path) ?? 0;
        return ts > 0 && ts <= staleCutoffMs;
      })
      .map((row) => row.file_path);
  }, [providerSessionComputedIndex.mtimeTs, sortedProviderSessionRows]);
  const allFilteredProviderRowsSelected =
    sortedProviderSessionRows.length > 0 &&
    sortedProviderSessionRows.every((row) => Boolean(props.selectedProviderFiles[row.file_path]));
  const allStaleProviderRowsSelected =
    staleProviderFilePaths.length > 0 &&
    staleProviderFilePaths.every((filePath) => Boolean(props.selectedProviderFiles[filePath]));
  const enabledCsvColumns = useMemo(
    () => CSV_COLUMN_KEYS.filter((key) => Boolean(state.csvColumns[key])),
    [state.csvColumns],
  );
  const parserWorkspaceView = useMemo(
    () =>
      buildParserWorkspaceView({
        state: state.parserWorkspace,
        parserReports: props.parserReports,
        providerSessionRows: props.providerSessionRows,
        selectedSessionPath: props.selectedSessionPath,
        effectiveSlowOnly,
        slowProviderSet: workbenchModel.slowProviderSet,
      }),
    [
      state.parserWorkspace,
      props.parserReports,
      props.providerSessionRows,
      props.selectedSessionPath,
      effectiveSlowOnly,
      workbenchModel.slowProviderSet,
    ],
  );
  const providerFlowModel = useMemo(
    () =>
      buildProviderFlowModel({
        providers: props.providers,
        providerTabs: props.providerTabs,
        parserReports: props.parserReports,
        allParserReports: props.allParserReports,
        allProviderSessionRows: props.allProviderSessionRows,
        dataSourceRows: props.dataSourceRows,
        slowProviderIds: props.slowProviderIds,
        providerView: props.providerView,
        providerMessages: {
          flowNextCollect: props.messages.providers.flowNextCollect,
          flowNextCollectSessions: props.messages.providers.flowNextCollectSessions,
          flowNextParse: props.messages.providers.flowNextParse,
          flowNextReadonly: props.messages.providers.flowNextReadonly,
          flowNextExecute: props.messages.providers.flowNextExecute,
          flowNextDryRun: props.messages.providers.flowNextDryRun,
          flowStageDetect: props.messages.providers.flowStageDetect,
          flowStageSessions: props.messages.providers.flowStageSessions,
          flowStageParser: props.messages.providers.flowStageParser,
          flowStageSafeCleanup: props.messages.providers.flowStageSafeCleanup,
          flowStageApply: props.messages.providers.flowStageApply,
        },
      }),
    [
      props.providers,
      props.providerTabs,
      props.parserReports,
      props.allParserReports,
      props.allProviderSessionRows,
      props.dataSourceRows,
      props.slowProviderIds,
      props.providerView,
      props.messages.providers,
    ],
  );
  const selectedSessionParseFailCount = parserWorkspaceView.selectedSessionProvider
    ? providerFlowModel.parseFailByProvider[parserWorkspaceView.selectedSessionProvider]
    : undefined;
  const selectedSessionPreview = useMemo(
    () => props.providerSessionRows.find((row) => row.file_path === props.selectedSessionPath) ?? null,
    [props.providerSessionRows, props.selectedSessionPath],
  );
  const presentationModel = useMemo(
    () =>
      buildProviderPanelPresentationModel({
        messages: props.messages,
        providerView: props.providerView,
        selectedProviderLabel: props.selectedProviderLabel,
        providerActionData: props.providerActionData,
        recoveryBackupExportData: props.recoveryBackupExportData,
        selectedProviderFilePathsCount: props.selectedProviderFilePaths.length,
        providerActionProvider: props.providerActionProvider,
        providerDeleteBackupEnabled: props.providerDeleteBackupEnabled,
        hotspotScopeOrigin: state.hotspotScopeOrigin,
        slowOnly: state.slowOnly,
        canApplySlowOnly,
      }),
    [
      props.messages,
      props.providerView,
      props.selectedProviderLabel,
      props.providerActionData,
      props.recoveryBackupExportData,
      props.selectedProviderFilePaths.length,
      props.providerActionProvider,
      props.providerDeleteBackupEnabled,
      state.hotspotScopeOrigin,
      state.slowOnly,
      canApplySlowOnly,
    ],
  );
  const sessionFileActionPreviewKey =
    props.providerActionSelection && presentationModel.sessionFileActionResult
      ? providerActionSelectionKey(
          props.providerActionSelection.provider,
          props.providerActionSelection.action,
          props.providerActionSelection.file_paths,
          { backup_before_delete: props.providerActionSelection.backup_before_delete },
        )
      : "";
  const archiveSelectionKey =
    props.providerActionProvider && props.selectedProviderFilePaths.length > 0
      ? providerActionSelectionKey(props.providerActionProvider, "archive_local", props.selectedProviderFilePaths)
      : "";
  const deleteSelectionKey =
    props.providerActionProvider && props.selectedProviderFilePaths.length > 0
      ? providerActionSelectionKey(props.providerActionProvider, "delete_local", props.selectedProviderFilePaths, {
          backup_before_delete: props.providerDeleteBackupEnabled,
        })
      : "";
  const sessionFileActionCurrentKey =
    presentationModel.sessionFileActionResult?.action === "archive_local"
      ? archiveSelectionKey
      : presentationModel.sessionFileActionResult?.action === "delete_local"
        ? deleteSelectionKey
        : "";
  const sessionFileActionCanExecute = Boolean(
    presentationModel.sessionFileActionResult &&
      props.providerActionSelection &&
      props.providerActionSelection.action === presentationModel.sessionFileActionResult.action &&
      sessionFileActionPreviewKey &&
      sessionFileActionPreviewKey === sessionFileActionCurrentKey,
  );
  const archiveStage = getProviderWorkflowStage(props.messages, {
    action: "archive_local",
    actionResult: presentationModel.sessionFileActionResult,
    actionSelection: props.providerActionSelection,
    currentSelectionKey: archiveSelectionKey,
  });
  const deleteStage = getProviderWorkflowStage(props.messages, {
    action: "delete_local",
    actionResult: presentationModel.sessionFileActionResult,
    actionSelection: props.providerActionSelection,
    currentSelectionKey: deleteSelectionKey,
  });
  const providerSupportsCleanup =
    props.providerView !== "all" &&
    Boolean(props.providers.find((provider) => provider.provider === props.providerView)?.capabilities.safe_cleanup);
  const csvColumnItems = useMemo(
    () => buildProviderCsvColumnItems(props.messages, state.csvColumns),
    [props.messages, state.csvColumns],
  );

  return {
    sourceFilterOptions,
    canOpenProviderById,
    canApplySlowOnly,
    effectiveSlowOnly,
    workbenchModel,
    sessionModel: {
      sortedProviderSessionRows,
      renderedProviderSessionRows,
      archivedSessionCount,
      filteredProviderFilePaths,
      staleProviderFilePaths,
      allFilteredProviderRowsSelected,
      allStaleProviderRowsSelected,
      enabledCsvColumns,
      providerSessionComputedIndex,
    },
    parserModel: {
      ...parserWorkspaceView,
      selectedSessionParseFailCount,
    },
    flowModel: providerFlowModel,
    presentationModel: {
      ...presentationModel,
      sessionFileActionCanExecute,
      archiveStage,
      deleteStage,
      providerSupportsCleanup,
      csvColumnItems,
      selectedSessionPreview,
    },
    constants: {
      csvPresets: {
        all: DEFAULT_CSV_COLUMNS,
        compact: COMPACT_CSV_COLUMNS,
        forensics: FORENSICS_CSV_COLUMNS,
      },
      csvColumnKeys: CSV_COLUMN_KEYS,
      chunkSize: CHUNK_SIZE,
    },
  };
}
