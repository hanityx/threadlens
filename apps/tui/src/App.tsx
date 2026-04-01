import React, { useEffect, useMemo, useState } from "react";
import { spawn } from "node:child_process";
import type { UpdateCheckStatus } from "@threadlens/shared-contracts";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { fetchUpdateCheck, getApiBaseUrl } from "./api.js";
import { AppBootstrapProps, type ProviderScope, VIEWS } from "./config.js";
import { resolveHeaderLayout } from "./lib/headerLayout.js";
import { buildUpdateNoticeLine, buildUpdateNoticeSummary } from "./lib/updateNotice.js";
import { SearchView } from "./views/SearchView.js";
import { SessionsView } from "./views/SessionsView.js";
import { CleanupView } from "./views/CleanupView.js";

const VIEW_SHORTCUTS: Record<string, string[]> = {
  search: [
    "type  search query",
    "Esc/Enter/Tab  results",
    "j/k  navigate",
    "n/p  snippet",
    "Ctrl+O  cleanup",
    "r  refresh",
  ],
  sessions: [
    "/·i  filter",
    "j/k  navigate",
    "b  backup",
    "a/A  archive",
    "d/D  delete",
    "r  refresh",
  ],
  cleanup: [
    "/·i  filter",
    "Space  select",
    "a  analysis",
    "d  dry-run",
    "D  execute",
    "x  clear sel",
  ],
};

function HelpOverlay() {
  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      gap={1}
    >
      <Text color="yellow" bold>ThreadLens TUI — Keyboard Reference</Text>
      <Box flexDirection="column" gap={0}>
        <Text color="cyan">Global:  </Text>
        <Text color="gray">  <Text color="white">1</Text> Search  <Text color="white">2</Text> Sessions  <Text color="white">3</Text> Cleanup  <Text color="white">?</Text> Help  <Text color="white">q</Text> Quit  <Text color="white">Ctrl+C</Text> Force exit</Text>
      </Box>
      <Box flexDirection="column" gap={0}>
        <Text color="cyan">Search:</Text>
        <Text color="gray">  type to search (min 2 chars)  ·  Esc/Enter/Ctrl+N/Tab → results  ·  /·Esc·i → edit query</Text>
        <Text color="gray">  j/k ↑↓ navigate  ·  J/K page  ·  g/G top/bottom  ·  n/p next/prev snippet</Text>
        <Text color="gray">  Enter open in Sessions  ·  Ctrl+O open in Cleanup  ·  [ ] switch provider</Text>
      </Box>
      <Box flexDirection="column" gap={0}>
        <Text color="cyan">Sessions:</Text>
        <Text color="gray">  /·i filter  ·  Esc·Enter back to list  ·  j/k ↑↓  ·  J/K page  ·  g/G ends</Text>
        <Text color="gray">  b backup  ·  a archive dry-run  ·  A archive execute  ·  d delete dry-run  ·  D delete execute</Text>
        <Text color="gray">  c clear token  ·  r refresh  ·  [ ] switch provider</Text>
      </Box>
      <Box flexDirection="column" gap={0}>
        <Text color="cyan">Cleanup:</Text>
        <Text color="gray">  /·i filter  ·  Esc·Enter back  ·  j/k ↑↓  ·  J/K page  ·  g/G ends</Text>
        <Text color="gray">  Space select  ·  a impact analysis  ·  d dry-run  ·  D execute  ·  x clear selection  ·  c clear token</Text>
      </Box>
    </Box>
  );
}

export function App(props: AppBootstrapProps) {
  const { initialProvider, initialQuery, initialView, initialFilter, initialSearchFocus } = props;
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [viewIndex, setViewIndex] = useState(
    Math.max(
      0,
      VIEWS.findIndex((view) => view.id === (initialView ?? "search")),
    ),
  );
  const [sessionsProvider, setSessionsProvider] = useState<ProviderScope>(
    initialProvider && initialProvider !== "all" ? initialProvider : "codex",
  );
  const [searchQuery, setSearchQuery] = useState(initialQuery ?? "");
  const [searchProvider, setSearchProvider] = useState<ProviderScope>(initialProvider ?? "all");
  const [searchFocusMode, setSearchFocusMode] = useState<"query" | "results">(
    initialSearchFocus ?? "query",
  );
  const [sessionsFilter, setSessionsFilter] = useState(
    initialView === "sessions" ? (initialFilter ?? "") : "",
  );
  const [cleanupFilter, setCleanupFilter] = useState(
    initialView === "cleanup" ? (initialFilter ?? "") : "",
  );
  const [textEntryLocked, setTextEntryLocked] = useState(false);
  const [sessionsFilePath, setSessionsFilePath] = useState<string | null>(null);
  const [cleanupInitialThreadId, setCleanupInitialThreadId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckStatus | null>(null);

  const activeView = VIEWS[viewIndex]!.id;

  const footerShortcuts = useMemo(() => {
    const shortcuts = [...(VIEW_SHORTCUTS[activeView] ?? [])];
    if (updateCheck?.has_update) shortcuts.push("u  release");
    return shortcuts.join("  ·  ");
  }, [activeView, updateCheck?.has_update]);
  const updateNotice = useMemo(
    () => buildUpdateNoticeLine(updateCheck),
    [updateCheck],
  );
  const updateSummary = useMemo(
    () => buildUpdateNoticeSummary(updateCheck),
    [updateCheck],
  );
  const headerLayout = useMemo(() => {
    return resolveHeaderLayout({
      columns: stdout?.columns ?? process.stdout.columns ?? 120,
      apiLabel: getApiBaseUrl().replace("http://127.0.0.1:", "api:"),
    });
  }, [stdout]);

  useEffect(() => {
    let cancelled = false;
    void fetchUpdateCheck()
      .then((next) => {
        if (!cancelled) setUpdateCheck(next);
      })
      .catch(() => {
        if (!cancelled) setUpdateCheck(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openReleaseUrl = () => {
    const releaseUrl = updateCheck?.release_url;
    if (!releaseUrl) return;
    const opener = process.platform === "darwin"
      ? { command: "open", args: [releaseUrl] }
      : process.platform === "win32"
        ? { command: "cmd", args: ["/c", "start", "", releaseUrl] }
        : { command: "xdg-open", args: [releaseUrl] };
    const child = spawn(opener.command, opener.args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }
    if (textEntryLocked) return;
    if (input === "q") {
      exit();
      return;
    }
    if (input === "?") {
      setShowHelp((prev) => !prev);
      return;
    }
    if (input === "u" && updateCheck?.has_update) {
      openReleaseUrl();
      return;
    }
    if (input === "1") {
      setViewIndex(0);
      return;
    }
    if (input === "2") {
      setViewIndex(1);
      return;
    }
    if (input === "3") {
      setViewIndex(2);
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} gap={1}>
      {/* ── Header bar ── */}
      <Box
        borderStyle="round"
        borderColor="green"
        paddingX={2}
        flexDirection="column"
      >
        <Box justifyContent="space-between" alignItems="center">
          <Box gap={3} alignItems="center">
            <Text color="green" bold>ThreadLens</Text>
            {VIEWS.map((view, index) => (
              <Text key={view.id} color={index === viewIndex ? "white" : "gray"} bold={index === viewIndex}>
                {index === viewIndex ? `[${index + 1}·${view.label}]` : `${index + 1}·${view.label}`}
              </Text>
            ))}
          </Box>
          {headerLayout.stacked ? null : (
            <Text color="gray" dimColor>{headerLayout.metaText}</Text>
          )}
        </Box>
        {headerLayout.stacked ? (
          <Box justifyContent="flex-end">
            <Text color="gray" dimColor>{headerLayout.metaText}</Text>
          </Box>
        ) : null}
      </Box>

      {showHelp ? <HelpOverlay /> : null}
      {updateNotice ? (
        <Box borderStyle="round" borderColor="yellow" paddingX={2} flexDirection="column">
          <Text color="yellow">{updateNotice}</Text>
          {updateSummary ? <Text color="gray">{updateSummary}</Text> : null}
        </Box>
      ) : null}

      {activeView === "search" ? (
        <SearchView
          active
          initialQuery={searchQuery}
          initialProvider={searchProvider}
          initialFocusMode={searchFocusMode}
          onTextEntryChange={setTextEntryLocked}
          onQueryChange={setSearchQuery}
          onProviderChange={setSearchProvider}
          onFocusModeChange={setSearchFocusMode}
          onOpenSession={(provider, filePath) => {
            setSessionsProvider(provider === "all" ? "codex" : provider);
            setSessionsFilePath(filePath);
            setViewIndex(1);
          }}
          onOpenCleanup={(threadId) => {
            setCleanupInitialThreadId(threadId);
            setCleanupFilter(threadId);
            setViewIndex(2);
          }}
        />
      ) : null}
      {activeView === "sessions" ? (
        <SessionsView
          active
          provider={sessionsProvider}
          setProvider={setSessionsProvider}
          initialFilePath={sessionsFilePath}
          initialFilter={sessionsFilter}
          onTextEntryChange={setTextEntryLocked}
          onFilterChange={setSessionsFilter}
          onInitialFilePathHandled={() => setSessionsFilePath(null)}
        />
      ) : null}
      {activeView === "cleanup" ? (
        <CleanupView
          active
          initialThreadId={cleanupInitialThreadId}
          initialFilter={cleanupFilter}
          onTextEntryChange={setTextEntryLocked}
          onFilterChange={setCleanupFilter}
          onInitialThreadIdHandled={() => setCleanupInitialThreadId(null)}
        />
      ) : null}

      {/* ── Footer status ── */}
      <Box borderStyle="round" borderColor="gray" paddingX={2}>
        <Text color="gray" dimColor>{footerShortcuts}</Text>
      </Box>
    </Box>
  );
}
