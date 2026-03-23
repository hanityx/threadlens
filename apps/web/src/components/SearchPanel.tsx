import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api";
import type { ConversationSearchEnvelope, ConversationSearchHit } from "../types";
import type { Messages } from "../i18n";
import { extractEnvelopeData, formatDateTime, normalizeDisplayValue } from "../lib/helpers";

type SearchPanelProps = {
  messages: Messages;
  providerOptions: Array<{ id: string; name: string }>;
  onOpenSession: (hit: ConversationSearchHit) => void;
  onOpenThread: (hit: ConversationSearchHit) => void;
};

function compactSessionId(sessionId?: string | null): string {
  if (!sessionId) return "session";
  if (sessionId.length <= 18) return sessionId;
  return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}

function compactSourceLabel(source?: string | null): string {
  if (!source) return "source";
  const normalized = source.replace(/\\/g, "/");
  if (!normalized.includes("/")) return normalized;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 2) return normalized;
  return `${parts.slice(-2).join("/")}`;
}

function searchHitDedupKey(hit: ConversationSearchHit): string {
  const transcriptKey = hit.session_id || hit.file_path;
  const snippetKey = (hit.snippet || "").trim().toLowerCase();
  const titleKey = (hit.display_title || hit.title || "").trim().toLowerCase();
  return [
    hit.provider,
    transcriptKey,
    hit.match_kind,
    titleKey,
    snippetKey,
  ].join("::");
}

export function SearchPanel({
  messages,
  providerOptions,
  onOpenSession,
  onOpenThread,
}: SearchPanelProps) {
  const sampleQueries = ["backup", "agent", "review", "deploy"];
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);
  const deferredQuery = useDeferredValue(debouncedQuery);
  const searchEnabled = deferredQuery.length >= 2;

  const search = useQuery({
    queryKey: ["conversation-search", deferredQuery, provider],
    queryFn: ({ signal }) => {
      const providerQuery =
        provider === "all" ? "" : `&provider=${encodeURIComponent(provider)}`;
      return apiGet<ConversationSearchEnvelope>(
        `/api/conversation-search?q=${encodeURIComponent(
          deferredQuery,
        )}&limit=120${providerQuery}`,
        { signal },
      );
    },
    enabled: searchEnabled,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const searchData =
    extractEnvelopeData<NonNullable<ConversationSearchEnvelope["data"]>>(search.data) ??
    {};
  const rawResults = searchData.results ?? [];
  const results = useMemo(() => {
    const deduped: ConversationSearchHit[] = [];
    const seen = new Set<string>();
    for (const hit of rawResults) {
      const key = searchHitDedupKey(hit);
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(hit);
    }
    return deduped;
  }, [rawResults]);
  const collapsedDuplicateCount = rawResults.length - results.length;
  const resultCount = results.length;
  const searchedSessions = searchData.searched_sessions ?? 0;
  const availableSessions = searchData.available_sessions ?? searchedSessions;
  const titleMatches = results.filter((hit) => hit.match_kind === "title").length;
  const messageMatches = results.filter((hit) => hit.match_kind === "message").length;

  const providerLabelById = useMemo(
    () => new Map(providerOptions.map((item) => [item.id, item.name])),
    [providerOptions],
  );
  const providerHitCount = useMemo(
    () => new Set(results.map((hit) => hit.provider)).size,
    [results],
  );
  const providerGroups = useMemo(() => {
    const groups = new Map<string, ConversationSearchHit[]>();
    for (const hit of results) {
      const list = groups.get(hit.provider) ?? [];
      list.push(hit);
      groups.set(hit.provider, list);
    }

    const orderedProviders =
      provider === "all"
        ? providerOptions.map((item) => item.id).filter((id) => id !== "all")
        : [provider];

    const orderedGroups = orderedProviders
      .map((providerId) => {
        const providerResults = groups.get(providerId) ?? [];
        const sessionMap = new Map<
          string,
          {
            key: string;
            openHit: ConversationSearchHit;
            title: string;
            source: string;
            matches: ConversationSearchHit[];
          }
        >();

        for (const hit of providerResults) {
          const sessionKey = hit.session_id || hit.file_path;
          const existing = sessionMap.get(sessionKey);
          if (existing) {
            existing.matches.push(hit);
            continue;
          }

          sessionMap.set(sessionKey, {
            key: sessionKey,
            openHit: hit,
            title:
              normalizeDisplayValue(hit.display_title) ||
              normalizeDisplayValue(hit.title) ||
              hit.session_id,
            source: normalizeDisplayValue(hit.source) || hit.file_path,
            matches: [hit],
          });
        }

        return {
          id: providerId,
          name: providerLabelById.get(providerId) ?? providerId,
          matchCount: providerResults.length,
          sessions: Array.from(sessionMap.values()),
        };
      })
      .filter((group) => group.sessions.length > 0);

    for (const [providerId, providerResults] of groups.entries()) {
      if (orderedProviders.includes(providerId)) continue;
      const sessionMap = new Map<
        string,
        {
          key: string;
          openHit: ConversationSearchHit;
          title: string;
          source: string;
          matches: ConversationSearchHit[];
        }
      >();
      for (const hit of providerResults) {
        const sessionKey = hit.session_id || hit.file_path;
        const existing = sessionMap.get(sessionKey);
        if (existing) {
          existing.matches.push(hit);
          continue;
        }
        sessionMap.set(sessionKey, {
          key: sessionKey,
          openHit: hit,
          title:
            normalizeDisplayValue(hit.display_title) ||
            normalizeDisplayValue(hit.title) ||
            hit.session_id,
          source: normalizeDisplayValue(hit.source) || hit.file_path,
          matches: [hit],
        });
      }
      orderedGroups.push({
        id: providerId,
        name: providerLabelById.get(providerId) ?? providerId,
        matchCount: providerResults.length,
        sessions: Array.from(sessionMap.values()),
      });
    }

    return orderedGroups;
  }, [provider, providerLabelById, providerOptions, results]);
  const showLoadingSkeleton = searchEnabled && search.isLoading && results.length === 0;
  const showLiveLoading = searchEnabled && search.isFetching;

  return (
    <section className="panel search-panel search-stage">
      <header className="search-stage-head">
        <div className="search-stage-title">
          <span className="search-scope-label">search stage</span>
          <h2>{messages.search.title}</h2>
          <p>원문 세션을 바로 찾는다.</p>
        </div>
        <div className="search-stage-badges">
          <span className="search-stage-badge">matches {resultCount}</span>
          <span className="search-stage-badge">providers {providerHitCount}</span>
        </div>
      </header>

      <div className="search-command-shell">
        <div className="search-command-bar">
          <span className="search-command-prompt" aria-hidden="true">
            &gt;
          </span>
          <input
            type="search"
            className="search-input search-input-stage"
            placeholder={messages.search.inputPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="search-command-shortcut" aria-hidden="true">
            <kbd>⌘</kbd>
            <kbd>K</kbd>
          </div>
        </div>

        <div className="search-command-meta search-command-meta-stage">
          <div className="search-command-meta-group">
            <div className="search-scope-label">{messages.search.providerFilter}</div>
            <div className="search-scope-chips" aria-label={messages.search.providerFilter}>
              <button
                type="button"
                className={`status-pill-button ${provider === "all" ? "status-active" : "status-detected"}`.trim()}
                onClick={() => setProvider("all")}
              >
                {messages.search.allProviders}
              </button>
              {providerOptions
                .filter((item) => item.id !== "all")
                .map((item) => (
                  <button
                    key={`search-chip-${item.id}`}
                    type="button"
                    className={`status-pill-button ${provider === item.id ? "status-active" : "status-detected"}`.trim()}
                    onClick={() => setProvider(item.id)}
                  >
                    {item.name}
                  </button>
                ))}
            </div>
          </div>
          <div className="search-command-meta-group">
            <div className="search-scope-label">빠른 검색 예시</div>
            <div className="search-example-chips">
              {sampleQueries.map((sample) => (
                <button
                  key={`sample-query-${sample}`}
                  type="button"
                  className="btn-outline btn-chip"
                  onClick={() => setQuery(sample)}
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="search-stage-layout">
        <div className="search-results-column">
          {!searchEnabled ? (
            <div className="search-idle-strip">
              <span>{messages.search.emptyIdle}</span>
            </div>
          ) : null}

          {showLiveLoading ? (
            <div className="search-live-strip" role="status" aria-live="polite">
              <span className="search-live-dot" aria-hidden="true" />
              <span>{messages.search.loading}</span>
            </div>
          ) : null}

          {searchEnabled && !search.isLoading ? (
            <div className="search-summary-strip" role="status" aria-live="polite">
              <span>
                <strong>{resultCount}</strong> {messages.search.resultCountBody}
              </span>
              <span>
                <strong>
                  {searchedSessions}/{availableSessions}
                </strong>{" "}
                {messages.search.scannedSessionsBody}
              </span>
              <span>
                <strong>{providerHitCount}</strong> AI · {messages.search.titleMatches} {titleMatches} · {messages.search.messageMatches}{" "}
                {messageMatches}
              </span>
            </div>
          ) : null}

          {searchEnabled && !search.isLoading && collapsedDuplicateCount > 0 ? (
            <div className="info-box compact">
              <p>{messages.search.dedupedHint.replace("{count}", String(collapsedDuplicateCount))}</p>
            </div>
          ) : null}

          {searchEnabled && !search.isLoading && results.length === 0 ? (
            <div className="info-box compact">
              <p>{messages.search.emptyResult}</p>
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
                      <span className="mono-sub">{group.sessions.length} sessions</span>
                      <span className="status-pill status-active">{group.matchCount}</span>
                    </div>
                  </div>
                  <div className="search-group-list">
                    {group.sessions.map((session) => {
                      const providerName = providerLabelById.get(session.openHit.provider) ?? session.openHit.provider;
                      const previewMatches = session.matches.slice(0, 2);
                      const remainingMatches = session.matches.length - previewMatches.length;
                      return (
                        <article
                          key={`${group.id}:${session.key}`}
                          className="search-result-card search-result-card-stage"
                          tabIndex={0}
                          role="button"
                          onClick={() => onOpenSession(session.openHit)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onOpenSession(session.openHit);
                            }
                          }}
                        >
                          <div className="search-result-main">
                            <div className="search-result-title-stack">
                              <strong className="search-result-title-link">{session.title}</strong>
                              <div className="mono-sub" title={session.openHit.session_id}>
                                {compactSessionId(session.openHit.session_id)}
                              </div>
                            </div>
                            <div className="search-result-top">
                              <span className="status-pill status-active">{providerName}</span>
                              <span className="search-result-kind">{session.matches.length} hits</span>
                            </div>
                          </div>
                          <div className="search-result-meta">
                            <span
                              className="search-result-source"
                              title={session.source}
                            >
                              {compactSourceLabel(session.source)}
                            </span>
                            <span>{formatDateTime(session.openHit.mtime)}</span>
                            <div className="search-result-actions">
                              <button
                                type="button"
                                className="btn-link-inline"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onOpenSession(session.openHit);
                                }}
                              >
                                {messages.search.openSession}
                              </button>
                              {session.openHit.thread_id ? (
                                <button
                                  type="button"
                                  className="btn-link-inline"
                                  onClick={(event) => {
                                    event.stopPropagation();
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
                                    : match.role || messages.search.matchMessage}
                                </span>
                                <p className="search-result-snippet search-result-snippet-compact">{match.snippet}</p>
                              </div>
                            ))}
                            {remainingMatches > 0 ? (
                              <div className="search-match-more">
                                +{remainingMatches} more hits in this session
                              </div>
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
      </div>
    </section>
  );
}
