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
        )}&limit=40${providerQuery}`,
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
    const seen = new Set<string>();
    return rawResults.filter((hit) => {
      const key = [
        hit.provider,
        hit.session_id,
        hit.match_kind,
        hit.role ?? "",
        normalizeDisplayValue(hit.display_title) || normalizeDisplayValue(hit.title) || "",
        normalizeDisplayValue(hit.snippet),
      ].join("::");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
      .map((providerId) => ({
        id: providerId,
        name: providerLabelById.get(providerId) ?? providerId,
        results: groups.get(providerId) ?? [],
      }))
      .filter((group) => group.results.length > 0);

    for (const [providerId, providerResults] of groups.entries()) {
      if (orderedProviders.includes(providerId)) continue;
      orderedGroups.push({
        id: providerId,
        name: providerLabelById.get(providerId) ?? providerId,
        results: providerResults,
      });
    }

    return orderedGroups;
  }, [provider, providerLabelById, providerOptions, results]);
  const showLoadingSkeleton = searchEnabled && search.isLoading && results.length === 0;
  const showLiveLoading = searchEnabled && search.isFetching;

  return (
    <section className="panel search-panel">
      <header>
        <h2>{messages.search.title}</h2>
        <span>{messages.search.subtitle}</span>
      </header>
      <div className="search-command-shell">
        <div className="search-command-head compact">
          <strong>{messages.search.heroTitle}</strong>
          <span>{messages.search.heroBody}</span>
        </div>
        <input
          type="search"
          className="search-input"
          placeholder={messages.search.inputPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="search-command-meta">
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
            <div className="search-scope-label">Try quick searches</div>
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

      {!searchEnabled ? (
        <div className="search-idle-strip">
          <span>{messages.search.emptyIdle}</span>
          <span className="sub-hint">{messages.search.helper}</span>
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
        <div className="search-result-list">
          {providerGroups.map((group) => (
            <section key={`search-group-${group.id}`} className="search-group-section">
              <div className="search-group-header">
                <strong>{group.name}</strong>
                <span className="status-pill status-active">{group.results.length}</span>
              </div>
              <div className="search-group-list">
                {group.results.map((hit, index) => {
                  const resultKey = `${hit.provider}:${hit.session_id}:${hit.match_kind}:${hit.role ?? "na"}:${index}`;
                  const providerName = providerLabelById.get(hit.provider) ?? hit.provider;
                  const resultTitle =
                    normalizeDisplayValue(hit.display_title) ||
                    normalizeDisplayValue(hit.title) ||
                    hit.session_id;
                  const resultSource = normalizeDisplayValue(hit.source) || hit.file_path;
                  return (
                    <article
                      key={resultKey}
                      className="search-result-card"
                      tabIndex={0}
                      role="button"
                      onClick={() => onOpenSession(hit)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpenSession(hit);
                        }
                      }}
                    >
                      <div className="search-result-main">
                        <div className="search-result-title-stack">
                          <strong className="search-result-title-link">{resultTitle}</strong>
                          <div className="mono-sub">{hit.session_id}</div>
                        </div>
                        <div className="search-result-top">
                          <span className="status-pill status-active">
                            {providerName}
                          </span>
                          <span className="search-result-kind">
                            {hit.match_kind === "title"
                              ? messages.search.matchTitle
                              : messages.search.matchMessage}
                          </span>
                        </div>
                      </div>
                      <div className="search-result-meta">
                        <span>{resultSource}</span>
                        <span>{formatDateTime(hit.mtime)}</span>
                        {hit.role ? <span>{hit.role}</span> : null}
                        <div className="search-result-actions">
                          <button
                            type="button"
                            className="btn-link-inline"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenSession(hit);
                            }}
                          >
                            {messages.search.openSession}
                          </button>
                          {hit.thread_id ? (
                            <button
                              type="button"
                              className="btn-link-inline"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpenThread(hit);
                              }}
                            >
                              {messages.search.openThread}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <p className="search-result-snippet search-result-snippet-compact">{hit.snippet}</p>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
