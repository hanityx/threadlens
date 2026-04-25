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
  const scopedProviderSessionRows = useMemo(
    () => {
      if (state.showBackupRows) {
        return props.providerSessionRows.filter((row) => row.source === "cleanup_backups");
      }
      if (state.showArchivedRows) {
        return props.providerSessionRows.filter((row) => row.source === "archived_sessions");
      }
      return props.providerSessionRows.filter(
        (row) => row.source !== "cleanup_backups" && row.source !== "archived_sessions",
      );
    },
    [props.providerSessionRows, state.showArchivedRows, state.showBackupRows],
  );
  const hasBackupRows = useMemo(
    () => props.providerSessionRows.some((row) => row.source === "cleanup_backups"),
    [props.providerSessionRows],
  );
  const hasArchivedRows = useMemo(
    () => props.providerSessionRows.some((row) => row.source === "archived_sessions"),
    [props.providerSessionRows],
  );
  const sourceFilterOptions = useMemo(
    () => buildSourceFilterOptions(scopedProviderSessionRows),
    [scopedProviderSessionRows],
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
      filterProviderSessionRows(scopedProviderSessionRows, providerSessionComputedIndex, {
        query: state.deferredSessionFilter,
        sourceFilter: state.sourceFilter,
        probeFilter: state.probeFilter,
        effectiveSlowOnly,
        slowProviderSet: workbenchModel.slowProviderSet,
      }),
    [
      scopedProviderSessionRows,
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
  const selectedBackupSourceRows = useMemo(() => {
    const selectedRows = props.providerSessionRows.filter((row) =>
      Boolean(props.selectedProviderFiles[row.file_path]),
    );
    return selectedRows.filter((row) => row.source === "cleanup_backups");
  }, [props.providerSessionRows, props.selectedProviderFiles]);
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
  const selectedProviderIds = useMemo(
    () =>
      Array.from(
        new Set(
          props.providerSessionRows
            .filter(
              (row) =>
                Boolean(props.selectedProviderFiles[row.file_path]) &&
                row.source !== "cleanup_backups" &&
                row.source !== "archived_sessions",
            )
            .map((row) => row.provider)
            .filter(Boolean),
        ),
      ),
    [props.providerSessionRows, props.selectedProviderFiles],
  );
  const backupEligibleFilePaths = actionEligibleFilePaths;
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
  const presentationModel = useMemo(
    () =>
      buildProviderPanelPresentationModel({
        messages: props.messages,
        providerView: props.providerView,
        selectedProviderLabel: props.selectedProviderLabel,
        providerActionData: props.providerActionData,
        recoveryData: props.recoveryData,
        recoveryBackupExportData: props.recoveryBackupExportData,
        backupRoot: props.backupRoot,
        exportRoot: props.exportRoot,
        latestExportArchivePath: props.latestExportArchivePath,
        selectedProviderFilePathsCount: props.selectedProviderFilePaths.length,
        selectedBackupEligibleFilePathsCount: backupEligibleFilePaths.length,
        selectedBackupSourceCount: selectedBackupSourceRows.length,
        selectedProviderIdsCount: selectedProviderIds.length,
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
      props.recoveryData,
      props.recoveryBackupExportData,
      props.backupRoot,
      props.exportRoot,
      props.latestExportArchivePath,
      props.selectedProviderFilePaths.length,
      backupEligibleFilePaths.length,
      selectedBackupSourceRows.length,
      selectedProviderIds.length,
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
        {
          backup_before_delete: props.providerActionSelection.backup_before_delete,
          backup_root: props.providerActionSelection.backup_root,
        },
      )
      : "";
  const archiveAction = state.showArchivedRows ? "unarchive_local" : "archive_local";
  const archiveActionEligibleFilePaths = state.showArchivedRows
    ? unarchiveEligibleFilePaths
    : actionEligibleFilePaths;
  const archiveSelectionKey =
    props.providerActionProvider && archiveActionEligibleFilePaths.length > 0
      ? providerActionSelectionKey(
          props.providerActionProvider,
          archiveAction,
          archiveActionEligibleFilePaths,
          { backup_root: props.backupRoot },
        )
      : "";
  const deleteSelectionKey =
    props.providerActionProvider && actionEligibleFilePaths.length > 0
      ? providerActionSelectionKey(props.providerActionProvider, "delete_local", actionEligibleFilePaths, {
          backup_before_delete: props.providerDeleteBackupEnabled,
          backup_root: props.backupRoot,
        })
      : "";
  const sessionFileActionCurrentKey =
    presentationModel.sessionFileActionResult?.action === "archive_local"
      ? archiveSelectionKey
      : presentationModel.sessionFileActionResult?.action === "unarchive_local"
        ? archiveSelectionKey
      : presentationModel.sessionFileActionResult?.action === "delete_local"
        ? deleteSelectionKey
        : "";
  const sessionFileActionCanExecute = Boolean(
    presentationModel.sessionFileActionResult &&
      props.providerActionSelection &&
      props.providerActionSelection.action === presentationModel.sessionFileActionResult.action &&
      (presentationModel.sessionFileActionResult.dry_run ||
        String(presentationModel.sessionFileActionResult.confirm_token_expected ?? "").trim()) &&
      presentationModel.sessionFileActionResult.applied_count === 0 &&
      sessionFileActionPreviewKey &&
      sessionFileActionPreviewKey === sessionFileActionCurrentKey,
  );
  const sessionFileActionResult =
    sessionFileActionPreviewKey &&
    sessionFileActionPreviewKey === sessionFileActionCurrentKey
      ? presentationModel.sessionFileActionResult
      : null;
  const archiveStage = getProviderWorkflowStage(props.messages, {
    action: archiveAction,
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
      scopedProviderSessionRows,
      hasBackupRows,
      hasArchivedRows,
      sortedProviderSessionRows,
      renderedProviderSessionRows,
      archivedSessionCount,
      filteredProviderFilePaths,
      actionEligibleFilePaths,
      unarchiveEligibleFilePaths,
      backupDeleteEligibleFilePaths,
      backupEligibleFilePaths,
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
      sessionFileActionResult,
      sessionFileActionCanExecute,
      archiveStage,
      deleteStage,
      providerSupportsCleanup,
      csvColumnItems,
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
