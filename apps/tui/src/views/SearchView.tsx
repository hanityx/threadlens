import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { searchConversations } from "../api.js";
import { PROVIDERS, type ProviderScope } from "../config.js";
import type { SearchHit } from "../types.js";
import { formatDateLabel, getWindowedItems, truncate } from "../lib/format.js";

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
};

type SearchMeta = {
  searched: number;
  available: number;
  truncated: boolean;
};

export function SearchView(props: {
  active: boolean;
  onOpenSession: (provider: ProviderScope, filePath: string) => void;
  onOpenCleanup: (threadId: string) => void;
  initialQuery?: string;
  initialProvider?: ProviderScope;
  initialFocusMode?: "query" | "results";
  onTextEntryChange?: (locked: boolean) => void;
  onQueryChange?: (query: string) => void;
  onProviderChange?: (provider: ProviderScope) => void;
  onFocusModeChange?: (mode: "query" | "results") => void;
}) {
  const {
    active,
    onOpenSession,
    onOpenCleanup,
    initialQuery,
    initialProvider,
    initialFocusMode,
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
  const [results, setResults] = useState<SearchHit[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<SearchMeta>({ searched: 0, available: 0, truncated: false });
  const [focusMode, setFocusMode] = useState<"query" | "results">(initialFocusMode ?? "query");
  const [refreshTick, setRefreshTick] = useState(0);
  const [snippetIndex, setSnippetIndex] = useState(0);

  useEffect(() => {
    onTextEntryChange?.(focusMode === "query");
    onFocusModeChange?.(focusMode);
  }, [focusMode, onFocusModeChange, onTextEntryChange]);

  useEffect(() => {
    onQueryChange?.(query);
  }, [onQueryChange, query]);

  useEffect(() => {
    onProviderChange?.(provider);
  }, [onProviderChange, provider]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setMeta({ searched: 0, available: 0, truncated: false });
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);

      void searchConversations(query.trim(), provider)
        .then((data) => {
          if (cancelled) return;
          setResults(data.results ?? []);
          setMeta({
            searched: data.searched_sessions ?? 0,
            available: data.available_sessions ?? 0,
            truncated: Boolean(data.truncated),
          });
          setSelectedIndex(0);
          setSnippetIndex(0);
          if ((initialFocusMode ?? "query") === "results") {
            setFocusMode("results");
          }
        })
        .catch((fetchError) => {
          if (cancelled) return;
          setResults([]);
          setMeta({ searched: 0, available: 0, truncated: false });
          setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [provider, query, refreshTick]);

  const groupedResults = useMemo<SearchSessionGroup[]>(() => {
    const groups = new Map<string, SearchSessionGroup>();
    for (const hit of results) {
      const key = `${hit.provider}::${hit.session_id || hit.file_path}`;
      const existing = groups.get(key);
      if (existing) {
        existing.matchCount += 1;
        if (hit.snippet && !existing.snippets.includes(hit.snippet)) {
          existing.snippets.push(hit.snippet);
        }
        continue;
      }
      groups.set(key, {
        key,
        provider: hit.provider as ProviderScope,
        title: hit.display_title || hit.title || hit.session_id,
        filePath: hit.file_path,
        threadId: hit.thread_id,
        source: hit.source || "-",
        mtime: hit.mtime,
        matchCount: 1,
        snippets: hit.snippet ? [hit.snippet] : [],
      });
    }

    return Array.from(groups.values()).sort((left, right) => {
      if (right.matchCount !== left.matchCount) return right.matchCount - left.matchCount;
      return right.mtime.localeCompare(left.mtime);
    });
  }, [results]);

  const providerSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of groupedResults) {
      counts.set(group.provider, (counts.get(group.provider) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => `${name} ${count}`)
      .join(" · ");
  }, [groupedResults]);

  useEffect(() => {
    setSnippetIndex(0);
  }, [selectedIndex, groupedResults]);

  useInput((input, key) => {
    if (!active) return;
    if (input === "[") {
      setProviderIndex((prev) => (prev - 1 + PROVIDERS.length) % PROVIDERS.length);
      return;
    }
    if (input === "]") {
      setProviderIndex((prev) => (prev + 1) % PROVIDERS.length);
      return;
    }
    if (input.toLowerCase() === "r" && query.trim().length >= 2) {
      setRefreshTick((prev) => prev + 1);
      return;
    }
    if (key.ctrl && input.toLowerCase() === "n") {
      if (groupedResults.length > 0) setFocusMode("results");
      return;
    }
    if (key.ctrl && input.toLowerCase() === "p") {
      setFocusMode("query");
      return;
    }
    if (focusMode === "query") {
      if (key.tab) {
        if (groupedResults.length > 0) setFocusMode("results");
        return;
      }
      if (key.return) {
        if (groupedResults.length > 0) setFocusMode("results");
        return;
      }
      if (key.escape) {
        if (groupedResults.length > 0) setFocusMode("results");
        return;
      }
      if (key.backspace || key.delete) {
        setQuery((prev) => prev.slice(0, -1));
        return;
      }
      if (
        !key.ctrl &&
        !key.meta &&
        !key.escape &&
        !key.return &&
        !key.tab &&
        !key.upArrow &&
        !key.downArrow &&
        !key.leftArrow &&
        !key.rightArrow &&
        input.length > 0
      ) {
        setQuery((prev) => prev + input);
      }
      return;
    }
    if (key.tab || key.escape || input === "/" || input.toLowerCase() === "i") {
      setFocusMode("query");
      return;
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(Math.max(groupedResults.length - 1, 0), prev + 1));
      return;
    }
    if (input === "g") {
      setSelectedIndex(0);
      return;
    }
    if (input === "G") {
      setSelectedIndex(Math.max(groupedResults.length - 1, 0));
      return;
    }
    if (input === "K") {
      setSelectedIndex((prev) => Math.max(0, prev - 10));
      return;
    }
    if (input === "J") {
      setSelectedIndex((prev) => Math.min(Math.max(groupedResults.length - 1, 0), prev + 10));
      return;
    }
    if (input.toLowerCase() === "n" || key.rightArrow) {
      const selected = groupedResults[selectedIndex];
      if (selected && selected.snippets.length > 1) {
        setSnippetIndex((prev) => Math.min(selected.snippets.length - 1, prev + 1));
      }
      return;
    }
    if (input.toLowerCase() === "p" || key.leftArrow) {
      const selected = groupedResults[selectedIndex];
      if (selected && selected.snippets.length > 1) {
        setSnippetIndex((prev) => Math.max(0, prev - 1));
      }
      return;
    }
    if (key.return) {
      const selected = groupedResults[selectedIndex];
      if (selected) onOpenSession(selected.provider, selected.filePath);
      return;
    }
    if (key.ctrl && input.toLowerCase() === "o") {
      const selected = groupedResults[selectedIndex];
      if (selected?.threadId) onOpenCleanup(selected.threadId);
    }
  });

  const selected = groupedResults[selectedIndex] ?? null;
  const visibleGroups = useMemo(() => getWindowedItems(groupedResults, selectedIndex, 12), [groupedResults, selectedIndex]);

  return (
    <Box flexDirection="column" gap={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
        <Text color="cyan">검색</Text>
        <Text color="gray">입력 모드: 그대로 타이핑 · Enter/Ctrl+N/Tab 결과 보기 · /·Esc·Ctrl+P·i 다시 입력</Text>
        <Box borderStyle="round" borderColor={focusMode === "query" ? "green" : "gray"} paddingX={1}>
          {query.length > 0 ? (
            <Text color={focusMode === "query" ? "white" : "gray"}>
              {query}
              {focusMode === "query" ? "▌" : ""}
            </Text>
          ) : (
            <Text color="gray">{focusMode === "query" ? "검색어 2글자 이상 입력▌" : "검색어 2글자 이상 입력"}</Text>
          )}
        </Box>
        <Text color="yellow">scope: {provider}</Text>
        <Text color="gray">focus: {focusMode}</Text>
        <Text color="gray">
          scanned {meta.searched}/{meta.available}
          {meta.truncated ? " · truncated" : ""}
          {" · "}groups {groupedResults.length} · matches {results.length}
        </Text>
        {providerSummary ? <Text color="gray">{providerSummary}</Text> : null}
        {loading ? <Text color="yellow">검색 중…</Text> : null}
        {error ? <Text color="red">{error}</Text> : null}
        {!loading && query.trim().length < 2 ? <Text color="gray">검색어를 2글자 이상 입력해.</Text> : null}
      </Box>
      <Box gap={2}>
        <Box width="58%" borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color="cyan">세션 결과</Text>
          {groupedResults.length > 0 ? (
            <Text color="gray">
              showing {visibleGroups.start + 1}-{visibleGroups.end}/{groupedResults.length}
            </Text>
          ) : null}
          {groupedResults.length === 0 ? <Text color="gray">검색 결과 없음</Text> : null}
          {visibleGroups.items.map((group, offset) => {
            const index = visibleGroups.start + offset;
            const focused = index === selectedIndex;
            return (
              <Box key={group.key} flexDirection="column" marginTop={1}>
                <Text color={focused ? "green" : "white"}>
                  {focused ? "›" : " "} {truncate(group.title, 68)}
                </Text>
                <Text color="gray">
                  {group.provider} · match {group.matchCount} · {formatDateLabel(group.mtime)}
                </Text>
                <Text color={focused ? "white" : "gray"}>
                  {truncate(group.snippets[0] || "-", 82)}
                </Text>
              </Box>
            );
          })}
        </Box>
        <Box width="42%" borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color="cyan">선택 상세</Text>
          {selected ? (
            <>
              <Text>{truncate(selected.title, 56)}</Text>
              <Text color="gray">{selected.provider}</Text>
              <Text color="gray">{truncate(selected.filePath, 56)}</Text>
              <Text color="gray">{selected.source}</Text>
              <Text color="yellow">
                snippets {selected.snippets.length} · {selected.threadId ? "Ctrl+O 정리실 가능" : "세션만"}
              </Text>
              {selected.snippets.length > 1 ? (
                <Text color="gray">
                  snippet {snippetIndex + 1}/{selected.snippets.length} · n/p 또는 ←/→
                </Text>
              ) : null}
              <Text>{truncate(selected.snippets[snippetIndex] || "-", 120)}</Text>
            </>
          ) : (
            <Text color="gray">검색 결과를 선택해.</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
