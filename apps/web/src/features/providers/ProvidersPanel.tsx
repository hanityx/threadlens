import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Messages } from "../../i18n";
import type {
  ProviderMatrixProvider,
  ProviderDataDepth,
  ProviderView,
  DataSourceInventoryRow,
  ProviderActionSelection,
  ProviderSessionRow,
  ProviderSessionActionResult,
  RecoveryBackupExportResponse,
} from "../../types";
import {
  COMPACT_CSV_COLUMNS,
  CSV_COLUMN_KEYS,
  DEFAULT_CSV_COLUMNS,
  FORENSICS_CSV_COLUMNS,
  clearSlowOnlyPref,
  readCsvColumnPrefs,
  writeCsvColumnPrefs,
  type CsvColumnKey,
} from "./helpers";
import { DataSourcesList } from "./DataSourcesList";
import { ParserHealthTable } from "./ParserHealthTable";
import { BackupHub } from "./BackupHub";
import { AiManagementMatrix } from "./AiManagementMatrix";
import { SessionTable } from "./SessionTable";
import { ProviderWorkspaceBar } from "./ProviderWorkspaceBar";
import { ProviderAdvancedShell } from "./ProviderAdvancedShell";
import { ProviderSideStack } from "./ProviderSideStack";
import {
  buildProviderSessionComputedIndex,
  buildSourceFilterOptions,
  filterProviderSessionRows,
  sortProviderSessionRows,
  type ProviderProbeFilter,
  type ProviderSessionSort,
  type ProviderSourceFilter,
} from "./sessionTableModel";
import { buildProviderFlowModel } from "./providerFlowModel";
import {
  buildParserDetailState,
  filterParserReports,
  sortParserReports,
  type ParserSort,
} from "./parserModel";
import {
  buildHotspotOriginLabel,
  buildJumpToParserProviderState,
  buildJumpToProviderSessionsState,
  buildJumpToSessionFromParserErrorState,
  canFocusPendingParserProvider,
  resolvePendingSessionJump,
  type ParserJumpStatus,
  type PendingSessionJump,
} from "./providerJumpModel";
import { buildProviderWorkbenchModel } from "./providerWorkbenchModel";
import {
  buildProviderCsvColumnItems,
  buildProviderCsvExportData,
} from "./providerCsvModel";
import { providerActionSelectionKey } from "../../hooks/appDataUtils";
import {
  buildProviderPanelPresentationModel,
  getCapabilityLevelLabel,
  getProviderActionLabel,
  getProviderFlowStateLabel,
  getProviderStatusLabel,
} from "./providerPanelPresentationModel";
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
  selectedProviderLabel: string;
  selectedProviderFilePaths: string[];
  canRunProviderAction: boolean;
  busy: boolean;
  providerDeleteBackupEnabled: boolean;
  setProviderDeleteBackupEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  runProviderAction: (
    action: "backup_local" | "archive_local" | "delete_local",
    dryRun: boolean,
    options?: { backup_before_delete?: boolean },
  ) => void;
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
  } = props;
  const [sessionFilter, setSessionFilter] = useState("");
  const deferredSessionFilter = useDeferredValue(sessionFilter);
  const [sessionSort, setSessionSort] = useState<ProviderSessionSort>("mtime_desc");
  const [probeFilter, setProbeFilter] = useState<ProviderProbeFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<ProviderSourceFilter>("all");
  const [renderLimit, setRenderLimit] = useState(120);
  const [csvExportedRows, setCsvExportedRows] = useState<number | null>(null);
  const [parserDetailProvider, setParserDetailProvider] = useState<string>("");
  const [parserFailOnly, setParserFailOnly] = useState(false);
  const [parserSort, setParserSort] = useState<ParserSort>("fail_desc");
  const [slowOnly, setSlowOnly] = useState(false);
  const [hotspotScopeOrigin, setHotspotScopeOrigin] = useState<ProviderView | null>(null);
  const [csvColumns, setCsvColumns] = useState<Record<CsvColumnKey, boolean>>(readCsvColumnPrefs);
  const providerSessionsSectionRef = useRef<HTMLElement | null>(null);
  const parserSectionRef = useRef<HTMLDetailsElement | null>(null);
  const [pendingSessionJump, setPendingSessionJump] = useState<PendingSessionJump | null>(null);
  const [pendingParserFocusProvider, setPendingParserFocusProvider] = useState<string>("");
  const [parserJumpStatus, setParserJumpStatus] = useState<ParserJumpStatus>("idle");
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
  const sourceFilterOptions = useMemo(
    () => buildSourceFilterOptions(providerSessionRows),
    [providerSessionRows],
  );
  useEffect(() => {
    if (sourceFilter === "all") return;
    const exists = sourceFilterOptions.some((item) => item.source === sourceFilter);
    if (!exists) setSourceFilter("all");
  }, [sourceFilter, sourceFilterOptions]);
  useEffect(() => {
    clearSlowOnlyPref();
  }, []);
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
  useEffect(() => {
    setRenderLimit(120);
  }, [providerView, sessionFilter, sessionSort, probeFilter, sourceFilter]);
  const filteredProviderFilePaths = useMemo(
    () => sortedProviderSessionRows.map((row) => row.file_path),
    [sortedProviderSessionRows],
  );
  const allFilteredProviderRowsSelected =
    sortedProviderSessionRows.length > 0 &&
    sortedProviderSessionRows.every((row) => Boolean(selectedProviderFiles[row.file_path]));
  const enabledCsvColumns = useMemo(
    () => CSV_COLUMN_KEYS.filter((key) => Boolean(csvColumns[key])),
    [csvColumns],
  );
  useEffect(() => {
    writeCsvColumnPrefs(csvColumns);
  }, [csvColumns]);
  const filteredParserReports = useMemo(
    () =>
      filterParserReports(parserReports, {
        parserFailOnly,
        effectiveSlowOnly,
        slowProviderSet,
      }),
    [parserReports, parserFailOnly, effectiveSlowOnly, slowProviderSet],
  );
  const sortedParserReports = useMemo(
    () => sortParserReports(filteredParserReports, parserSort),
    [filteredParserReports, parserSort],
  );
  const parserDetailState = useMemo(
    () =>
      buildParserDetailState({
        sortedParserReports,
        parserDetailProvider,
        providerSessionRows,
        selectedSessionPath,
      }),
    [sortedParserReports, parserDetailProvider, providerSessionRows, selectedSessionPath],
  );
  const {
    parserReportsWithErrors,
    resolvedParserDetailProvider,
    parserDetailReport,
    selectedSessionProvider,
    selectedSessionProviderVisibleInParser,
  } = parserDetailState;
  useEffect(() => {
    if (parserDetailProvider !== resolvedParserDetailProvider) {
      setParserDetailProvider(resolvedParserDetailProvider);
    }
  }, [parserDetailProvider, resolvedParserDetailProvider]);
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
  const sessionFileActionCurrentKey =
    providerView !== "all" && sessionFileActionResult
      ? providerActionSelectionKey(providerView, sessionFileActionResult.action, selectedProviderFilePaths, {
          backup_before_delete:
            sessionFileActionResult.action === "delete_local" ? providerDeleteBackupEnabled : undefined,
        })
      : "";
  const sessionFileActionCanExecute = Boolean(
    sessionFileActionResult &&
      providerActionSelection &&
      providerActionSelection.action === sessionFileActionResult.action &&
      sessionFileActionPreviewKey &&
      sessionFileActionPreviewKey === sessionFileActionCurrentKey,
  );
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
    setParserDetailProvider(next.parserDetailProvider);
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
    setParserFailOnly(next.parserFailOnly);
    setParserDetailProvider(next.parserDetailProvider);
    setPendingParserFocusProvider(next.pendingParserFocusProvider);
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
    setParserDetailProvider(next.parserDetailProvider);
    setPendingSessionJump(next.pendingSessionJump);
    setParserJumpStatus(next.parserJumpStatus);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        providerSessionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };
  useEffect(() => {
    const resolved = resolvePendingSessionJump({
      pendingSessionJump,
      providerView,
      providerSessionsLoading,
      providerSessionRows,
    });
    if (!resolved) return;
    if (resolved.selectedSessionPath) {
      setSelectedSessionPath(resolved.selectedSessionPath);
      setParserJumpStatus(resolved.parserJumpStatus);
      scrollToSessionRow(resolved.selectedSessionPath);
    } else {
      setParserJumpStatus(resolved.parserJumpStatus);
    }
    setPendingSessionJump(null);
  }, [
    pendingSessionJump,
    providerView,
    providerSessionsLoading,
    providerSessionRows,
    setSelectedSessionPath,
  ]);
  useEffect(() => {
    if (!canFocusPendingParserProvider(pendingParserFocusProvider, sortedParserReports)) return;
    scrollToParserProviderRow(pendingParserFocusProvider);
    setPendingParserFocusProvider("");
  }, [pendingParserFocusProvider, sortedParserReports]);
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
      <input
        className="search-input"
        placeholder={messages.providers.sessionSearchPlaceholder}
        value={sessionFilter}
        onChange={(e) => setSessionFilter(e.target.value)}
      />
      <select
        className="filter-select"
        aria-label={messages.providers.probeFilterLabel}
        value={probeFilter}
        onChange={(e) => setProbeFilter(e.target.value as ProviderProbeFilter)}
      >
        <option value="all">{messages.providers.probeAll}</option>
        <option value="ok">{messages.providers.probeOk}</option>
        <option value="fail">{messages.providers.probeFail}</option>
      </select>
      <div className="sessions-control-meta">
        <span className="sub-hint">
          rows {sortedProviderSessionRows.length}/{providerSessionRows.length}
          {sortedProviderSessionRows.length > renderedProviderSessionRows.length
            ? ` · window ${renderedProviderSessionRows.length}/${sortedProviderSessionRows.length}`
            : ""}
        </span>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={allFilteredProviderRowsSelected || allProviderRowsSelected}
            onChange={(e) => toggleSelectAllProviderRows(e.target.checked, filteredProviderFilePaths)}
          />
          {messages.providers.selectAllInTab}
        </label>
        <span className="sub-hint">
          {providerLabel} · selected {selectedProviderFilePaths.length}
        </span>
        {effectiveSlowOnly ? (
          <span className="sub-hint">{messages.providers.slowOnlyActive}</span>
        ) : null}
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

      <section className="provider-ops-layout">
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
          selectedSessionProvider={selectedSessionProvider}
          selectedSessionParseFailCount={selectedSessionParseFailCount}
          onJumpToParserProvider={jumpToParserProvider}
          sourceFilter={sourceFilter}
          onSourceFilterChange={(value) => setSourceFilter(value as ProviderSourceFilter)}
          sourceFilterOptions={sourceFilterOptions}
          sessionSort={sessionSort}
          onSessionSortChange={(value) => setSessionSort(value as ProviderSessionSort)}
          slowOnly={slowOnly}
          canApplySlowOnly={canApplySlowOnly}
          onSlowOnlyChange={setSlowOnly}
          onSetProviderViewAll={() => setProviderView("all")}
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
          onSetParserDetailProvider={setParserDetailProvider}
          selectedProviderFiles={selectedProviderFiles}
          onSelectedProviderFileChange={(filePath, checked) =>
            setSelectedProviderFiles((prev) => ({ ...prev, [filePath]: checked }))
          }
          providerSessionsLoading={providerSessionsLoading}
          onLoadMoreRows={() => setRenderLimit((prev) => prev + 120)}
          hasMoreRows={sortedProviderSessionRows.length > renderedProviderSessionRows.length}
          sessionFileActionResult={sessionFileActionResult}
          sessionFileActionCanExecute={sessionFileActionCanExecute}
          actionLabel={actionLabel}
          csvExportedRows={csvExportedRows}
          sectionRef={providerSessionsSectionRef}
        />

        <ProviderSideStack
          advancedOpen={advancedOpen}
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
              selectedSessionProvider={selectedSessionProvider}
              selectedSessionProviderVisibleInParser={selectedSessionProviderVisibleInParser}
              parserFailOnly={parserFailOnly}
              onParserFailOnlyChange={setParserFailOnly}
              filteredParserReportsCount={filteredParserReports.length}
              totalParserReportsCount={parserReports.length}
              parserSort={parserSort}
              onParserSortChange={(value) => setParserSort(value as ParserSort)}
              sortedParserReports={sortedParserReports}
              parserLoading={parserLoading}
              slowProviderSet={slowProviderSet}
              statusLabel={statusLabel}
              onJumpToProviderSessions={jumpToProviderSessions}
              parserReportsWithErrors={parserReportsWithErrors}
              parserDetailProvider={parserDetailProvider}
              onParserDetailProviderChange={setParserDetailProvider}
              parserJumpStatus={parserJumpStatus}
              parserDetailReport={parserDetailReport}
              onJumpToSessionFromParserError={jumpToSessionFromParserError}
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
