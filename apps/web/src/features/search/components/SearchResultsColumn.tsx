import type { Dispatch, SetStateAction } from "react";
import type { ConversationSearchHit } from "@/shared/types";
import type { Messages } from "@/i18n";
import {
  compactProviderName,
  compactSearchSnippet,
  formatSearchMessage,
  formatSourceLabel,
  getSearchRoleLabel,
  shouldIgnoreSearchCardKeyboardActivation,
  type SearchProviderGroup,
} from "@/features/search/model/searchPanelModel";

type SearchResultsColumnProps = {
  messages: Messages;
  searchEnabled: boolean;
  resultCount: number;
  searchedSessions: number;
  availableSessions: number;
  providerHitCount: number;
  messageMatches: number;
  collapsedDuplicateCount: number;
  statusText: string | null;
  showLiveLoading: boolean;
  showLoadingSkeleton: boolean;
  providerGroups: SearchProviderGroup[];
  providerLabelById: Map<string, string>;
  expandedSessions: Set<string>;
  activeSessionKey: string | null;
  sessionOpenProviderIds: string[];
  setActiveSessionKey: Dispatch<SetStateAction<string | null>>;
  setExpandedSessions: Dispatch<SetStateAction<Set<string>>>;
  onOpenSession: (hit: ConversationSearchHit) => void;
  onOpenThread: (hit: ConversationSearchHit) => void;
};

export function SearchResultsColumn({
  messages,
  searchEnabled,
  resultCount,
  searchedSessions,
  availableSessions,
  providerHitCount,
  messageMatches,
  collapsedDuplicateCount,
  statusText,
  showLiveLoading,
  showLoadingSkeleton,
  providerGroups,
  providerLabelById,
  expandedSessions,
  activeSessionKey,
  sessionOpenProviderIds,
  setActiveSessionKey,
  setExpandedSessions,
  onOpenSession,
  onOpenThread,
}: SearchResultsColumnProps) {
  return (
    <div className="search-results-column">
      {searchEnabled ? (
        <div className="search-summary-strip" role="status" aria-live="polite">
          <span className="search-summary-item">
            <strong className="search-summary-value">{resultCount}</strong>
            <span className="search-summary-label">{messages.search.summaryMatchesLabel}</span>
          </span>
          <span className="search-summary-item">
            <strong className="search-summary-value">
              {searchedSessions}/{availableSessions}
            </strong>
            <span className="search-summary-label">{messages.search.summaryScannedLabel}</span>
          </span>
          <span className="search-summary-item">
            <strong className="search-summary-value">{providerHitCount}</strong>
            <span className="search-summary-label">{messages.search.providerHits}</span>
            <span className="search-summary-divider" aria-hidden="true">·</span>
            <strong className="search-summary-value">{messageMatches}</strong>
            <span className="search-summary-label">{messages.search.summaryMessagesLabel}</span>
          </span>
          {collapsedDuplicateCount > 0 ? (
            <span className="search-summary-item">
              <strong className="search-summary-value">{collapsedDuplicateCount}</strong>
              <span className="search-summary-label">{messages.search.summaryDedupedLabel}</span>
            </span>
          ) : null}
          {statusText ? (
            <span className={`status-pill ${showLiveLoading ? "status-preview" : "status-missing"}`.trim()}>
              {statusText}
            </span>
          ) : null}
        </div>
      ) : null}

      {showLoadingSkeleton ? (
        <div className="search-loading-stack" aria-hidden="true">
          <div className="search-loading-row">
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
          <div className="search-loading-row">
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
          <div className="search-loading-row">
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
          </div>
        </div>
      ) : null}

      <div className="search-results-layout search-results-layout-single">
        <div className="search-result-list search-result-list-stage">
          {providerGroups.map((group) => (
            <section key={`search-group-${group.id}`} className="search-group-section">
              <div className="search-group-header">
                <strong>{group.name}</strong>
                <div className="search-group-header-meta">
                  <span className="mono-sub">
                    {formatSearchMessage(messages.search.groupRows, { count: group.sessions.length })}
                  </span>
                  <span className="status-pill status-active">
                    {formatSearchMessage(messages.search.groupHits, { count: group.matchCount })}
                  </span>
                </div>
              </div>
              <div className="search-group-list">
                {group.sessions.map((session) => {
                  const cardProviderName = providerLabelById.get(session.openHit.provider) ?? session.openHit.provider;
                  const isExpanded = expandedSessions.has(session.key);
                  const isActive = activeSessionKey === session.key;
                  const canOpenSession = sessionOpenProviderIds.includes(session.openHit.provider);
                  const previewMatches = isExpanded ? session.matches : session.matches.slice(0, 1);
                  const remainingMatches = session.matches.length - 1;
                  const cardKey = `${group.id}:${session.key}`;
                  return (
                    <article
                      key={cardKey}
                      className={`search-result-card search-result-card-stage${isActive ? " is-active" : ""}${canOpenSession ? "" : " is-disabled"}`}
                      tabIndex={canOpenSession ? 0 : undefined}
                      role={canOpenSession ? "button" : undefined}
                      aria-disabled={canOpenSession ? undefined : true}
                      onClick={canOpenSession
                        ? () => {
                            setActiveSessionKey(session.key);
                            onOpenSession(session.openHit);
                          }
                        : undefined}
                      onKeyDown={canOpenSession
                        ? (event) => {
                            if (
                              shouldIgnoreSearchCardKeyboardActivation({
                                currentTarget: event.currentTarget,
                                target: event.target,
                              })
                            ) {
                              return;
                            }
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setActiveSessionKey(session.key);
                              onOpenSession(session.openHit);
                            }
                          }
                        : undefined}
                      title={canOpenSession ? undefined : messages.search.disabledSessionTitle}
                    >
                      <div className="search-result-main">
                        <div className="search-result-title-stack">
                          <strong className="search-result-title-link" title={session.openHit.session_id}>
                            {session.title}
                          </strong>
                        </div>
                        <div className="search-result-top">
                          {session.openHit.session_id ? (
                            <span className="search-result-kind search-result-session-id">
                              {session.openHit.session_id}
                            </span>
                          ) : (
                            <span className="search-result-kind">{compactProviderName(cardProviderName)}</span>
                          )}
                          <span className="search-result-kind">
                            {formatSearchMessage(messages.search.groupHits, { count: session.matches.length })}
                          </span>
                        </div>
                      </div>
                      <div className="search-result-meta">
                        <span className="search-result-source" title={session.source}>
                          {formatSourceLabel(session.source)}
                        </span>
                        <div className="search-result-actions">
                          {session.openHit.thread_id ? (
                            <button
                              type="button"
                              className="status-pill-button search-inline-pill"
                              onClick={(event) => {
                                event.stopPropagation();
                                setActiveSessionKey(session.key);
                                onOpenThread(session.openHit);
                              }}
                            >
                              {messages.search.openThread}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="search-match-list">
                        {previewMatches.map((match, index) => (
                          <div
                            key={`${session.key}:${match.match_kind}:${match.role ?? "na"}:${index}`}
                            className="search-match-item"
                          >
                            <span className="search-match-role">
                              {match.match_kind === "title"
                                ? messages.search.matchTitle
                                : getSearchRoleLabel(match.role, messages)}
                            </span>
                            <p className="search-result-snippet search-result-snippet-compact">
                              {compactSearchSnippet(match)}
                            </p>
                          </div>
                        ))}
                        {remainingMatches > 0 ? (
                          <button
                            type="button"
                            className="search-match-more"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedSessions((prev) => {
                                const next = new Set(prev);
                                if (next.has(session.key)) {
                                  next.delete(session.key);
                                } else {
                                  next.add(session.key);
                                }
                                return next;
                              });
                            }}
                          >
                            {isExpanded
                              ? messages.search.collapseMatches
                              : formatSearchMessage(messages.search.moreMatches, {
                                  count: remainingMatches,
                                })}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
