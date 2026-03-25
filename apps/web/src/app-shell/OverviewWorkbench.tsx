import type { ReactNode } from "react";
import type { ProviderSessionRow, ThreadRow } from "../types";
import {
  compactWorkbenchId,
  formatWorkbenchRailTime,
  normalizeWorkbenchSessionTitle,
  normalizeWorkbenchTitle,
} from "./workbenchFormat";

type OverviewWorkbenchProps = {
  setupGuideOpen: boolean;
  onToggleSetupGuide: () => void;
  onCloseSetupGuide: () => void;
  onOpenThreads: () => void;
  onOpenProviders: () => void;
  onProvidersIntent: () => void;
  onOpenSearch: () => void;
  onSearchIntent: () => void;
  onOpenRecentSession: (row: ProviderSessionRow) => void;
  onOpenRecentThread: (threadId: string) => void;
  runtimeLatencyText: string;
  focusSessionCommandId: string;
  focusSessionStatus: string;
  visibleProviderSessionSummary: {
    parse_ok: number;
    rows: number;
  };
  highRiskCount: number;
  syncStatusText: string;
  focusSessionTitle: string;
  focusSessionMeta: string;
  overviewBooting: boolean;
  visibleProviderSummary: {
    active: number;
  };
  searchRowsText: string;
  reviewRowsText: string;
  recentSessionPreview: ProviderSessionRow[];
  focusReviewTitle: string;
  focusReviewMeta: string;
  secondaryFlaggedPreview: ThreadRow[];
  activeSummaryText: string;
  activeProviderSummaryLine: string;
  parserScoreText: string;
  backupSetsCount: number;
  recentThreadGroups: Array<{ label: string; rows: ThreadRow[] }>;
  getRecentThreadTitle: (row: ThreadRow) => string;
  getRecentThreadSummary: (row: ThreadRow) => string;
  setupStageContent: ReactNode;
};

export function OverviewWorkbench(props: OverviewWorkbenchProps) {
  const {
    setupGuideOpen,
    onToggleSetupGuide,
    onCloseSetupGuide,
    onOpenThreads,
    onOpenProviders,
    onProvidersIntent,
    onOpenSearch,
    onSearchIntent,
    onOpenRecentSession,
    onOpenRecentThread,
    runtimeLatencyText,
    focusSessionCommandId,
    focusSessionStatus,
    visibleProviderSessionSummary,
    highRiskCount,
    syncStatusText,
    focusSessionTitle,
    focusSessionMeta,
    overviewBooting,
    visibleProviderSummary,
    searchRowsText,
    reviewRowsText,
    recentSessionPreview,
    focusReviewTitle,
    focusReviewMeta,
    secondaryFlaggedPreview,
    activeSummaryText,
    activeProviderSummaryLine,
    parserScoreText,
    backupSetsCount,
    recentThreadGroups,
    getRecentThreadTitle,
    getRecentThreadSummary,
    setupStageContent,
  } = props;

  return (
    <section className="overview-workbench">
      {!setupGuideOpen ? (
        <div className="overview-workbench-grid">
          <section className="panel overview-stage overview-main-canvas">
            <div className="overview-stage-header overview-main-head">
              <div className="overview-stage-title overview-main-title">
                <span className="overview-note-label">overview</span>
                <h1>ThreadLens</h1>
                <p>Sessions, review, archive.</p>
              </div>
              <div className="overview-header-actions">
                <button
                  type="button"
                  className="overview-header-btn is-quiet"
                  onClick={onToggleSetupGuide}
                >
                  {setupGuideOpen ? "Close setup" : "Setup"}
                </button>
                <button
                  type="button"
                  className="overview-header-btn"
                  onClick={onOpenThreads}
                >
                  Review
                </button>
                <button
                  type="button"
                  className="overview-header-btn is-primary"
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
                  <div className="overview-command-summary">
                    <strong>{focusSessionCommandId}</strong>
                    <span>{focusSessionStatus}</span>
                  </div>
                  <div className="overview-command-metrics" aria-label="workbench status">
                    <span>
                      <strong>{visibleProviderSessionSummary.parse_ok}</strong> ready
                    </span>
                    <span>
                      <strong>{highRiskCount}</strong> flagged
                    </span>
                    <span>{syncStatusText}</span>
                  </div>
                </div>
              </section>

              <div className="overview-insight-grid">
                <article className="overview-insight-card is-primary">
                  <div className="overview-primary-panel-grid">
                    <div className="overview-primary-copy">
                      <span className="overview-note-label">active session</span>
                      <strong className="overview-primary-focus-title">{focusSessionTitle}</strong>
                      <div className="overview-primary-focus-meta">{focusSessionMeta}</div>
                      <p className="overview-primary-summary">
                        {overviewBooting
                          ? "Loading recent sessions, parser health, and active providers."
                          : `${visibleProviderSessionSummary.parse_ok}/${visibleProviderSessionSummary.rows || "..."} ready across ${visibleProviderSummary.active || "..."} active AI. Search, review, or open the archive next.`}
                      </p>
                      <div className="overview-primary-focus-kpis" aria-label="focus session summary">
                        <article>
                          <span>rows</span>
                          <strong>{searchRowsText}</strong>
                        </article>
                        <article>
                          <span>review</span>
                          <strong>{reviewRowsText}</strong>
                        </article>
                      </div>
                      <div className="overview-card-actions" aria-label="workbench quick actions">
                        <button
                          type="button"
                          className="overview-card-action is-quiet"
                          onClick={onOpenSearch}
                          onMouseEnter={onSearchIntent}
                          onFocus={onSearchIntent}
                        >
                          <span>Search</span>
                        </button>
                        <button
                          type="button"
                          className="overview-card-action"
                          onClick={onOpenThreads}
                        >
                          <span>Review</span>
                        </button>
                        <button
                          type="button"
                          className="overview-card-action is-primary"
                          onClick={onOpenProviders}
                          onMouseEnter={onProvidersIntent}
                          onFocus={onProvidersIntent}
                        >
                          <span>Sessions</span>
                        </button>
                      </div>
                    </div>
                    <div className="overview-primary-list">
                      <span className="overview-note-label">ready now</span>
                      <div className="overview-primary-list-items">
                        {recentSessionPreview.length ? (
                          recentSessionPreview.slice(0, 3).map((row) => (
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
                                {row.provider} · {formatWorkbenchRailTime(row.mtime)}
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
                  <article className="overview-insight-card is-review">
                    <div className="overview-review-head">
                      <span className="overview-note-label">review queue</span>
                      <span className="overview-review-pill">{reviewRowsText}</span>
                    </div>
                    <div className="overview-review-focus">
                      <span className="overview-review-kicker">top thread</span>
                      <div className="overview-review-title">{focusReviewTitle}</div>
                      <div className="overview-review-meta">{focusReviewMeta}</div>
                    </div>
                    {secondaryFlaggedPreview.length ? (
                      <div className="overview-review-list">
                        {secondaryFlaggedPreview.map((row) => (
                          <div key={`overview-review-secondary-${row.thread_id}`} className="overview-review-list-item">
                            <strong>
                              {normalizeWorkbenchTitle(
                                row.title,
                                compactWorkbenchId(row.thread_id, "thread"),
                              )}
                            </strong>
                            <span>
                              {row.source || "thread"} / {row.risk_level || compactWorkbenchId(row.thread_id, "thread")}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p>No additional flagged threads.</p>
                    )}
                  </article>
                  <div className="overview-support-mini-grid">
                    <article className="overview-insight-card is-mini">
                      <span className="overview-note-label">providers</span>
                      <strong>{activeSummaryText}</strong>
                      <p>{activeProviderSummaryLine}</p>
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
                  <strong>Recent Threads</strong>
                </div>
              </div>
              <div className="overview-side-list overview-side-list-history">
                {recentThreadGroups.length ? (
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

            <section className="overview-side-card overview-side-card-status">
              <div className="overview-side-head">
                <span className="overview-note-label">system</span>
                <strong>{syncStatusText}</strong>
              </div>
              <div className="overview-side-status-list">
                <article className="overview-side-status-item">
                  <span>runtime</span>
                  <strong>{runtimeLatencyText}</strong>
                </article>
                <article className="overview-side-status-item">
                  <span>parser</span>
                  <strong>{parserScoreText}</strong>
                </article>
                <article className="overview-side-status-item">
                  <span>backups</span>
                  <strong>{backupSetsCount}</strong>
                </article>
                <article className="overview-side-status-item">
                  <span>ready rows</span>
                  <strong>{visibleProviderSessionSummary.parse_ok}</strong>
                </article>
              </div>
            </section>
          </aside>
        </div>
      ) : (
        <section className="overview-secondary-panel overview-setup-stage" aria-label="setup stage">
          <div className="overview-secondary-head">
            <span className="overview-note-label">setup stage</span>
            <button
              type="button"
              className="overview-secondary-close"
              onClick={onCloseSetupGuide}
            >
              Close
            </button>
          </div>
          <div className="overview-secondary-body">{setupStageContent}</div>
        </section>
      )}
    </section>
  );
}
