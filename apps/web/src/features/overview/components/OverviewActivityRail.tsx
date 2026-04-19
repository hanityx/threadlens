import type { Messages } from "@/i18n";
import type { ProviderSessionRow, ThreadRow } from "@/shared/types";
import { compactWorkbenchId, formatWorkbenchRailTime, normalizeWorkbenchSessionTitle } from "@/app/model/workbenchFormat";
import { formatProviderDisplayName } from "@/shared/lib/format";
import {
  describeOverviewSessionSource,
  describeSessionFreshnessDot,
  describeSessionHealthDot,
  describeSessionWeightDot,
} from "@/features/overview/model/overviewWorkbenchModel";

type OverviewActivityRailProps = {
  messages: Messages;
  overviewMessages: Messages["overview"];
  showRecentSessionsRail: boolean;
  overviewRecentSessionPreview: ProviderSessionRow[];
  recentThreadGroups: Array<{ label: string; rows: ThreadRow[] }>;
  getRecentThreadTitle: (row: ThreadRow) => string;
  getRecentThreadSummary: (row: ThreadRow) => string;
  overviewBooting: boolean;
  syncStatusText: string;
  onOpenRecentSession: (row: ProviderSessionRow) => void;
  onOpenRecentThread: (threadId: string) => void;
};

export function OverviewActivityRail({
  messages,
  overviewMessages,
  showRecentSessionsRail,
  overviewRecentSessionPreview,
  recentThreadGroups,
  getRecentThreadTitle,
  getRecentThreadSummary,
  overviewBooting,
  syncStatusText,
  onOpenRecentSession,
  onOpenRecentThread,
}: OverviewActivityRailProps) {
  const describeThreadRiskDot = (row: ThreadRow) => {
    if (row.risk_level === "high") {
      return { label: overviewMessages.dotThreadRiskHigh, className: "is-active" };
    }
    if (row.risk_level === "medium") {
      return { label: overviewMessages.dotThreadRiskMedium, className: "is-warn" };
    }
    return { label: overviewMessages.dotThreadRiskLow, className: "" };
  };

  const describeThreadPinnedDot = (row: ThreadRow) =>
    row.is_pinned
      ? { label: overviewMessages.dotThreadPinned, className: "is-active" }
      : { label: overviewMessages.dotThreadNotPinned, className: "" };

  const describeThreadActivityDot = (row: ThreadRow) =>
    row.activity_status === "active"
      ? { label: overviewMessages.dotThreadActive, className: "is-active" }
      : { label: overviewMessages.dotThreadIdle, className: "" };

  return (
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
            <strong>{messages.overview.recentActivity}</strong>
          </div>
        </div>
        <div className="overview-side-list overview-side-list-history">
          {showRecentSessionsRail ? (
            overviewRecentSessionPreview.length ? (
              <section className="overview-side-group">
                <div className="overview-side-group-head">
                  <span>{overviewMessages.today}</span>
                </div>
                <div className="overview-side-group-list">
                  {overviewRecentSessionPreview.slice(0, 4).map((row) => {
                    const healthDot = describeSessionHealthDot(row, overviewMessages);
                    const freshnessDot = describeSessionFreshnessDot(row, overviewMessages);
                    const weightDot = describeSessionWeightDot(row, overviewMessages);
                    const dotEntries = [
                      { key: "health", label: healthDot.label, className: healthDot.className },
                      { key: "freshness", label: freshnessDot.label, className: freshnessDot.className },
                      { key: "weight", label: weightDot.label, className: weightDot.className },
                    ];
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
                            {formatProviderDisplayName(row.provider)} / {describeOverviewSessionSource(row.source, overviewMessages)}
                          </p>
                        </div>
                        <div
                          className="overview-side-item-dots"
                          aria-label={dotEntries.map((entry) => entry.label).join(". ")}
                        >
                          {dotEntries.map((entry) => (
                            <span
                              key={`${row.session_id}-${entry.key}`}
                              className="overview-side-item-dot"
                            >
                              <span className={entry.className} />
                              <span role="tooltip" className="overview-side-item-dot-tooltip">
                                {entry.label}
                              </span>
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : (
              <div className="overview-side-empty">
                {overviewBooting ? syncStatusText : messages.overview.noRecentSessions}
              </div>
            )
          ) : recentThreadGroups.length ? (
            recentThreadGroups.map((group) => (
              <section key={`overview-thread-group-${group.label}`} className="overview-side-group">
                <div className="overview-side-group-head">
                  <span>{group.label}</span>
                </div>
                <div className="overview-side-group-list">
                  {group.rows.map((row) => {
                    const riskDot = describeThreadRiskDot(row);
                    const pinnedDot = describeThreadPinnedDot(row);
                    const activityDot = describeThreadActivityDot(row);
                    const dotEntries = [
                      { key: "risk", label: riskDot.label, className: riskDot.className },
                      { key: "pinned", label: pinnedDot.label, className: pinnedDot.className },
                      { key: "activity", label: activityDot.label, className: activityDot.className },
                    ];

                    return (
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
                        <div
                          className="overview-side-item-dots"
                          aria-label={dotEntries.map((entry) => entry.label).join(". ")}
                        >
                          {dotEntries.map((entry) => (
                            <span key={`${row.thread_id}-${entry.key}`} className="overview-side-item-dot">
                              <span className={entry.className} />
                              <span role="tooltip" className="overview-side-item-dot-tooltip">
                                {entry.label}
                              </span>
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="overview-side-empty">{messages.overview.waitingThreads}</div>
          )}
        </div>
      </section>
    </aside>
  );
}
