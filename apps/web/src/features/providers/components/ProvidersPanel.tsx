import { useEffect, useMemo } from "react";
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
import { CHUNK_SIZE } from "@/shared/types";
import {
  COMPACT_CSV_COLUMNS,
  CSV_COLUMN_KEYS,
  DEFAULT_CSV_COLUMNS,
  FORENSICS_CSV_COLUMNS,
  type CsvColumnKey,
} from "@/features/providers/lib/helpers";
import { DataSourcesList } from "@/features/providers/components/DataSourcesList";
import { ParserHealthTable } from "@/features/providers/parser/ParserHealthTable";
import { BackupHub } from "@/features/providers/components/BackupHub";
import { AiManagementMatrix } from "@/features/providers/components/AiManagementMatrix";
import { SessionTable } from "@/features/providers/components/SessionTable";
import { ProviderWorkspaceBar } from "@/features/providers/components/ProviderWorkspaceBar";
import { ProviderAdvancedShell } from "@/features/providers/components/ProviderAdvancedShell";
import { ProviderSideStack } from "@/features/providers/components/ProviderSideStack";
import {
  buildProviderSessionComputedIndex,
  buildSourceFilterOptions,
  filterProviderSessionRows,
  sortProviderSessionRows,
  type ProviderProbeFilter,
  type ProviderSessionSort,
  type ProviderSourceFilter,
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
import {
  providerActionSelectionKey,
} from "@/shared/lib/appState";
import {
  buildProviderPanelPresentationModel,
  getCapabilityLevelLabel,
  getProviderActionLabel,
  getProviderFlowStateLabel,
  getProviderStatusLabel,
  getProviderWorkflowStage,
} from "@/features/providers/model/providerPanelPresentationModel";
import { useProvidersPanelState } from "@/features/providers/hooks/useProvidersPanelState";
type ProviderFlowState = "done" | "pending" | "blocked";

const SESSION_PANEL_ACTIVE_MIN_HEIGHT = 640;

export function resolveSessionPanelHeight(options: {
  detailHeight?: number | null;
  stackHeight?: number | null;
  baselineHeight?: number | null;
  minHeight?: number;
}) {
  const { detailHeight = null, stackHeight = null, baselineHeight = null, minHeight = SESSION_PANEL_ACTIVE_MIN_HEIGHT } = options;
  const measuredHeight = Math.max(Number(stackHeight || 0), Number(detailHeight || 0));
  return Math.max(minHeight, Number(baselineHeight || 0), Math.ceil(measuredHeight));
}

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
    providerProbeFilterIntent,
    setProviderProbeFilterIntent,
  } = props;
  const sourceFilterOptions = useMemo(
    () => buildSourceFilterOptions(providerSessionRows),
    [providerSessionRows],
  );
  const {
    sessionFilter,
    setSessionFilter,
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
  } = useProvidersPanelState({
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
    runProviderHardDelete,
  });

  const statusLabel = (status: "active" | "detected" | "missing") =>
    getProviderStatusLabel(messages, status);
  const actionLabel = (action: "backup_local" | "archive_local" | "delete_local") =>
    getProviderActionLabel(messages, action);
  const flowStateLabel = (state: ProviderFlowState) => getProviderFlowStateLabel(messages, state);
  const capabilityLevelLabel = (level: string) => getCapabilityLevelLabel(level);
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
  }, [parserWorkspace.parserDetailProvider, resolvedParserDetailProvider]);
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
    const payload = exportData.payload;
    const blob = new Blob([payload], { type: "text/csv;charset=utf-8;" });
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
    setSessionFilter(next.sessionFilter);
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
    setSessionFilter(next.sessionFilter);
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
  ]);
  useEffect(() => {
    if (!canFocusPendingParserProvider(parserWorkspace.pendingParserFocusProvider, sortedParserReports)) return;
    scrollToParserProviderRow(parserWorkspace.pendingParserFocusProvider);
    dispatchParserWorkspace({ type: "clear_pending_parser_focus" });
  }, [parserWorkspace.pendingParserFocusProvider, sortedParserReports]);
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
  }, [selectedSessionPath]);
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

  const searchSlot = (
    <div className="sub-toolbar cleanup-toolbar">
      <div className="toolbar-search-shell is-input">
        <span className="toolbar-search-prompt" aria-hidden="true">
          &gt;
        </span>
        <input
          className="search-input toolbar-search-input"
          placeholder={messages.providers.sessionSearchPlaceholder}
          value={sessionFilter}
          onChange={(e) => setSessionFilter(e.target.value)}
        />
      </div>
      <div className="toolbar-search-shell is-select">
        <select
          className="filter-select toolbar-search-select"
          aria-label={messages.providers.probeFilterLabel}
          value={probeFilter}
          onChange={(e) => setProbeFilter(e.target.value as ProviderProbeFilter)}
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
        providerLabel={providerLabel}
        providerView={providerView}
        coreProviderTabs={coreProviderTabs}
        optionalProviderTabs={optionalProviderTabs}
        onSelectProviderView={setProviderView}
        summary={{
          sessions: selectedManagementCard ? selectedProviderSessionCount : providerSessionRows.length,
          sources: selectedManagementCard ? selectedProviderPresentSources : detectedDataSourceCount,
          transcriptReady: selectedManagementCard ? selectedProviderTranscriptReady : providerSessionSummary.parse_ok ?? 0,
          parseFail: selectedManagementCard ? selectedManagementCard.parseFail : parserSummary.parse_fail ?? 0,
          archived: archivedSessionCount,
          lastRefreshAt: providersLastRefreshAt,
        }}
        searchSlot={searchSlot}
      />

      <section className={`provider-ops-layout ${selectedSessionPath ? "is-session-active" : ""}`.trim()}>
        <SessionTable
          messages={messages}
          providerSessionSummary={{
            rows: providerSessionSummary.rows ?? providerSessionRows.length,
            parse_ok: providerSessionSummary.parse_ok ?? 0,
          }}
          providerSessionRows={providerSessionRows}
          providerSessionsLimit={providerSessionsLimit}
          providerRowsSampled={providerRowsSampled}
          showProviderSessionsZeroState={showProviderSessionsZeroState}
          selectedProviderHasPresentSource={selectedProviderHasPresentSource}
          onPromoteDepthRefresh={() => {
            setProviderDataDepth("deep");
            refreshProvidersData();
          }}
          sortedProviderSessionRows={sortedProviderSessionRows}
          renderedProviderSessionRows={renderedProviderSessionRows}
          canRunProviderAction={canRunProviderAction}
          busy={busy}
          onRunArchiveDryRun={() => runProviderAction("archive_local", true)}
          onRunArchive={() => runProviderAction("archive_local", false)}
          onRunDeleteDryRun={() =>
            runProviderAction("delete_local", true, {
              backup_before_delete: providerDeleteBackupEnabled,
            })
          }
          onRunDelete={() =>
            runProviderAction("delete_local", false, {
              backup_before_delete: providerDeleteBackupEnabled,
            })
          }
          onRequestHardDeleteConfirm={openHardDeleteConfirm}
          hardDeleteConfirmOpen={hardDeleteConfirmOpen}
          hardDeleteSkipConfirmChecked={hardDeleteSkipConfirmChecked}
          onToggleHardDeleteSkipConfirmChecked={setHardDeleteSkipConfirmChecked}
          onConfirmHardDelete={confirmHardDelete}
          onCancelHardDeleteConfirm={resetHardDeleteConfirmState}
          selectedSessionProvider={selectedSessionProvider}
          selectedSessionParseFailCount={selectedSessionParseFailCount}
          onJumpToParserProvider={jumpToParserProvider}
          sourceFilter={sourceFilter}
          onSourceFilterChange={(value) => setSourceFilter(value as ProviderSourceFilter)}
          sourceFilterOptions={sourceFilterOptions}
          sessionSort={sessionSort}
          onSessionSortChange={(value) => setSessionSort(value as ProviderSessionSort)}
          staleOnlyActive={allStaleProviderRowsSelected}
          canSelectStaleOnly={staleProviderFilePaths.length > 0}
          onToggleSelectStaleOnly={() =>
            setSelectedProviderFiles((prev) => {
              const next = { ...prev };
              if (allStaleProviderRowsSelected) {
                staleProviderFilePaths.forEach((filePath) => {
                  delete next[filePath];
                });
              } else {
                staleProviderFilePaths.forEach((filePath) => {
                  next[filePath] = true;
                });
              }
              return next;
            })
          }
          enabledCsvColumnsCount={enabledCsvColumns.length}
          totalCsvColumns={CSV_COLUMN_KEYS.length}
          onExportCsv={exportFilteredSessionsCsv}
          onSetCsvColumnsPreset={(preset) => {
            if (preset === "all") {
              setCsvColumns({ ...DEFAULT_CSV_COLUMNS });
              return;
            }
            if (preset === "compact") {
              setCsvColumns({ ...COMPACT_CSV_COLUMNS });
              return;
            }
            setCsvColumns({ ...FORENSICS_CSV_COLUMNS });
          }}
          csvColumnItems={csvColumnItems}
          onCsvColumnChange={(key, checked) =>
            setCsvColumns((prev) => ({ ...prev, [key as CsvColumnKey]: checked }))
          }
          showReadOnlyHint={!providerSupportsCleanup && providerView !== "all"}
          showProviderColumn={showProviderColumn}
          selectedSessionPath={selectedSessionPath}
          slowProviderSet={slowProviderSet}
          onSelectSessionPath={setSelectedSessionPath}
          onSetParserDetailProvider={(providerId) =>
            dispatchParserWorkspace({
              type: "set_parser_detail_provider",
              providerId,
            })
          }
          selectedProviderFiles={selectedProviderFiles}
          allProviderRowsSelected={allProviderRowsSelected}
          allFilteredProviderRowsSelected={allFilteredProviderRowsSelected}
          toggleSelectAllProviderRows={(checked) => toggleSelectAllProviderRows(checked, filteredProviderFilePaths)}
          onSelectedProviderFileChange={(filePath, checked) =>
            setSelectedProviderFiles((prev) => ({ ...prev, [filePath]: checked }))
          }
          providerSessionsLoading={providerSessionsLoading}
          onLoadMoreRows={() => setRenderLimit((prev) => prev + CHUNK_SIZE)}
          hasMoreRows={sortedProviderSessionRows.length > renderedProviderSessionRows.length}
          archiveStage={archiveStage}
          deleteStage={deleteStage}
          sessionFileActionResult={sessionFileActionResult}
          sessionFileActionCanExecute={sessionFileActionCanExecute}
          actionLabel={actionLabel}
          csvExportedRows={csvExportedRows}
          sectionRef={providerSessionsSectionRef}
          panelStyle={activeSessionPanelHeight ? { height: `${activeSessionPanelHeight}px` } : undefined}
        />

        <ProviderSideStack
          messages={messages}
          advancedOpen={advancedOpen}
          sectionRef={providerSideStackRef}
          sessionDetailSlot={sessionDetailSlot}
          backupHubSlot={
            <BackupHub
              messages={messages}
              selectedProviderFilePathsCount={selectedProviderFilePaths.length}
              latestBackupCount={latestBackupCount}
              latestExportCount={latestExportCount}
              providerDeleteBackupEnabled={providerDeleteBackupEnabled}
              onProviderDeleteBackupEnabledChange={(checked) => setProviderDeleteBackupEnabled(checked)}
              canRunProviderBackup={canRunProviderBackup}
              busy={busy}
              onRunBackupSelected={() => runProviderAction("backup_local", false)}
              onRunRecoveryBackupExport={() => runRecoveryBackupExport([])}
              latestBackupPath={latestBackupPath}
              backupFlowHint={backupFlowHint}
              deleteBackupModeLabel={deleteBackupModeLabel}
              selectedSessionPreview={selectedSessionPreview}
              backupActionResult={backupActionResult}
            />
          }
          parserSlot={
            <ParserHealthTable
              messages={messages}
              parserSummary={parserSummary}
              linkedSession={{
                provider: selectedSessionProvider,
                visibleInParser: selectedSessionProviderVisibleInParser,
              }}
              overview={{
                parserFailOnly: parserWorkspace.parserFailOnly,
                onParserFailOnlyChange: (value) =>
                  dispatchParserWorkspace({ type: "set_parser_fail_only", value }),
                filteredParserReportsCount: filteredParserReports.length,
                totalParserReportsCount: parserReports.length,
                parserSort: parserWorkspace.parserSort,
                onParserSortChange: (value) =>
                  dispatchParserWorkspace({
                    type: "set_parser_sort",
                    value: value as typeof parserWorkspace.parserSort,
                  }),
                sortedParserReports,
                parserLoading,
                slowProviderSet,
                statusLabel,
                onJumpToProviderSessions: jumpToProviderSessions,
              }}
              detail={{
                parserReportsWithErrors,
                parserDetailProvider: parserWorkspace.parserDetailProvider,
                onParserDetailProviderChange: (providerId) =>
                  dispatchParserWorkspace({
                    type: "set_parser_detail_provider",
                    providerId,
                  }),
                parserJumpStatus: parserWorkspace.parserJumpStatus,
                parserDetailReport,
                onJumpToSessionFromParserError: jumpToSessionFromParserError,
              }}
              detailsRef={parserSectionRef}
            />
          }
        />
      </section>

      <div className="provider-routing-tools-row">
        <ProviderAdvancedShell
          messages={messages}
          advancedOpen={advancedOpen}
          onAdvancedOpenChange={setAdvancedOpen}
          onRefreshProvidersData={refreshProvidersData}
          providersRefreshing={providersRefreshing}
          providersLastRefreshAt={providersLastRefreshAt}
          providerDataDepth={providerDataDepth}
          onProviderDataDepthChange={setProviderDataDepth}
          slowProviderThresholdMs={slowProviderThresholdMs}
          slowThresholdOptions={slowThresholdOptions}
          onSlowProviderThresholdChange={setSlowProviderThresholdMs}
          canReturnHotspotScope={canReturnHotspotScope}
          hotspotOriginLabel={hotspotOriginLabel}
          onReturnHotspotScope={() => {
            if (!hotspotScopeOrigin) return;
            setProviderView(hotspotScopeOrigin);
            setHotspotScopeOrigin(null);
          }}
          providerFetchMetrics={providerFetchMetrics}
          slowProviderIdsCount={slowProviderIds.length}
          providerTabCount={providerTabCount}
          slowProviderSummary={slowProviderSummary}
          hasSlowProviderFetch={hasSlowProviderFetch}
          matrixSlot={
            <AiManagementMatrix
              messages={messages}
              providerSummary={providerSummary}
              providers={providers}
              providerMatrixLoading={providerMatrixLoading}
              providerScanMsById={new Map(
                providerTabs
                  .filter((tab) => tab.id !== "all")
                  .map((tab) => [tab.id, tab.scan_ms ?? null]),
              )}
              slowProviderSet={slowProviderSet}
              statusLabel={statusLabel}
              capabilityLevelLabel={capabilityLevelLabel}
              onJumpToProviderSessions={jumpToProviderSessions}
              slowHotspotCards={slowHotspotCards}
              providerTabCount={providerTabCount}
              slowFocusActive={slowFocusActive}
              onFocusSlowProviders={focusSlowProviders}
              onClearSlowFocus={clearSlowFocus}
              onJumpToParserProvider={jumpToParserProvider}
              visibleFlowCards={visibleFlowCards}
              flowStateLabel={flowStateLabel}
              dataSourcesSlot={
                <DataSourcesList
                  copy={{
                    disclosure: messages.providers.dataSourcesDisclosure,
                    detected: messages.providers.dataSourcesDetected,
                    files: messages.providers.dataSourcesFiles,
                    dirs: messages.providers.dataSourcesDirs,
                    size: messages.providers.dataSourcesSize,
                    updated: messages.providers.dataSourcesUpdated,
                    openSessions: messages.providers.openSessions,
                    ok: messages.common.ok,
                    fail: messages.common.fail,
                  }}
                  dataSourcesLoading={dataSourcesLoading}
                  dataSourceRows={dataSourceRows}
                  detectedDataSourceCount={detectedDataSourceCount}
                  canOpenProviderById={canOpenProviderById}
                  onOpenProviderSessions={jumpToProviderSessions}
                />
              }
            />
          }
        />
        {diagnosticsSlot ? (
          <div className="provider-routing-tools-main provider-routing-diagnostics-block">
            {diagnosticsSlot}
          </div>
        ) : null}
      </div>
    </>
  );
}
