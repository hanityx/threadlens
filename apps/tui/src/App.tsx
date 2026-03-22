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
      <Text color="yellow">도움말</Text>
      <Text color="gray">전역: 1 Search · 2 Sessions · 3 Cleanup · ? 도움말 · q 종료</Text>
      <Text color="gray">Search: 타이핑 입력 · Enter/Ctrl+N/Tab 결과 · /·Esc·Ctrl+P·i 입력복귀 · [ ] provider · j/k 이동 · J/K page · g/G ends · n/p snippet · Ctrl+O 정리실 · r 새검색</Text>
      <Text color="gray">Sessions: /·i 필터 · Esc·Enter 목록복귀 · [ ] provider · j/k 이동 · J/K page · g/G ends · b 백업 · a/A 보관 · d/D 삭제 · c 토큰지움 · r 새로고침</Text>
      <Text color="gray">Cleanup: /·i 필터 · Esc·Enter 목록복귀 · j/k 이동 · J/K page · g/G ends · space 선택 · a 영향 분석 · d 드라이런 · D 실행 · c 토큰지움 · x 선택 초기화 · r 새로고침</Text>
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
    if (activeView === "search") return "Search: Enter/Ctrl+N/Tab 결과 · /·Esc·Ctrl+P·i 입력 · j/k·J/K·g/G 이동 · n/p snippet · Ctrl+O 정리실";
    if (activeView === "sessions") return "Sessions: /·i 필터 · Esc·Enter 복귀 · j/k·J/K·g/G 이동 · b 백업 · a/A 보관 · d/D 삭제";
    return "Cleanup: /·i 필터 · Esc·Enter 복귀 · j/k·J/K·g/G 이동 · space 선택 · a 영향 분석 · d/D 실행";
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
        <Text color="green">Provider Observatory TUI v0</Text>
        <Text color="gray">
          1 Search · 2 Sessions · 3 Cleanup · q 종료 · API {getApiBaseUrl()}
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
