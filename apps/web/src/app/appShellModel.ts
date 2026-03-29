import { useMemo } from "react";
import { SEARCHABLE_PROVIDER_IDS, SEARCHABLE_PROVIDER_LABELS } from "@threadlens/shared-contracts";
import { formatDateTime, formatProviderDisplayName } from "../lib/helpers";
import type {
  DataSourceInventoryRow,
  ProviderMatrixProvider,
  ProviderParserHealthReport,
  ProviderSessionRow,
  ProviderView,
  ThreadRow,
} from "../types";
import {
  compactWorkbenchId,
  formatWorkbenchGroupLabel,
  formatWorkbenchRailDay,
  formatWorkbenchRailTime,
  normalizeWorkbenchSessionTitle,
  normalizeWorkbenchTitle,
  providerFromSourceKey,
} from "./workbenchFormat";

const HIDDEN_PROVIDER_IDS = new Set(["chatgpt"]);
const OPTIONAL_PROVIDER_IDS = new Set(["copilot"]);
const PROVIDER_DISPLAY_ORDER = ["all", "codex", "claude", "gemini", "copilot"];

type ProviderTabLike = {
  id: ProviderView;
  name: string;
  status: "active" | "detected" | "missing";
};

type ParserSummary = {
  providers: number;
  scanned: number;
  parse_ok: number;
  parse_fail: number;
  parse_score: number | null;
};

type ProviderSessionSummary = {
  providers: number;
  rows: number;
  parse_ok: number;
  parse_fail: number;
};

export function buildSearchProviderOptions<T extends ProviderTabLike>(providerTabs: T[]) {
  return SEARCHABLE_PROVIDER_IDS.map((id) => ({
    id,
    name: SEARCHABLE_PROVIDER_LABELS[id],
  }));
}

export function buildVisibleProviderTabs<T extends ProviderTabLike>(providerTabs: T[]): T[] {
  const filtered = providerTabs.filter((tab) => tab.id === "all" || !HIDDEN_PROVIDER_IDS.has(tab.id));
  return [...filtered].sort((left, right) => {
    const leftIndex = PROVIDER_DISPLAY_ORDER.indexOf(left.id);
    const rightIndex = PROVIDER_DISPLAY_ORDER.indexOf(right.id);
    if (leftIndex !== -1 || rightIndex !== -1) {
      const safeLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const safeRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      if (safeLeft !== safeRight) return safeLeft - safeRight;
    }
    return left.name.localeCompare(right.name);
  });
}

export function buildVisibleProviderIds<T extends { id: ProviderView }>(
  visibleProviderTabs: T[],
  providerView: ProviderView,
): Array<Exclude<ProviderView, "all">> {
  return visibleProviderTabs
    .filter(
      (tab) => tab.id !== "all" && (providerView !== "all" || !OPTIONAL_PROVIDER_IDS.has(tab.id)),
    )
    .map((tab) => tab.id as Exclude<ProviderView, "all">);
}

export function buildVisibleProviderSummary<T extends ProviderTabLike>(
  visibleProviderTabs: T[],
  visibleProviders: ProviderMatrixProvider[],
) {
  const visibleTabs = visibleProviderTabs.filter((tab) => tab.id !== "all");
  if (visibleProviders.length === 0 && visibleTabs.length > 0) {
    return {
      total: visibleTabs.length,
      active: visibleTabs.filter((tab) => tab.status === "active").length,
      detected: visibleTabs.filter((tab) => tab.status === "detected").length,
    };
  }
  return {
    total: visibleProviders.length,
    active: visibleProviders.filter((provider) => provider.status === "active").length,
    detected: visibleProviders.filter((provider) => provider.status === "detected").length,
  };
}

export function buildVisibleProviderSessionSummary(options: {
  providerView: ProviderView;
  visibleProviderSessionRows: ProviderSessionRow[];
  visibleProviders: ProviderMatrixProvider[];
}): ProviderSessionSummary {
  const providersInRows = new Set(options.visibleProviderSessionRows.map((row) => row.provider));
  const parseOk = options.visibleProviderSessionRows.filter((row) => row.probe.ok).length;
  return {
    providers:
      options.providerView === "all" ? providersInRows.size || options.visibleProviders.length : 1,
    rows: options.visibleProviderSessionRows.length,
    parse_ok: parseOk,
    parse_fail: options.visibleProviderSessionRows.length - parseOk,
  };
}

export function buildVisibleParserSummary(
  visibleParserReports: ProviderParserHealthReport[],
): ParserSummary {
  const scanned = visibleParserReports.reduce((sum, report) => sum + Number(report.scanned || 0), 0);
  const parseOk = visibleParserReports.reduce(
    (sum, report) => sum + Number(report.parse_ok || 0),
    0,
  );
  const parseFail = visibleParserReports.reduce(
    (sum, report) => sum + Number(report.parse_fail || 0),
    0,
  );
  return {
    providers: visibleParserReports.length,
    scanned,
    parse_ok: parseOk,
    parse_fail: parseFail,
    parse_score: scanned ? Number(((parseOk / scanned) * 100).toFixed(1)) : null,
  };
}

function buildRecentThreadSummary(row: ThreadRow): string {
  const tags = new Set(row.risk_tags ?? []);
  const noWorkspace = tags.has("no-cwd");
  const orphanCandidate = tags.has("orphan-candidate");
  const contextHigh = tags.has("ctx-high");
  const contextMedium = tags.has("ctx-medium");
  const activity = row.activity_status || "recent";

  if (activity === "running" && contextHigh) {
    return "High-context session with active review work.";
  }
  if (row.risk_level === "high" && noWorkspace) {
    return "No cwd found. Check archive safety before cleanup.";
  }
  if (row.risk_level === "medium" && orphanCandidate) {
    return "Older session trail with weak workspace links.";
  }
  if (row.is_pinned) {
    return "Pinned for follow-up before archive or cleanup.";
  }
  if (contextMedium) {
    return "Workspace context drifted, but the thread still resolves.";
  }
  if (row.source === "sessions") {
    return "Session archive trace with local review context.";
  }
  return "Recent review trail from the local archive.";
}

function buildRecentThreadTitle(row: ThreadRow): string {
  const normalized = normalizeWorkbenchTitle(row.title, "");
  if (normalized) {
    // If the title looks like a file path, show only the last two segments
    const slashCount = (normalized.match(/\//g) ?? []).length;
    if (normalized.startsWith("/") || normalized.startsWith("~/") || slashCount >= 3) {
      const parts = normalized.replace(/\/$/, "").split("/").filter(Boolean);
      if (parts.length >= 2) return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
      if (parts.length === 1) return parts[0];
    }
    return normalized;
  }
  const tags = new Set(row.risk_tags ?? []);
  if (row.activity_status === "running" && tags.has("ctx-high")) return "Running Review Session";
  if (row.risk_level === "high" && tags.has("no-cwd")) return "No-Workspace Review";
  if (row.is_pinned && row.risk_level === "high") return "Pinned Review Thread";
  if (tags.has("orphan-candidate")) return "Archive Candidate";
  if (tags.has("ctx-medium")) return "Context Drift Note";
  if (row.risk_level === "high") return "Review Session Trace";
  if (row.risk_level === "medium") return "Review Candidate";
  return compactWorkbenchId(row.thread_id, "thread");
}

function buildRecentThreadGroups(recentThreadPreview: ThreadRow[]) {
  const groups: Array<{ label: string; rows: ThreadRow[] }> = [];
  for (const row of recentThreadPreview) {
    const label = formatWorkbenchGroupLabel(row.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.rows.push(row);
    } else {
      groups.push({ label, rows: [row] });
    }
  }
  return groups;
}

export function useAppShellModel(options: {
  layoutView: "overview" | "search" | "threads" | "providers";
  providerView: ProviderView;
  providersDiagnosticsOpen: boolean;
  providerTabs: Array<
    ProviderTabLike & {
      scanned: number;
      scan_ms: number | null;
      is_slow: boolean;
    }
  >;
  providers: ProviderMatrixProvider[];
  slowProviderIds: string[];
  providerSessionRows: ProviderSessionRow[];
  allProviderSessionRows: ProviderSessionRow[];
  parserReports: ProviderParserHealthReport[];
  allParserReports: ProviderParserHealthReport[];
  dataSourceRows: DataSourceInventoryRow[];
  selectedProviderFiles: Record<string, boolean>;
  runtimeLoading: boolean;
  recoveryLoading: boolean;
  threadsLoading: boolean;
  dataSourcesLoading: boolean;
  providerMatrixLoading: boolean;
  providerSessionsLoading: boolean;
  parserLoading: boolean;
  threadsFastBooting: boolean;
  providersRefreshing: boolean;
  refreshingAllData: boolean;
  providersLastRefreshAt: string;
  highRiskCount: number;
  visibleRows: ThreadRow[];
  selectedProviderLabel: string;
  runtimeBackendReachable: boolean | null | undefined;
  runtimeBackendLatencyMs: number | null | undefined;
  analyzeErrorKey: string;
  cleanupErrorKey: string;
  acknowledgedForensicsErrorKeys: { analyze: string; cleanup: string };
  runtimeError: boolean;
  smokeStatusError: boolean;
  recoveryError: boolean;
  providerMatrixError: boolean;
  providerSessionsError: boolean;
  providerParserHealthError: boolean;
  providerSessionActionError: boolean;
  bulkActionError: boolean;
  showRuntimeBackendDegraded: boolean;
  recoveryBackupSets: number;
}) {
  const visibleProviderTabs = useMemo(
    () => buildVisibleProviderTabs(options.providerTabs),
    [options.providerTabs],
  );
  const visibleProviderIds = useMemo(
    () => buildVisibleProviderIds(visibleProviderTabs, options.providerView),
    [options.providerView, visibleProviderTabs],
  );
  const visibleProviderIdSet = useMemo(
    () => new Set<string>(visibleProviderIds),
    [visibleProviderIds],
  );
  const visibleProviders = useMemo(
    () =>
      options.providers.filter((provider) => visibleProviderIdSet.has(provider.provider)),
    [options.providers, visibleProviderIdSet],
  );
  const visibleProviderSummary = useMemo(
    () => buildVisibleProviderSummary(visibleProviderTabs, visibleProviders),
    [visibleProviderTabs, visibleProviders],
  );
  const visibleSlowProviderIds = useMemo(
    () => options.slowProviderIds.filter((providerId) => visibleProviderIdSet.has(providerId)),
    [options.slowProviderIds, visibleProviderIdSet],
  );
  const visibleProviderSessionRows = useMemo(
    () =>
      options.providerSessionRows.filter((row) => visibleProviderIdSet.has(row.provider)),
    [options.providerSessionRows, visibleProviderIdSet],
  );
  const allVisibleProviderSessionRows = useMemo(
    () =>
      options.allProviderSessionRows.filter((row) => visibleProviderIdSet.has(row.provider)),
    [options.allProviderSessionRows, visibleProviderIdSet],
  );
  const visibleProviderSessionSummary = useMemo(
    () =>
      buildVisibleProviderSessionSummary({
        providerView: options.providerView,
        visibleProviderSessionRows,
        visibleProviders,
      }),
    [options.providerView, visibleProviderSessionRows, visibleProviders],
  );
  const overviewCountsLoading =
    options.runtimeLoading ||
    options.recoveryLoading ||
    options.threadsLoading ||
    options.dataSourcesLoading ||
    options.providerMatrixLoading ||
    options.providerSessionsLoading ||
    options.parserLoading ||
    options.threadsFastBooting ||
    options.providersRefreshing ||
    options.refreshingAllData;
  const overviewBooting =
    overviewCountsLoading &&
    visibleProviderSessionRows.length === 0 &&
    visibleProviderSummary.total === 0 &&
    visibleProviderSessionSummary.rows === 0;
  const activeSummaryText =
    visibleProviderSummary.total > 0
      ? `active ${visibleProviderSummary.active}/${visibleProviderSummary.total}`
      : overviewBooting
        ? "syncing"
        : overviewCountsLoading
          ? "active ..."
          : "active 0/0";
  const searchRowsText =
    visibleProviderSessionSummary.rows > 0
      ? `${visibleProviderSessionSummary.rows} rows`
      : overviewCountsLoading
        ? "... rows"
        : "0 rows";
  const reviewRowsText =
    options.highRiskCount > 0
      ? `${options.highRiskCount} review`
      : overviewCountsLoading
        ? "... review"
        : "0 review";
  const syncStatusText = options.refreshingAllData
    ? "Syncing now"
    : options.providersRefreshing
      ? "Refreshing providers"
      : options.providersLastRefreshAt
        ? `Updated ${formatDateTime(options.providersLastRefreshAt)}`
        : "Idle";
  const recentSessionPreview = useMemo(
    () =>
      [...visibleProviderSessionRows]
        .sort((left, right) => Date.parse(right.mtime || "") - Date.parse(left.mtime || ""))
        .slice(0, 4),
    [visibleProviderSessionRows],
  );
  const focusSession = recentSessionPreview[0] ?? null;
  const focusSessionTitle = focusSession
    ? normalizeWorkbenchSessionTitle(
        focusSession.display_title,
        compactWorkbenchId(focusSession.session_id, "session"),
      )
    : overviewBooting
      ? "Syncing sessions"
      : "Live archive ready";
  const focusSessionMeta = focusSession
    ? `${formatProviderDisplayName(focusSession.provider)} / ${formatWorkbenchRailTime(focusSession.mtime)} / ready`
    : overviewBooting
      ? "providers / parser / runtime"
      : "archive / live / ready";
  const focusSessionCommandId = focusSession
    ? compactWorkbenchId(focusSession.session_id, "session")
    : overviewBooting
      ? "session sync"
      : "session live";
  const focusSessionStatus = focusSession
    ? `${formatProviderDisplayName(focusSession.provider)} active · ${formatWorkbenchRailTime(focusSession.mtime)}`
    : overviewBooting
      ? "hydrating providers"
      : "archive ready";
  const emptySessionNextTitle = focusSession
    ? normalizeWorkbenchSessionTitle(
        focusSession.display_title,
        compactWorkbenchId(focusSession.session_id, "session"),
      )
    : "";
  const emptySessionNextPath = focusSession?.file_path ?? "";
  const visibleParserReports = useMemo(
    () => options.parserReports.filter((report) => visibleProviderIdSet.has(report.provider)),
    [options.parserReports, visibleProviderIdSet],
  );
  const allVisibleParserReports = useMemo(
    () => options.allParserReports.filter((report) => visibleProviderIdSet.has(report.provider)),
    [options.allParserReports, visibleProviderIdSet],
  );
  const visibleParserSummary = useMemo(
    () => buildVisibleParserSummary(visibleParserReports),
    [visibleParserReports],
  );
  const flaggedThreadPreview = useMemo(
    () =>
      [...options.visibleRows]
        .sort((left, right) => {
          const riskDiff = Number(right.risk_score || 0) - Number(left.risk_score || 0);
          if (riskDiff !== 0) return riskDiff;
          return Date.parse(right.timestamp || "") - Date.parse(left.timestamp || "");
        })
        .slice(0, 4),
    [options.visibleRows],
  );
  const focusReviewThread = flaggedThreadPreview[0] ?? null;
  const focusReviewTitle = focusReviewThread
    ? normalizeWorkbenchTitle(
        focusReviewThread.title,
        compactWorkbenchId(focusReviewThread.thread_id, "thread"),
      )
    : "Review queue idle";
  const focusReviewMeta = focusReviewThread
    ? `${focusReviewThread.source || "thread"} / ${focusReviewThread.risk_level || "review"} / ${formatWorkbenchRailDay(focusReviewThread.timestamp)}`
    : "review / quiet / recent";
  const secondaryFlaggedPreview = flaggedThreadPreview.slice(1, 3);
  const recentThreadPreview = useMemo(
    () =>
      [...options.visibleRows]
        .sort((left, right) => Date.parse(right.timestamp || "") - Date.parse(left.timestamp || ""))
        .slice(0, 4),
    [options.visibleRows],
  );
  const recentThreadGroups = useMemo(
    () => buildRecentThreadGroups(recentThreadPreview),
    [recentThreadPreview],
  );
  const activeProviderPreview = useMemo(
    () => visibleProviders.filter((provider) => provider.status === "active").slice(0, 4),
    [visibleProviders],
  );
  const activeProviderSummaryLine = activeProviderPreview.length
    ? activeProviderPreview.map((provider) => provider.name).join(" · ")
    : visibleProviderSummary.active > 0
      ? `${visibleProviderSummary.active} active providers`
      : overviewBooting
        ? "Loading provider status."
        : "Waiting for live providers.";
  const visibleDataSourceRows = useMemo(
    () =>
      options.dataSourceRows.filter((row) => {
        const providerId = providerFromSourceKey(row.source_key);
        return providerId ? visibleProviderIdSet.has(providerId) : true;
      }),
    [options.dataSourceRows, visibleProviderIdSet],
  );
  const visibleAllProviderRowsSelected =
    visibleProviderSessionRows.length > 0 &&
    visibleProviderSessionRows.every((row) => Boolean(options.selectedProviderFiles[row.file_path]));
  const searchProviderOptions = useMemo(
    () => buildSearchProviderOptions(options.providerTabs),
    [options.providerTabs],
  );
  const showSearch = options.layoutView === "search";
  const showProviders = options.layoutView === "providers";
  const showThreadsTable = options.layoutView === "threads";
  const showForensics = options.layoutView === "threads";
  const showRouting = options.layoutView === "providers" && options.providersDiagnosticsOpen;
  const showThreadDetail = options.layoutView === "threads";
  const showSessionDetail = options.layoutView === "providers";
  const showDetails = showThreadDetail || showSessionDetail;
  const showGlobalAnalyzeDeleteError =
    !showForensics &&
    !options.showRuntimeBackendDegraded &&
    Boolean(options.analyzeErrorKey) &&
    options.acknowledgedForensicsErrorKeys.analyze !== options.analyzeErrorKey;
  const showGlobalCleanupDryRunError =
    !showForensics &&
    !options.showRuntimeBackendDegraded &&
    Boolean(options.cleanupErrorKey) &&
    options.acknowledgedForensicsErrorKeys.cleanup !== options.cleanupErrorKey;
  const hasGlobalErrorStack =
    options.runtimeError ||
    options.smokeStatusError ||
    options.recoveryError ||
    options.providerMatrixError ||
    options.providerSessionsError ||
    options.providerParserHealthError ||
    Boolean(showGlobalAnalyzeDeleteError) ||
    Boolean(showGlobalCleanupDryRunError) ||
    options.providerSessionActionError ||
    Boolean(options.bulkActionError && !options.showRuntimeBackendDegraded);
  const parserScoreText = overviewBooting
    ? "syncing"
    : overviewCountsLoading
      ? "syncing"
      : visibleParserSummary.parse_score != null
        ? `${visibleParserSummary.parse_score}%`
        : "n/a";
  const runtimeLatencyText = overviewBooting
    ? "sync"
    : overviewCountsLoading
      ? "sync"
      : options.runtimeBackendReachable
        ? `${options.runtimeBackendLatencyMs ?? "-"} ms`
        : "down";

  return {
    visibleProviderTabs,
    visibleProviderIds,
    visibleProviderIdSet,
    visibleProviders,
    visibleProviderSummary,
    visibleSlowProviderIds,
    visibleProviderSessionRows,
    allVisibleProviderSessionRows,
    visibleProviderSessionSummary,
    overviewBooting,
    activeSummaryText,
    searchRowsText,
    reviewRowsText,
    syncStatusText,
    recentSessionPreview,
    focusSession,
    focusSessionTitle,
    focusSessionMeta,
    focusSessionCommandId,
    focusSessionStatus,
    emptySessionNextTitle,
    emptySessionNextPath,
    visibleParserReports,
    allVisibleParserReports,
    visibleParserSummary,
    focusReviewThread,
    focusReviewTitle,
    focusReviewMeta,
    secondaryFlaggedPreview,
    recentThreadGroups,
    recentThreadTitle: buildRecentThreadTitle,
    recentThreadSummary: buildRecentThreadSummary,
    activeProviderSummaryLine,
    visibleDataSourceRows,
    visibleAllProviderRowsSelected,
    searchProviderOptions,
    showSearch,
    showProviders,
    showThreadsTable,
    showForensics,
    showRouting,
    showThreadDetail,
    showSessionDetail,
    showDetails,
    showGlobalAnalyzeDeleteError,
    showGlobalCleanupDryRunError,
    hasGlobalErrorStack,
    parserScoreText,
    runtimeLatencyText,
    backupSetsCount: options.recoveryBackupSets,
  };
}
