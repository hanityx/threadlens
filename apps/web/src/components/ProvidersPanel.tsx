import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Messages } from "../i18n";
import type {
  ProviderMatrixProvider,
  ProviderDataDepth,
  ProviderView,
  DataSourceInventoryRow,
  ProviderSessionRow,
  ProviderSessionActionResult,
} from "../types";
import { SKELETON_ROWS } from "../types";

type ProviderSessionSort = "mtime_desc" | "mtime_asc" | "size_desc" | "size_asc" | "title_asc" | "title_desc";
type ProviderProbeFilter = "all" | "ok" | "fail";
type ProviderSourceFilter = "all" | (string & {});
type ParserSort = "fail_desc" | "fail_asc" | "score_desc" | "score_asc" | "name_asc" | "name_desc";
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

function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }
  return raw;
}

function formatLocalDate(value: string): string {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return "-";
  return new Date(t).toLocaleString();
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
    const raw = window.localStorage.getItem("cmc-provider-csv-columns");
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

export interface ProvidersPanelProps {
  messages: Messages;

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
  providerView: ProviderView;
  setProviderView: (v: ProviderView) => void;
  providerDataDepth: ProviderDataDepth;
  setProviderDataDepth: (v: ProviderDataDepth) => void;

  providerSessionRows: ProviderSessionRow[];
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
  runProviderAction: (action: "archive_local" | "delete_local", dryRun: boolean) => void;
  providerActionData: ProviderSessionActionResult | null;

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
    providers,
    providerSummary,
    providerMatrixLoading,
    providerTabs,
    slowProviderIds,
    slowProviderThresholdMs,
    providerView,
    setProviderView,
    providerDataDepth,
    setProviderDataDepth,
    providerSessionRows,
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
    runProviderAction,
    providerActionData,
    parserReports,
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
  const [csvColumns, setCsvColumns] = useState<Record<CsvColumnKey, boolean>>(readCsvColumnPrefs);
  const providerSessionsSectionRef = useRef<HTMLElement | null>(null);
  const parserSectionRef = useRef<HTMLElement | null>(null);
  const [pendingSessionJump, setPendingSessionJump] = useState<{
    provider: string;
    sessionId: string;
  } | null>(null);
  const [pendingParserFocusProvider, setPendingParserFocusProvider] = useState<string>("");
  const [parserJumpStatus, setParserJumpStatus] = useState<"idle" | "found" | "not_found">("idle");

  const statusLabel = (status: "active" | "detected" | "missing") => {
    if (status === "active") return messages.providers.statusActive;
    if (status === "detected") return messages.providers.statusDetected;
    return messages.providers.statusMissing;
  };

  const actionLabel = (action: "archive_local" | "delete_local") => {
    if (action === "archive_local") return messages.providers.actionArchiveLocal;
    return messages.providers.actionDeleteLocal;
  };
  const dataSourceLabel = (sourceKey: string) =>
    sourceKey
      .replace(/_/g, " ")
      .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
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
  const slowProviderSet = useMemo(
    () => new Set(slowProviderIds),
    [slowProviderIds],
  );
  const providerTabById = useMemo(
    () => new Map(providerTabs.map((tab) => [tab.id, tab])),
    [providerTabs],
  );
  const slowProviderSummary = useMemo(() => {
    const names = slowProviderIds
      .map((providerId) => providerTabById.get(providerId as ProviderView)?.name ?? providerId)
      .slice(0, 3);
    return names.join(", ");
  }, [slowProviderIds, providerTabById]);
  const providerTabCount = providerTabs.filter((tab) => tab.id !== "all").length;
  const detectedDataSourceCount = dataSourceRows.filter((row) => row.present).length;
  const hasSlowProviderFetch =
    providerFetchMetrics.data_sources !== null && providerFetchMetrics.data_sources >= 1200 ||
    providerFetchMetrics.matrix !== null && providerFetchMetrics.matrix >= 1200 ||
    providerFetchMetrics.sessions !== null && providerFetchMetrics.sessions >= 1200 ||
    providerFetchMetrics.parser !== null && providerFetchMetrics.parser >= 1200;
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
  ]);
  const sortedProviderSessionRows = useMemo(() => {
    const rows = [...filteredProviderSessionRows];
    rows.sort((a, b) => {
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
    window.localStorage.setItem("cmc-provider-csv-columns", JSON.stringify(csvColumns));
  }, [csvColumns]);
  const filteredParserReports = useMemo(
    () => (parserFailOnly ? parserReports.filter((report) => Number(report.parse_fail) > 0) : parserReports),
    [parserReports, parserFailOnly],
  );
  const sortedParserReports = useMemo(() => {
    const rows = [...filteredParserReports];
    rows.sort((a, b) => {
      if (parserSort === "fail_desc") return Number(b.parse_fail) - Number(a.parse_fail);
      if (parserSort === "fail_asc") return Number(a.parse_fail) - Number(b.parse_fail);
      if (parserSort === "score_desc") return Number(b.parse_score ?? -1) - Number(a.parse_score ?? -1);
      if (parserSort === "score_asc") return Number(a.parse_score ?? 101) - Number(b.parse_score ?? 101);
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
  const selectedSessionParseFailCount = selectedSessionProvider
    ? parseFailByProvider[selectedSessionProvider]
    : undefined;

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

  const jumpToProviderSessions = (providerId: string, parseFail = 0) => {
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

  return (
    <>
      <section className="panel provider-panel">
        <header>
          <h2>{messages.providers.matrixTitle}</h2>
          <span>
            {messages.providers.active} {providerSummary?.active ?? 0}/{providerSummary?.total ?? providers.length}
          </span>
        </header>
        <div className="provider-table-wrap">
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
                    <td>{p.capability_level}</td>
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
      </section>

      <section className="panel">
        <header>
          <h2>{messages.providers.dataSourcesTitle}</h2>
          <span>
            {messages.providers.dataSourcesDetected} {detectedDataSourceCount}/{dataSourceRows.length}
          </span>
        </header>
        <div className="data-source-grid">
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
                        {messages.providers.dataSourcesUpdated} {formatLocalDate(row.latest_mtime)}
                      </span>
                    </div>
                  </article>
                );
              })}
        </div>
      </section>

      <section className="provider-tabs" role="tablist" aria-label={messages.providers.providerTabsLabel}>
        {providerTabs.map((tab) => (
          <button
            key={`provider-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={providerView === tab.id}
            className={`provider-tab ${providerView === tab.id ? "is-active" : ""} ${tab.is_slow ? "is-slow" : ""}`.trim()}
            onClick={() => setProviderView(tab.id)}
          >
            <span className="provider-tab-title">{tab.id === "all" ? messages.common.allAi : tab.name}</span>
            <span className="provider-tab-meta">
              {tab.scanned} {messages.providers.sessionsSuffix}
            </span>
            {tab.scan_ms !== null ? (
              <span className="provider-tab-meta">{formatFetchMs(tab.scan_ms)}</span>
            ) : null}
            {tab.is_slow ? (
              <span className="provider-slow-badge">{messages.providers.slowProviderBadge}</span>
            ) : null}
            <span className={`status-pill status-${tab.status}`}>{statusLabel(tab.status)}</span>
          </button>
        ))}
      </section>

      <section className="toolbar">
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
          {messages.providers.parserHint}
          {providersLastRefreshAt
            ? ` · ${messages.providers.lastRefresh} ${formatLocalDate(providersLastRefreshAt)}`
            : ""}
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
          <div className="sub-toolbar">
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
            <span className="sub-hint">
              {messages.providers.filteredRows} {sortedProviderSessionRows.length}/{providerSessionRows.length}
              {sortedProviderSessionRows.length > renderedProviderSessionRows.length
                ? ` · ${messages.providers.renderingWindow} ${renderedProviderSessionRows.length}/${sortedProviderSessionRows.length}`
                : ""}
            </span>
            <button
              className="btn-outline"
              type="button"
              disabled={sortedProviderSessionRows.length === 0 || enabledCsvColumns.length === 0}
              onClick={exportFilteredSessionsCsv}
            >
              {messages.providers.exportCsv}
            </button>
            <details>
              <summary>{messages.providers.csvColumns}</summary>
              <div className="sub-toolbar">
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
              <div className="sub-toolbar">
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
          <div className="sub-toolbar">
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
          </div>
          <div className="sub-toolbar">
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
              onClick={() => runProviderAction("delete_local", true)}
            >
              {messages.providers.deleteDryRun}
            </button>
            <button
              className="btn-accent"
              disabled={!canRunProviderAction || busy}
              onClick={() => runProviderAction("delete_local", false)}
            >
              {messages.providers.delete}
            </button>
            <span className="sub-hint">{messages.providers.alwaysDryRun}</span>
            {!canRunProviderAction && providerView !== "all" ? (
              <span className="sub-hint">{messages.providers.readOnlyHint}</span>
            ) : null}
          </div>
          <div className="provider-table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>{messages.providers.colProvider}</th>
                  <th>{messages.providers.colSession}</th>
                  <th>{messages.threadDetail.fieldSource}</th>
                  <th>{messages.providers.colFormat}</th>
                  <th>{messages.providers.colProbe}</th>
                  <th>{messages.sessionDetail.fieldModified}</th>
                  <th>{messages.providers.colSize}</th>
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
                    <td>{row.provider}</td>
                    <td className="title-col">
                      <div className="title-main">{row.display_title || row.probe.detected_title || row.session_id}</div>
                      <div className="mono-sub">{row.session_id}</div>
                    </td>
                    <td>{row.source}</td>
                    <td>{row.probe.format}</td>
                    <td>{row.probe.ok ? messages.common.ok : messages.common.fail}</td>
                    <td>{formatLocalDate(row.mtime)}</td>
                    <td>{row.size_bytes.toLocaleString()}</td>
                  </tr>
                ))}
                {providerSessionsLoading
                  ? Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
                      <tr key={`provider-session-skeleton-${idx}`}>
                        <td colSpan={8}>
                          <div className="skeleton-line" />
                        </td>
                      </tr>
                    ))
                  : null}
                {sortedProviderSessionRows.length === 0 && !providerSessionsLoading ? (
                  <tr>
                    <td colSpan={8} className="sub-hint">
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
          {providerActionData ? (
            <div className="sub-toolbar">
              <span className="sub-hint">
                {messages.providers.action} {actionLabel(providerActionData.action)} · {messages.providers.valid}{" "}
                {providerActionData.valid_count} · {messages.providers.applied} {providerActionData.applied_count} · {messages.providers.token}{" "}
                {providerActionData.confirm_token_expected}
              </span>
            </div>
          ) : null}
          {csvExportedRows !== null ? (
            <div className="sub-toolbar">
              <span className="sub-hint">
                {messages.providers.csvExported} {csvExportedRows}
              </span>
            </div>
          ) : null}
        </section>

        <section className="panel" ref={parserSectionRef}>
          <header>
            <h2>{messages.providers.parserTitle}</h2>
            <span>
              {messages.providers.score} {parserSummary.parse_score ?? "-"}
            </span>
          </header>
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
                    <td>{report.parse_ok}</td>
                    <td>{report.parse_fail}</td>
                    <td>{report.parse_score ?? "-"}</td>
                  </tr>
                ))}
                {parserLoading
                  ? Array.from({ length: 4 }).map((_, idx) => (
                      <tr key={`parser-health-skeleton-${idx}`}>
                        <td colSpan={6}>
                          <div className="skeleton-line" />
                        </td>
                      </tr>
                    ))
                  : null}
                {sortedParserReports.length === 0 && !parserLoading ? (
                  <tr>
                    <td colSpan={6} className="sub-hint">
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
        </section>
      </section>
    </>
  );
}
