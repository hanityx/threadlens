import { useDeferredValue, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api";
import type { ConversationSearchEnvelope, ConversationSearchHit } from "../../types";
import type { Messages } from "../../i18n";
import { extractEnvelopeData, formatDateTime, normalizeDisplayValue } from "../../lib/helpers";
const HOME_PATH_MARKER = `/${"Users"}/`;

/* ── Recent searches ──────────────────────────────────────────── */

type RecentSearch = { q: string; ts: number };
const RECENT_KEY = "tl:search:recent";
const MAX_RECENT = 8;

function loadRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentSearch =>
        typeof item?.q === "string" && typeof item?.ts === "number",
    );
  } catch {
    return [];
  }
}

function addRecentSearch(query: string): RecentSearch[] {
  const current = loadRecentSearches();
  const updated: RecentSearch[] = [
    { q: query, ts: Date.now() },
    ...current.filter((item) => item.q !== query),
  ].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
  return updated;
}

function removeRecentSearch(query: string): RecentSearch[] {
  const current = loadRecentSearches();
  const updated = current.filter((item) => item.q !== query);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
  return updated;
}

function formatRecentTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export type SearchPanelProps = {
  messages: Messages;
  providerOptions: Array<{ id: string; name: string }>;
  onOpenSession: (hit: ConversationSearchHit) => void;
  onOpenThread: (hit: ConversationSearchHit) => void;
  initialQuery?: string;
};

function compactSessionId(sessionId?: string | null): string {
  if (!sessionId) return "session";
  if (sessionId.length <= 18) return sessionId;
  return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}

function compactSourceLabel(source?: string | null): string {
  if (!source) return "source";
  const normalized = source.replace(/\\/g, "/");
  if (!normalized.includes("/")) {
    return normalized.length > 28
      ? `${normalized.slice(0, 12)}…${normalized.slice(-8)}`
      : normalized;
  }
  const parts = normalized.split("/").filter(Boolean);
  const leaf = parts.at(-1) || normalized;
  return leaf.length > 28 ? `${leaf.slice(0, 12)}…${leaf.slice(-8)}` : leaf;
}

function compactProviderName(provider?: string | null): string {
  if (!provider) return "session";
  if (provider === "claude-cli") return "Claude";
  if (provider === "gemini-cli") return "Gemini";
  if (provider === "copilot-chat") return "Copilot";
  if (provider === "codex") return "Codex";
  return provider
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function compactSearchTitle(hit: ConversationSearchHit): string {
  const fallback =
    hit.thread_id
      ? `thread ${hit.thread_id.slice(0, 8)}`
      : hit.session_id
        ? `session ${hit.session_id.slice(0, 8)}`
        : "session result";
  const raw = normalizeDisplayValue(hit.display_title) || normalizeDisplayValue(hit.title);
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  const looksGenerated =
    lower === "none" ||
    lower === "unknown" ||
    lower.startsWith("rollout-") ||
    raw.includes("AGENTS.md") ||
    raw.includes("<INSTRUCTIONS>") ||
    raw.includes(HOME_PATH_MARKER) ||
    raw.length > 88;
  return looksGenerated ? fallback : raw;
}

function compactSearchSnippet(hit: ConversationSearchHit): string {
  const raw = String(hit.snippet || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const normalized = raw
    .replace(/^#\s*AGENTS\.md instructions for .*?<INSTRUCTIONS>\s*/i, "AGENTS instructions ")
    .replace(/^#\s*Global AGENTS\s*/i, "Global agents ")
    .replace(/\/Users\/[^\s)]+/g, "workspace path")
    .trim();
  const lower = normalized.toLowerCase();
  const rolePrefix =
    hit.role === "assistant"
      ? "Assistant"
      : hit.role === "tool"
        ? "Tool"
        : hit.role === "developer" || hit.role === "system"
          ? "Policy"
          : "User";
  const providerLabel = compactProviderName(hit.provider);

  if (lower.includes("agents instructions") || lower.includes("global agents")) {
    return `${providerLabel} policy note on workspace rules.`;
  }
  if (
    lower.includes("workspace path") ||
    lower.includes(".jsonl") ||
    lower.includes("rollout-")
  ) {
    return `${providerLabel} archive path note with workspace context.`;
  }
  if (
    lower.includes("diagnostics") ||
    lower.includes("provider") ||
    lower.includes("parser") ||
    lower.includes("flow")
  ) {
    return lower.includes("parser") || lower.includes("flow")
      ? `${providerLabel} parser and flow diagnostics.`
      : `${providerLabel} provider diagnostics note.`;
  }
  if (
    lower.includes("review") ||
    lower.includes("flagged") ||
    lower.includes("impact") ||
    lower.includes("cleanup")
  ) {
    if (lower.includes("cleanup")) return `${providerLabel} cleanup note from the review trail.`;
    if (lower.includes("flagged")) return `${providerLabel} flagged review note.`;
    return `${providerLabel} review trace with impact context.`;
  }
  if (
    lower.includes("session") ||
    lower.includes("transcript") ||
    lower.includes("assistant") ||
    lower.includes("user")
  ) {
    if (rolePrefix === "Assistant") return `${providerLabel} assistant reply from the archived session.`;
    if (rolePrefix === "Tool") return `${providerLabel} tool output from the archived session.`;
    if (rolePrefix === "Policy") return `${providerLabel} policy note from the archived session.`;
    return "User prompt from the archived session.";
  }

  return normalized.length > 118 ? `${normalized.slice(0, 115)}…` : normalized;
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
  initialQuery = "",
}: SearchPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(
    () => loadRecentSearches(),
  );
  const handleRemoveRecent = useCallback((q: string) => {
    setRecentSearches(removeRecentSearch(q));
  }, []);
  useEffect(() => {
    if (!initialQuery) return;
    setQuery((prev) => (prev === initialQuery ? prev : initialQuery));
  }, [initialQuery]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setQuery("");
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);
  const deferredQuery = useDeferredValue(debouncedQuery);
  const searchEnabled = deferredQuery.length >= 2;

  useEffect(() => {
    if (debouncedQuery.length < 2) return;
    setRecentSearches(addRecentSearch(debouncedQuery));
  }, [debouncedQuery]);

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
            title: compactSearchTitle(hit),
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
          title: compactSearchTitle(hit),
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
          <span className="overview-note-label">search</span>
          <h2>{messages.search.title}</h2>
          <p>Threads, sessions, keywords.</p>
        </div>
      </header>

      <div className="search-command-shell">
        <div className="search-command-breadcrumb">
          <span className="search-command-path is-brand">threadlens</span>
          <span className="search-command-slash">/</span>
          <span className="search-command-path">search</span>
          <span className="search-command-slash">/</span>
          <span className="search-command-path is-active">
            {provider === "all" ? "all ai" : providerLabelById.get(provider) ?? provider}
          </span>
          <span className="search-command-runtime">
            {searchEnabled ? `${availableSessions} rows` : "idle"}
          </span>
        </div>
        <div className="search-command-body">
          <div className="search-command-left">
            <div className="search-command-bar">
              <span className="search-command-prompt" aria-hidden="true">&gt;</span>
              <input
                ref={inputRef}
                type="search"
                className="search-input search-input-stage"
                aria-label="Search conversations"
                placeholder={messages.search.inputPlaceholder}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="search-command-meta-group">
              <div className="search-scope-label">{messages.search.providerFilter}</div>
              <div className="search-scope-chips" aria-label={messages.search.providerFilter}>
                <button
                  type="button"
                  className={`status-pill-button search-pill ${provider === "all" ? "status-active" : "status-preview"}`.trim()}
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
                      className={`status-pill-button search-pill ${provider === item.id ? "status-active" : "status-preview"}`.trim()}
                      onClick={() => setProvider(item.id)}
                    >
                      {item.name}
                    </button>
                  ))}
              </div>
            </div>
          </div>
          <div className="search-command-tips">
            <div className="search-tips-col">
              <div className="search-scope-label">tips</div>
              <div className="search-tips-list">
                <div className="search-tip-row">
                  <span className="search-tip-key">keywords</span>
                  <span className="search-tip-desc">free text, any order</span>
                </div>
                <div className="search-tip-row">
                  <span className="search-tip-key">filename</span>
                  <span className="search-tip-desc">AGENTS.md, .jsonl</span>
                </div>
                <div className="search-tip-row">
                  <span className="search-tip-key">scope</span>
                  <span className="search-tip-desc">filter by provider</span>
                </div>
              </div>
            </div>
            <div className="search-tips-col">
              <div className="search-scope-label">shortcuts</div>
              <div className="search-tips-shortcuts">
                <div className="search-tip-row">
                  <kbd className="search-tip-kbd">⌘K</kbd>
                  <span className="search-tip-desc">focus search</span>
                </div>
                <div className="search-tip-row">
                  <kbd className="search-tip-kbd">Esc</kbd>
                  <span className="search-tip-desc">clear query</span>
                </div>
              </div>
            </div>
            <div className="search-tips-recent">
              <div className="search-scope-label">{messages.search.recentSearches}</div>
              {recentSearches.length === 0 ? (
                <div className="search-recent-list">
                  {([
                    { q: "parser health", t: "2m ago" },
                    { q: "gemini session", t: "1h ago" },
                    { q: "AGENTS.md review", t: "3h ago" },
                    { q: "threadlens debug", t: "yesterday" },
                    { q: "copilot backup", t: "2d ago" },
                    { q: "codex transcript", t: "3d ago" },
                  ]).map(({ q, t }) => (
                    <div key={q} className="search-recent-item search-recent-sample" aria-hidden="true">
                      <span className="search-recent-icon">↺</span>
                      <span className="search-recent-query">{q}</span>
                      <span className="search-recent-time">{t}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="search-recent-list">
                  {recentSearches.slice(0, 6).map((item) => (
                    <div
                      key={item.ts}
                      className="search-recent-item"
                      role="button"
                      tabIndex={0}
                      onClick={() => setQuery(item.q)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setQuery(item.q);
                        }
                      }}
                    >
                      <span className="search-recent-icon" aria-hidden="true">↺</span>
                      <span className="search-recent-query">{item.q}</span>
                      <span className="search-recent-time">{formatRecentTime(item.ts)}</span>
                      <button
                        type="button"
                        className="search-recent-remove"
                        aria-label={`Remove "${item.q}" from recent searches`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveRecent(item.q);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="search-stage-layout">
        <div className="search-results-column">
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
                <strong>{providerHitCount}</strong> AI · <strong>{messageMatches}</strong> {messages.search.messageMatches}
              </span>
            </div>
          ) : null}

          {searchEnabled && !search.isLoading && collapsedDuplicateCount > 0 ? (
            <div className="info-box compact search-dedupe-strip">
              <p>{messages.search.dedupedHint.replace("{count}", String(collapsedDuplicateCount))}</p>
            </div>
          ) : null}

          {searchEnabled && !search.isLoading && results.length === 0 ? (
            <div className="info-box compact search-empty-strip">
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
                      <span className="mono-sub">{group.sessions.length} rows</span>
                      <span className="status-pill status-active">{group.matchCount}</span>
                    </div>
                  </div>
                  <div className="search-group-list">
                    {group.sessions.map((session) => {
                      const providerName = providerLabelById.get(session.openHit.provider) ?? session.openHit.provider;
                      const previewMatches = session.matches.slice(0, 1);
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
                              <strong className="search-result-title-link" title={session.openHit.session_id}>
                                {session.title}
                              </strong>
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
                            <div className="search-result-actions">
                              <button
                                type="button"
                                className="status-pill-button search-inline-pill"
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
                                  className="status-pill-button search-inline-pill"
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
                                <p className="search-result-snippet search-result-snippet-compact">
                                  {compactSearchSnippet(match)}
                                </p>
                              </div>
                            ))}
                            {remainingMatches > 0 ? (
                              <div className="search-match-more">
                                +{remainingMatches} more
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
