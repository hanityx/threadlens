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

  useEffect(() => { onQueryChange?.(query); }, [onQueryChange, query]);
  useEffect(() => { onProviderChange?.(provider); }, [onProviderChange, provider]);

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
  }, [provider, query, refreshTick]);

  const groupedResults = useMemo<SearchSessionGroup[]>(() => {
    const groups = new Map<string, SearchSessionGroup>();
    for (const hit of results) {
      const key = `${hit.provider}::${hit.session_id || hit.file_path}`;
      const existing = groups.get(key);
      if (existing) {
        existing.matchCount += 1;
        if (hit.snippet && !existing.snippets.includes(hit.snippet)) existing.snippets.push(hit.snippet);
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
    return Array.from(groups.values()).sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      return b.mtime.localeCompare(a.mtime);
    });
  }, [results]);

  const providerSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of groupedResults) counts.set(g.provider, (counts.get(g.provider) ?? 0) + 1);
    return Array.from(counts.entries()).map(([n, c]) => `${n} ${c}`).join(" · ");
  }, [groupedResults]);

  useEffect(() => { setSnippetIndex(0); }, [selectedIndex, groupedResults]);

  useInput((input, key) => {
    if (!active) return;
    if (input === "[") { setProviderIndex((p) => (p - 1 + PROVIDERS.length) % PROVIDERS.length); return; }
    if (input === "]") { setProviderIndex((p) => (p + 1) % PROVIDERS.length); return; }
    if (input.toLowerCase() === "r" && query.trim().length >= 2) { setRefreshTick((p) => p + 1); return; }
    if (key.ctrl && input.toLowerCase() === "n") { if (groupedResults.length > 0) setFocusMode("results"); return; }
    if (key.ctrl && input.toLowerCase() === "p") { setFocusMode("query"); return; }
    if (focusMode === "query") {
      if (key.tab || key.return || key.escape) { if (groupedResults.length > 0) setFocusMode("results"); return; }
      if (key.backspace || key.delete) { setQuery((p) => p.slice(0, -1)); return; }
      if (!key.ctrl && !key.meta && !key.escape && !key.return && !key.tab && !key.upArrow && !key.downArrow && !key.leftArrow && !key.rightArrow && input.length > 0) {
        setQuery((p) => p + input);
      }
      return;
    }
    if (key.tab || key.escape || input === "/" || input.toLowerCase() === "i") { setFocusMode("query"); return; }
    if (key.upArrow || input === "k") { setSelectedIndex((p) => Math.max(0, p - 1)); return; }
    if (key.downArrow || input === "j") { setSelectedIndex((p) => Math.min(Math.max(groupedResults.length - 1, 0), p + 1)); return; }
    if (input === "g") { setSelectedIndex(0); return; }
    if (input === "G") { setSelectedIndex(Math.max(groupedResults.length - 1, 0)); return; }
    if (input === "K") { setSelectedIndex((p) => Math.max(0, p - 10)); return; }
    if (input === "J") { setSelectedIndex((p) => Math.min(Math.max(groupedResults.length - 1, 0), p + 10)); return; }
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
            {loading ? <Text color="yellow">searching…</Text> : null}
            {meta.searched > 0 ? (
              <Text color="gray" dimColor>{meta.searched}/{meta.available} sessions{meta.truncated ? " (partial)" : ""}</Text>
            ) : null}
          </Box>
        </Box>
        <Box borderStyle="single" borderColor={focusMode === "query" ? "green" : "gray"} paddingX={1}>
          <Text color="gray" dimColor>›  </Text>
          {query.length > 0 ? (
            <Text color={focusMode === "query" ? "white" : "gray"}>{query}{focusMode === "query" ? "▌" : ""}</Text>
          ) : (
            <Text color="gray" dimColor>{focusMode === "query" ? "type query (min 2 chars)▌" : "enter query…"}</Text>
          )}
        </Box>
        <Box gap={1} alignItems="center">
          <Text color="gray" dimColor>scope:</Text>
          {PROVIDERS.map((p, i) => (
            <Text key={p} color={i === providerIndex ? (PROVIDER_COLOR[p] ?? "white") : "gray"} bold={i === providerIndex}>
              {i === providerIndex ? `[${p}]` : p}
            </Text>
          ))}
          <Text color="gray" dimColor>  [ ] switch</Text>
          {error ? <Text color="red">  {error}</Text> : null}
        </Box>
        {groupedResults.length > 0 ? (
          <Box gap={3}>
            <Text color="white">{groupedResults.length} sessions</Text>
            <Text color="gray" dimColor>{results.length} hits</Text>
            {providerSummary ? <Text color="gray" dimColor>{providerSummary}</Text> : null}
          </Box>
        ) : null}
      </Box>

      {/* Results + detail */}
      <Box gap={1}>
        <Box width="55%" borderStyle="round" borderColor={focusMode === "results" ? "cyan" : "gray"} paddingX={1} flexDirection="column">
          <Box justifyContent="space-between">
            <Text color="cyan">Results</Text>
            {groupedResults.length > 0 ? (
              <Text color="gray" dimColor>{visibleGroups.start + 1}–{visibleGroups.end}/{groupedResults.length}</Text>
            ) : null}
          </Box>
          {groupedResults.length === 0 && !loading ? (
            <Text color="gray" dimColor>{query.trim().length < 2 ? "Enter at least 2 characters." : "No results found."}</Text>
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
                  <Text color="gray" dimColor>{group.matchCount} hit{group.matchCount !== 1 ? "s" : ""}</Text>
                  <Text color="gray" dimColor>{formatDateLabel(group.mtime)}</Text>
                  {group.threadId ? <Text color="green" dimColor>cleanup</Text> : null}
                </Box>
                {focused && snippet ? (
                  <Box paddingLeft={2}>
                    <Text color="gray">{truncate(snippet.replace(/\s+/g, " ").trim(), 86)}</Text>
                  </Box>
                ) : null}
                {focused && group.snippets.length > 1 ? (
                  <Box paddingLeft={2}>
                    <Text color="gray" dimColor>snippet {snippetIndex + 1}/{group.snippets.length}  n/p ←/→</Text>
                  </Box>
                ) : null}
              </Box>
            );
          })}
        </Box>

        <Box width="45%" borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color="cyan">Detail</Text>
          {selected ? (
            <>
              <Box gap={1} alignItems="flex-start" marginTop={1}>
                <Text color={PROVIDER_COLOR[selected.provider] ?? "white"} bold>{providerBadge(selected.provider)}</Text>
                <Text color="white">{truncate(selected.title, 46)}</Text>
              </Box>
              <Text color="gray" dimColor>{truncate(selected.filePath, 58)}</Text>
              <Box gap={3}>
                <Text color="gray" dimColor>{selected.source}</Text>
                <Text color="gray" dimColor>{formatDateLabel(selected.mtime)}</Text>
              </Box>
              {selected.snippets.length > 0 ? (
                <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
                  <Box justifyContent="space-between">
                    <Text color="gray" dimColor>snippet</Text>
                    {selected.snippets.length > 1 ? (
                      <Text color="gray" dimColor>{snippetIndex + 1}/{selected.snippets.length}</Text>
                    ) : null}
                  </Box>
                  <Text color="white">
                    {truncate((selected.snippets[snippetIndex] ?? "").replace(/\s+/g, " ").trim(), 200)}
                  </Text>
                </Box>
              ) : (
                <Text color="gray" dimColor>No snippet.</Text>
              )}
              <Box gap={3} marginTop={1}>
                <Text color="green" dimColor>Enter open</Text>
                {selected.threadId ? <Text color="yellow" dimColor>Ctrl+O cleanup</Text> : null}
              </Box>
            </>
          ) : (
            <Text color="gray" dimColor>Select a result.</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
