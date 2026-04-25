import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { SEARCHABLE_PROVIDER_IDS } from "@threadlens/shared-contracts";
import { apiGet } from "@/api";
import type { Messages } from "@/i18n";
import type {
  ConversationSearchEnvelope,
  ConversationSearchSession,
  ConversationSearchSessionHitsEnvelope,
} from "@/shared/types";
import {
  readPersistedSearchProviderPreference,
  SEARCH_PROVIDER_STORAGE_KEY,
  writeStorageValue,
} from "@/shared/lib/appState";
import { extractEnvelopeData } from "@/shared/lib/format";
import { SearchCommandShell } from "@/features/search/components/SearchCommandShell";
import { SearchResultsColumn } from "@/features/search/components/SearchResultsColumn";
import {
  addRecentSearch,
  buildSessionHitsFailureState,
  buildSearchSessionKey,
  buildProviderGroups,
  clearDismissedActiveRecentSearch,
  isSearchFocusShortcut,
  loadRecentSearches,
  removeRecentSearch,
  shouldSkipHydratedInitialRecentPersistence,
  syncDismissedActiveRecentSearch,
  type LoadedSessionHitsState,
  type RecentSearch,
  type SearchSessionGroup,
} from "@/features/search/model/searchPanelModel";

export {
  isSearchFocusShortcut,
  shouldIgnoreSearchCardKeyboardActivation,
} from "@/features/search/model/searchPanelModel";

const SEARCH_RESULTS_PAGE_SIZE = 40;
const SEARCH_PREVIEW_HITS_PER_SESSION = 3;
const SEARCH_SESSION_HITS_PAGE_SIZE = 40;

type SearchPanelProps = {
  messages: Messages;
  providerOptions: Array<{ id: string; name: string }>;
  sessionOpenProviderIds?: string[];
  onOpenSession: (hit: SearchSessionGroup["openHit"]) => void;
  onOpenThread: (hit: SearchSessionGroup["openHit"]) => void;
  initialQuery?: string;
};

export function SearchPanel({
  messages,
  providerOptions,
  sessionOpenProviderIds = [],
  onOpenSession,
  onOpenThread,
  initialQuery = "",
}: SearchPanelProps) {
  const initialTrimmedQuery = initialQuery.trim();
  const inputRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const hydratedInitialRecentPersistPendingRef = useRef(Boolean(initialTrimmedQuery));
  const [query, setQuery] = useState(initialTrimmedQuery);
  const [provider, setProvider] = useState(() => {
    const saved = readPersistedSearchProviderPreference();
    return saved && SEARCHABLE_PROVIDER_IDS.includes(saved as (typeof SEARCHABLE_PROVIDER_IDS)[number])
      ? saved
      : "all";
  });
  const [debouncedQuery, setDebouncedQuery] = useState(initialTrimmedQuery);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(() => new Set());
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null);
  const [sessionHitsBySession, setSessionHitsBySession] = useState<
    Record<string, LoadedSessionHitsState | undefined>
  >({});
  const sessionHitsBySessionRef = useRef<Record<string, LoadedSessionHitsState | undefined>>({});
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
    syncDismissedActiveRecentSearch(query);
  }, [query]);

  useEffect(() => {
    sessionHitsBySessionRef.current = sessionHitsBySession;
  }, [sessionHitsBySession]);

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
        clearDismissedActiveRecentSearch();
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
        setSessionHitsBySession({});
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const deferredQuery = useDeferredValue(debouncedQuery);
  const searchEnabled = deferredQuery.length >= 2;

  useEffect(() => {
    if (debouncedQuery.length < 2) return;
    const shouldSkipHydratedInitialPersist =
      shouldSkipHydratedInitialRecentPersistence({
        initialQuery: initialTrimmedQuery,
        debouncedQuery,
        hydratedInitialPending: hydratedInitialRecentPersistPendingRef.current,
      });
    hydratedInitialRecentPersistPendingRef.current = false;
    if (shouldSkipHydratedInitialPersist) return;
    setRecentSearches(addRecentSearch(debouncedQuery));
  }, [debouncedQuery, initialTrimmedQuery]);

  const visibleRecentSearches = recentSearches.slice(0, 6);
  const recentLayout =
    visibleRecentSearches.length === 0
      ? "empty"
      : visibleRecentSearches.length <= 2
        ? "inline"
        : "strip";

  const search = useInfiniteQuery({
    queryKey: ["conversation-search", deferredQuery, provider],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const providerQuery =
        provider === "all"
          ? `&provider=${encodeURIComponent(SEARCHABLE_PROVIDER_IDS.join(","))}`
          : `&provider=${encodeURIComponent(provider)}`;
      const cursorQuery = pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : "";
      return apiGet<ConversationSearchEnvelope>(
        `/api/conversation-search?q=${encodeURIComponent(deferredQuery)}&page_size=${SEARCH_RESULTS_PAGE_SIZE}&preview_hits_per_session=${SEARCH_PREVIEW_HITS_PER_SESSION}${providerQuery}${cursorQuery}`,
        { signal },
      );
    },
    getNextPageParam: (lastPage) => {
      const data =
        extractEnvelopeData<NonNullable<ConversationSearchEnvelope["data"]>>(lastPage) ?? {};
      return data.next_cursor || undefined;
    },
    enabled: searchEnabled,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const searchPages = search.data?.pages ?? [];
  const firstPage =
    extractEnvelopeData<NonNullable<ConversationSearchEnvelope["data"]>>(
      searchPages[0] ?? null,
    ) ?? {};
  const sessions = searchPages.flatMap(
    (page) =>
      extractEnvelopeData<NonNullable<ConversationSearchEnvelope["data"]>>(page)?.sessions ?? [],
  );
  const searchedSessions = firstPage.searched_sessions ?? 0;
  const availableSessions = firstPage.available_sessions ?? searchedSessions;
  const summarySessionCount = firstPage.total_matching_sessions ?? sessions.length;
  const summaryHitCount =
    firstPage.total_matching_hits ??
    sessions.reduce((sum, session) => sum + Number(session.match_count || 0), 0);
  const summaryHitCountIsApproximate =
    firstPage.total_matching_hits == null &&
    (sessions.some((session) => session.has_more_hits) || Boolean(search.hasNextPage));
  const providerLabelById = useMemo(
    () => new Map(providerOptions.map((item) => [item.id, item.name])),
    [providerOptions],
  );
  const providerGroups = useMemo(
    () =>
      buildProviderGroups({
        provider,
        providerLabelById,
        providerOptions,
        sessions,
      }),
    [provider, providerLabelById, providerOptions, sessions],
  );

  const showLoadingSkeleton = searchEnabled && search.isLoading && sessions.length === 0;
  const showLiveLoading = searchEnabled && search.isFetching && sessions.length === 0;
  const statusText =
    sessions.length === 0
      ? showLiveLoading
        ? messages.search.loading
        : messages.search.emptyResult
      : null;

  const loadSessionHits = useCallback(
    async (session: ConversationSearchSession) => {
      const sessionKey = buildSearchSessionKey(session);
      const existing = sessionHitsBySessionRef.current[sessionKey];
      if (existing?.loading) return;
      if (existing && !existing.hasMore) return;

      setSessionHitsBySession((prev) => ({
        ...prev,
        [sessionKey]: {
          hits: prev[sessionKey]?.hits ?? [],
          loading: true,
          hasMore: prev[sessionKey]?.hasMore ?? session.has_more_hits,
          nextCursor: prev[sessionKey]?.nextCursor ?? null,
        },
      }));

      try {
        const cursor = existing?.nextCursor ? `&cursor=${encodeURIComponent(existing.nextCursor)}` : "";
        const envelope = await apiGet<ConversationSearchSessionHitsEnvelope>(
          `/api/conversation-search/session-hits?q=${encodeURIComponent(deferredQuery)}&provider=${encodeURIComponent(session.provider)}&session_id=${encodeURIComponent(session.session_id)}&file_path=${encodeURIComponent(session.file_path)}&page_size=${SEARCH_SESSION_HITS_PAGE_SIZE}${cursor}`,
        );
        const data =
          extractEnvelopeData<NonNullable<ConversationSearchSessionHitsEnvelope["data"]>>(envelope) ??
          {};
        setSessionHitsBySession((prev) => {
          const previousHits = prev[sessionKey]?.hits ?? [];
          const incomingHits = data.hits ?? [];
          return {
            ...prev,
            [sessionKey]: {
              hits: cursor ? [...previousHits, ...incomingHits] : incomingHits,
              loading: false,
              hasMore: Boolean(data.has_more),
              nextCursor: data.next_cursor ?? null,
            },
          };
        });
      } catch {
        setSessionHitsBySession((prev) => ({
          ...prev,
          [sessionKey]: buildSessionHitsFailureState(prev[sessionKey], session.has_more_hits),
        }));
      }
    },
    [deferredQuery],
  );

  useEffect(() => {
    if (!hasWindowIntersectionObserver() || !search.hasNextPage || search.isFetchingNextPage) {
      return;
    }
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry?.isIntersecting) return;
      void search.fetchNextPage();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [search.fetchNextPage, search.hasNextPage, search.isFetchingNextPage, sessions.length]);

  return (
    <section className="panel search-panel search-stage">
      <header className="search-stage-head">
        <div className="search-stage-title">
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
        inputRef={inputRef}
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
          summarySessionCount={summarySessionCount}
          summaryHitCount={summaryHitCount}
          summaryHitCountIsApproximate={summaryHitCountIsApproximate}
          loadedSessionCount={sessions.length}
          searchedSessions={searchedSessions}
          availableSessions={availableSessions}
          statusText={statusText}
          showLiveLoading={showLiveLoading}
          showLoadingSkeleton={showLoadingSkeleton}
          providerGroups={providerGroups}
          providerLabelById={providerLabelById}
          expandedSessions={expandedSessions}
          activeSessionKey={activeSessionKey}
          sessionOpenProviderIds={sessionOpenProviderIds}
          sessionHitsBySession={sessionHitsBySession}
          hasNextPage={Boolean(search.hasNextPage)}
          isFetchingNextPage={search.isFetchingNextPage}
          loadMoreRef={loadMoreRef}
          onLoadMoreResults={() => {
            void search.fetchNextPage();
          }}
          onLoadSessionHits={(session) => {
            void loadSessionHits(session.result);
          }}
          setActiveSessionKey={setActiveSessionKey}
          setExpandedSessions={setExpandedSessions}
          onOpenSession={onOpenSession}
          onOpenThread={onOpenThread}
        />
      </div>
    </section>
  );
}

function hasWindowIntersectionObserver(): boolean {
  return typeof window !== "undefined" && typeof window.IntersectionObserver !== "undefined";
}
