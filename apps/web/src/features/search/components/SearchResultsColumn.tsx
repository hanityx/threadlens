import type { Dispatch, MouseEvent, RefObject, SetStateAction } from "react";
import type { ConversationSearchHit } from "@/shared/types";
import type { Messages } from "@/i18n";
import {
  compactProviderName,
  compactSearchSnippet,
  formatSearchMessage,
  formatSourceLabel,
  getSearchRoleLabel,
  type SearchProviderGroup,
  type SearchSessionGroup,
} from "@/features/search/model/searchPanelModel";

type SessionHitsState = {
  hits: ConversationSearchHit[];
  loading: boolean;
  hasMore: boolean;
};

type SearchResultsColumnProps = {
  messages: Messages;
  searchEnabled: boolean;
  summarySessionCount: number;
  summaryHitCount: number;
  summaryHitCountIsApproximate?: boolean;
  loadedSessionCount: number;
  searchedSessions: number;
  availableSessions: number;
  statusText: string | null;
  showLiveLoading: boolean;
  showLoadingSkeleton: boolean;
  providerGroups: SearchProviderGroup[];
  providerLabelById: Map<string, string>;
  expandedSessions: Set<string>;
  activeSessionKey: string | null;
  sessionOpenProviderIds: string[];
  sessionHitsBySession?: Record<string, SessionHitsState | undefined>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  loadMoreRef?: RefObject<HTMLButtonElement | null>;
  onLoadMoreResults?: () => void;
  onLoadSessionHits?: (session: SearchSessionGroup) => void;
  setActiveSessionKey: Dispatch<SetStateAction<string | null>>;
  setExpandedSessions: Dispatch<SetStateAction<Set<string>>>;
  onOpenSession: (hit: ConversationSearchHit) => void;
  onOpenThread: (hit: ConversationSearchHit) => void;
};

function formatApproximateCountLabel(
  template: string,
  count: number,
  approximate = false,
): string {
  const formatted = formatSearchMessage(template, { count });
  if (!approximate) return formatted;
  const token = String(count);
  const tokenIndex = formatted.indexOf(token);
  if (tokenIndex < 0) return `${formatted}+`;
  return `${formatted.slice(0, tokenIndex)}${token}+${formatted.slice(tokenIndex + token.length)}`;
}

export function SearchResultsColumn({
  messages,
  searchEnabled,
  summarySessionCount,
  summaryHitCount,
  summaryHitCountIsApproximate = false,
  loadedSessionCount,
  searchedSessions,
  availableSessions,
  statusText,
  showLiveLoading,
  showLoadingSkeleton,
  providerGroups,
  providerLabelById,
  expandedSessions,
  activeSessionKey,
  sessionOpenProviderIds,
  sessionHitsBySession = {},
  hasNextPage = false,
  isFetchingNextPage = false,
  loadMoreRef,
  onLoadMoreResults,
  onLoadSessionHits,
  setActiveSessionKey,
  setExpandedSessions,
  onOpenSession,
  onOpenThread,
}: SearchResultsColumnProps) {
  const remainingSessionCount = Math.max(summarySessionCount - loadedSessionCount, 0);

  return (
    <div className="search-results-column">
      {searchEnabled ? (
        <div className="search-summary-strip" role="status" aria-live="polite">
          {!showLiveLoading ? (
            <>
              <span className="search-summary-item">
                <strong className="search-summary-value">
                  {formatSearchMessage(messages.search.groupRows, { count: summarySessionCount })}
                </strong>
              </span>
              <span className="search-summary-item">
                <strong className="search-summary-value">
                  {searchedSessions}/{availableSessions}
                </strong>
                <span className="search-summary-label">{messages.search.summaryScannedLabel}</span>
              </span>
              <span className="search-summary-item">
                <strong className="search-summary-value">
                  {formatApproximateCountLabel(
                    messages.search.groupHits,
                    summaryHitCount,
                    summaryHitCountIsApproximate,
                  )}
                </strong>
              </span>
            </>
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
                    {formatApproximateCountLabel(
                      messages.search.groupHits,
                      group.matchCount,
                      group.hasApproximateHits,
                    )}
                  </span>
                </div>
              </div>
              <div className="search-group-list">
                {group.sessions.map((session) => {
                  const cardProviderName =
                    providerLabelById.get(session.openHit.provider) ?? session.openHit.provider;
                  const isExpanded = expandedSessions.has(session.key);
                  const isActive = activeSessionKey === session.key;
                  const canOpenSession = sessionOpenProviderIds.includes(session.openHit.provider);
                  const sessionHitsState = sessionHitsBySession[session.key];
                  const expandedMatches = sessionHitsState?.hits?.length ? sessionHitsState.hits : session.matches;
                  const visibleMatches = isExpanded ? expandedMatches : session.matches;
                  const showsIdentifierTitle =
                    Boolean(session.openHit.session_id) && session.title === session.openHit.session_id;
                  const canLoadMoreHits =
                    Boolean(sessionHitsState?.hasMore) ||
                    (!sessionHitsState && session.result.has_more_hits);
                  const hasLoadedSourceHits = Boolean(sessionHitsState?.hits?.length);
                  const showSessionToggle = Boolean(session.result.has_more_hits || sessionHitsState);
                  const showSessionLoadMore =
                    isExpanded &&
                    Boolean(
                      session.result.has_more_hits || sessionHitsState?.loading || canLoadMoreHits,
                    );
                  const loadMoreDisabled = Boolean(sessionHitsState?.loading || !canLoadMoreHits);

                  const expandSession = () => {
                    setExpandedSessions((prev) => {
                      const next = new Set(prev);
                      next.add(session.key);
                      return next;
                    });
                  };

                  const collapseSession = () => {
                    setExpandedSessions((prev) => {
                      const next = new Set(prev);
                      next.delete(session.key);
                      return next;
                    });
                  };

                  const handleLoadMoreHits = (event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    if (sessionHitsState?.loading) return;
                    if (!isExpanded) {
                      expandSession();
                    }
                    if (canLoadMoreHits) {
                      onLoadSessionHits?.(session);
                    }
                  };

                  const handleCollapseSession = (event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    collapseSession();
                  };

                  const handleToggleSession = (event: MouseEvent<HTMLButtonElement>) => {
                    event.stopPropagation();
                    if (isExpanded) {
                      collapseSession();
                      return;
                    }
                    expandSession();
                    if (!hasLoadedSourceHits) {
                      onLoadSessionHits?.(session);
                    }
                  };

                  return (
                    <article
                      key={`${group.id}:${session.key}`}
                      className={`search-result-card search-result-card-stage${isActive ? " is-active" : ""}${canOpenSession ? "" : " is-disabled"}`}
                      aria-disabled={canOpenSession ? undefined : true}
                      onClick={canOpenSession
                        ? () => {
                            setActiveSessionKey(session.key);
                            onOpenSession(session.openHit);
                          }
                        : undefined}
                      title={canOpenSession ? undefined : messages.search.disabledSessionTitle}
                    >
                      <div className="search-result-main">
                        <div className="search-result-title-stack">
                          <button
                            type="button"
                            className="search-result-title-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setActiveSessionKey(session.key);
                              onOpenSession(session.openHit);
                            }}
                            aria-label={`Open: ${session.title}`}
                            disabled={!canOpenSession}
                          >
                            <strong
                              className={`search-result-title-link${showsIdentifierTitle ? " is-identifier" : ""}`}
                              title={session.openHit.session_id}
                            >
                              {session.title}
                            </strong>
                          </button>
                          {session.openHit.session_id && !showsIdentifierTitle ? (
                            <div className="search-result-session-id-row">
                              <span className="search-result-kind search-result-session-id">
                                {session.openHit.session_id}
                              </span>
                            </div>
                          ) : null}
                        </div>
                        <div className="search-result-top">
                          {!session.openHit.session_id ? (
                            <span className="search-result-kind">
                              {compactProviderName(cardProviderName)}
                            </span>
                          ) : null}
                          <span className="search-result-kind">
                            {formatApproximateCountLabel(
                              messages.search.groupHits,
                              session.result.match_count,
                              session.result.has_more_hits,
                            )}
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
                      <div
                        className={`search-match-list${isExpanded ? " is-expanded" : ""}${isExpanded && hasLoadedSourceHits ? " is-scrollable" : ""}`}
                      >
                        {visibleMatches.map((match, index) => (
                          <div
                            key={`${session.key}:${match.match_kind}:${match.role ?? "na"}:${index}`}
                            className="search-match-item"
                          >
                            <div
                              className={`search-match-head${
                                index === 0 && showSessionToggle ? " is-toggle-anchor" : ""
                              }${
                                index === 0 && isExpanded && hasLoadedSourceHits ? " is-sticky-anchor" : ""
                              }`}
                            >
                              {index === 0 && showSessionToggle ? (
                                <button
                                  type="button"
                                  className="search-match-role search-match-role-toggle"
                                  aria-expanded={isExpanded}
                                  onClick={handleToggleSession}
                                >
                                  {match.match_kind === "title"
                                    ? messages.search.matchTitle
                                    : getSearchRoleLabel(match.role, messages)}
                                </button>
                              ) : (
                                <span className="search-match-role">
                                  {match.match_kind === "title"
                                    ? messages.search.matchTitle
                                    : getSearchRoleLabel(match.role, messages)}
                                </span>
                              )}
                              {index === 0 && showSessionToggle ? (
                                <button
                                  type="button"
                                  className="search-match-toggle-icon"
                                  aria-label={isExpanded ? messages.search.collapseMatches : messages.transcript.loadMoreFromSource}
                                  aria-expanded={isExpanded}
                                  onClick={handleToggleSession}
                                >
                                  <svg
                                    viewBox="0 0 16 16"
                                    className={`search-match-toggle-glyph${isExpanded ? " is-expanded" : ""}`}
                                    aria-hidden="true"
                                  >
                                    <path d="M3.5 6.25 8 10.75l4.5-4.5" />
                                  </svg>
                                </button>
                              ) : null}
                            </div>
                            <p className="search-result-snippet search-result-snippet-compact">
                              {compactSearchSnippet(match)}
                            </p>
                          </div>
                        ))}
                      </div>
                      {!isExpanded && showSessionToggle || showSessionLoadMore ? (
                        <div className="search-match-footer">
                          {showSessionLoadMore ? (
                            <button
                              type="button"
                              className={`search-match-more${loadMoreDisabled ? " is-disabled" : ""}`}
                              onClick={handleLoadMoreHits}
                              disabled={loadMoreDisabled}
                              aria-disabled={loadMoreDisabled}
                            >
                              {sessionHitsState?.loading
                                ? messages.common.loading
                                : messages.transcript.loadMoreFromSource}
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
          {hasNextPage || isFetchingNextPage ? (
            <div className="search-result-list-footer">
              <button
                ref={loadMoreRef}
                type="button"
                className="search-match-more"
                onClick={onLoadMoreResults}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage
                  ? messages.search.loading
                  : remainingSessionCount > 0
                    ? formatSearchMessage(messages.search.moreMatches, { count: remainingSessionCount })
                    : messages.search.moreMatches.replace("{count}", "0")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
