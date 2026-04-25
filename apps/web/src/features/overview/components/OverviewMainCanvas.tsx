import type { Messages } from "@/i18n";
import type { ProviderSessionRow, ThreadRow } from "@/shared/types";
import { Card } from "@/shared/ui/components/Card";
import { compactWorkbenchId, formatWorkbenchRailTime, normalizeWorkbenchSessionTitle, normalizeWorkbenchTitle } from "@/app/model/workbenchFormat";
import { formatBytes, formatBytesCompact, formatProviderDisplayName } from "@/shared/lib/format";
import {
  describeOverviewSessionSource,
  formatOverviewMessage,
  formatOverviewReviewRisk,
  formatOverviewReviewSource,
} from "@/features/overview/model/overviewWorkbenchModel";

type OverviewMainCanvasProps = {
  messages: Messages;
  overviewMessages: Messages["overview"];
  setupGuideOpen: boolean;
  overviewBooting: boolean;
  runtimeLatencyText: string;
  runtimeStatusText: string;
  syncStatusText: string;
  backupSetsCount: number;
  reviewRowsText: string;
  searchRowsText: string;
  parserScoreText: string;
  focusSessionTitle: string;
  focusSessionMeta: string;
  overviewFocusSession: ProviderSessionRow | null | undefined;
  focusSessionCommandId: string;
  focusSessionStatus: string;
  overviewSelectedProviderIds: string[];
  overviewParseOk: number;
  overviewParseFail: number;
  visibleProviderSessionSummary: { parse_ok: number; parse_fail: number; rows: number };
  overviewSessionCount: number;
  overviewActiveProviderCount: number;
  overviewSessionBytes: number;
  totalVisibleSessionBytes: number;
  overviewRecentSessionPreview: ProviderSessionRow[];
  focusReviewThread: ThreadRow | null | undefined;
  focusReviewTitle: string;
  focusReviewMeta: string;
  secondaryFlaggedPreview: ThreadRow[];
  recentThreadTitle: (row: ThreadRow) => string;
  overviewActiveSummary: string;
  overviewActiveSummaryLine: string;
  onToggleSetupGuide: () => void;
  onOpenThreads: () => void;
  onOpenProviders: () => void;
  onProvidersIntent: () => void;
  onOpenProvidersWithProbeFilter: (probeFilter: "all" | "fail") => void;
  onOpenRecentSession: (row: ProviderSessionRow) => void;
  onOpenRecentThread: (threadId: string) => void;
};

export function OverviewMainCanvas({
  messages,
  overviewMessages,
  setupGuideOpen,
  overviewBooting,
  runtimeLatencyText,
  runtimeStatusText,
  syncStatusText,
  backupSetsCount,
  reviewRowsText,
  searchRowsText,
  parserScoreText,
  focusSessionTitle,
  focusSessionMeta,
  overviewFocusSession,
  focusSessionCommandId,
  focusSessionStatus,
  overviewSelectedProviderIds,
  overviewParseOk,
  overviewParseFail,
  visibleProviderSessionSummary,
  overviewSessionCount,
  overviewActiveProviderCount,
  overviewSessionBytes,
  totalVisibleSessionBytes,
  overviewRecentSessionPreview,
  focusReviewThread,
  focusReviewTitle,
  focusReviewMeta,
  secondaryFlaggedPreview,
  recentThreadTitle,
  overviewActiveSummary,
  overviewActiveSummaryLine,
  onToggleSetupGuide,
  onOpenThreads,
  onOpenProviders,
  onProvidersIntent,
  onOpenProvidersWithProbeFilter,
  onOpenRecentSession,
  onOpenRecentThread,
}: OverviewMainCanvasProps) {
  return (
    <section className="panel overview-stage overview-main-canvas">
      <div className="overview-stage-header overview-main-head">
        <div className="overview-stage-title overview-main-title">
          <h1>ThreadLens</h1>
          <p>{messages.overview.heroBody}</p>
        </div>
        <div className="overview-header-actions">
          <button
            type="button"
            className="overview-header-btn is-primary"
            onClick={onToggleSetupGuide}
          >
            {setupGuideOpen ? messages.overview.closeSetup : messages.overview.openSetup}
          </button>
          <button
            type="button"
            className="overview-header-btn"
            onClick={onOpenThreads}
          >
            {messages.overview.openThreads}
          </button>
          <button
            type="button"
            className="overview-header-btn is-quiet"
            onClick={onOpenProviders}
            onMouseEnter={onProvidersIntent}
            onFocus={onProvidersIntent}
          >
            {messages.overview.openSessions}
          </button>
        </div>
      </div>

      <div className="overview-stage-layout overview-stage-layout-workbench">
        <section className="overview-command-shell" aria-label={overviewMessages.commandShellLabel}>
          <div className="overview-window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="overview-command-breadcrumb">
            <span className="overview-command-path is-brand">threadlens</span>
            <span className="overview-command-slash">/</span>
            <span className="overview-command-path">{overviewMessages.commandPathSessions}</span>
            <span className="overview-command-slash">/</span>
            <span className="overview-command-path is-active">{overviewMessages.commandPathActive}</span>
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
                  {formatProviderDisplayName(overviewFocusSession.provider)} {overviewMessages.activeMetaReady} · {formatWorkbenchRailTime(overviewFocusSession.mtime)}
                </span>
              </button>
            ) : (
              <div className="overview-command-summary">
                <strong>{focusSessionCommandId}</strong>
                <span>{focusSessionStatus}</span>
              </div>
            )}
            <div className="overview-command-metrics" aria-label={overviewMessages.commandStatusLabel}>
              <span>
                <button
                  type="button"
                  className="overview-command-status-button"
                  onClick={() => onOpenProvidersWithProbeFilter("all")}
                >
                  <strong>{overviewSelectedProviderIds.length ? overviewParseOk : visibleProviderSessionSummary.parse_ok}</strong> {messages.overview.readyLabel}
                </button>
              </span>
              <span>
                <button
                  type="button"
                  className="overview-command-status-button"
                  onClick={() => onOpenProvidersWithProbeFilter("fail")}
                >
                  <strong>{overviewSelectedProviderIds.length ? overviewParseFail : visibleProviderSessionSummary.parse_fail}</strong> {messages.overview.failLabel}
                </button>
              </span>
            </div>
          </div>
        </section>

        <div className="overview-insight-grid">
          <Card variant="primary">
            <div className="overview-primary-panel-grid">
              <div className="overview-primary-copy">
                <span className="overview-note-label">{messages.overview.activeSession}</span>
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
                      {formatProviderDisplayName(overviewFocusSession.provider)} / {formatWorkbenchRailTime(overviewFocusSession.mtime)} / {overviewMessages.readyLabel}
                    </div>
                    <p className="overview-primary-summary">
                      {overviewBooting
                        ? overviewMessages.loadingPrimarySummary
                        : formatOverviewMessage(overviewMessages.primarySummary, {
                            ready: overviewSelectedProviderIds.length ? overviewParseOk : visibleProviderSessionSummary.parse_ok,
                            rows: overviewSelectedProviderIds.length ? overviewSessionCount : visibleProviderSessionSummary.rows || "...",
                            active: overviewActiveProviderCount || "...",
                          })}
                    </p>
                  </button>
                ) : (
                  <>
                    <strong className="overview-primary-focus-title">{focusSessionTitle}</strong>
                    <div className="overview-primary-focus-meta">{focusSessionMeta}</div>
                    <p className="overview-primary-summary">
                      {overviewBooting
                        ? overviewMessages.loadingPrimarySummary
                        : formatOverviewMessage(overviewMessages.primarySummary, {
                            ready: overviewSelectedProviderIds.length ? overviewParseOk : visibleProviderSessionSummary.parse_ok,
                            rows: overviewSelectedProviderIds.length ? overviewSessionCount : visibleProviderSessionSummary.rows || "...",
                            active: overviewActiveProviderCount || "...",
                          })}
                    </p>
                  </>
                )}
                <div className="overview-primary-focus-kpis" aria-label={overviewMessages.focusSessionSummaryLabel}>
                  <article>
                    <span>{overviewMessages.rowsLabel}</span>
                    <strong>
                      {overviewSelectedProviderIds.length
                        ? formatOverviewMessage(overviewMessages.rowsValue, {
                            count: overviewSessionCount,
                          })
                        : searchRowsText}
                    </strong>
                  </article>
                  <article>
                    <span>{overviewMessages.sizeLabel}</span>
                    <strong>{formatBytes(overviewSelectedProviderIds.length ? overviewSessionBytes : totalVisibleSessionBytes)}</strong>
                  </article>
                </div>
                {overviewFocusSession ? (
                  <div className="overview-primary-facts" aria-label={overviewMessages.activeSessionFactsLabel}>
                    <span>{describeOverviewSessionSource(overviewFocusSession.source, overviewMessages)}</span>
                    <span>
                      {formatOverviewMessage(overviewMessages.updatedAt, {
                        time: formatWorkbenchRailTime(overviewFocusSession.mtime),
                      })}
                    </span>
                    <span>{formatBytesCompact(overviewFocusSession.size_bytes)}</span>
                  </div>
                ) : null}
              </div>
              <div className="overview-primary-list">
                <span className="overview-note-label">{messages.overview.readyNow}</span>
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
                      {overviewBooting ? syncStatusText : messages.overview.noRecentSessions}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
          <div className="overview-support-stack">
            <Card variant="review">
              <div className="overview-review-head">
                <span className="overview-note-label">{messages.overview.reviewQueue}</span>
                <button
                  type="button"
                  className="overview-review-pill overview-review-pill-button"
                  onClick={onOpenThreads}
                >
                  {reviewRowsText}
                </button>
              </div>
              {focusReviewThread ? (
                <button
                  type="button"
                  className="overview-review-focus overview-review-focus-button"
                  onClick={() => onOpenRecentThread(focusReviewThread.thread_id)}
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
                      onClick={() => onOpenRecentThread(row.thread_id)}
                    >
                      <div className="overview-review-list-copy">
                        <strong>
                          {normalizeWorkbenchTitle(
                            row.title,
                            compactWorkbenchId(row.thread_id, "thread"),
                          )}
                        </strong>
                        <span>
                          {formatOverviewReviewSource(row.source, overviewMessages)} / {formatOverviewReviewRisk(row.risk_level, overviewMessages)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p>{messages.overview.noAdditionalReviewThreads}</p>
              )}
            </Card>
            <div className="overview-support-mini-grid">
              <Card variant="mini">
                <span className="overview-note-label">{messages.overview.providersLabel}</span>
                <strong>{overviewActiveSummary}</strong>
                <p>{overviewActiveSummaryLine}</p>
              </Card>
              <Card variant="mini">
                <span className="overview-note-label">{messages.overview.syncLabel}</span>
                <strong>{parserScoreText}</strong>
                <p>
                  {overviewBooting
                    ? messages.overview.loadingParserRuntime
                    : formatOverviewMessage(overviewMessages.backupsRuntimeSummary, {
                        backups: backupSetsCount,
                        runtime: runtimeStatusText,
                      })}
                </p>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
