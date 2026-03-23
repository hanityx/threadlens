import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Messages } from "../i18n";
import type {
  ProviderMatrixProvider,
  ProviderDataDepth,
  ProviderView,
  DataSourceInventoryRow,
  ProviderSessionRow,
  ProviderSessionActionResult,
  RecoveryBackupExportResponse,
} from "../types";
import { SKELETON_ROWS } from "../types";
import { formatDateTime, formatInteger } from "../lib/helpers";

type ProviderSessionSort = "mtime_desc" | "mtime_asc" | "size_desc" | "size_asc" | "title_asc" | "title_desc";
type ProviderProbeFilter = "all" | "ok" | "fail";
type ProviderSourceFilter = "all" | (string & {});
type ParserSort =
  | "fail_desc"
  | "fail_asc"
  | "score_desc"
  | "score_asc"
  | "scan_ms_desc"
  | "scan_ms_asc"
  | "name_asc"
  | "name_desc";
type ProviderFlowState = "done" | "pending" | "blocked";
type CsvColumnKey =
  | "provider"
  | "session_id"
  | "title"
  | "title_source"
  | "source"
  | "format"
  | "probe_ok"
  | "size_bytes"
  | "modified"
  | "file_path";

const CSV_COLUMN_KEYS: CsvColumnKey[] = [
  "provider",
  "session_id",
  "title",
  "title_source",
  "source",
  "format",
  "probe_ok",
  "size_bytes",
  "modified",
  "file_path",
];

const DEFAULT_CSV_COLUMNS: Record<CsvColumnKey, boolean> = {
  provider: true,
  session_id: true,
  title: true,
  title_source: true,
  source: true,
  format: true,
  probe_ok: true,
  size_bytes: true,
  modified: true,
  file_path: true,
};

const COMPACT_CSV_COLUMNS: Record<CsvColumnKey, boolean> = {
  provider: true,
  session_id: true,
  title: true,
  title_source: false,
  source: false,
  format: true,
  probe_ok: true,
  size_bytes: true,
  modified: true,
  file_path: true,
};

const FORENSICS_CSV_COLUMNS: Record<CsvColumnKey, boolean> = {
  provider: true,
  session_id: true,
  title: true,
  title_source: false,
  source: true,
  format: true,
  probe_ok: true,
  size_bytes: true,
  modified: true,
  file_path: true,
};
const SLOW_THRESHOLD_OPTIONS_MS = [800, 1200, 1600, 2200, 3000];
const PROVIDER_CSV_COLUMNS_STORAGE_KEY = "po-provider-csv-columns";
const LEGACY_PROVIDER_CSV_COLUMNS_STORAGE_KEY = "cmc-provider-csv-columns";
const PROVIDER_SLOW_ONLY_STORAGE_KEY = "po-provider-slow-only";
const LEGACY_PROVIDER_SLOW_ONLY_STORAGE_KEY = "cmc-provider-slow-only";
const CORE_PROVIDER_IDS = ["codex", "claude", "gemini"] as const;
const OPTIONAL_PROVIDER_IDS = ["copilot"] as const;

function readStorageValue(keys: readonly string[]): string | null {
  if (typeof window === "undefined") return null;
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  }
  return null;
}

function writeStorageValue(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }
  return raw;
}

function formatBytes(value: number): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[idx]}`;
}

function formatFetchMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${Math.max(0, Math.round(value))}ms`;
}

function readCsvColumnPrefs(): Record<CsvColumnKey, boolean> {
  if (typeof window === "undefined") return DEFAULT_CSV_COLUMNS;
  try {
    const raw = readStorageValue([
      PROVIDER_CSV_COLUMNS_STORAGE_KEY,
      LEGACY_PROVIDER_CSV_COLUMNS_STORAGE_KEY,
    ]);
    if (!raw) return DEFAULT_CSV_COLUMNS;
    const parsed = JSON.parse(raw) as Partial<Record<CsvColumnKey, boolean>>;
    const next: Record<CsvColumnKey, boolean> = { ...DEFAULT_CSV_COLUMNS };
    CSV_COLUMN_KEYS.forEach((key) => {
      if (typeof parsed[key] === "boolean") next[key] = parsed[key] as boolean;
    });
    return next;
  } catch {
    return DEFAULT_CSV_COLUMNS;
  }
}

function readSlowOnlyPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      readStorageValue([PROVIDER_SLOW_ONLY_STORAGE_KEY, LEGACY_PROVIDER_SLOW_ONLY_STORAGE_KEY]) ===
      "1"
    );
  } catch {
    return false;
  }
}

export interface ProvidersPanelProps {
  messages: Messages;
  sessionDetailSlot?: React.ReactNode;

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
  const [slowOnly, setSlowOnly] = useState(readSlowOnlyPref);
  const [hotspotScopeOrigin, setHotspotScopeOrigin] = useState<ProviderView | null>(null);
  const [csvColumns, setCsvColumns] = useState<Record<CsvColumnKey, boolean>>(readCsvColumnPrefs);
  const providerSessionsSectionRef = useRef<HTMLElement | null>(null);
  const parserSectionRef = useRef<HTMLDetailsElement | null>(null);
  const [pendingSessionJump, setPendingSessionJump] = useState<{
    provider: string;
    sessionId: string;
  } | null>(null);
  const [pendingParserFocusProvider, setPendingParserFocusProvider] = useState<string>("");
  const [parserJumpStatus, setParserJumpStatus] = useState<"idle" | "found" | "not_found">("idle");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const statusLabel = (status: "active" | "detected" | "missing") => {
    if (status === "active") return messages.providers.statusActive;
    if (status === "detected") return messages.providers.statusDetected;
    return messages.providers.statusMissing;
  };

  const actionLabel = (action: "backup_local" | "archive_local" | "delete_local") => {
    if (action === "backup_local") return messages.providers.actionBackupLocal;
    if (action === "archive_local") return messages.providers.actionArchiveLocal;
    return messages.providers.actionDeleteLocal;
  };
  const flowStateLabel = (state: ProviderFlowState) => {
    if (state === "done") return messages.providers.flowStatusDone;
    if (state === "blocked") return messages.providers.flowStatusBlocked;
    return messages.providers.flowStatusPending;
  };
  const capabilityLevelLabel = (level: string) => {
    if (level === "full") return "전체 기능";
    if (level === "read-only") return "읽기 전용";
    if (level === "unavailable") return "사용 불가";
    return level;
  };
  const dataSourceLabel = (sourceKey: string) => {
    const key = sourceKey.toLowerCase();
    if (key === "history") return "히스토리";
    if (key === "global_state") return "글로벌 상태";
    if (key === "sessions") return "세션";
    if (key === "archived_sessions") return "보관 세션";
    if (key === "codex_root") return "Codex 루트";
    if (key === "chat_root") return "Chat 루트";
    if (key === "claude_root") return "Claude 루트";
    if (key === "claude_projects") return "Claude 프로젝트";
    if (key === "claude_transcripts") return "Claude 전사";
    if (key === "gemini_root") return "Gemini 루트";
    if (key === "gemini_tmp") return "Gemini 임시 저장소";
    if (key === "gemini_history") return "Gemini 히스토리";
    if (key === "gemini_antigravity") return "Gemini 대화 저장소";
    if (key === "copilot_vscode") return "Copilot VS Code";
    if (key === "copilot_cursor") return "Copilot Cursor";
    if (key === "copilot_vscode_workspace") return "Copilot VS Code 워크스페이스";
    if (key === "copilot_cursor_workspace") return "Copilot Cursor 워크스페이스";
    return sourceKey
      .replace(/_/g, " ")
      .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  };
  const providerFromDataSource = (sourceKey: string): ProviderView | null => {
    const key = sourceKey.toLowerCase();
    if (key.startsWith("claude")) return "claude";
    if (key.startsWith("gemini")) return "gemini";
    if (key.startsWith("copilot")) return "copilot";
    if (key.startsWith("chat_")) return "chatgpt";
    if (
      key.startsWith("codex_") ||
      key === "sessions" ||
      key === "archived_sessions" ||
      key === "history" ||
      key === "global_state"
    ) {
      return "codex";
    }
    return null;
  };
  const canOpenProviderById = (providerId: ProviderView | null): providerId is ProviderView =>
    Boolean(providerId && providerTabs.some((tab) => tab.id === providerId));

  const providerLabel = providerView === "all" ? messages.common.allAi : selectedProviderLabel;
  const backupActionResult = providerActionData?.action === "backup_local" ? providerActionData : null;
  const sessionFileActionResult =
    providerActionData && providerActionData.action !== "backup_local" ? providerActionData : null;
  const latestBackupCount =
    backupActionResult?.backed_up_count ?? (backupActionResult?.backup_to ? 1 : 0);
  const latestBackupPath =
    backupActionResult?.backup_to ?? "이번 세션에서는 아직 선택 백업이 만들어지지 않았어.";
  const latestExportCount = recoveryBackupExportData?.exported_count ?? 0;
  const backupFlowHint =
    selectedProviderFilePaths.length > 0
      ? `선택한 ${selectedProviderFilePaths.length}개 세션을 먼저 백업한 뒤, 아래에서 보관 또는 삭제 드라이런으로 이어가.`
      : "먼저 원본 세션을 선택하고 백업부터 시작해.";
  const deleteBackupModeLabel = providerDeleteBackupEnabled ? "켜짐" : "꺼짐";
  const canRunProviderBackup = providerView !== "all" && selectedProviderFilePaths.length > 0;
  const canApplySlowOnly = providerView === "all";
  const effectiveSlowOnly = canApplySlowOnly && slowOnly;
  const slowProviderSet = useMemo(
    () => new Set(slowProviderIds),
    [slowProviderIds],
  );
  const providerTabById = useMemo(
    () => new Map(providerTabs.map((tab) => [tab.id, tab])),
    [providerTabs],
  );
  const managedProviderTabs = useMemo(
    () => providerTabs.filter((tab) => tab.id !== "all"),
    [providerTabs],
  );
  const coreProviderTabs = useMemo(
    () => managedProviderTabs.filter((tab) => CORE_PROVIDER_IDS.includes(tab.id as (typeof CORE_PROVIDER_IDS)[number])),
    [managedProviderTabs],
  );
  const optionalProviderTabs = useMemo(
    () =>
      managedProviderTabs.filter((tab) =>
        OPTIONAL_PROVIDER_IDS.includes(tab.id as (typeof OPTIONAL_PROVIDER_IDS)[number]),
      ),
    [managedProviderTabs],
  );
  const slowThresholdOptions = useMemo(() => {
    if (SLOW_THRESHOLD_OPTIONS_MS.includes(slowProviderThresholdMs)) {
      return SLOW_THRESHOLD_OPTIONS_MS;
    }
    return [...SLOW_THRESHOLD_OPTIONS_MS, slowProviderThresholdMs].sort((a, b) => a - b);
  }, [slowProviderThresholdMs]);
  const slowProviderSummary = useMemo(() => {
    const names = slowProviderIds
      .map((providerId) => providerTabById.get(providerId as ProviderView)?.name ?? providerId)
      .slice(0, 3);
    return names.join(", ");
  }, [slowProviderIds, providerTabById]);
  const providerTabCount = providerTabs.filter((tab) => tab.id !== "all").length;
  const detectedDataSourceCount = dataSourceRows.filter((row) => row.present).length;
  const selectedProviderDataSources = useMemo(() => {
    if (providerView === "all") return [];
    return dataSourceRows.filter((row) => providerFromDataSource(row.source_key) === providerView);
  }, [dataSourceRows, providerView]);
  const selectedProviderHasPresentSource = selectedProviderDataSources.some((row) => row.present);
  const showProviderSessionsZeroState =
    providerView !== "all" &&
    !providerSessionsLoading &&
    providerSessionRows.length === 0;
  const hasSlowProviderFetch =
    providerFetchMetrics.data_sources !== null && providerFetchMetrics.data_sources >= slowProviderThresholdMs ||
    providerFetchMetrics.matrix !== null && providerFetchMetrics.matrix >= slowProviderThresholdMs ||
    providerFetchMetrics.sessions !== null && providerFetchMetrics.sessions >= slowProviderThresholdMs ||
    providerFetchMetrics.parser !== null && providerFetchMetrics.parser >= slowProviderThresholdMs;
  const sourceFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    providerSessionRows.forEach((row) => {
      const source = String(row.source || "").trim() || "unknown";
      counts.set(source, (counts.get(source) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([source, count]) => ({ source, count }));
  }, [providerSessionRows]);
  useEffect(() => {
    if (sourceFilter === "all") return;
    const exists = sourceFilterOptions.some((item) => item.source === sourceFilter);
    if (!exists) setSourceFilter("all");
  }, [sourceFilter, sourceFilterOptions]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    writeStorageValue(PROVIDER_SLOW_ONLY_STORAGE_KEY, slowOnly ? "1" : "0");
  }, [slowOnly]);
  const providerSessionComputedIndex = useMemo(() => {
    const searchText = new Map<string, string>();
    const mtimeTs = new Map<string, number>();
    const sortTitle = new Map<string, string>();
    providerSessionRows.forEach((row) => {
      const normalizedTitle = row.display_title || row.probe?.detected_title || row.session_id;
      const ts = Date.parse(row.mtime);
      const text = [normalizedTitle, row.probe?.detected_title, row.session_id, row.file_path, row.provider]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      searchText.set(row.file_path, text);
      mtimeTs.set(row.file_path, Number.isNaN(ts) ? 0 : ts);
      sortTitle.set(row.file_path, normalizedTitle);
    });
    return { searchText, mtimeTs, sortTitle };
  }, [providerSessionRows]);
  const providerTitleCollator = useMemo(
    () => new Intl.Collator(undefined, { sensitivity: "base" }),
    [],
  );
  const filteredProviderSessionRows = useMemo(() => {
    const q = deferredSessionFilter.trim().toLowerCase();
    return providerSessionRows.filter((row) => {
      if (sourceFilter !== "all" && row.source !== sourceFilter) return false;
      if (probeFilter === "ok" && !row.probe.ok) return false;
      if (probeFilter === "fail" && row.probe.ok) return false;
      if (effectiveSlowOnly && !slowProviderSet.has(row.provider)) return false;

      if (!q) return true;
      const text = providerSessionComputedIndex.searchText.get(row.file_path) ?? "";
      return text.includes(q);
    });
  }, [
    providerSessionRows,
    providerSessionComputedIndex,
    deferredSessionFilter,
    probeFilter,
    sourceFilter,
    effectiveSlowOnly,
    slowProviderSet,
  ]);
  const sortedProviderSessionRows = useMemo(() => {
    const rows = [...filteredProviderSessionRows];
    const transcriptPriority = (row: typeof rows[number]) => {
      if (row.probe.format === "jsonl") return 4;
      if (row.file_path.endsWith(".metadata.json")) return 1;
      if (row.probe.format === "json") {
        if (row.source.includes("workspace_chats") || row.source === "tmp" || row.source === "projects") {
          return 3;
        }
        return 2;
      }
      if (row.probe.format === "unknown") return 0;
      return 1;
    };
    rows.sort((a, b) => {
      const aPriority = transcriptPriority(a);
      const bPriority = transcriptPriority(b);
      if (aPriority !== bPriority) return bPriority - aPriority;
      const aPath = a.file_path;
      const bPath = b.file_path;
      const aTs = providerSessionComputedIndex.mtimeTs.get(aPath) ?? 0;
      const bTs = providerSessionComputedIndex.mtimeTs.get(bPath) ?? 0;
      const aTitle = providerSessionComputedIndex.sortTitle.get(aPath) ?? a.session_id;
      const bTitle = providerSessionComputedIndex.sortTitle.get(bPath) ?? b.session_id;
      switch (sessionSort) {
        case "mtime_asc":
          return aTs - bTs;
        case "size_desc":
          return b.size_bytes - a.size_bytes;
        case "size_asc":
          return a.size_bytes - b.size_bytes;
        case "title_asc":
          return providerTitleCollator.compare(aTitle, bTitle);
        case "title_desc":
          return providerTitleCollator.compare(bTitle, aTitle);
        case "mtime_desc":
        default:
          return bTs - aTs;
      }
    });
    return rows;
  }, [filteredProviderSessionRows, providerSessionComputedIndex, providerTitleCollator, sessionSort]);
  const renderedProviderSessionRows = useMemo(
    () => sortedProviderSessionRows.slice(0, renderLimit),
    [sortedProviderSessionRows, renderLimit],
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
    if (typeof window === "undefined") return;
    writeStorageValue(PROVIDER_CSV_COLUMNS_STORAGE_KEY, JSON.stringify(csvColumns));
  }, [csvColumns]);
  const filteredParserReports = useMemo(
    () =>
      (parserFailOnly ? parserReports.filter((report) => Number(report.parse_fail) > 0) : parserReports)
        .filter((report) => !effectiveSlowOnly || slowProviderSet.has(report.provider)),
    [parserReports, parserFailOnly, effectiveSlowOnly, slowProviderSet],
  );
  const sortedParserReports = useMemo(() => {
    const rows = [...filteredParserReports];
    rows.sort((a, b) => {
      if (parserSort === "fail_desc") return Number(b.parse_fail) - Number(a.parse_fail);
      if (parserSort === "fail_asc") return Number(a.parse_fail) - Number(b.parse_fail);
      if (parserSort === "score_desc") return Number(b.parse_score ?? -1) - Number(a.parse_score ?? -1);
      if (parserSort === "score_asc") return Number(a.parse_score ?? 101) - Number(b.parse_score ?? 101);
      if (parserSort === "scan_ms_desc") return Number(b.scan_ms ?? -1) - Number(a.scan_ms ?? -1);
      if (parserSort === "scan_ms_asc") return Number(a.scan_ms ?? Number.MAX_SAFE_INTEGER) - Number(b.scan_ms ?? Number.MAX_SAFE_INTEGER);
      if (parserSort === "name_desc") return String(b.name || "").localeCompare(String(a.name || ""));
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return rows;
  }, [filteredParserReports, parserSort]);
  const parserReportsWithErrors = useMemo(
    () =>
      sortedParserReports.filter(
        (report) => Array.isArray(report.sample_errors) && report.sample_errors.length > 0,
      ),
    [sortedParserReports],
  );
  useEffect(() => {
    if (parserReportsWithErrors.length === 0) {
      setParserDetailProvider("");
      return;
    }
    const exists = parserReportsWithErrors.some((report) => report.provider === parserDetailProvider);
    if (!exists) setParserDetailProvider(parserReportsWithErrors[0].provider);
  }, [parserReportsWithErrors, parserDetailProvider]);
  const parserDetailReport = useMemo(
    () => parserReportsWithErrors.find((report) => report.provider === parserDetailProvider) ?? null,
    [parserReportsWithErrors, parserDetailProvider],
  );
  const selectedSessionProvider = useMemo(
    () =>
      providerSessionRows.find((row) => row.file_path === selectedSessionPath)?.provider ?? "",
    [providerSessionRows, selectedSessionPath],
  );
  const selectedSessionProviderVisibleInParser = useMemo(
    () =>
      !selectedSessionProvider ||
      sortedParserReports.some((report) => report.provider === selectedSessionProvider),
    [sortedParserReports, selectedSessionProvider],
  );
  const parseFailByProvider = useMemo(() => {
    const map: Record<string, number> = {};
    parserReports.forEach((report) => {
      map[report.provider] = Number(report.parse_fail);
    });
    return map;
  }, [parserReports]);
  const parseScoreByProvider = useMemo(() => {
    const map: Record<string, number | null> = {};
    parserReports.forEach((report) => {
      map[report.provider] = report.parse_score;
    });
    return map;
  }, [parserReports]);
  const parserReportByProvider = useMemo(() => {
    const map = new Map<string, (typeof parserReports)[number]>();
    allParserReports.forEach((report) => {
      map.set(report.provider, report);
    });
    return map;
  }, [allParserReports]);
  const providerMatrixById = useMemo(() => {
    const map = new Map<string, ProviderMatrixProvider>();
    providers.forEach((provider) => {
      map.set(provider.provider, provider);
    });
    return map;
  }, [providers]);
  const providerSessionCountById = useMemo(() => {
    const map = new Map<string, number>();
    allProviderSessionRows.forEach((row) => {
      map.set(row.provider, (map.get(row.provider) ?? 0) + 1);
    });
    return map;
  }, [allProviderSessionRows]);
  const dataSourcesByProvider = useMemo(() => {
    const map = new Map<string, DataSourceInventoryRow[]>();
    dataSourceRows.forEach((row) => {
      const providerId = providerFromDataSource(row.source_key);
      if (!providerId || providerId === "all") return;
      const current = map.get(providerId) ?? [];
      current.push(row);
      map.set(providerId, current);
    });
    return map;
  }, [dataSourceRows]);
  const transcriptReadyCountByProvider = useMemo(() => {
    const map = new Map<string, number>();
    allProviderSessionRows.forEach((row) => {
      const ready = row.probe.format === "jsonl" || row.probe.format === "json";
      if (!ready) return;
      map.set(row.provider, (map.get(row.provider) ?? 0) + 1);
    });
    return map;
  }, [allProviderSessionRows]);
  const providerFlowCards = useMemo(() => {
    return providerTabs
      .filter((tab) => tab.id !== "all")
      .map((tab) => {
        const providerId = tab.id;
        const providerInfo = providerMatrixById.get(providerId);
        const parserInfo = parserReportByProvider.get(providerId);
        const sources = dataSourcesByProvider.get(providerId) ?? [];
        const presentSources = sources.filter((row) => row.present);
        const roots = providerInfo?.evidence?.roots ?? [];
        const sessionCount = providerSessionCountById.get(providerId) ?? 0;
        const parseFail = Number(parserInfo?.parse_fail ?? 0);
        const parseOk = Number(parserInfo?.parse_ok ?? 0);
        const parseScore = parserInfo?.parse_score ?? null;
        const canAnalyze = Boolean(providerInfo?.capabilities.analyze_context);
        const canRead = Boolean(providerInfo?.capabilities.read_sessions);
        const canSafeCleanup = Boolean(providerInfo?.capabilities.safe_cleanup);
        const parserStageState: ProviderFlowState =
          sessionCount === 0
            ? "pending"
            : parseFail > 0
              ? "blocked"
              : parseOk > 0 || parseScore !== null
                ? "done"
                : "pending";
        const applyStageState: ProviderFlowState =
          canSafeCleanup && sessionCount > 0 && parseFail === 0
            ? "done"
            : canSafeCleanup && sessionCount > 0
              ? "pending"
              : "blocked";

        let nextStep = messages.providers.flowNextCollect;
        if (presentSources.length > 0 && sessionCount === 0) {
          nextStep = messages.providers.flowNextCollectSessions;
        } else if (sessionCount > 0 && parseFail > 0) {
          nextStep = messages.providers.flowNextParse;
        } else if (!canSafeCleanup) {
          nextStep = messages.providers.flowNextReadonly;
        } else if (canSafeCleanup && sessionCount > 0 && parseFail === 0) {
          nextStep = messages.providers.flowNextExecute;
        } else if (sessionCount > 0) {
          nextStep = messages.providers.flowNextDryRun;
        }

        return {
          providerId,
          name: tab.name,
          status: tab.status,
          scanMs: tab.scan_ms,
          parseFail,
          parseScore,
          canRead,
          canAnalyze,
          canSafeCleanup,
          roots,
          sources,
          presentSourceCount: presentSources.length,
          sessionCount,
          nextStep,
          flow: [
            {
              key: "source",
              label: messages.providers.flowStageDetect,
              state: presentSources.length > 0 ? "done" : "pending",
            },
            {
              key: "sessions",
              label: messages.providers.flowStageSessions,
              state: sessionCount > 0 ? "done" : "pending",
            },
            {
              key: "parser",
              label: messages.providers.flowStageParser,
              state: parserStageState,
            },
            {
              key: "cleanup",
              label: messages.providers.flowStageSafeCleanup,
              state: canSafeCleanup ? "done" : "blocked",
            },
            {
              key: "apply",
              label: messages.providers.flowStageApply,
              state: applyStageState,
            },
          ] as Array<{ key: string; label: string; state: ProviderFlowState }>,
        };
      });
  }, [
    providerTabs,
    providerMatrixById,
    parserReportByProvider,
    dataSourcesByProvider,
    providerSessionCountById,
    messages.providers.flowNextCollect,
    messages.providers.flowNextCollectSessions,
    messages.providers.flowNextParse,
    messages.providers.flowNextReadonly,
    messages.providers.flowNextExecute,
    messages.providers.flowNextDryRun,
    messages.providers.flowStageDetect,
    messages.providers.flowStageSessions,
    messages.providers.flowStageParser,
    messages.providers.flowStageSafeCleanup,
    messages.providers.flowStageApply,
  ]);
  const providerFlowCardById = useMemo(
    () => new Map(providerFlowCards.map((card) => [card.providerId, card])),
    [providerFlowCards],
  );
  const slowHotspotCards = useMemo(() => {
    return slowProviderIds
      .map((providerId) => {
        const tab = providerTabById.get(providerId as ProviderView);
        if (!tab || tab.id === "all") return null;
        return {
          provider: providerId,
          name: tab.name,
          scanMs: tab.scan_ms,
          scanned: tab.scanned,
          parseFail: parseFailByProvider[providerId] ?? 0,
          parseScore: parseScoreByProvider[providerId] ?? null,
        };
      })
      .filter((item): item is {
        provider: string;
        name: string;
        scanMs: number | null;
        scanned: number;
        parseFail: number;
        parseScore: number | null;
      } => item !== null)
      .sort((a, b) => {
        const aMs = a.scanMs ?? -1;
        const bMs = b.scanMs ?? -1;
        if (aMs !== bMs) return bMs - aMs;
        if (a.parseFail !== b.parseFail) return b.parseFail - a.parseFail;
        return b.scanned - a.scanned;
      })
      .slice(0, 6);
  }, [slowProviderIds, providerTabById, parseFailByProvider, parseScoreByProvider]);
  const selectedSessionParseFailCount = selectedSessionProvider
    ? parseFailByProvider[selectedSessionProvider]
    : undefined;
  const selectedManagementCard = useMemo(
    () => providerFlowCardById.get(providerView) ?? null,
    [providerFlowCardById, providerView],
  );
  const selectedProviderMeta = useMemo(
    () => (providerView === "all" ? null : providerMatrixById.get(providerView) ?? null),
    [providerMatrixById, providerView],
  );
  const selectedProviderTranscriptReady = useMemo(
    () => (providerView === "all" ? 0 : transcriptReadyCountByProvider.get(providerView) ?? 0),
    [providerView, transcriptReadyCountByProvider],
  );
  const selectedProviderPresentSources = useMemo(
    () =>
      providerView === "all"
        ? 0
        : (dataSourcesByProvider.get(providerView) ?? []).filter((row) => row.present).length,
    [dataSourcesByProvider, providerView],
  );
  const selectedProviderSessionCount = useMemo(
    () => (providerView === "all" ? 0 : providerSessionCountById.get(providerView) ?? 0),
    [providerSessionCountById, providerView],
  );
  const selectedSessionPreview = useMemo(
    () => providerSessionRows.find((row) => row.file_path === selectedSessionPath) ?? null,
    [providerSessionRows, selectedSessionPath],
  );
  const visibleFlowCards = useMemo(() => {
    if (providerView === "all") {
      return providerFlowCards.filter((card) =>
        CORE_PROVIDER_IDS.includes(card.providerId as (typeof CORE_PROVIDER_IDS)[number]),
      );
    }
    return providerFlowCards.filter((card) => card.providerId === providerView);
  }, [providerFlowCards, providerView]);

  const exportFilteredSessionsCsv = () => {
    const headers = enabledCsvColumns.length > 0 ? enabledCsvColumns : CSV_COLUMN_KEYS;
    const lines = [headers.map(csvCell).join(",")];
    sortedProviderSessionRows.forEach((row) => {
      const valuesByKey: Record<CsvColumnKey, unknown> = {
        provider: row.provider,
        session_id: row.session_id,
        title: row.display_title || row.probe.detected_title || row.session_id,
        title_source: row.probe.title_source ?? "",
        source: row.source,
        format: row.probe.format,
        probe_ok: row.probe.ok ? "ok" : "fail",
        size_bytes: row.size_bytes,
        modified: row.mtime,
        file_path: row.file_path,
      };
      lines.push(headers.map((key) => csvCell(valuesByKey[key])).join(","));
    });
    const payload = `\uFEFF${lines.join("\n")}`;
    const blob = new Blob([payload], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const scope = providerView === "all" ? "all" : providerView;
    anchor.href = url;
    anchor.download = `provider-sessions-${scope}-${stamp}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setCsvExportedRows(sortedProviderSessionRows.length);
  };

  const csvColumnLabel = (key: CsvColumnKey): string => {
    if (key === "provider") return messages.providers.csvColumnProvider;
    if (key === "session_id") return messages.providers.csvColumnSessionId;
    if (key === "title") return messages.providers.csvColumnTitle;
    if (key === "title_source") return messages.providers.csvColumnTitleSource;
    if (key === "source") return messages.providers.csvColumnSource;
    if (key === "format") return messages.providers.csvColumnFormat;
    if (key === "probe_ok") return messages.providers.csvColumnProbe;
    if (key === "size_bytes") return messages.providers.csvColumnSize;
    if (key === "modified") return messages.providers.csvColumnModified;
    return messages.providers.csvColumnPath;
  };

  const jumpToProviderSessions = (
    providerId: string,
    parseFail = 0,
    options?: { fromHotspot?: boolean },
  ) => {
    if (options?.fromHotspot) {
      setHotspotScopeOrigin(providerView);
    } else {
      setHotspotScopeOrigin(null);
    }
    setProviderView(providerId as ProviderView);
    setProbeFilter(parseFail > 0 ? "fail" : "all");
    setParserDetailProvider(providerId);
    setSessionFilter("");
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
    if (!providerId) return;
    setAdvancedOpen(true);
    if (parserFailOnly) setParserFailOnly(false);
    setParserDetailProvider(providerId);
    setPendingParserFocusProvider(providerId);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        parserSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };
  const jumpToSessionFromParserError = (providerId: string, sessionId: string) => {
    setHotspotScopeOrigin(null);
    setProviderView(providerId as ProviderView);
    setProbeFilter("all");
    setSessionFilter("");
    setParserDetailProvider(providerId);
    setPendingSessionJump({ provider: providerId, sessionId });
    setParserJumpStatus("idle");
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        providerSessionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };
  useEffect(() => {
    if (!pendingSessionJump) return;
    if (providerView !== pendingSessionJump.provider) return;
    if (providerSessionsLoading) return;
    const hit = providerSessionRows.find(
      (row) => row.provider === pendingSessionJump.provider && row.session_id === pendingSessionJump.sessionId,
    );
    if (hit) {
      setSelectedSessionPath(hit.file_path);
      setParserJumpStatus("found");
      scrollToSessionRow(hit.file_path);
    } else {
      setParserJumpStatus("not_found");
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
    if (!pendingParserFocusProvider) return;
    const exists = sortedParserReports.some((report) => report.provider === pendingParserFocusProvider);
    if (!exists) return;
    scrollToParserProviderRow(pendingParserFocusProvider);
    setPendingParserFocusProvider("");
  }, [pendingParserFocusProvider, sortedParserReports]);
  const hotspotOriginLabel = useMemo(() => {
    if (!hotspotScopeOrigin) return "";
    if (hotspotScopeOrigin === "all") return messages.common.allAi;
    return providerTabById.get(hotspotScopeOrigin)?.name ?? hotspotScopeOrigin;
  }, [hotspotScopeOrigin, providerTabById, messages.common.allAi]);
  const canReturnHotspotScope = Boolean(
    hotspotScopeOrigin &&
    hotspotScopeOrigin !== providerView,
  );
  const slowFocusActive = canApplySlowOnly && slowOnly;
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
  const showProviderColumn = providerView === "all";

  return (
    <>
      <section className="panel provider-workspace-bar">
        <header>
          <h2>{messages.providers.hubTitle}</h2>
          <span>{providerLabel}</span>
        </header>
        <div className="provider-workspace-main">
          <div className="provider-workspace-primary">
            <div className="ai-management-focusbar">
              <button
                type="button"
                className={`provider-chip ${providerView === "all" ? "is-active" : ""}`.trim()}
                onClick={() => setProviderView("all")}
              >
                {messages.common.allAi}
              </button>
              {coreProviderTabs.map((tab) => (
                <button
                  key={`core-provider-chip-${tab.id}`}
                  type="button"
                  className={`provider-chip ${providerView === tab.id ? "is-active" : ""}`.trim()}
                  onClick={() => setProviderView(tab.id)}
                >
                  {tab.name}
                </button>
              ))}
              {optionalProviderTabs.length > 0 ? (
                <details className="provider-chip-disclosure">
                  <summary>{messages.providers.optionalProvidersSummary}</summary>
                  <div className="provider-chip-disclosure-body">
                    {optionalProviderTabs.map((tab) => (
                      <button
                        key={`optional-provider-chip-${tab.id}`}
                        type="button"
                        className={`provider-chip ${providerView === tab.id ? "is-active" : ""}`.trim()}
                        onClick={() => setProviderView(tab.id)}
                      >
                        {tab.name}
                      </button>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>

            <div className="provider-workspace-copy">
              <span className="overview-note-label">source sessions workbench</span>
              <strong>원본 세션 데이터 그리드와 detail rail을 같은 화면에서 이어서 다뤄.</strong>
              <p>프로바이더를 고르고, 세션 파일을 필터링하고, 단건 detail과 백업/보관/삭제 드라이런을 오른쪽 rail에서 바로 검토해.</p>
            </div>

            <div className="provider-workspace-summary">
              <article className="provider-summary-cell">
                <span>{messages.providers.hubMetricSessions}</span>
                <strong>{selectedManagementCard ? selectedProviderSessionCount : providerSessionRows.length}</strong>
              </article>
              <article className="provider-summary-cell">
                <span>{messages.providers.hubMetricSources}</span>
                <strong>{selectedManagementCard ? selectedProviderPresentSources : detectedDataSourceCount}</strong>
              </article>
              <article className="provider-summary-cell">
                <span>{messages.providers.hubMetricTranscript}</span>
                <strong>{selectedManagementCard ? selectedProviderTranscriptReady : providerSessionSummary.parse_ok ?? 0}</strong>
              </article>
              <article className="provider-summary-cell">
                <span>{messages.providers.hubMetricParseFail}</span>
                <strong>{selectedManagementCard ? selectedManagementCard.parseFail : parserSummary.parse_fail ?? 0}</strong>
              </article>
            </div>
          </div>

          <div className="provider-workspace-actions">
            <div className="provider-workspace-actions-head">
              <strong>{messages.providers.backupHubTitle}</strong>
              <span className="sub-hint">
                {messages.providers.backupHubSelected} {selectedProviderFilePaths.length} · {messages.providers.backupHubLatest} {latestBackupCount}
              </span>
            </div>
            <div className="provider-action-toolbar-inline">
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={providerDeleteBackupEnabled}
                  onChange={(event) => setProviderDeleteBackupEnabled(event.target.checked)}
                />
                {messages.providers.deleteWithBackup}
              </label>
              <button
                className="btn-base"
                type="button"
                disabled={!canRunProviderBackup || busy}
                onClick={() => runProviderAction("backup_local", false)}
              >
                {messages.providers.backupSelected}
              </button>
              <button
                className="btn-outline"
                type="button"
                disabled={busy}
                onClick={() => runRecoveryBackupExport([])}
              >
                {messages.providers.exportAllBackups}
              </button>
            </div>
            {selectedSessionPreview ? (
              <div className="provider-selection-preview">
                <strong>{selectedSessionPreview.display_title || selectedSessionPreview.probe.detected_title || selectedSessionPreview.session_id}</strong>
                <span className="sub-hint">
                  {selectedSessionPreview.session_id} · {selectedSessionPreview.provider} · {selectedSessionPreview.probe.format}
                </span>
              </div>
            ) : null}
            {backupActionResult ? (
              <div className="provider-inline-result">
                <strong>최근 백업 실행</strong>
                <span>
                  {messages.providers.valid} {backupActionResult.valid_count} · {messages.providers.applied} {backupActionResult.applied_count}
                  {typeof backupActionResult.backed_up_count === "number"
                    ? ` · ${messages.providers.backedUp} ${backupActionResult.backed_up_count}`
                    : ""}
                </span>
              </div>
            ) : latestExportCount > 0 ? (
              <div className="provider-inline-result">
                <strong>{messages.providers.backupHubExported}</strong>
                <span>{latestExportCount}</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="provider-ops-layout">
        <section className="panel" ref={providerSessionsSectionRef}>
          <header>
            <h2>{messages.providers.sessionsTitle}</h2>
            <span>
              {providerSessionSummary.rows ?? providerSessionRows.length} {messages.providers.rows} · {messages.providers.parseOk}{" "}
              {providerSessionSummary.parse_ok ?? 0}
              {" · "}
              {messages.providers.queryLimit} {providerSessionsLimit}
              {providerRowsSampled ? ` · ${messages.providers.sampledHint}` : ""}
            </span>
          </header>
          <div className="provider-grid-intro">
            <div className="provider-grid-intro-copy">
              <span className="overview-note-label">data grid</span>
              <strong>{providerLabel} 원본 세션 큐를 필터링하고 바로 rail로 넘겨.</strong>
              <p>좌측은 세션 파일 그리드, 우측은 선택한 세션의 transcript와 파일 액션 rail이다.</p>
            </div>
          </div>
          {showProviderSessionsZeroState ? (
            <div className="info-box compact">
              <span className="sub-hint">
                {selectedProviderHasPresentSource
                  ? messages.providers.sessionsEmptyDetectedNoLogs
                  : messages.providers.sessionsEmptyNoSources}
                {` · ${messages.providers.sessionsEmptyActionHint}`}
              </span>
              <button
                className="btn-outline"
                type="button"
                onClick={() => {
                  setProviderDataDepth("deep");
                  refreshProvidersData();
                }}
              >
                {messages.providers.depthDeep} + {messages.providers.refreshNow}
              </button>
            </div>
          ) : null}
          <div className="sub-toolbar sessions-control-strip">
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
                {messages.providers.filteredRows} {sortedProviderSessionRows.length}/{providerSessionRows.length}
                {sortedProviderSessionRows.length > renderedProviderSessionRows.length
                  ? ` · ${messages.providers.renderingWindow} ${renderedProviderSessionRows.length}/${sortedProviderSessionRows.length}`
                  : ""}
              </span>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={allFilteredProviderRowsSelected || allProviderRowsSelected}
                  onChange={(e) =>
                    toggleSelectAllProviderRows(e.target.checked, filteredProviderFilePaths)
                  }
                />
                {messages.providers.selectAllInTab}
              </label>
              <span className="sub-hint">
                {providerLabel} · {messages.providers.selected} {selectedProviderFilePaths.length}
              </span>
            </div>
          </div>
          <div className="sub-toolbar sessions-action-strip">
            <div className="sessions-action-main">
              <button
                className="btn-outline"
                disabled={!canRunProviderAction || busy}
                onClick={() => runProviderAction("archive_local", true)}
              >
                {messages.providers.archiveDryRun}
              </button>
              <button
                className="btn-base"
                disabled={!canRunProviderAction || busy}
                onClick={() => runProviderAction("archive_local", false)}
              >
                {messages.providers.archive}
              </button>
              <button
                className="btn-outline"
                disabled={!canRunProviderAction || busy}
                onClick={() =>
                  runProviderAction("delete_local", true, {
                    backup_before_delete: providerDeleteBackupEnabled,
                  })
                }
              >
                {messages.providers.deleteDryRun}
              </button>
              <button
                className="btn-danger"
                disabled={!canRunProviderAction || busy}
                onClick={() =>
                  runProviderAction("delete_local", false, {
                    backup_before_delete: providerDeleteBackupEnabled,
                  })
                }
              >
                {messages.providers.delete}
              </button>
            </div>
            <div className="sessions-action-tools">
            {selectedSessionProvider ? (
              <button
                type="button"
                className={`status-pill status-pill-button ${Number(selectedSessionParseFailCount ?? 0) > 0 ? "status-detected" : "status-active"}`}
                onClick={() => jumpToParserProvider(selectedSessionProvider)}
              >
                {messages.providers.parserLinkedBadge} {selectedSessionProvider} · {messages.providers.parserLinkedFails}{" "}
                {selectedSessionParseFailCount ?? messages.common.unknown}
                <span className="status-pill-action">{messages.providers.parserLinkedOpen}</span>
              </button>
            ) : null}
            <details className="inline-tools-disclosure">
              <summary>고급 필터 / export</summary>
              <div className="sub-toolbar inline-tools-disclosure-body">
                <select
                  className="filter-select"
                  aria-label={messages.providers.sourceFilterLabel}
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value as ProviderSourceFilter)}
                >
                  <option value="all">{messages.providers.sourceAll}</option>
                  {sourceFilterOptions.map((item) => (
                    <option key={`source-filter-${item.source}`} value={item.source}>
                      {item.source} ({item.count})
                    </option>
                  ))}
                </select>
                <select
                  className="filter-select"
                  aria-label={messages.providers.sortLabel}
                  value={sessionSort}
                  onChange={(e) => setSessionSort(e.target.value as ProviderSessionSort)}
                >
                  <option value="mtime_desc">{messages.providers.sortNewest}</option>
                  <option value="mtime_asc">{messages.providers.sortOldest}</option>
                  <option value="size_desc">{messages.providers.sortSizeDesc}</option>
                  <option value="size_asc">{messages.providers.sortSizeAsc}</option>
                  <option value="title_asc">{messages.providers.sortTitleAsc}</option>
                  <option value="title_desc">{messages.providers.sortTitleDesc}</option>
                </select>
                <label className="check-inline">
                  <input
                    type="checkbox"
                    checked={slowOnly}
                    disabled={!canApplySlowOnly}
                    onChange={(e) => setSlowOnly(e.target.checked)}
                  />
                  {messages.providers.slowOnlyFilter}
                </label>
                {!canApplySlowOnly && slowOnly ? (
                  <>
                    <span className="sub-hint">{messages.providers.slowOnlyDormant}</span>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => setProviderView("all")}
                    >
                      {messages.common.allAi}
                    </button>
                  </>
                ) : null}
                <button
                  className="btn-outline"
                  type="button"
                  disabled={sortedProviderSessionRows.length === 0 || enabledCsvColumns.length === 0}
                  onClick={exportFilteredSessionsCsv}
                >
                  {messages.providers.exportCsv}
                </button>
              </div>
              <div className="sub-toolbar inline-tools-disclosure-body">
                <button
                  className="btn-outline"
                  type="button"
                  onClick={() => setCsvColumns({ ...DEFAULT_CSV_COLUMNS })}
                >
                  {messages.providers.csvPresetAll}
                </button>
                <button
                  className="btn-outline"
                  type="button"
                  onClick={() => setCsvColumns({ ...COMPACT_CSV_COLUMNS })}
                >
                  {messages.providers.csvPresetCompact}
                </button>
                <button
                  className="btn-outline"
                  type="button"
                  onClick={() => setCsvColumns({ ...FORENSICS_CSV_COLUMNS })}
                >
                  {messages.providers.csvPresetForensics}
                </button>
              </div>
              <div className="sub-toolbar inline-tools-disclosure-body">
                {CSV_COLUMN_KEYS.map((key) => (
                  <label key={`csv-col-${key}`} className="check-inline">
                    <input
                      type="checkbox"
                      checked={Boolean(csvColumns[key])}
                      onChange={(e) => setCsvColumns((prev) => ({ ...prev, [key]: e.target.checked }))}
                    />
                    {csvColumnLabel(key)}
                  </label>
                ))}
                <span className="sub-hint">
                  {messages.providers.csvSelectedColumns} {enabledCsvColumns.length}/{CSV_COLUMN_KEYS.length}
                </span>
              </div>
            </details>
            </div>
            {!canRunProviderAction && providerView !== "all" ? (
              <span className="sub-hint">{messages.providers.readOnlyHint}</span>
            ) : null}
          </div>
          <div className="provider-table-wrap">
            <table className="provider-session-table">
              <thead>
                <tr>
                  <th></th>
                  {showProviderColumn ? <th className="col-provider">{messages.providers.colProvider}</th> : null}
                  <th>{messages.providers.colSession}</th>
                  <th className="col-source">{messages.threadDetail.fieldSource}</th>
                  <th className="col-format">{messages.providers.colFormat}</th>
                  <th className="col-probe">{messages.providers.colProbe}</th>
                  <th className="col-modified">{messages.sessionDetail.fieldModified}</th>
                  <th className="col-size">{messages.providers.colSize}</th>
                </tr>
              </thead>
              <tbody>
                {renderedProviderSessionRows.map((row) => (
                  <tr
                    key={`${row.provider}-${row.session_id}-${row.file_path}`}
                    data-file-key={encodeURIComponent(row.file_path)}
                    className={[
                      selectedSessionPath === row.file_path ? "active-row" : "",
                      slowProviderSet.has(row.provider) ? "provider-slow-row" : "",
                    ].filter(Boolean).join(" ") || undefined}
                    onClick={() => {
                      setSelectedSessionPath(row.file_path);
                      setParserDetailProvider(row.provider);
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedProviderFiles[row.file_path])}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          setSelectedProviderFiles((prev) => ({ ...prev, [row.file_path]: e.target.checked }))
                        }
                      />
                    </td>
                    {showProviderColumn ? <td className="col-provider">{row.provider}</td> : null}
                    <td className="title-col">
                      <button
                        type="button"
                        className="table-link-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedSessionPath(row.file_path);
                          setParserDetailProvider(row.provider);
                        }}
                      >
                        <div className="title-main">{row.display_title || row.probe.detected_title || row.session_id}</div>
                        <div className="mono-sub">{row.session_id}</div>
                      </button>
                    </td>
                    <td className="col-source">{row.source}</td>
                    <td className="col-format">{row.probe.format}</td>
                    <td className="col-probe">{row.probe.ok ? messages.common.ok : messages.common.fail}</td>
                    <td className="col-modified">{formatDateTime(row.mtime)}</td>
                    <td className="col-size">{formatInteger(row.size_bytes)}</td>
                  </tr>
                ))}
                {providerSessionsLoading
                  ? Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
                      <tr key={`provider-session-skeleton-${idx}`}>
                        <td colSpan={showProviderColumn ? 8 : 7}>
                          <div className="skeleton-line" />
                        </td>
                      </tr>
                    ))
                  : null}
                {sortedProviderSessionRows.length === 0 && !providerSessionsLoading ? (
                  <tr>
                    <td colSpan={showProviderColumn ? 8 : 7} className="sub-hint">
                      {messages.providers.sessionsLoading}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {sortedProviderSessionRows.length > renderedProviderSessionRows.length ? (
            <div className="sub-toolbar">
              <button
                className="btn-outline"
                type="button"
                onClick={() => setRenderLimit((prev) => prev + 120)}
              >
                {messages.providers.loadMoreRows} {renderedProviderSessionRows.length}/{sortedProviderSessionRows.length}
              </button>
            </div>
          ) : null}
          {sessionFileActionResult ? (
            <section className="provider-result-grid">
              <article className="provider-result-card">
                <span className="overview-note-label">{messages.providers.actionResultTitle}</span>
                <strong>
                  {actionLabel(sessionFileActionResult.action)}
                  {sessionFileActionResult.dry_run ? ` · ${messages.providers.resultPreview}` : ""}
                </strong>
                <p>
                  {messages.providers.valid} {sessionFileActionResult.valid_count} · {messages.providers.applied}{" "}
                  {sessionFileActionResult.applied_count}
                  {typeof sessionFileActionResult.backed_up_count === "number"
                    ? ` · ${messages.providers.backedUp} ${sessionFileActionResult.backed_up_count}`
                    : ""}
                </p>
                {sessionFileActionResult.confirm_token_expected ? (
                  <code>{sessionFileActionResult.confirm_token_expected}</code>
                ) : null}
              </article>
              {sessionFileActionResult.backup_to ? (
                <article className="provider-result-card">
                  <span className="overview-note-label">{messages.providers.backupLocation}</span>
                  <strong className="mono-sub">{sessionFileActionResult.backup_to}</strong>
                  <p>
                    {sessionFileActionResult.backup_manifest_path
                      ? `${messages.providers.backupManifest}: ${sessionFileActionResult.backup_manifest_path}`
                      : messages.providers.backupReadyHint}
                  </p>
                </article>
              ) : null}
              {sessionFileActionResult.archived_to ? (
                <article className="provider-result-card">
                  <span className="overview-note-label">{messages.providers.archiveLocation}</span>
                  <strong className="mono-sub">{sessionFileActionResult.archived_to}</strong>
                  <p>{messages.providers.archiveReadyHint}</p>
                </article>
              ) : null}
            </section>
          ) : null}
          {csvExportedRows !== null ? (
            <div className="sub-toolbar">
              <span className="sub-hint">
                {messages.providers.csvExported} {csvExportedRows}
              </span>
            </div>
          ) : null}
        </section>

        <section className="provider-side-stack">
        {sessionDetailSlot}
        {advancedOpen ? (
        <details className="panel panel-disclosure" ref={parserSectionRef}>
          <summary>
            {messages.providers.parserTitle} · {messages.providers.score} {parserSummary.parse_score ?? "-"}
          </summary>
          <div className="panel-disclosure-body">
            <div className="sub-toolbar">
              <span className="sub-hint">{messages.providers.parserJumpHint}</span>
              {selectedSessionProvider ? (
                <span className="sub-hint">
                  {messages.providers.parserLinkedProvider} {selectedSessionProvider}
                  {!selectedSessionProviderVisibleInParser ? ` · ${messages.providers.parserLinkedHidden}` : ""}
                </span>
              ) : null}
            </div>
            <div className="sub-toolbar">
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={parserFailOnly}
                  onChange={(e) => setParserFailOnly(e.target.checked)}
                />
                {messages.providers.parserFailOnly}
              </label>
              <span className="sub-hint">
                {messages.providers.filteredRows} {filteredParserReports.length}/{parserReports.length}
              </span>
              <select
                className="filter-select"
                aria-label={messages.providers.parserSortLabel}
                value={parserSort}
                onChange={(e) => setParserSort(e.target.value as ParserSort)}
              >
                <option value="fail_desc">{messages.providers.parserSortFailDesc}</option>
                <option value="fail_asc">{messages.providers.parserSortFailAsc}</option>
                <option value="score_desc">{messages.providers.parserSortScoreDesc}</option>
                <option value="score_asc">{messages.providers.parserSortScoreAsc}</option>
                <option value="scan_ms_desc">{messages.providers.parserSortScanDesc}</option>
                <option value="scan_ms_asc">{messages.providers.parserSortScanAsc}</option>
                <option value="name_asc">{messages.providers.parserSortNameAsc}</option>
                <option value="name_desc">{messages.providers.parserSortNameDesc}</option>
              </select>
            </div>
            <div className="provider-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{messages.providers.colProvider}</th>
                    <th>{messages.providers.colStatus}</th>
                    <th>{messages.providers.colScanned}</th>
                    <th>{messages.providers.colScanMs}</th>
                    <th>{messages.providers.colParseOk}</th>
                    <th>{messages.providers.colParseFail}</th>
                    <th>{messages.providers.colScore}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedParserReports.map((report) => (
                    <tr
                      key={`parser-${report.provider}`}
                      data-parser-provider-key={encodeURIComponent(report.provider)}
                      className={[
                        "parser-jump-row",
                        selectedSessionProvider === report.provider ? "parser-linked-row" : "",
                        slowProviderSet.has(report.provider) ? "provider-slow-row" : "",
                      ].filter(Boolean).join(" ")}
                      role="button"
                      tabIndex={0}
                      onClick={() => jumpToProviderSessions(report.provider, Number(report.parse_fail))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          jumpToProviderSessions(report.provider, Number(report.parse_fail));
                        }
                      }}
                    >
                      <td>{report.name}</td>
                      <td>
                        <span className={`status-pill status-${report.status}`}>{statusLabel(report.status)}</span>
                      </td>
                      <td>{report.scanned}</td>
                      <td>{formatFetchMs(report.scan_ms ?? null)}</td>
                      <td>{report.parse_ok}</td>
                      <td>{report.parse_fail}</td>
                      <td>{report.parse_score ?? "-"}</td>
                    </tr>
                  ))}
                  {parserLoading
                    ? Array.from({ length: 4 }).map((_, idx) => (
                        <tr key={`parser-health-skeleton-${idx}`}>
                          <td colSpan={7}>
                            <div className="skeleton-line" />
                          </td>
                        </tr>
                      ))
                    : null}
                  {sortedParserReports.length === 0 && !parserLoading ? (
                    <tr>
                      <td colSpan={7} className="sub-hint">
                        {messages.providers.parserLoading}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="sub-toolbar">
              <label className="provider-quick-switch">
                <span>{messages.providers.parserDetailLabel}</span>
                <select
                  className="provider-quick-select"
                  value={parserDetailProvider}
                  onChange={(e) => setParserDetailProvider(e.target.value)}
                  disabled={parserReportsWithErrors.length === 0}
                >
                  {parserReportsWithErrors.length === 0 ? (
                    <option value="">{messages.providers.parserNoSampleErrors}</option>
                  ) : (
                    parserReportsWithErrors.map((report) => (
                      <option key={`parser-detail-${report.provider}`} value={report.provider}>
                        {report.name} ({report.sample_errors?.length ?? 0})
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
            <div className="parser-errors">
              {parserJumpStatus === "found" ? (
                <p className="sub-hint">{messages.providers.parserJumpFound}</p>
              ) : null}
              {parserJumpStatus === "not_found" ? (
                <p className="sub-hint">{messages.providers.parserJumpNotFound}</p>
              ) : null}
              {parserDetailReport?.sample_errors?.length ? (
                <>
                  <p className="sub-hint">
                    {messages.providers.parserSelectedErrors} {parserDetailReport.name}
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>{messages.providers.parserFieldSessionId}</th>
                        <th>{messages.providers.parserFieldFormat}</th>
                        <th>{messages.providers.parserFieldError}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parserDetailReport.sample_errors.map((entry, idx) => (
                        <tr
                          key={`parser-error-${parserDetailReport.provider}-${entry.session_id}-${idx}`}
                          className="parser-error-jump-row"
                          role="button"
                          tabIndex={0}
                          onClick={() => jumpToSessionFromParserError(parserDetailReport.provider, entry.session_id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              jumpToSessionFromParserError(parserDetailReport.provider, entry.session_id);
                            }
                          }}
                        >
                          <td className="mono-sub">{entry.session_id}</td>
                          <td>{entry.format}</td>
                          <td>{entry.error ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p className="sub-hint">{messages.providers.parserNoSampleErrors}</p>
              )}
            </div>
          </div>
        </details>
        ) : null}
        </section>
      </section>

      <details
        className="panel panel-disclosure provider-advanced-shell"
        open={advancedOpen}
        onToggle={(event) => {
          setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open);
        }}
      >
        <summary>
          {messages.providers.advancedTitle}
          <span className="panel-summary-subcopy"> · {messages.providers.advancedSubtitle}</span>
        </summary>
        <div className="panel-disclosure-body provider-advanced-stack">
      {advancedOpen ? (
        <>
      <section className="toolbar provider-diagnostics-toolbar">
        <button
          className="btn-outline"
          type="button"
          onClick={refreshProvidersData}
          disabled={providersRefreshing}
        >
          {providersRefreshing
            ? messages.providers.refreshing
            : messages.providers.refreshNow}
        </button>
        <span className="sub-hint">
          {providersLastRefreshAt
            ? `${messages.providers.lastRefresh} ${formatDateTime(providersLastRefreshAt)}`
            : "아직 새로고침 이력이 없어."}
        </span>
        <details className="inline-tools-disclosure">
          <summary>스캔 설정 / 느린 진단</summary>
          <div className="sub-toolbar inline-tools-disclosure-body">
            <label className="provider-quick-switch">
              <span>{messages.providers.depthLabel}</span>
              <select
                className="provider-quick-select"
                value={providerDataDepth}
                onChange={(e) => setProviderDataDepth(e.target.value as ProviderDataDepth)}
              >
                <option value="fast">{messages.providers.depthFast}</option>
                <option value="balanced">{messages.providers.depthBalanced}</option>
                <option value="deep">{messages.providers.depthDeep}</option>
              </select>
            </label>
            <label className="provider-quick-switch">
              <span>{messages.providers.slowThresholdLabel}</span>
              <select
                className="provider-quick-select"
                value={String(slowProviderThresholdMs)}
                onChange={(e) => {
                  const nextValue = Number(e.target.value);
                  if (Number.isFinite(nextValue)) setSlowProviderThresholdMs(nextValue);
                }}
              >
                {slowThresholdOptions.map((thresholdMs) => (
                  <option key={`slow-threshold-${thresholdMs}`} value={thresholdMs}>
                    {thresholdMs}ms
                  </option>
                ))}
              </select>
            </label>
            {canReturnHotspotScope ? (
              <button
                className="btn-outline"
                type="button"
                onClick={() => {
                  if (!hotspotScopeOrigin) return;
                  setProviderView(hotspotScopeOrigin);
                  setHotspotScopeOrigin(null);
                }}
              >
                {messages.providers.scopeReturn} {hotspotOriginLabel}
              </button>
            ) : null}
            <span className="sub-hint">
              {messages.providers.parserHint}
              {` · ${messages.providers.fetchMsLabel} `}
              {`${messages.providers.fetchMsDataSources} ${formatFetchMs(providerFetchMetrics.data_sources)}`}
              {` · ${messages.providers.fetchMsMatrix} ${formatFetchMs(providerFetchMetrics.matrix)}`}
              {` · ${messages.providers.fetchMsSessions} ${formatFetchMs(providerFetchMetrics.sessions)}`}
              {` · ${messages.providers.fetchMsParser} ${formatFetchMs(providerFetchMetrics.parser)}`}
              {` · ${messages.providers.slowProvidersLabel} ${slowProviderIds.length}/${providerTabCount}`}
              {` · ${messages.providers.slowThresholdLabel} ${slowProviderThresholdMs}ms`}
              {slowProviderIds.length > 0
                ? ` · ${slowProviderSummary}`
                : ` · ${messages.providers.slowProvidersNone}`}
              {hasSlowProviderFetch ? ` · ${messages.providers.fetchMsSlow}` : ""}
            </span>
          </div>
        </details>
      </section>

      <details className="panel panel-disclosure provider-panel">
        <summary>
          {messages.providers.matrixDisclosure} · {messages.providers.active}{" "}
          {providerSummary?.active ?? 0}/{providerSummary?.total ?? providers.length}
        </summary>
        <div className="panel-disclosure-body provider-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{messages.providers.colProvider}</th>
                <th>{messages.providers.colStatus}</th>
                <th>{messages.providers.colCapability}</th>
                <th>{messages.providers.colRead}</th>
                <th>{messages.providers.colAnalyze}</th>
                <th>{messages.providers.colSafeCleanup}</th>
                <th>{messages.providers.colHardDelete}</th>
                <th>{messages.providers.colLogs}</th>
                <th>{messages.providers.colNotes}</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => {
                const providerScanMs = providerTabById.get(p.provider as ProviderView)?.scan_ms ?? null;
                const providerSlow = slowProviderSet.has(p.provider);
                return (
                  <tr key={p.provider} className={providerSlow ? "provider-slow-row" : undefined}>
                    <td className="title-col">
                      <div className="provider-name-cell">
                        <span>{p.name}</span>
                        {providerSlow ? (
                          <span className="provider-slow-badge">
                            {messages.providers.slowProviderBadge}
                            {providerScanMs !== null ? ` ${formatFetchMs(providerScanMs)}` : ""}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="inline-link-btn"
                          onClick={() => jumpToProviderSessions(p.provider)}
                        >
                          {messages.providers.openSessions}
                        </button>
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill status-${p.status}`}>{statusLabel(p.status)}</span>
                    </td>
                    <td>{capabilityLevelLabel(p.capability_level)}</td>
                    <td>{p.capabilities.read_sessions ? messages.common.yes : "-"}</td>
                    <td>{p.capabilities.analyze_context ? messages.common.yes : "-"}</td>
                    <td>{p.capabilities.safe_cleanup ? messages.common.yes : "-"}</td>
                    <td>{p.capabilities.hard_delete ? messages.common.yes : "-"}</td>
                    <td>{p.evidence?.session_log_count ?? 0}</td>
                    <td className="notes-col">
                      <div>{p.status === "detected" && (p.evidence?.session_log_count ?? 0) === 0
                        ? messages.providers.installDetected
                        : p.evidence?.notes ?? "-"}</div>
                      <details className="provider-roots">
                        <summary>
                          {messages.providers.rootsLabel} ({p.evidence?.roots?.length ?? 0})
                        </summary>
                        <ul>
                          {(p.evidence?.roots ?? []).length === 0 ? (
                            <li className="mono-sub">{messages.providers.rootsNone}</li>
                          ) : (
                            (p.evidence?.roots ?? []).map((root) => (
                              <li key={`${p.provider}-${root}`} className="mono-sub">
                                {root}
                              </li>
                            ))
                          )}
                        </ul>
                      </details>
                    </td>
                  </tr>
                );
              })}
              {providerMatrixLoading
                ? Array.from({ length: 4 }).map((_, idx) => (
                    <tr key={`provider-matrix-skeleton-${idx}`}>
                      <td colSpan={9}>
                        <div className="skeleton-line" />
                      </td>
                    </tr>
                  ))
                : null}
              {providers.length === 0 && !providerMatrixLoading ? (
                <tr>
                  <td colSpan={9} className="sub-hint">
                    {messages.providers.matrixLoading}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>

      <details className="panel panel-disclosure">
        <summary>
          {messages.providers.dataSourcesDisclosure} · {messages.providers.dataSourcesDetected}{" "}
          {detectedDataSourceCount}/{dataSourceRows.length}
        </summary>
        <div className="panel-disclosure-body data-source-grid">
          {dataSourcesLoading && dataSourceRows.length === 0
            ? Array.from({ length: 6 }).map((_, idx) => (
                <div key={`data-source-skeleton-${idx}`} className="data-source-card">
                  <div className="skeleton-line" />
                </div>
              ))
            : dataSourceRows.map((row) => {
                const mappedProvider = providerFromDataSource(row.source_key);
                const canJump = canOpenProviderById(mappedProvider);
                return (
                  <article
                    key={`data-source-${row.source_key}`}
                    className={`data-source-card ${row.present ? "is-present" : "is-missing"}`}
                  >
                    <div className="data-source-top">
                      <strong>{dataSourceLabel(row.source_key)}</strong>
                      <div className="data-source-top-actions">
                        {canJump ? (
                          <button
                            type="button"
                            className="inline-link-btn"
                            onClick={() => jumpToProviderSessions(mappedProvider)}
                          >
                            {messages.providers.openSessions}
                          </button>
                        ) : null}
                        <span className={`status-pill ${row.present ? "status-active" : "status-missing"}`}>
                          {row.present ? messages.common.ok : messages.common.fail}
                        </span>
                      </div>
                    </div>
                    <div className="mono-sub data-source-path">{row.path || "-"}</div>
                    <div className="data-source-meta">
                      <span>
                        {messages.providers.dataSourcesFiles} {row.file_count}
                      </span>
                      <span>
                        {messages.providers.dataSourcesDirs} {row.dir_count}
                      </span>
                      <span>
                        {messages.providers.dataSourcesSize} {formatBytes(row.total_bytes)}
                      </span>
                      <span>
                        {messages.providers.dataSourcesUpdated} {formatDateTime(row.latest_mtime)}
                      </span>
                    </div>
                  </article>
                );
              })}
        </div>
      </details>

      {slowHotspotCards.length > 0 ? (
        <details className="panel panel-disclosure">
          <summary>
            {messages.providers.hotspotDisclosure} · {slowHotspotCards.length}/{providerTabCount}
          </summary>
          <div className="panel-disclosure-body">
            <div className="sub-toolbar">
              {!slowFocusActive ? (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={focusSlowProviders}
                >
                  {messages.providers.hotspotFocusSlow}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-outline"
                  onClick={clearSlowFocus}
                >
                  {messages.providers.hotspotClearFocus}
                </button>
              )}
            </div>
            <div className="hotspot-grid">
              {slowHotspotCards.map((card) => (
                <article key={`hotspot-${card.provider}`} className="hotspot-card">
                  <div className="hotspot-head">
                    <strong>{card.name}</strong>
                    <span className="provider-slow-badge">
                      {messages.providers.slowProviderBadge} {formatFetchMs(card.scanMs)}
                    </span>
                  </div>
                  <div className="hotspot-meta">
                    <span>{messages.providers.hotspotScan} {formatFetchMs(card.scanMs)}</span>
                    <span>{messages.providers.hotspotRows} {card.scanned}</span>
                    <span>{messages.providers.hotspotParseFail} {card.parseFail}</span>
                    <span>{messages.providers.score} {card.parseScore ?? "-"}</span>
                  </div>
                  <div className="hotspot-actions">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => jumpToProviderSessions(card.provider, card.parseFail, { fromHotspot: true })}
                    >
                      {messages.providers.openSessions}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => jumpToParserProvider(card.provider)}
                    >
                      {messages.providers.hotspotOpenParser}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </details>
      ) : null}

      <details className="panel panel-disclosure">
        <summary>
          {messages.providers.flowBoardTitle} · {messages.providers.flowBoardSubtitle} {visibleFlowCards.length}
        </summary>
        <div className="panel-disclosure-body provider-flow-board">
          {visibleFlowCards.map((card) => (
            <article
              key={`provider-flow-${card.providerId}`}
              className={`provider-flow-card ${card.parseFail > 0 ? "is-warning" : ""}`.trim()}
            >
              <div className="provider-flow-head">
                <div>
                  <strong>{card.name}</strong>
                  <div className="mono-sub">{card.providerId}</div>
                </div>
                <div className="provider-flow-head-meta">
                  {card.scanMs !== null ? (
                    <span className="provider-slow-badge">{formatFetchMs(card.scanMs)}</span>
                  ) : null}
                  <span className={`status-pill status-${card.status}`}>{statusLabel(card.status)}</span>
                </div>
              </div>

              <div className="provider-capability-row">
                <span className={`capability-chip ${card.canRead ? "is-on" : "is-off"}`}>{messages.providers.colRead}</span>
                <span className={`capability-chip ${card.canAnalyze ? "is-on" : "is-off"}`}>{messages.providers.colAnalyze}</span>
                <span className={`capability-chip ${card.canSafeCleanup ? "is-on" : "is-off"}`}>{messages.providers.colSafeCleanup}</span>
              </div>

              <div className="provider-flow-track">
                {card.flow.map((stage, idx) => (
                  <div key={`${card.providerId}-${stage.key}`} className="provider-flow-segment">
                    <div className={`provider-flow-node is-${stage.state}`}>
                      <span className="provider-flow-node-label">{stage.label}</span>
                      <span className="provider-flow-node-state">{flowStateLabel(stage.state)}</span>
                    </div>
                    {idx < card.flow.length - 1 ? <span className="provider-flow-arrow">→</span> : null}
                  </div>
                ))}
              </div>

              <div className="provider-flow-config-grid">
                <div className="provider-flow-config">
                  <h3>{messages.providers.configMapRoots}</h3>
                  <ul>
                    {card.roots.length === 0 ? (
                      <li className="mono-sub">{messages.providers.configMapNoRoots}</li>
                    ) : (
                      card.roots.slice(0, 3).map((root) => (
                        <li key={`${card.providerId}-root-${root}`} className="mono-sub provider-config-path" title={root}>
                          {root}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="provider-flow-config">
                  <h3>{messages.providers.configMapSources}</h3>
                  <ul>
                    {card.sources.length === 0 ? (
                      <li className="mono-sub">{messages.providers.configMapNoSources}</li>
                    ) : (
                      card.sources.slice(0, 3).map((source) => (
                        <li key={`${card.providerId}-source-${source.source_key}`}>
                          <strong>{dataSourceLabel(source.source_key)}</strong>
                          <span className="mono-sub provider-config-path" title={source.path}>
                            {source.path || "-"}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              <div className="provider-flow-actions">
                <span className="sub-hint">
                  {messages.providers.flowNextLabel} {card.nextStep}
                </span>
                <span className="sub-hint">
                  {messages.providers.dataSourcesDetected} {card.presentSourceCount}/{card.sources.length} · {messages.providers.rows} {card.sessionCount}
                  {card.parseFail > 0 ? ` · ${messages.providers.colParseFail} ${card.parseFail}` : ""}
                  {card.parseScore !== null ? ` · ${messages.providers.score} ${card.parseScore}` : ""}
                </span>
                <div className="provider-flow-button-group">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => jumpToProviderSessions(card.providerId, card.parseFail)}
                  >
                    {messages.providers.openSessions}
                  </button>
                  {card.parseFail > 0 ? (
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => jumpToParserProvider(card.providerId)}
                    >
                      {messages.providers.hotspotOpenParser}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </details>
        </>
      ) : (
        <div className="info-box compact">
          <strong>고급 진단은 선택 사항이야.</strong>
          <p>파서 실패, 느린 스캔, 경로 단위 디버깅이 필요할 때만 열어.</p>
        </div>
      )}
        </div>
      </details>
    </>
  );
}
