import React, { useMemo, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { getApiBaseUrl } from "./api.js";
import { AppBootstrapProps, type ProviderScope, VIEWS } from "./config.js";
import { SearchView } from "./views/SearchView.js";
import { SessionsView } from "./views/SessionsView.js";
import { CleanupView } from "./views/CleanupView.js";

function HelpOverlay() {
  return (
    <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="column">
      <Text color="yellow">Help</Text>
      <Text color="gray">Global: 1 Search · 2 Sessions · 3 Cleanup · ? Help · q quit</Text>
      <Text color="gray">Search: type to search · Enter/Ctrl+N/Tab results · /·Esc·Ctrl+P·i edit · [ ] provider · j/k move · J/K page · g/G ends · n/p snippet · Ctrl+O cleanup · r refresh</Text>
      <Text color="gray">Sessions: /·i filter · Esc·Enter back to list · [ ] provider · j/k move · J/K page · g/G ends · b backup · a/A archive · d/D delete · c clear token · r refresh</Text>
      <Text color="gray">Cleanup: /·i filter · Esc·Enter back to list · j/k move · J/K page · g/G ends · space select · a impact analysis · d dry-run · D execute · c clear token · x clear selection · r refresh</Text>
    </Box>
  );
}

export function App(props: AppBootstrapProps) {
  const { initialProvider, initialQuery, initialView, initialFilter, initialSearchFocus } = props;
  const { exit } = useApp();
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
  const [searchFocusMode, setSearchFocusMode] = useState<"query" | "results">(initialSearchFocus ?? "query");
  const [sessionsFilter, setSessionsFilter] = useState(initialView === "sessions" ? initialFilter ?? "" : "");
  const [cleanupFilter, setCleanupFilter] = useState(initialView === "cleanup" ? initialFilter ?? "" : "");
  const [textEntryLocked, setTextEntryLocked] = useState(false);
  const [sessionsFilePath, setSessionsFilePath] = useState<string | null>(null);
  const [cleanupInitialThreadId, setCleanupInitialThreadId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const activeView = VIEWS[viewIndex]!.id;

  const footerText = useMemo(() => {
    if (activeView === "search") return "Search: Enter/Ctrl+N/Tab results · /·Esc·Ctrl+P·i edit · j/k·J/K·g/G move · n/p snippet · Ctrl+O cleanup";
    if (activeView === "sessions") return "Sessions: /·i filter · Esc·Enter back · j/k·J/K·g/G move · b backup · a/A archive · d/D delete";
    return "Cleanup: /·i filter · Esc·Enter back · j/k·J/K·g/G move · space select · a impact analysis · d/D execute";
  }, [activeView]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      return;
    }
    if (textEntryLocked) {
      return;
    }
    if (input === "q") {
      exit();
      return;
    }
    if (input === "?") {
      setShowHelp((prev) => !prev);
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
    <Box flexDirection="column" padding={1} gap={1}>
      <Box borderStyle="round" borderColor="green" paddingX={1} flexDirection="column">
        <Text color="green">ThreadLens TUI v0</Text>
        <Text color="gray">
          1 Search · 2 Sessions · 3 Cleanup · q quit · API {getApiBaseUrl()}
        </Text>
        <Text>
          {VIEWS.map((view, index) =>
            index === viewIndex ? `[${view.label}]` : ` ${view.label} `,
          ).join("  ")}
        </Text>
      </Box>
      {showHelp ? <HelpOverlay /> : null}
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
      <Box borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="gray">{footerText}</Text>
      </Box>
    </Box>
  );
}
