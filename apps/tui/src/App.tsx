import { useEffect, useMemo, useState } from "react";
import { spawn } from "node:child_process";
import type { UpdateCheckStatus } from "@threadlens/shared-contracts";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { fetchUpdateCheck, getApiBaseUrl } from "./api.js";
import { AppBootstrapProps, type ProviderScope, VIEWS } from "./config.js";
import { getMessages } from "./i18n/index.js";
import { resolveHeaderLayout } from "./lib/headerLayout.js";
import { isReservedGlobalShortcut } from "./lib/globalShortcut.js";
import {
  persistDismissedUpdateVersion,
  readDismissedUpdateVersion,
  shouldDisplayUpdateNotice,
} from "./lib/updateDismissState.js";
import { buildUpdateNoticeLine, buildUpdateNoticeSummary } from "./lib/updateNotice.js";
import { SearchView } from "./views/SearchView.js";
import { SessionsView } from "./views/SessionsView.js";
import { CleanupView } from "./views/CleanupView.js";

function HelpOverlay({ messages }: { messages: ReturnType<typeof getMessages> }) {
  return (
    <Box
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      gap={1}
    >
      <Text color="yellow" bold>{messages.app.helpTitle}</Text>
      <Box flexDirection="column" gap={0}>
        <Text color="cyan">{messages.app.helpGlobalLabel}</Text>
        <Text color="gray">{messages.app.helpGlobalBody}</Text>
      </Box>
      <Box flexDirection="column" gap={0}>
        <Text color="cyan">{messages.app.helpSearchLabel}</Text>
        <Text color="gray">{messages.app.helpSearchBodyLine1}</Text>
        <Text color="gray">{messages.app.helpSearchBodyLine2}</Text>
        <Text color="gray">{messages.app.helpSearchBodyLine3}</Text>
      </Box>
      <Box flexDirection="column" gap={0}>
        <Text color="cyan">{messages.app.helpSessionsLabel}</Text>
        <Text color="gray">{messages.app.helpSessionsBodyLine1}</Text>
        <Text color="gray">{messages.app.helpSessionsBodyLine2}</Text>
        <Text color="gray">{messages.app.helpSessionsBodyLine3}</Text>
      </Box>
      <Box flexDirection="column" gap={0}>
        <Text color="cyan">{messages.app.helpCleanupLabel}</Text>
        <Text color="gray">{messages.app.helpCleanupBodyLine1}</Text>
        <Text color="gray">{messages.app.helpCleanupBodyLine2}</Text>
      </Box>
    </Box>
  );
}

export function App(props: AppBootstrapProps) {
  const { initialProvider, initialQuery, initialView, initialFilter, initialSearchFocus, locale = "en" } = props;
  const { exit } = useApp();
  const { stdout } = useStdout();
  const messages = getMessages(locale);
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
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState(() =>
    readDismissedUpdateVersion(),
  );

  const activeView = VIEWS[viewIndex]!.id;
  const visibleUpdateCheck = useMemo(
    () => (
      shouldDisplayUpdateNotice(updateCheck, dismissedUpdateVersion)
        ? updateCheck
        : null
    ),
    [dismissedUpdateVersion, updateCheck],
  );
  const reserveUpdateShortcuts = Boolean(visibleUpdateCheck?.has_update);

  const footerShortcuts = useMemo(() => {
    const shortcuts = [...(messages.app.footerShortcuts[activeView] ?? [])];
    if (visibleUpdateCheck?.has_update) {
      shortcuts.push(messages.app.updateReleaseShortcut, messages.app.updateDismissShortcut);
    }
    return shortcuts.join("  ·  ");
  }, [activeView, messages.app.footerShortcuts, messages.app.updateDismissShortcut, messages.app.updateReleaseShortcut, visibleUpdateCheck?.has_update]);
  const updateNotice = useMemo(
    () => buildUpdateNoticeLine(visibleUpdateCheck, messages),
    [messages, visibleUpdateCheck],
  );
  const updateSummary = useMemo(
    () => buildUpdateNoticeSummary(visibleUpdateCheck, messages, locale),
    [locale, messages, visibleUpdateCheck],
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
    if (input === "q") {
      exit();
      return;
    }
    if (input === "?") {
      setShowHelp((prev) => !prev);
      return;
    }
    if (input === "u" && visibleUpdateCheck?.has_update) {
      openReleaseUrl();
      return;
    }
    if (input === "U" && visibleUpdateCheck?.latest_version) {
      persistDismissedUpdateVersion(visibleUpdateCheck.latest_version);
      setDismissedUpdateVersion(visibleUpdateCheck.latest_version);
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
      return;
    }
    if (textEntryLocked && !isReservedGlobalShortcut(input, { includeUpdateShortcuts: reserveUpdateShortcuts })) return;
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

      {showHelp ? <HelpOverlay messages={messages} /> : null}
      {updateNotice ? (
        <Box borderStyle="round" borderColor="yellow" paddingX={2} flexDirection="column">
          <Text color="yellow">{updateNotice}</Text>
          {updateSummary ? <Text color="gray">{updateSummary}</Text> : null}
        </Box>
      ) : null}

      {activeView === "search" ? (
        <SearchView
          active
          locale={locale}
          messages={messages}
          initialQuery={searchQuery}
          initialProvider={searchProvider}
          initialFocusMode={searchFocusMode}
          onTextEntryChange={setTextEntryLocked}
          reserveUpdateShortcuts={reserveUpdateShortcuts}
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
          locale={locale}
          messages={messages}
          provider={sessionsProvider}
          setProvider={setSessionsProvider}
          initialFilePath={sessionsFilePath}
          initialFilter={sessionsFilter}
          onTextEntryChange={setTextEntryLocked}
          reserveUpdateShortcuts={reserveUpdateShortcuts}
          onFilterChange={setSessionsFilter}
          onInitialFilePathHandled={() => setSessionsFilePath(null)}
        />
      ) : null}
      {activeView === "cleanup" ? (
        <CleanupView
          active
          locale={locale}
          messages={messages}
          initialThreadId={cleanupInitialThreadId}
          initialFilter={cleanupFilter}
          onTextEntryChange={setTextEntryLocked}
          reserveUpdateShortcuts={reserveUpdateShortcuts}
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
