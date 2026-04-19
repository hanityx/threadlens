import { type RefObject, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { SEARCHABLE_PROVIDER_IDS } from "@threadlens/shared-contracts";
import { apiGet } from "@/api";
import type { Messages } from "@/i18n";
import type { ConversationSearchEnvelope, ConversationSearchHit } from "@/shared/types";
import { SEARCH_PROVIDER_STORAGE_KEY, readStorageValue, writeStorageValue } from "@/shared/lib/appState";
import { extractEnvelopeData, formatDateTime } from "@/shared/lib/format";
import { SearchCommandShell } from "@/features/search/components/SearchCommandShell";
import { SearchResultsColumn } from "@/features/search/components/SearchResultsColumn";
import {
  addRecentSearch,
  buildProviderGroups,
  isSearchFocusShortcut,
  loadRecentSearches,
  removeRecentSearch,
  searchHitDedupKey,
  type RecentSearch,
} from "@/features/search/model/searchPanelModel";

export {
  isSearchFocusShortcut,
  shouldIgnoreSearchCardKeyboardActivation,
} from "@/features/search/model/searchPanelModel";

export type SearchPanelProps = {
  messages: Messages;
  providerOptions: Array<{ id: string; name: string }>;
  sessionOpenProviderIds?: string[];
  onOpenSession: (hit: ConversationSearchHit) => void;
  onOpenThread: (hit: ConversationSearchHit) => void;
  initialQuery?: string;
  onQueryDraftChange?: (query: string) => void;
};

export function SearchPanel({
  messages,
  providerOptions,
  sessionOpenProviderIds = [],
  onOpenSession,
  onOpenThread,
  initialQuery = "",
  onQueryDraftChange,
}: SearchPanelProps) {
  const initialTrimmedQuery = initialQuery.trim();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialTrimmedQuery);
  const [provider, setProvider] = useState(() => {
    const saved = readStorageValue([SEARCH_PROVIDER_STORAGE_KEY]);
    return saved && SEARCHABLE_PROVIDER_IDS.includes(saved as (typeof SEARCHABLE_PROVIDER_IDS)[number])
      ? saved
      : "all";
  });
  const [debouncedQuery, setDebouncedQuery] = useState(initialTrimmedQuery);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(() => new Set());
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(() => loadRecentSearches());

  const handleRemoveRecent = useCallback((searchQuery: string) => {
    setRecentSearches(removeRecentSearch(searchQuery));
  }, []);

  useEffect(() => {
    if (!initialQuery) return;
    setQuery((prev) => (prev === initialQuery ? prev : initialQuery));
  }, [initialQuery]);

  useEffect(() => {
    onQueryDraftChange?.(query);
  }, [onQueryDraftChange, query]);

  useEffect(() => {
    writeStorageValue(SEARCH_PROVIDER_STORAGE_KEY, provider);
  }, [provider]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isSearchFocusShortcut(event)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape") {
        setQuery("");
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) {
          activeElement.blur();
        } else {
          inputRef.current?.blur();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = query.trim();
      setDebouncedQuery(next);
      startTransition(() => {
        setExpandedSessions(new Set());
        setActiveSessionKey(null);
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const deferredQuery = useDeferredValue(debouncedQuery);
  const searchEnabled = deferredQuery.length >= 2;

  useEffect(() => {
    if (debouncedQuery.length < 2) return;
    setRecentSearches(addRecentSearch(debouncedQuery));
  }, [debouncedQuery]);

  const visibleRecentSearches = recentSearches.slice(0, 6);
  const recentLayout =
    visibleRecentSearches.length === 0
      ? "empty"
      : visibleRecentSearches.length <= 2
        ? "inline"
        : "strip";

  const search = useQuery({
    queryKey: ["conversation-search", deferredQuery, provider],
    queryFn: ({ signal }) => {
      const providerQuery =
        provider === "all"
          ? `&provider=${encodeURIComponent(SEARCHABLE_PROVIDER_IDS.join(","))}`
          : `&provider=${encodeURIComponent(provider)}`;
      return apiGet<ConversationSearchEnvelope>(
        `/api/conversation-search?q=${encodeURIComponent(deferredQuery)}&limit=120${providerQuery}`,
        { signal },
      );
    },
    enabled: searchEnabled,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const searchData =
    extractEnvelopeData<NonNullable<ConversationSearchEnvelope["data"]>>(search.data) ?? {};
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
  const messageMatches = results.filter((hit) => hit.match_kind === "message").length;
  const providerLabelById = useMemo(
    () => new Map(providerOptions.map((item) => [item.id, item.name])),
    [providerOptions],
  );
  const providerHitCount = useMemo(
    () => new Set(results.map((hit) => hit.provider)).size,
    [results],
  );
  const providerGroups = useMemo(
    () =>
      buildProviderGroups({
        provider,
        providerLabelById,
        providerOptions,
        results,
      }),
    [provider, providerLabelById, providerOptions, results],
  );
  const showLoadingSkeleton = searchEnabled && search.isLoading && results.length === 0;
  const showLiveLoading = searchEnabled && search.isFetching;
  const statusText =
    results.length === 0
      ? showLiveLoading
        ? messages.search.loading
        : messages.search.emptyResult
      : null;

  return (
    <section className="panel search-panel search-stage">
      <header className="search-stage-head">
        <div className="search-stage-title">
          <span className="overview-note-label">{messages.search.commandPathLabel}</span>
          <h2>{messages.search.title}</h2>
          <p>{messages.search.stageBody}</p>
        </div>
      </header>

      <SearchCommandShell
        messages={messages}
        provider={provider}
        providerOptions={providerOptions}
        providerLabel={
        provider === "all" ? messages.search.allProviders : providerLabelById.get(provider) ?? provider
        }
        searchEnabled={searchEnabled}
        inputRef={inputRef as RefObject<HTMLInputElement>}
        query={query}
        setQuery={setQuery}
        recentLayout={recentLayout}
        visibleRecentSearches={visibleRecentSearches}
        onSelectProvider={setProvider}
        onRemoveRecent={handleRemoveRecent}
      />

      <div className="search-stage-layout">
        <SearchResultsColumn
          messages={messages}
          searchEnabled={searchEnabled}
          resultCount={resultCount}
          searchedSessions={searchedSessions}
          availableSessions={availableSessions}
          providerHitCount={providerHitCount}
          messageMatches={messageMatches}
          collapsedDuplicateCount={collapsedDuplicateCount}
          statusText={statusText}
          showLiveLoading={showLiveLoading}
          showLoadingSkeleton={showLoadingSkeleton}
          providerGroups={providerGroups}
          providerLabelById={providerLabelById}
          expandedSessions={expandedSessions}
          activeSessionKey={activeSessionKey}
          sessionOpenProviderIds={sessionOpenProviderIds}
          setActiveSessionKey={setActiveSessionKey}
          setExpandedSessions={setExpandedSessions}
          onOpenSession={onOpenSession}
          onOpenThread={onOpenThread}
        />
      </div>
    </section>
  );
}
