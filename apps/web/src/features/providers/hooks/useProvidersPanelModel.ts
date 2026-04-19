import { useEffect, useMemo } from "react";
import type { ProviderView } from "@/shared/types";
import { CHUNK_SIZE } from "@/shared/types";
import {
  COMPACT_CSV_COLUMNS,
  CSV_COLUMN_KEYS,
  DEFAULT_CSV_COLUMNS,
  FORENSICS_CSV_COLUMNS,
  type CsvColumnKey,
} from "@/features/providers/lib/helpers";
import {
  buildProviderSessionComputedIndex,
  buildSourceFilterOptions,
  filterProviderSessionRows,
  sortProviderSessionRows,
} from "@/features/providers/model/sessionTableModel";
import { buildProviderFlowModel } from "@/features/providers/model/providerFlowModel";
import {
  buildHotspotOriginLabel,
  buildJumpToParserProviderState,
  buildJumpToProviderSessionsState,
  buildJumpToSessionFromParserErrorState,
  canFocusPendingParserProvider,
  resolvePendingSessionJump,
} from "@/features/providers/model/providerJumpModel";
import { buildParserWorkspaceView } from "@/features/providers/parser/parserWorkspaceModel";
import { buildProviderWorkbenchModel } from "@/features/providers/model/providerWorkbenchModel";
import {
  buildProviderCsvColumnItems,
  buildProviderCsvExportData,
} from "@/features/providers/model/providerCsvModel";
import { providerActionSelectionKey } from "@/shared/lib/appState";
import {
  buildProviderPanelPresentationModel,
  getProviderWorkflowStage,
} from "@/features/providers/model/providerPanelPresentationModel";
import type { useProvidersPanelState } from "@/features/providers/hooks/useProvidersPanelState";
import type { ProvidersPanelProps } from "@/features/providers/components/ProvidersPanel";

const SESSION_PANEL_ACTIVE_MIN_HEIGHT = 640;

export function resolveSessionPanelHeight(options: {
  detailHeight?: number | null;
  stackHeight?: number | null;
  baselineHeight?: number | null;
  minHeight?: number;
}) {
  const {
    detailHeight = null,
    stackHeight = null,
    baselineHeight = null,
    minHeight = SESSION_PANEL_ACTIVE_MIN_HEIGHT,
  } = options;
  const measuredHeight = Math.max(Number(stackHeight || 0), Number(detailHeight || 0));
  return Math.max(minHeight, Number(baselineHeight || 0), Math.ceil(measuredHeight));
}

export function useProvidersPanelModel(options: {
  props: ProvidersPanelProps;
  state: ReturnType<typeof useProvidersPanelState>;
}) {
  const { props, state } = options;
  const {
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
    dataSourceRows,
    dataSourcesLoading,
    providerSessionsLimit,
    providerRowsSampled,
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
  } = props;
  const {
    deferredSessionFilter,
    sessionSort,
    setSessionSort,
    probeFilter,
    setProbeFilter,
    sourceFilter,
    setSourceFilter,
    renderLimit,
    setRenderLimit,
    csvExportedRows,
    setCsvExportedRows,
    parserWorkspace,
    dispatchParserWorkspace,
    slowOnly,
    setSlowOnly,
    hotspotScopeOrigin,
    setHotspotScopeOrigin,
    csvColumns,
    setCsvColumns,
    providerSessionsSectionRef,
    providerSideStackRef,
    activeSessionPanelBaselineRef,
    parserSectionRef,
    advancedOpen,
    setAdvancedOpen,
    activeSessionPanelHeight,
    setActiveSessionPanelHeight,
    hardDeleteConfirmOpen,
    hardDeleteSkipConfirmChecked,
    setHardDeleteSkipConfirmChecked,
    resetHardDeleteConfirmState,
    openHardDeleteConfirm,
    confirmHardDelete,
  } = state;

  const sourceFilterOptions = useMemo(
    () => buildSourceFilterOptions(providerSessionRows),
    [providerSessionRows],
  );
  const canOpenProviderById = (providerId: ProviderView | null): providerId is ProviderView =>
    Boolean(providerId && providerTabs.some((tab) => tab.id === providerId));
  const canApplySlowOnly = providerView === "all";
  const effectiveSlowOnly = canApplySlowOnly && slowOnly;
  const workbenchModel = useMemo(
    () =>
      buildProviderWorkbenchModel({
        providerTabs,
        slowProviderIds,
        slowProviderThresholdMs,
        providerView,
        dataSourceRows,
        providerSessionsLoading,
        providerSessionRows,
        providerFetchMetrics,
      }),
    [
      providerTabs,
      slowProviderIds,
      slowProviderThresholdMs,
      providerView,
      dataSourceRows,
      providerSessionsLoading,
      providerSessionRows,
      providerFetchMetrics,
    ],
  );
  const {
    slowProviderSet,
    providerTabById,
    coreProviderTabs,
    optionalProviderTabs,
    slowThresholdOptions,
    slowProviderSummary,
    providerTabCount,
    detectedDataSourceCount,
    selectedProviderHasPresentSource,
    showProviderSessionsZeroState,
    hasSlowProviderFetch,
  } = workbenchModel;
  const providerSessionComputedIndex = useMemo(
    () => buildProviderSessionComputedIndex(providerSessionRows),
    [providerSessionRows],
  );
  const providerTitleCollator = useMemo(
    () => new Intl.Collator(undefined, { sensitivity: "base" }),
    [],
  );
  const filteredProviderSessionRows = useMemo(
    () =>
      filterProviderSessionRows(providerSessionRows, providerSessionComputedIndex, {
        query: deferredSessionFilter,
        sourceFilter,
        probeFilter,
        effectiveSlowOnly,
        slowProviderSet,
      }),
    [
      providerSessionRows,
      providerSessionComputedIndex,
      deferredSessionFilter,
      probeFilter,
      sourceFilter,
      effectiveSlowOnly,
      slowProviderSet,
    ],
  );
  const sortedProviderSessionRows = useMemo(
    () =>
      sortProviderSessionRows(
        filteredProviderSessionRows,
        providerSessionComputedIndex,
        providerTitleCollator,
        sessionSort,
      ),
    [filteredProviderSessionRows, providerSessionComputedIndex, providerTitleCollator, sessionSort],
  );
  const renderedProviderSessionRows = useMemo(
    () => sortedProviderSessionRows.slice(0, renderLimit),
    [sortedProviderSessionRows, renderLimit],
  );
  const archivedSessionCount = useMemo(
    () => providerSessionRows.filter((row) => row.source === "archived_sessions").length,
    [providerSessionRows],
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
    sortedProviderSessionRows.every((row) => Boolean(selectedProviderFiles[row.file_path]));
  const allStaleProviderRowsSelected =
    staleProviderFilePaths.length > 0 &&
    staleProviderFilePaths.every((filePath) => Boolean(selectedProviderFiles[filePath]));
  const enabledCsvColumns = useMemo(
    () => CSV_COLUMN_KEYS.filter((key) => Boolean(csvColumns[key])),
    [csvColumns],
  );
  const parserWorkspaceView = useMemo(
    () =>
      buildParserWorkspaceView({
        state: parserWorkspace,
        parserReports,
        providerSessionRows,
        selectedSessionPath,
        effectiveSlowOnly,
        slowProviderSet,
      }),
    [
      parserWorkspace,
      parserReports,
      providerSessionRows,
      selectedSessionPath,
      effectiveSlowOnly,
      slowProviderSet,
    ],
  );
  const {
    filteredParserReports,
    sortedParserReports,
    parserReportsWithErrors,
    resolvedParserDetailProvider,
    parserDetailReport,
    selectedSessionProvider,
    selectedSessionProviderVisibleInParser,
  } = parserWorkspaceView;
  useEffect(() => {
    if (parserWorkspace.parserDetailProvider !== resolvedParserDetailProvider) {
      dispatchParserWorkspace({
        type: "sync_resolved_parser_detail_provider",
        providerId: resolvedParserDetailProvider,
      });
    }
  }, [parserWorkspace.parserDetailProvider, resolvedParserDetailProvider, dispatchParserWorkspace]);

  const providerFlowModel = useMemo(
    () =>
      buildProviderFlowModel({
        providers,
        providerTabs,
        parserReports,
        allParserReports,
        allProviderSessionRows,
        dataSourceRows,
        slowProviderIds,
        providerView,
        providerMessages: {
          flowNextCollect: messages.providers.flowNextCollect,
          flowNextCollectSessions: messages.providers.flowNextCollectSessions,
          flowNextParse: messages.providers.flowNextParse,
          flowNextReadonly: messages.providers.flowNextReadonly,
          flowNextExecute: messages.providers.flowNextExecute,
          flowNextDryRun: messages.providers.flowNextDryRun,
          flowStageDetect: messages.providers.flowStageDetect,
          flowStageSessions: messages.providers.flowStageSessions,
          flowStageParser: messages.providers.flowStageParser,
          flowStageSafeCleanup: messages.providers.flowStageSafeCleanup,
          flowStageApply: messages.providers.flowStageApply,
        },
      }),
    [
      providers,
      providerTabs,
      parserReports,
      allParserReports,
      allProviderSessionRows,
      dataSourceRows,
      slowProviderIds,
      providerView,
      messages.providers,
    ],
  );
  const {
    parseFailByProvider,
    slowHotspotCards,
    selectedManagementCard,
    selectedProviderTranscriptReady,
    selectedProviderPresentSources,
    selectedProviderSessionCount,
    visibleFlowCards,
  } = providerFlowModel;
  const selectedSessionParseFailCount = selectedSessionProvider
    ? parseFailByProvider[selectedSessionProvider]
    : undefined;
  const selectedSessionPreview = useMemo(
    () => providerSessionRows.find((row) => row.file_path === selectedSessionPath) ?? null,
    [providerSessionRows, selectedSessionPath],
  );
  const presentationModel = useMemo(
    () =>
      buildProviderPanelPresentationModel({
        messages,
        providerView,
        selectedProviderLabel,
        providerActionData,
        recoveryBackupExportData,
        selectedProviderFilePathsCount: selectedProviderFilePaths.length,
        providerActionProvider,
        providerDeleteBackupEnabled,
        hotspotScopeOrigin,
        slowOnly,
        canApplySlowOnly,
      }),
    [
      messages,
      providerView,
      selectedProviderLabel,
      providerActionData,
      recoveryBackupExportData,
      selectedProviderFilePaths.length,
      providerActionProvider,
      providerDeleteBackupEnabled,
      hotspotScopeOrigin,
      slowOnly,
      canApplySlowOnly,
    ],
  );
  const {
    providerLabel,
    backupActionResult,
    sessionFileActionResult,
    latestBackupCount,
    latestBackupPath,
    latestExportCount,
    backupFlowHint,
    deleteBackupModeLabel,
    canRunProviderBackup,
    canReturnHotspotScope,
    slowFocusActive,
    showProviderColumn,
  } = presentationModel;
  const sessionFileActionPreviewKey =
    providerActionSelection && sessionFileActionResult
      ? providerActionSelectionKey(
          providerActionSelection.provider,
          providerActionSelection.action,
          providerActionSelection.file_paths,
          { backup_before_delete: providerActionSelection.backup_before_delete },
        )
      : "";
  const archiveSelectionKey =
    providerActionProvider && selectedProviderFilePaths.length > 0
      ? providerActionSelectionKey(providerActionProvider, "archive_local", selectedProviderFilePaths)
      : "";
  const deleteSelectionKey =
    providerActionProvider && selectedProviderFilePaths.length > 0
      ? providerActionSelectionKey(providerActionProvider, "delete_local", selectedProviderFilePaths, {
          backup_before_delete: providerDeleteBackupEnabled,
        })
      : "";
  const sessionFileActionCurrentKey =
    sessionFileActionResult?.action === "archive_local"
      ? archiveSelectionKey
      : sessionFileActionResult?.action === "delete_local"
        ? deleteSelectionKey
        : "";
  const sessionFileActionCanExecute = Boolean(
    sessionFileActionResult &&
      providerActionSelection &&
      providerActionSelection.action === sessionFileActionResult.action &&
      sessionFileActionPreviewKey &&
      sessionFileActionPreviewKey === sessionFileActionCurrentKey,
  );
  const archiveStage = getProviderWorkflowStage(messages, {
    action: "archive_local",
    actionResult: sessionFileActionResult,
    actionSelection: providerActionSelection,
    currentSelectionKey: archiveSelectionKey,
  });
  const deleteStage = getProviderWorkflowStage(messages, {
    action: "delete_local",
    actionResult: sessionFileActionResult,
    actionSelection: providerActionSelection,
    currentSelectionKey: deleteSelectionKey,
  });
  const providerSupportsCleanup =
    providerView !== "all" &&
    Boolean(providers.find((provider) => provider.provider === providerView)?.capabilities.safe_cleanup);
  const csvColumnItems = useMemo(
    () => buildProviderCsvColumnItems(messages, csvColumns),
    [messages, csvColumns],
  );

  const exportFilteredSessionsCsv = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const exportData = buildProviderCsvExportData({
      rows: sortedProviderSessionRows,
      enabledColumns: enabledCsvColumns,
      providerView,
      stamp,
    });
    const blob = new Blob([exportData.payload], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportData.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    setCsvExportedRows(exportData.exportedRows);
  };

  const jumpToProviderSessions = (
    providerId: string,
    parseFail = 0,
    options?: { fromHotspot?: boolean },
  ) => {
    const next = buildJumpToProviderSessionsState({
      currentProviderView: providerView,
      providerId,
      parseFail,
      fromHotspot: options?.fromHotspot,
    });
    setHotspotScopeOrigin(next.hotspotScopeOrigin);
    setProviderView(next.providerView);
    setProbeFilter(next.probeFilter);
    dispatchParserWorkspace({
      type: "set_parser_detail_provider",
      providerId: next.parserDetailProvider,
    });
    state.setSessionFilter(next.sessionFilter);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        providerSessionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };

  const scrollToSessionRow = (filePath: string) => {
    if (typeof window === "undefined") return;
    const key = encodeURIComponent(filePath);
    window.setTimeout(() => {
      const row = document.querySelector(`tr[data-file-key="${key}"]`);
      if (row instanceof HTMLElement) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      providerSessionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const scrollToParserProviderRow = (providerId: string) => {
    if (typeof window === "undefined") return;
    const key = encodeURIComponent(providerId);
    window.setTimeout(() => {
      const row = document.querySelector(`tr[data-parser-provider-key="${key}"]`);
      if (row instanceof HTMLElement) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.focus({ preventScroll: true });
        return;
      }
      parserSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const jumpToParserProvider = (providerId: string) => {
    const next = buildJumpToParserProviderState(providerId);
    if (!next) return;
    setAdvancedOpen(next.advancedOpen);
    dispatchParserWorkspace({
      type: "jump_to_parser_provider",
      providerId: next.parserDetailProvider,
    });
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        parserSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };

  const jumpToSessionFromParserError = (providerId: string, sessionId: string) => {
    const next = buildJumpToSessionFromParserErrorState({ providerId, sessionId });
    setHotspotScopeOrigin(next.hotspotScopeOrigin);
    setProviderView(next.providerView);
    setProbeFilter(next.probeFilter);
    state.setSessionFilter(next.sessionFilter);
    dispatchParserWorkspace({
      type: "jump_to_session_from_parser_error",
      providerId: next.parserDetailProvider,
      sessionId: next.pendingSessionJump.sessionId,
    });
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        providerSessionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };

  useEffect(() => {
    const resolved = resolvePendingSessionJump({
      pendingSessionJump: parserWorkspace.pendingSessionJump,
      providerView,
      providerSessionsLoading,
      providerSessionRows,
    });
    if (!resolved) return;
    if (resolved.selectedSessionPath) {
      setSelectedSessionPath(resolved.selectedSessionPath);
      dispatchParserWorkspace({
        type: "resolve_pending_session_jump",
        parserJumpStatus: resolved.parserJumpStatus,
      });
      scrollToSessionRow(resolved.selectedSessionPath);
    } else {
      dispatchParserWorkspace({
        type: "resolve_pending_session_jump",
        parserJumpStatus: resolved.parserJumpStatus,
      });
    }
  }, [
    parserWorkspace.pendingSessionJump,
    providerView,
    providerSessionsLoading,
    providerSessionRows,
    setSelectedSessionPath,
    dispatchParserWorkspace,
  ]);

  useEffect(() => {
    if (!canFocusPendingParserProvider(parserWorkspace.pendingParserFocusProvider, sortedParserReports)) return;
    scrollToParserProviderRow(parserWorkspace.pendingParserFocusProvider);
    dispatchParserWorkspace({ type: "clear_pending_parser_focus" });
  }, [parserWorkspace.pendingParserFocusProvider, sortedParserReports, dispatchParserWorkspace]);

  useEffect(() => {
    if (!selectedSessionPath || !providerSideStackRef.current) {
      setActiveSessionPanelHeight(null);
      activeSessionPanelBaselineRef.current = null;
      return;
    }

    const stackTarget = providerSideStackRef.current;
    const detailTarget = stackTarget.querySelector<HTMLElement>(".session-detail-panel");
    let frameId = 0;

    const syncHeight = () => {
      const nextHeight = resolveSessionPanelHeight({
        stackHeight: stackTarget.getBoundingClientRect().height,
        detailHeight: detailTarget?.getBoundingClientRect().height ?? null,
        baselineHeight: activeSessionPanelBaselineRef.current,
      });
      activeSessionPanelBaselineRef.current = Math.max(activeSessionPanelBaselineRef.current ?? 0, nextHeight);
      const resolvedHeight = Math.max(nextHeight, activeSessionPanelBaselineRef.current);
      setActiveSessionPanelHeight((current) => (current === resolvedHeight ? current : resolvedHeight));
    };

    syncHeight();

    const observer = new ResizeObserver(() => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        syncHeight();
      });
    });

    observer.observe(stackTarget);
    if (detailTarget && detailTarget !== stackTarget) {
      observer.observe(detailTarget);
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [selectedSessionPath, providerSideStackRef, setActiveSessionPanelHeight, activeSessionPanelBaselineRef]);

  const hotspotOriginLabel = useMemo(
    () =>
      buildHotspotOriginLabel({
        hotspotScopeOrigin,
        providerTabById,
        allAiLabel: messages.common.allAi,
      }),
    [hotspotScopeOrigin, providerTabById, messages.common.allAi],
  );

  const focusSlowProviders = () => {
    setProviderView("all");
    setSlowOnly(true);
    setHotspotScopeOrigin(null);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        providerSessionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };

  const clearSlowFocus = () => {
    setSlowOnly(false);
  };

  return {
    sourceFilterOptions,
    canOpenProviderById,
    canApplySlowOnly,
    effectiveSlowOnly,
    workbenchModel: {
      slowProviderSet,
      providerTabById,
      coreProviderTabs,
      optionalProviderTabs,
      slowThresholdOptions,
      slowProviderSummary,
      providerTabCount,
      detectedDataSourceCount,
      selectedProviderHasPresentSource,
      showProviderSessionsZeroState,
      hasSlowProviderFetch,
    },
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
      filteredParserReports,
      sortedParserReports,
      parserReportsWithErrors,
      parserDetailReport,
      selectedSessionProvider,
      selectedSessionProviderVisibleInParser,
      selectedSessionParseFailCount,
    },
    flowModel: {
      slowHotspotCards,
      selectedManagementCard,
      selectedProviderTranscriptReady,
      selectedProviderPresentSources,
      selectedProviderSessionCount,
      visibleFlowCards,
    },
    presentationModel: {
      providerLabel,
      backupActionResult,
      sessionFileActionResult,
      latestBackupCount,
      latestBackupPath,
      latestExportCount,
      backupFlowHint,
      deleteBackupModeLabel,
      canRunProviderBackup,
      canReturnHotspotScope,
      slowFocusActive,
      showProviderColumn,
      sessionFileActionCanExecute,
      archiveStage,
      deleteStage,
      providerSupportsCleanup,
      csvColumnItems,
      hotspotOriginLabel,
      selectedSessionPreview,
    },
    actions: {
      exportFilteredSessionsCsv,
      jumpToProviderSessions,
      jumpToParserProvider,
      jumpToSessionFromParserError,
      focusSlowProviders,
      clearSlowFocus,
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
