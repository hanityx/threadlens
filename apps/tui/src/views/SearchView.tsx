import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { searchConversations } from "../api.js";
import { PROVIDERS, type ProviderScope } from "../config.js";
import type { Locale, TuiMessages } from "../i18n/types.js";
import type { SearchSession } from "../types.js";
import { formatDateLabel, getWindowedItems, truncate } from "../lib/format.js";
import { isReservedGlobalShortcut } from "../lib/globalShortcut.js";
import { shouldLeaveSearchQueryMode } from "../lib/searchFocus.js";

type SearchSessionGroup = {
  key: string;
  provider: ProviderScope;
  title: string;
  filePath: string;
  threadId?: string | null;
  source: string;
  mtime: string;
  matchCount: number;
  snippets: string[];
  hasMoreHits: boolean;
};

function formatApproximateCountLabel(text: string, count: number, approximate = false): string {
  if (!approximate) return text;
  const token = String(count);
  const tokenIndex = text.indexOf(token);
  if (tokenIndex < 0) return `${text}+`;
  return `${text.slice(0, tokenIndex)}${token}+${text.slice(tokenIndex + token.length)}`;
}

export function groupSearchSessions(sessions: SearchSession[]): SearchSessionGroup[] {
  return sessions
    .map((session) => ({
      key: `${session.provider}::${session.session_id || session.file_path}`,
      provider: session.provider as ProviderScope,
      title: session.display_title || session.title || session.session_id,
      filePath: session.file_path,
      threadId: session.thread_id,
      source: session.source || "-",
      mtime: session.mtime,
      matchCount: session.match_count,
      snippets: Array.from(
        new Set(
          (session.preview_matches ?? [])
            .map((match) => match.snippet)
            .filter((snippet): snippet is string => snippet.trim().length > 0),
        ),
      ),
      hasMoreHits: session.has_more_hits,
    }))
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      return b.mtime.localeCompare(a.mtime);
    });
}

export function resolveSearchSelectionIndex(
  groupedResults: SearchSessionGroup[],
  currentIndex: number,
  currentSelectedKey: string | null,
): number {
  if (groupedResults.length === 0) return 0;
  if (currentSelectedKey) {
    const preservedIndex = groupedResults.findIndex((group) => group.key === currentSelectedKey);
    if (preservedIndex >= 0) return preservedIndex;
  }
  return Math.max(0, Math.min(groupedResults.length - 1, currentIndex));
}

type SearchMeta = {
  searched: number;
  available: number;
  truncated: boolean;
};

export function buildSearchMeta(data: {
  searched_sessions?: number;
  available_sessions?: number;
  truncated?: boolean;
}): SearchMeta {
  const searched = Number(data.searched_sessions ?? 0);
  const available = Number(data.available_sessions ?? searched);
  return {
    searched,
    available,
    truncated: Boolean(data.truncated),
  };
}

export function formatSearchMeta(messages: TuiMessages, meta: SearchMeta): string {
  return messages.search.sessionsSummary(meta.searched, meta.available, meta.truncated);
}

export function formatSearchResultSummary(messages: TuiMessages, groupedCount: number, hitCount: number): string {
  return messages.search.groupedSummary(groupedCount, hitCount);
}

export function formatSearchHitCount(messages: TuiMessages, count: number, approximate = false): string {
  return formatApproximateCountLabel(messages.search.hitCount(count), count, approximate);
}

export function formatSearchEmptyState(messages: TuiMessages, query: string): string {
  return query.trim().length < 2
    ? messages.search.enterAtLeastTwoCharacters
    : messages.search.noResultsFound;
}

export function formatSearchSnippetPager(messages: TuiMessages, current: number, total: number): string {
  return messages.search.snippetPager(current, total);
}

const PROVIDER_COLOR: Record<string, string> = {
  codex: "yellow",
  claude: "magenta",
  gemini: "blue",
  copilot: "cyan",
  all: "white",
};

function providerBadge(provider: string): string {
  const badges: Record<string, string> = {
    codex: "CDX",
    claude: "CLU",
    gemini: "GEM",
    copilot: "CPT",
  };
  return badges[provider] ?? provider.slice(0, 3).toUpperCase();
}

export function SearchView(props: {
  active: boolean;
  locale: Locale;
  messages: TuiMessages;
  onOpenSession: (provider: ProviderScope, filePath: string) => void;
  onOpenCleanup: (threadId: string) => void;
  initialQuery?: string;
  initialProvider?: ProviderScope;
  initialFocusMode?: "query" | "results";
  reserveUpdateShortcuts?: boolean;
  onTextEntryChange?: (locked: boolean) => void;
  onQueryChange?: (query: string) => void;
  onProviderChange?: (provider: ProviderScope) => void;
  onFocusModeChange?: (mode: "query" | "results") => void;
}) {
  const {
    active,
    locale,
    messages,
    onOpenSession,
    onOpenCleanup,
    initialQuery,
    initialProvider,
    initialFocusMode,
    reserveUpdateShortcuts = false,
    onTextEntryChange,
    onQueryChange,
    onProviderChange,
    onFocusModeChange,
  } = props;
  const [query, setQuery] = useState(initialQuery ?? "");
  const [providerIndex, setProviderIndex] = useState(
    Math.max(0, PROVIDERS.indexOf(initialProvider ?? "all")),
  );
  const provider = PROVIDERS[providerIndex]!;
  const [results, setResults] = useState<SearchSession[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<SearchMeta>({ searched: 0, available: 0, truncated: false });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMorePages, setHasMorePages] = useState(false);
  const [focusMode, setFocusMode] = useState<"query" | "results">(initialFocusMode ?? "query");
  const [refreshTick, setRefreshTick] = useState(0);
  const [snippetIndex, setSnippetIndex] = useState(0);
  const selectedKeyRef = useRef<string | null>(null);
  const { stdout } = useStdout();
  const stackedLayout = (stdout?.columns ?? process.stdout.columns ?? 120) < 108;

  useEffect(() => {
    onTextEntryChange?.(focusMode === "query");
    onFocusModeChange?.(focusMode);
  }, [focusMode, onFocusModeChange, onTextEntryChange]);

  useEffect(() => { onQueryChange?.(query); }, [onQueryChange, query]);
  useEffect(() => { onProviderChange?.(provider); }, [onProviderChange, provider]);

  const applySearchPage = useCallback((
    data: NonNullable<Awaited<ReturnType<typeof searchConversations>>>,
    append: boolean,
  ) => {
    const incoming = data.sessions ?? [];
    setResults((prev) => (append ? [...prev, ...incoming] : incoming));
    setMeta(buildSearchMeta(data));
    setNextCursor(data.next_cursor ?? null);
    setHasMorePages(Boolean(data.has_more));
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSelectedIndex(0);
      selectedKeyRef.current = null;
      setMeta({ searched: 0, available: 0, truncated: false });
      setNextCursor(null);
      setHasMorePages(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      selectedKeyRef.current = null;
      setLoading(true);
      setLoadingMore(false);
      setError(null);
      void searchConversations(query.trim(), provider, null)
        .then((data) => {
          if (cancelled) return;
          applySearchPage(data, false);
          setSelectedIndex(0);
          setSnippetIndex(0);
          if ((initialFocusMode ?? "query") === "results") setFocusMode("results");
        })
        .catch((err) => {
          if (cancelled) return;
          setResults([]);
          setMeta({ searched: 0, available: 0, truncated: false });
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [applySearchPage, initialFocusMode, provider, query, refreshTick]);

  const groupedResults = useMemo<SearchSessionGroup[]>(() => {
    return groupSearchSessions(results);
  }, [results]);

  const loadNextPage = useCallback(() => {
    if (loading || loadingMore) return;
    if (!hasMorePages || !nextCursor) return;
    if (query.trim().length < 2) return;
    selectedKeyRef.current = groupedResults[selectedIndex]?.key ?? null;
    setLoadingMore(true);
    setError(null);
    void searchConversations(query.trim(), provider, nextCursor)
      .then((data) => {
        applySearchPage(data, true);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoadingMore(false);
      });
  }, [applySearchPage, groupedResults, hasMorePages, loading, loadingMore, nextCursor, provider, query, selectedIndex]);

  const visibleHitCount = useMemo(
    () => groupedResults.reduce((sum, group) => sum + group.matchCount, 0),
    [groupedResults],
  );
  const visibleHitCountIsApproximate = useMemo(
    () => hasMorePages || groupedResults.some((group) => group.hasMoreHits),
    [groupedResults, hasMorePages],
  );

  const providerSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of groupedResults) counts.set(g.provider, (counts.get(g.provider) ?? 0) + 1);
    return Array.from(counts.entries()).map(([n, c]) => `${n} ${c}`).join(" · ");
  }, [groupedResults]);

  useEffect(() => {
    const nextIndex = resolveSearchSelectionIndex(groupedResults, selectedIndex, selectedKeyRef.current);
    if (nextIndex !== selectedIndex) {
      setSelectedIndex(nextIndex);
      return;
    }
    selectedKeyRef.current = groupedResults[nextIndex]?.key ?? null;
  }, [groupedResults, selectedIndex]);

  useEffect(() => { setSnippetIndex(0); }, [selectedIndex, groupedResults]);

  useInput((input, key) => {
    if (!active) return;
    if (input === "[") { setProviderIndex((p) => (p - 1 + PROVIDERS.length) % PROVIDERS.length); return; }
    if (input === "]") { setProviderIndex((p) => (p + 1) % PROVIDERS.length); return; }
    if (input.toLowerCase() === "r" && query.trim().length >= 2) { setRefreshTick((p) => p + 1); return; }
    if (key.ctrl && input.toLowerCase() === "n") { if (groupedResults.length > 0) setFocusMode("results"); return; }
    if (key.ctrl && input.toLowerCase() === "p") { setFocusMode("query"); return; }
    if (focusMode === "query") {
      if (isReservedGlobalShortcut(input, { includeUpdateShortcuts: reserveUpdateShortcuts })) return;
      if (shouldLeaveSearchQueryMode(key)) { setFocusMode("results"); return; }
      if (key.backspace || key.delete) { setQuery((p) => p.slice(0, -1)); return; }
      if (!key.ctrl && !key.meta && !key.escape && !key.return && !key.tab && !key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow && input.length > 0) {
        setQuery((p) => p + input);
      }
      return;
    }
    if (key.tab || key.escape || input === "/" || input.toLowerCase() === "i") { setFocusMode("query"); return; }
    if (key.upArrow || input === "k") { setSelectedIndex((p) => Math.max(0, p - 1)); return; }
    if (key.downArrow || input === "j") {
      if (selectedIndex >= groupedResults.length - 1 && hasMorePages) { loadNextPage(); return; }
      setSelectedIndex((p) => Math.min(Math.max(groupedResults.length - 1, 0), p + 1));
      return;
    }
    if (input === "g") { setSelectedIndex(0); return; }
    if (input === "G") { setSelectedIndex(Math.max(groupedResults.length - 1, 0)); return; }
    if (input === "K") { setSelectedIndex((p) => Math.max(0, p - 10)); return; }
    if (input === "J") {
      if (selectedIndex >= groupedResults.length - 1 && hasMorePages) { loadNextPage(); return; }
      setSelectedIndex((p) => Math.min(Math.max(groupedResults.length - 1, 0), p + 10));
      return;
    }
    if (input.toLowerCase() === "n" || key.rightArrow) {
      const sel = groupedResults[selectedIndex];
      if (sel && sel.snippets.length > 1) setSnippetIndex((p) => Math.min(sel.snippets.length - 1, p + 1));
      return;
    }
    if (input.toLowerCase() === "p" || key.leftArrow) {
      const sel = groupedResults[selectedIndex];
      if (sel && sel.snippets.length > 1) setSnippetIndex((p) => Math.max(0, p - 1));
      return;
    }
    if (key.return) { const sel = groupedResults[selectedIndex]; if (sel) onOpenSession(sel.provider, sel.filePath); return; }
    if (key.ctrl && input.toLowerCase() === "o") { const sel = groupedResults[selectedIndex]; if (sel?.threadId) onOpenCleanup(sel.threadId); }
  });

  const selected = groupedResults[selectedIndex] ?? null;
  const visibleGroups = useMemo(() => getWindowedItems(groupedResults, selectedIndex, 10), [groupedResults, selectedIndex]);

  return (
    <Box flexDirection="column" gap={1}>
      {/* Query bar */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column" gap={0}>
        <Box justifyContent="space-between" alignItems="center">
          <Text color="cyan" bold>Search</Text>
          <Box gap={2}>
            {loading || loadingMore ? <Text color="yellow">{messages.search.searching}</Text> : null}
            {meta.searched > 0 ? (
              <Text color="gray" dimColor>{formatSearchMeta(messages, meta)}</Text>
            ) : null}
          </Box>
        </Box>
        <Box borderStyle="single" borderColor={focusMode === "query" ? "green" : "gray"} paddingX={1}>
          <Text color="gray" dimColor>›  </Text>
          {query.length > 0 ? (
            <Text color={focusMode === "query" ? "white" : "gray"}>{query}{focusMode === "query" ? "▌" : ""}</Text>
          ) : (
            <Text color="gray" dimColor>{focusMode === "query" ? messages.search.queryEditingPlaceholder : messages.search.queryIdlePlaceholder}</Text>
          )}
        </Box>
        <Box gap={1} alignItems="center">
          <Text color="gray" dimColor>{messages.search.scopeLabel}</Text>
          {PROVIDERS.map((p, i) => (
            <Text key={p} color={i === providerIndex ? (PROVIDER_COLOR[p] ?? "white") : "gray"} bold={i === providerIndex}>
              {i === providerIndex ? `[${p}]` : p}
            </Text>
          ))}
          <Text color="gray" dimColor>{messages.common.switchHint}</Text>
          {error ? <Text color="red">  {error}</Text> : null}
        </Box>
        {groupedResults.length > 0 ? (
          <Box gap={3}>
            <Text color="white">
              {formatApproximateCountLabel(
                formatSearchResultSummary(messages, groupedResults.length, visibleHitCount),
                visibleHitCount,
                visibleHitCountIsApproximate,
              )}
            </Text>
            {providerSummary ? <Text color="gray" dimColor>{providerSummary}</Text> : null}
          </Box>
        ) : null}
      </Box>

      {/* Results + detail */}
      <Box gap={1} flexDirection={stackedLayout ? "column" : "row"}>
        <Box width={stackedLayout ? undefined : "55%"} borderStyle="round" borderColor={focusMode === "results" ? "cyan" : "gray"} paddingX={1} flexDirection="column">
          <Box justifyContent="space-between">
            <Text color="cyan">{messages.common.results}</Text>
            {groupedResults.length > 0 ? (
              <Text color="gray" dimColor>{visibleGroups.start + 1}–{visibleGroups.end}/{groupedResults.length}</Text>
            ) : null}
          </Box>
          {groupedResults.length === 0 && !loading ? (
            <Text color="gray" dimColor>{formatSearchEmptyState(messages, query)}</Text>
          ) : null}
          {visibleGroups.items.map((group, offset) => {
            const idx = visibleGroups.start + offset;
            const focused = idx === selectedIndex;
            const pColor = PROVIDER_COLOR[group.provider] ?? "white";
            const snippet = focused ? (group.snippets[snippetIndex] ?? "") : "";
            return (
              <Box key={group.key} flexDirection="column" marginTop={1}>
                <Box gap={1}>
                  <Text color={focused ? "green" : "gray"}>{focused ? "›" : " "}</Text>
                  <Text color={pColor} dimColor={!focused}>{providerBadge(group.provider)}</Text>
                  <Text color={focused ? "white" : "gray"} bold={focused}>{truncate(group.title, 54)}</Text>
                </Box>
                <Box gap={3} paddingLeft={2}>
                  <Text color="gray" dimColor>{formatSearchHitCount(messages, group.matchCount, group.hasMoreHits)}</Text>
                  <Text color="gray" dimColor>{formatDateLabel(group.mtime, locale)}</Text>
                  {group.threadId ? <Text color="green" dimColor>{messages.search.cleanupAction}</Text> : null}
                </Box>
                {focused && snippet ? (
                  <Box paddingLeft={2}>
                    <Text color="gray">{truncate(snippet.replace(/\s+/g, " ").trim(), 86)}</Text>
                  </Box>
                ) : null}
                {focused && group.snippets.length > 1 ? (
                  <Box paddingLeft={2}>
                    <Text color="gray" dimColor>{formatSearchSnippetPager(messages, snippetIndex + 1, group.snippets.length)}</Text>
                  </Box>
                ) : null}
              </Box>
            );
          })}
        </Box>

        <Box width={stackedLayout ? undefined : "45%"} borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color="cyan">{messages.common.detail}</Text>
          {selected ? (
            <>
              <Box gap={1} alignItems="flex-start" marginTop={1}>
                <Text color={PROVIDER_COLOR[selected.provider] ?? "white"} bold>{providerBadge(selected.provider)}</Text>
                <Text color="white">{truncate(selected.title, 46)}</Text>
              </Box>
              <Text color="gray" dimColor>{truncate(selected.filePath, 58)}</Text>
              <Box gap={3}>
                <Text color="gray" dimColor>{selected.source}</Text>
                <Text color="gray" dimColor>{formatDateLabel(selected.mtime, locale)}</Text>
              </Box>
              {selected.snippets.length > 0 ? (
                <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
                  <Box justifyContent="space-between">
                    <Text color="gray" dimColor>{messages.search.snippetLabel}</Text>
                    {selected.snippets.length > 1 ? (
                      <Text color="gray" dimColor>{snippetIndex + 1}/{selected.snippets.length}</Text>
                    ) : null}
                  </Box>
                  <Text color="white">
                    {truncate((selected.snippets[snippetIndex] ?? "").replace(/\s+/g, " ").trim(), 200)}
                  </Text>
                </Box>
              ) : (
                <Text color="gray" dimColor>{messages.search.noSnippet}</Text>
              )}
              <Box gap={3} marginTop={1}>
                <Text color="green" dimColor>{messages.search.enterOpen}</Text>
                {selected.threadId ? <Text color="yellow" dimColor>{messages.search.ctrlOpenCleanup}</Text> : null}
              </Box>
            </>
          ) : (
            <Text color="gray" dimColor>{messages.search.selectResult}</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
