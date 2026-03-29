import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ProviderView } from "../../types";
import type { ProviderSessionRow, ProviderSessionsEnvelope, ThreadRow } from "../../types";
import {
  compactWorkbenchId,
  formatWorkbenchRailTime,
  normalizeWorkbenchSessionTitle,
  normalizeWorkbenchTitle,
} from "../../app/workbenchFormat";
import { useAppContext } from "../../app/AppContext";
import { apiGet } from "../../api";
import { OverviewSetupStage } from "./OverviewSetupStage";
import { extractEnvelopeData, formatProviderDisplayName, parseNum } from "../../lib/helpers";
import { formatBytes, formatBytesCompact } from "../providers/helpers";
import {
  readStorageValue,
  SETUP_PREFERRED_PROVIDER_STORAGE_KEY,
  SETUP_SELECTION_STORAGE_KEY,
} from "../../hooks/appDataUtils";

function describeOverviewSessionSource(source: string): string {
  if (source === "sessions") return "Local archive";
  if (source === "projects") return "Project trace";
  if (source === "tmp") return "Workspace temp";
  return "Session trace";
}

function providerFromDataSource(sourceKey: string): string | null {
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
}

function readStoredSetupSelectionIds(allProviderIdSet: Set<string>): string[] {
  const raw = readStorageValue([SETUP_SELECTION_STORAGE_KEY]);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((item) => String(item || "").trim())
          .filter((item) => Boolean(item) && item !== "chatgpt" && allProviderIdSet.has(item)),
      ),
    );
  } catch {
    return [];
  }
}

function describeSessionHealthDot(row: ProviderSessionRow) {
  if (row.probe.ok) {
    return { label: "Readable session", className: "is-active" };
  }
  return { label: row.probe.error ? `Probe issue: ${row.probe.error}` : "Probe issue", className: "is-warn" };
}

function describeSessionFreshnessDot(row: ProviderSessionRow) {
  const timestamp = Date.parse(row.mtime || "");
  if (Number.isNaN(timestamp)) {
    return { label: "Unknown recency", className: "" };
  }
  const ageMs = Date.now() - timestamp;
  if (ageMs <= 24 * 60 * 60 * 1000) {
    return { label: "Fresh in the last 24 hours", className: "is-active" };
  }
  if (ageMs >= 7 * 24 * 60 * 60 * 1000) {
    return { label: "Stale for more than 7 days", className: "is-warn" };
  }
  return { label: "Recent within the last week", className: "" };
}

function describeSessionWeightDot(row: ProviderSessionRow) {
  const bytes = Number(row.size_bytes || 0);
  if (bytes >= 25 * 1024 * 1024) {
    return { label: `Heavy session footprint ${formatBytesCompact(bytes)}`, className: "is-active" };
  }
  if (bytes <= 512 * 1024) {
    return { label: `Light session footprint ${formatBytesCompact(bytes)}`, className: "" };
  }
  return { label: `Medium session footprint ${formatBytesCompact(bytes)}`, className: "" };
}

function buildInterleavedSessionPreview(
  rows: ProviderSessionRow[],
  preferredProviderId: string,
  limit: number,
): ProviderSessionRow[] {
  const grouped = new Map<string, ProviderSessionRow[]>();
  rows.forEach((row) => {
    const existing = grouped.get(row.provider);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(row.provider, [row]);
    }
  });
  grouped.forEach((group) =>
    group.sort((left, right) => Date.parse(right.mtime || "") - Date.parse(left.mtime || "")),
  );
  const providerOrder = Array.from(grouped.keys()).sort((left, right) => {
    if (left === preferredProviderId) return -1;
    if (right === preferredProviderId) return 1;
    return left.localeCompare(right);
  });
  const result: ProviderSessionRow[] = [];
  let index = 0;
  while (result.length < limit) {
    let added = false;
    for (const providerId of providerOrder) {
      const group = grouped.get(providerId) ?? [];
      const row = group[index];
      if (!row) continue;
      result.push(row);
      added = true;
      if (result.length >= limit) break;
    }
    if (!added) break;
    index += 1;
  }
  return result;
}

export function OverviewWorkbench() {
  const {
    setupGuideOpen,
    setSetupGuideOpen,
    changeLayoutView,
    changeProviderView,
    openProvidersHome,
    setProviderView,
    handleProvidersIntent,
    runtimeLatencyText,
    focusSessionCommandId,
    focusSessionStatus,
    visibleProviderSessionSummary,
    syncStatusText,
    focusSessionTitle,
    focusSessionMeta,
    overviewBooting,
    visibleProviderSummary,
    searchRowsText,
    reviewRowsText,
    recentSessionPreview,
    focusSession,
    focusReviewTitle,
    focusReviewMeta,
    focusReviewThread,
    secondaryFlaggedPreview,
    activeSummaryText,
    activeProviderSummaryLine,
    parserScoreText,
    backupSetsCount,
    recentThreadGroups,
    recentThreadTitle,
    recentThreadSummary,
    visibleProviders,
    providers: allProviders,
    visibleDataSourceRows,
    dataSourceRows: allDataSourceRows,
    visibleProviderSessionRows,
    allProviderSessionRows: allProviderSessionRowsRaw,
    visibleParserReports,
    allParserReports: allProviderParserReportsRaw,
    providersRefreshing,
    providersLastRefreshAt,
    refreshProvidersData,
    providerView,
    visibleProviderIdSet,
    setSelectedSessionPath,
    setSelectedThreadId,
    setProviderProbeFilterIntent,
  } = useAppContext();

  const onToggleSetupGuide = () => setSetupGuideOpen(!setupGuideOpen);
  const onCloseSetupGuide = () => setSetupGuideOpen(false);
  const onOpenThreads = () => changeLayoutView("threads");
  const onOpenProviders = () => openProvidersHome();
  const onOpenProvidersWithProbeFilter = (probeFilter: "all" | "fail") => {
    setProviderProbeFilterIntent(probeFilter);
    openProvidersHome();
  };
  const onProvidersIntent = handleProvidersIntent;
  const onOpenRecentSession = (row: ProviderSessionRow) => {
    changeProviderView(visibleProviderIdSet.has(row.provider) ? (row.provider as ProviderView) : "all");
    setSelectedSessionPath(row.file_path);
    changeLayoutView("providers");
  };
  const onOpenRecentThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    changeLayoutView("threads");
  };
  const totalVisibleSessionBytes = visibleProviderSessionRows.reduce(
    (sum, row) => sum + Number(row.size_bytes || 0),
    0,
  );
  const allProviderIdSet = new Set(allProviders.map((provider) => provider.provider));
  const storedSetupSelectionIds = readStoredSetupSelectionIds(allProviderIdSet);
  const overviewSelectedProviderIds = storedSetupSelectionIds.length
    ? storedSetupSelectionIds
    : providerView !== "all" && allProviderIdSet.has(providerView)
      ? [providerView]
      : [];
  const overviewSelectedProviderIdSet = new Set(overviewSelectedProviderIds);
  const storedPreferredProviderId = readStorageValue([SETUP_PREFERRED_PROVIDER_STORAGE_KEY]) ?? "";
  const overviewPrimaryProviderId =
    storedPreferredProviderId && overviewSelectedProviderIdSet.has(storedPreferredProviderId)
      ? storedPreferredProviderId
      : overviewSelectedProviderIds[0] ?? (providerView !== "all" ? providerView : "");
  const overviewProviderSessionQueries = useQueries({
    queries: overviewSelectedProviderIds.map((selectedProviderId) => ({
      queryKey: ["overview-provider-sessions", selectedProviderId],
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        apiGet<ProviderSessionsEnvelope>(
          `/api/provider-sessions?limit=60&provider=${encodeURIComponent(selectedProviderId)}`,
          { signal },
        ),
      enabled: overviewSelectedProviderIds.length > 1,
      staleTime: 30000,
      refetchOnWindowFocus: false,
      retry: 1,
    })),
  });
  const overviewQueriedSessionRows = useMemo(() => {
    if (overviewSelectedProviderIds.length <= 1) return [];
    return overviewProviderSessionQueries.flatMap((query) => {
      const data = extractEnvelopeData<NonNullable<ProviderSessionsEnvelope["data"]>>(query.data) ?? {};
      return data.rows ?? [];
    });
  }, [overviewProviderSessionQueries, overviewSelectedProviderIds.length]);
  const overviewSessionRows = useMemo(() => {
    const rows =
      overviewSelectedProviderIds.length > 1
        ? overviewQueriedSessionRows
        : overviewSelectedProviderIds.length
          ? allProviderSessionRowsRaw.filter((row) => overviewSelectedProviderIdSet.has(row.provider))
          : visibleProviderSessionRows;
    return [...rows].sort((left, right) => Date.parse(right.mtime || "") - Date.parse(left.mtime || ""));
  }, [
    allProviderSessionRowsRaw,
    overviewQueriedSessionRows,
    overviewSelectedProviderIdSet,
    overviewSelectedProviderIds.length,
    visibleProviderSessionRows,
  ]);
  const overviewPrimaryRows = useMemo(() => {
    if (!overviewPrimaryProviderId) return [];
    const sourceRows =
      overviewSelectedProviderIds.length > 1 && overviewQueriedSessionRows.length
        ? overviewQueriedSessionRows
        : allProviderSessionRowsRaw;
    return [...sourceRows]
      .filter((row) => row.provider === overviewPrimaryProviderId)
      .sort((left, right) => Date.parse(right.mtime || "") - Date.parse(left.mtime || ""));
  }, [
    allProviderSessionRowsRaw,
    overviewPrimaryProviderId,
    overviewQueriedSessionRows,
    overviewSelectedProviderIds.length,
  ]);
  const overviewFocusSession = overviewPrimaryRows[0] ?? overviewSessionRows[0] ?? focusSession;
  const overviewRecentSessionPreview = useMemo(
    () =>
      overviewSelectedProviderIds.length > 1
        ? buildInterleavedSessionPreview(overviewSessionRows, overviewPrimaryProviderId, 4)
        : overviewSessionRows.slice(0, 4),
    [overviewPrimaryProviderId, overviewSelectedProviderIds.length, overviewSessionRows],
  );
  const overviewSessionCount = useMemo(() => {
    if (!overviewSelectedProviderIds.length) return visibleProviderSessionSummary.rows;
    const total = allProviders.reduce((sum, provider) => {
      if (!overviewSelectedProviderIdSet.has(provider.provider)) return sum;
      return sum + Math.max(0, Number(provider.evidence?.session_log_count ?? 0));
    }, 0);
    return total || overviewSessionRows.length;
  }, [
    allProviders,
    overviewSelectedProviderIdSet,
    overviewSelectedProviderIds.length,
    overviewSessionRows.length,
    visibleProviderSessionSummary.rows,
  ]);
  const overviewSessionBytes = useMemo(() => {
    if (!overviewSelectedProviderIds.length) return totalVisibleSessionBytes;
    const total = allDataSourceRows.reduce((sum, row) => {
      if (!row.present) return sum;
      const providerId = providerFromDataSource(row.source_key);
      if (!providerId || !overviewSelectedProviderIdSet.has(providerId)) return sum;
      return sum + Number(row.total_bytes || 0);
    }, 0);
    return total || overviewSessionRows.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0);
  }, [
    allDataSourceRows,
    overviewSelectedProviderIdSet,
    overviewSelectedProviderIds.length,
    overviewSessionRows,
    totalVisibleSessionBytes,
  ]);
  const overviewParseOk = useMemo(() => {
    if (!overviewSelectedProviderIds.length) return visibleProviderSessionSummary.parse_ok;
    return allProviderParserReportsRaw.reduce((sum, report) => {
      if (!overviewSelectedProviderIdSet.has(report.provider)) return sum;
      return sum + parseNum(report.parse_ok);
    }, 0);
  }, [
    allProviderParserReportsRaw,
    overviewSelectedProviderIdSet,
    overviewSelectedProviderIds.length,
    visibleProviderSessionSummary.parse_ok,
  ]);
  const overviewParseFail = useMemo(() => {
    if (!overviewSelectedProviderIds.length) return visibleProviderSessionSummary.parse_fail;
    return allProviderParserReportsRaw.reduce((sum, report) => {
      if (!overviewSelectedProviderIdSet.has(report.provider)) return sum;
      return sum + parseNum(report.parse_fail);
    }, 0);
  }, [
    allProviderParserReportsRaw,
    overviewSelectedProviderIdSet,
    overviewSelectedProviderIds.length,
    visibleProviderSessionSummary.parse_fail,
  ]);
  const overviewParserScoreText = useMemo(() => {
    if (!overviewSelectedProviderIds.length) return parserScoreText;
    const scanned = overviewParseOk + overviewParseFail;
    if (scanned <= 0) return parserScoreText;
    return `${Number(((overviewParseOk / scanned) * 100).toFixed(1))}%`;
  }, [
    overviewParseFail,
    overviewParseOk,
    overviewSelectedProviderIds.length,
    parserScoreText,
  ]);
  const overviewActiveProviderCount = overviewSelectedProviderIds.length
    ? allProviders.filter(
        (provider) =>
          overviewSelectedProviderIdSet.has(provider.provider) && provider.status === "active",
      ).length
    : visibleProviderSummary.active;
  const overviewSelectedProviderLabels = overviewSelectedProviderIds
    .map((providerId) => formatProviderDisplayName(providerId))
    .filter(Boolean);
  const overviewActiveSummary = overviewSelectedProviderIds.length
    ? `active ${overviewActiveProviderCount}/${overviewSelectedProviderIds.length}`
    : activeSummaryText;
  const overviewActiveSummaryLine = overviewSelectedProviderIds.length
    ? overviewSelectedProviderLabels.join(" · ")
    : activeProviderSummaryLine;
  const showRecentSessionsRail = overviewSelectedProviderIds.length > 0;
  const getRecentThreadTitle = recentThreadTitle;
  const getRecentThreadSummary = recentThreadSummary;
  const setupStageContent = (
    <OverviewSetupStage
      providers={allProviders}
      dataSourceRows={allDataSourceRows}
      providerSessionRows={allProviderSessionRowsRaw}
      parserReports={allProviderParserReportsRaw}
      providersRefreshing={providersRefreshing}
      providersLastRefreshAt={providersLastRefreshAt}
      onRefresh={refreshProvidersData}
      onOpenProviders={(providerId) => {
        if (providerId && allProviderIdSet.has(providerId)) {
          changeProviderView(providerId as ProviderView);
        } else {
          changeProviderView("all");
        }
        changeLayoutView("providers");
      }}
      onOpenSearch={() => changeLayoutView("search")}
      onClose={onCloseSetupGuide}
      onApplyPreferredSelection={(selection) => {
        setProviderView(
          allProviderIdSet.has(selection.providerView)
            ? (selection.providerView as ProviderView)
            : "all",
        );
      }}
    />
  );
 
  return (
    <section className="overview-workbench">
      {!setupGuideOpen ? (
        <div className="overview-workbench-grid">
          <section className="panel overview-stage overview-main-canvas">
            <div className="overview-stage-header overview-main-head">
              <div className="overview-stage-title overview-main-title">
                <h1>ThreadLens</h1>
                <p>Review sessions. Clear backup queue.</p>
              </div>
              <div className="overview-header-actions">
                <button
                  type="button"
                  className="overview-header-btn is-primary"
                  onClick={onToggleSetupGuide}
                >
                  {setupGuideOpen ? "Close setup" : "Setup"}
                </button>
                <button
                  type="button"
                  className="overview-header-btn"
                  onClick={onOpenThreads}
                >
                  Thread
                </button>
                <button
                  type="button"
                  className="overview-header-btn is-quiet"
                  onClick={onOpenProviders}
                  onMouseEnter={onProvidersIntent}
                  onFocus={onProvidersIntent}
                >
                  Sessions
                </button>
              </div>
            </div>

            <div className="overview-stage-layout overview-stage-layout-workbench">
              <section className="overview-command-shell" aria-label="workbench command shell">
                <div className="overview-window-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="overview-command-breadcrumb">
                  <span className="overview-command-path is-brand">threadlens</span>
                  <span className="overview-command-slash">/</span>
                  <span className="overview-command-path">sessions</span>
                  <span className="overview-command-slash">/</span>
                  <span className="overview-command-path is-active">active</span>
                  <span className="overview-command-runtime">{runtimeLatencyText}</span>
                </div>
                <div className="overview-command-strip">
                  {overviewFocusSession ? (
                    <button
                      type="button"
                      className="overview-command-summary overview-command-summary-button"
                      onClick={() => onOpenRecentSession(overviewFocusSession)}
                    >
                      <strong>
                        {compactWorkbenchId(overviewFocusSession.session_id, "session")}
                      </strong>
                      <span>
                        {formatProviderDisplayName(overviewFocusSession.provider)} active · {formatWorkbenchRailTime(overviewFocusSession.mtime)}
                      </span>
                    </button>
                  ) : (
                    <div className="overview-command-summary">
                      <strong>{focusSessionCommandId}</strong>
                      <span>{focusSessionStatus}</span>
                    </div>
                  )}
                  <div className="overview-command-metrics" aria-label="workbench status">
                    <span>
                      <button
                        type="button"
                        className="overview-command-status-button"
                        onClick={() => onOpenProvidersWithProbeFilter("all")}
                      >
                        <strong>{overviewSelectedProviderIds.length ? overviewParseOk : visibleProviderSessionSummary.parse_ok}</strong> ready
                      </button>
                    </span>
                    <span>
                      <button
                        type="button"
                        className="overview-command-status-button"
                        onClick={() => onOpenProvidersWithProbeFilter("fail")}
                      >
                        <strong>{overviewSelectedProviderIds.length ? overviewParseFail : visibleProviderSessionSummary.parse_fail}</strong> fail
                      </button>
                    </span>
                  </div>
                </div>
              </section>

              <div className="overview-insight-grid">
                <article className="overview-insight-card is-primary">
                  <div className="overview-primary-panel-grid">
                    <div className="overview-primary-copy">
                      <span className="overview-note-label">active session</span>
                      {overviewFocusSession ? (
                        <button
                          type="button"
                          className="overview-primary-focus-link"
                          onClick={() => onOpenRecentSession(overviewFocusSession)}
                        >
                          <strong className="overview-primary-focus-title">
                            {normalizeWorkbenchSessionTitle(
                              overviewFocusSession.display_title,
                              compactWorkbenchId(overviewFocusSession.session_id, "session"),
                            )}
                          </strong>
                          <div className="overview-primary-focus-meta">
                            {formatProviderDisplayName(overviewFocusSession.provider)} / {formatWorkbenchRailTime(overviewFocusSession.mtime)} / ready
                          </div>
                          <p className="overview-primary-summary">
                            {overviewBooting
                              ? "Loading recent sessions, parser health, and active providers."
                              : `${overviewSelectedProviderIds.length ? overviewParseOk : visibleProviderSessionSummary.parse_ok}/${overviewSelectedProviderIds.length ? overviewSessionCount : visibleProviderSessionSummary.rows || "..."} ready across ${overviewActiveProviderCount || "..."} active AI. Search, review, or open the archive next.`}
                          </p>
                        </button>
                      ) : (
                        <>
                          <strong className="overview-primary-focus-title">{focusSessionTitle}</strong>
                          <div className="overview-primary-focus-meta">{focusSessionMeta}</div>
                          <p className="overview-primary-summary">
                            {overviewBooting
                              ? "Loading recent sessions, parser health, and active providers."
                              : `${overviewSelectedProviderIds.length ? overviewParseOk : visibleProviderSessionSummary.parse_ok}/${overviewSelectedProviderIds.length ? overviewSessionCount : visibleProviderSessionSummary.rows || "..."} ready across ${overviewActiveProviderCount || "..."} active AI. Search, review, or open the archive next.`}
                          </p>
                        </>
                      )}
                      <div className="overview-primary-focus-kpis" aria-label="focus session summary">
                        <article>
                          <span>rows</span>
                          <strong>{overviewSelectedProviderIds.length ? `${overviewSessionCount} rows` : searchRowsText}</strong>
                        </article>
                        <article>
                          <span>size</span>
                          <strong>{formatBytes(overviewSelectedProviderIds.length ? overviewSessionBytes : totalVisibleSessionBytes)}</strong>
                        </article>
                      </div>
                      {overviewFocusSession ? (
                        <div className="overview-primary-facts" aria-label="active session facts">
                          <span>{describeOverviewSessionSource(overviewFocusSession.source)}</span>
                          <span>Updated {formatWorkbenchRailTime(overviewFocusSession.mtime)}</span>
                          <span>{formatBytesCompact(overviewFocusSession.size_bytes)}</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="overview-primary-list">
                      <span className="overview-note-label">ready now</span>
                      <div className="overview-primary-list-items">
                        {overviewRecentSessionPreview.length ? (
                          overviewRecentSessionPreview.slice(0, 3).map((row) => (
                            <button
                              key={`overview-primary-ready-${row.file_path}`}
                              type="button"
                              className="overview-primary-list-item"
                              onClick={() => onOpenRecentSession(row)}
                            >
                              <strong>
                                {normalizeWorkbenchSessionTitle(
                                  row.display_title,
                                  compactWorkbenchId(row.session_id, "session"),
                                )}
                              </strong>
                              <span>
                                {formatProviderDisplayName(row.provider)} · {formatWorkbenchRailTime(row.mtime)}
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="overview-primary-list-empty">
                            {overviewBooting ? "Syncing recent rows." : "No recent sessions yet."}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
                <div className="overview-support-stack">
                  <article
                    className="overview-insight-card is-review is-clickable"
                    role="button"
                    tabIndex={0}
                    onClick={onOpenThreads}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenThreads();
                      }
                    }}
                  >
                    <div className="overview-review-head">
                      <span className="overview-note-label">review queue</span>
                      <span className="overview-review-pill">{reviewRowsText}</span>
                    </div>
                    {focusReviewThread ? (
                      <button
                        type="button"
                        className="overview-review-focus overview-review-focus-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenRecentThread(focusReviewThread.thread_id);
                        }}
                      >
                        <div className="overview-review-title">{focusReviewTitle}</div>
                        <div className="overview-review-meta">{focusReviewMeta}</div>
                      </button>
                    ) : (
                      <div className="overview-review-focus">
                        <div className="overview-review-title">{focusReviewTitle}</div>
                        <div className="overview-review-meta">{focusReviewMeta}</div>
                      </div>
                    )}
                    {secondaryFlaggedPreview.length ? (
                      <div className="overview-review-list">
                        {secondaryFlaggedPreview.map((row) => (
                          <button
                            key={`overview-review-secondary-${row.thread_id}`}
                            type="button"
                            className="overview-review-list-item"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenRecentThread(row.thread_id);
                            }}
                          >
                            <strong>
                              {normalizeWorkbenchTitle(
                                row.title,
                                compactWorkbenchId(row.thread_id, "thread"),
                              )}
                            </strong>
                            <span>
                              {row.source || "thread"} / {row.risk_level || compactWorkbenchId(row.thread_id, "thread")}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p>No additional review threads.</p>
                    )}
                  </article>
                  <div className="overview-support-mini-grid">
                    <article className="overview-insight-card is-mini">
                      <span className="overview-note-label">providers</span>
                      <strong>{overviewActiveSummary}</strong>
                      <p>{overviewActiveSummaryLine}</p>
                    </article>
                    <article className="overview-insight-card is-mini">
                      <span className="overview-note-label">sync</span>
                      <strong>{parserScoreText}</strong>
                      <p>
                        {overviewBooting
                          ? "Loading parser and runtime."
                          : `${backupSetsCount} backups · runtime ${runtimeLatencyText}`}
                      </p>
                    </article>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="overview-side-rail">
            <section className="overview-side-card overview-side-card-history">
              <div className="overview-side-head is-history">
                <div className="overview-side-headline">
                  <span className="overview-side-head-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path
                        d="M12 8v5l3 2m5-3a8 8 0 1 1-2.34-5.66M20 4v4h-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <strong>Recent Activity</strong>
                </div>
              </div>
              <div className="overview-side-list overview-side-list-history">
                {showRecentSessionsRail ? (
                  overviewRecentSessionPreview.length ? (
                    <section className="overview-side-group">
                      <div className="overview-side-group-head">
                        <span>Today</span>
                      </div>
                      <div className="overview-side-group-list">
                        {overviewRecentSessionPreview.slice(0, 4).map((row) => {
                          const healthDot = describeSessionHealthDot(row);
                          const freshnessDot = describeSessionFreshnessDot(row);
                          const weightDot = describeSessionWeightDot(row);
                          return (
                          <button
                            key={`overview-session-${row.file_path}`}
                            type="button"
                            className="overview-side-item overview-side-item-history"
                            onClick={() => onOpenRecentSession(row)}
                          >
                            <div className="overview-side-item-meta">
                              <span>{formatWorkbenchRailTime(row.mtime)}</span>
                            </div>
                            <div className="overview-side-item-copy">
                              <strong>
                                {normalizeWorkbenchSessionTitle(
                                  row.display_title,
                                  compactWorkbenchId(row.session_id, "session"),
                                )}
                              </strong>
                              <p>
                                {formatProviderDisplayName(row.provider)} / {describeOverviewSessionSource(row.source)}
                              </p>
                            </div>
                            <div
                              className="overview-side-item-dots"
                              aria-label={`${healthDot.label}. ${freshnessDot.label}. ${weightDot.label}.`}
                            >
                              <span className={healthDot.className} title={healthDot.label} />
                              <span className={freshnessDot.className} title={freshnessDot.label} />
                              <span className={weightDot.className} title={weightDot.label} />
                            </div>
                          </button>
                          );
                        })}
                      </div>
                    </section>
                  ) : (
                    <div className="overview-side-empty">
                      {overviewBooting ? "Syncing recent rows." : "No recent sessions yet."}
                    </div>
                  )
                ) : recentThreadGroups.length ? (
                  recentThreadGroups.map((group) => (
                    <section key={`overview-thread-group-${group.label}`} className="overview-side-group">
                      <div className="overview-side-group-head">
                        <span>{group.label}</span>
                      </div>
                      <div className="overview-side-group-list">
                        {group.rows.map((row) => (
                          <button
                            key={`overview-thread-${row.thread_id}`}
                            type="button"
                            className="overview-side-item overview-side-item-history"
                            onClick={() => onOpenRecentThread(row.thread_id)}
                          >
                            <div className="overview-side-item-meta">
                              <span>{formatWorkbenchRailTime(row.timestamp)}</span>
                            </div>
                            <div className="overview-side-item-copy">
                              <strong>{getRecentThreadTitle(row)}</strong>
                              <p>{getRecentThreadSummary(row)}</p>
                            </div>
                            <div className="overview-side-item-dots" aria-hidden="true">
                              <span className={row.risk_level === "high" ? "is-active" : ""} />
                              <span className={row.is_pinned ? "is-active" : ""} />
                              <span className={row.activity_status === "active" ? "is-active" : ""} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))
                ) : (
                  <div className="overview-side-empty">Waiting for threads.</div>
                )}
              </div>
            </section>

          </aside>
        </div>
      ) : (
        <section className="overview-secondary-panel overview-setup-stage" aria-label="setup stage">
          <div className="overview-secondary-body">{setupStageContent}</div>
        </section>
      )}
    </section>
  );
}
