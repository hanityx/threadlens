import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { backupSession, listProviderSessions, loadSessionTranscript, runProviderAction } from "../api.js";
import { PROVIDERS, type ProviderScope } from "../config.js";
import { getMessages } from "../i18n/index.js";
import type { Locale, TuiMessages } from "../i18n/types.js";
import type { ProviderScanEntry, ProviderSessionRow, TranscriptMessage } from "../types.js";
import { formatBytes, formatDateLabel, getWindowedItems, truncate } from "../lib/format.js";
import { isReservedGlobalShortcut } from "../lib/globalShortcut.js";
import { getSessionsFetchLimit, shouldRefetchSessions } from "../lib/sessionFetchWindow.js";
import { statusToneColor, type StatusTone } from "../lib/statusTone.js";

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

export function shouldShowSessionRow(row: ProviderSessionRow): boolean {
  return row.source !== "cleanup_backups";
}

export function filterVisibleSessionRows(rows: ProviderSessionRow[]): ProviderSessionRow[] {
  return rows.filter(shouldShowSessionRow);
}

type ConfirmableSessionAction = "archive_local" | "unarchive_local" | "delete_local";

function isArchivedSessionRow(row: ProviderSessionRow): boolean {
  return row.source === "archived_sessions";
}

function resolveArchiveSessionAction(row: ProviderSessionRow): Exclude<ConfirmableSessionAction, "delete_local"> {
  return isArchivedSessionRow(row) ? "unarchive_local" : "archive_local";
}

function ActionBadge({ kind, mode }: { kind: string; mode: string }) {
  const label = kind === "backup_local" ? "BAK" : kind === "unarchive_local" ? "UNA" : kind === "archive_local" ? "ARC" : "DEL";
  const color = kind === "delete_local" ? "red" : kind === "backup_local" ? "green" : "yellow";
  return (
    <Box gap={1}>
      <Text color={color} bold>{label}</Text>
      <Text color="gray" dimColor>{mode}</Text>
    </Box>
  );
}

export function shouldRenderSessionActionStatus(
  actionStatus: { tone: StatusTone; text: string } | null,
  pendingActionText: string | null,
): boolean {
  if (!actionStatus) return false;
  if (!pendingActionText) return true;
  return actionStatus.text !== pendingActionText;
}

export function shouldKeepPendingSessionAction(
  pendingActionFilePath: string,
  selectedFilePath: string | null,
): boolean {
  return pendingActionFilePath === selectedFilePath;
}

export function shouldRenderSessionLastAction(
  actionFilePath: string,
  selectedFilePath: string | null,
): boolean {
  return actionFilePath === selectedFilePath;
}

export function buildSessionActionHints(messages: TuiMessages): string[] {
  return [
    messages.sessions.actionBackup,
    messages.sessions.actionArchiveDryRun,
    messages.sessions.actionArchiveExecute,
    messages.sessions.actionDeleteDryRun,
    messages.sessions.actionDeleteExecute,
  ];
}

export function SessionsView(props: {
  active: boolean;
  provider: ProviderScope;
  setProvider: (provider: ProviderScope) => void;
  locale?: Locale;
  messages?: TuiMessages;
  inputEnabled?: boolean;
  initialFilePath: string | null;
  initialFilter?: string;
  reserveUpdateShortcuts?: boolean;
  onInitialFilePathHandled: () => void;
  onTextEntryChange?: (locked: boolean) => void;
  onFilterChange?: (filter: string) => void;
}) {
  const {
    active,
    provider,
    setProvider,
    locale = "en",
    messages: providedMessages,
    inputEnabled = true,
    initialFilePath,
    initialFilter,
    reserveUpdateShortcuts = false,
    onInitialFilePathHandled,
    onTextEntryChange,
    onFilterChange,
  } = props;
  const messages = providedMessages ?? getMessages(locale);
  const [rows, setRows] = useState<ProviderSessionRow[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ rows: number; parse_ok: number; parse_fail: number } | null>(null);
  const [providerScan, setProviderScan] = useState<string>("");
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState(initialFilter ?? "");
  const [focusMode, setFocusMode] = useState<"list" | "filter">("list");
  const [fetchedLimit, setFetchedLimit] = useState(0);
  const previousProviderRef = useRef<ProviderScope>(provider);
  const [actionStatus, setActionStatus] = useState<{ tone: StatusTone; text: string } | null>(null);
  const [pendingInitialPath, setPendingInitialPath] = useState<string | null>(initialFilePath);
  const [pendingAction, setPendingAction] = useState<{
    kind: ConfirmableSessionAction;
    token: string;
    filePath: string;
  } | null>(null);
  const [lastAction, setLastAction] = useState<{
    kind: "backup_local" | ConfirmableSessionAction;
    mode: "execute" | "dry-run";
    token: string;
    targetCount: number;
    appliedCount: number;
    validCount: number;
    path: string;
    backupCount: number;
    filePath: string;
  } | null>(null);
  const { stdout } = useStdout();
  const stackedLayout = (stdout?.columns ?? process.stdout.columns ?? 120) < 108;

  useEffect(() => {
    setPendingInitialPath(initialFilePath);
  }, [initialFilePath]);

  useEffect(() => {
    onTextEntryChange?.(active && focusMode === "filter");
  }, [active, focusMode, onTextEntryChange]);

  useEffect(() => {
    onFilterChange?.(filterQuery);
  }, [filterQuery, onFilterChange]);

  const fetchRows = (refresh = false, limit = getSessionsFetchLimit(filterQuery)) => {
    setLoading(true);
    setError(null);
    void listProviderSessions(provider, refresh, limit)
      .then((data) => {
        const nextRows = filterVisibleSessionRows(data.rows ?? []);
        const nextProviders: ProviderScanEntry[] = data.providers ?? [];
        setRows(nextRows);
        setFetchedLimit(limit);
        const parseFail = nextRows.filter((row) => !row.probe.ok).length;
        setSummary(
          nextRows.length > 0 || data.summary
            ? {
                rows: nextRows.length,
                parse_ok: nextRows.length - parseFail,
                parse_fail: parseFail,
              }
            : null,
        );
        setProviderScan(
          nextProviders
            .map((entry) => `${entry.name} ${entry.scanned}${entry.truncated ? "+" : ""}`)
            .join(" · "),
        );
        if (pendingInitialPath) {
          const nextIndex = nextRows.findIndex((row) => row.file_path === pendingInitialPath);
          setSelectedIndex(nextIndex >= 0 ? nextIndex : 0);
          setPendingInitialPath(null);
          onInitialFilePathHandled();
        } else {
          setSelectedIndex(0);
        }
      })
      .catch((fetchError) => {
        setRows([]);
        setSummary(null);
        setProviderScan("");
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const targetLimit = getSessionsFetchLimit(filterQuery);
    const providerChanged = previousProviderRef.current !== provider;
    if (shouldRefetchSessions(providerChanged, fetchedLimit, filterQuery)) {
      fetchRows(false, targetLimit);
    }
    previousProviderRef.current = provider;
  }, [fetchedLimit, filterQuery, provider]);

  const filteredRows = useMemo(() => {
    const needle = filterQuery.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        row.display_title,
        row.session_id,
        row.file_path,
        row.source,
        row.probe.detected_title,
      ]
        .some((value) => typeof value === "string" && value.toLowerCase().includes(needle)),
    );
  }, [filterQuery, rows]);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(Math.max(filteredRows.length - 1, 0), prev));
  }, [filteredRows.length]);

  const selected = filteredRows[selectedIndex] ?? null;
  const pendingActionText = pendingAction
    ? pendingAction.kind === "delete_local"
      ? messages.sessions.deleteExecutePrompt(pendingAction.token)
      : messages.sessions.archiveExecutePrompt(pendingAction.token)
    : null;
  const selectedFilePath = filteredRows[selectedIndex]?.file_path ?? null;
  const renderSimpleEmptyState =
    !loading &&
    !error &&
    rows.length === 0 &&
    filteredRows.length === 0 &&
    !summary &&
    !providerScan &&
    !pendingAction &&
    !actionStatus &&
    !selected;
  const visibleRows = useMemo(
    () => getWindowedItems(filteredRows, selectedIndex, 12),
    [filteredRows, selectedIndex],
  );

  useEffect(() => {
    if (!pendingAction) return;
    if (shouldKeepPendingSessionAction(pendingAction.filePath, selectedFilePath)) return;
    setPendingAction(null);
    setActionStatus((current) => (current?.text === pendingActionText ? null : current));
  }, [pendingAction, pendingActionText, selectedFilePath]);

  useEffect(() => {
    if (!selected) {
      setTranscript([]);
      return;
    }
    setTranscriptLoading(true);
    void loadSessionTranscript(selected.provider, selected.file_path, 120)
      .then((data) => {
        const dialogOnly = (data.messages ?? []).filter(
          (message: TranscriptMessage) => message.role === "user" || message.role === "assistant",
        );
        setTranscript(dialogOnly.slice(0, 10));
      })
      .catch(() => {
        setTranscript([]);
      })
      .finally(() => {
        setTranscriptLoading(false);
      });
  }, [selected?.file_path, selected?.provider]);

  const handleInput: Parameters<typeof useInput>[0] = (input, key) => {
    if (!active) return;
    if (focusMode === "filter") {
      if (isReservedGlobalShortcut(input, { includeUpdateShortcuts: reserveUpdateShortcuts })) return;
      if (key.escape || key.return || key.tab || (key.ctrl && input.toLowerCase() === "p")) {
        setFocusMode("list");
        return;
      }
      if (key.backspace || key.delete) {
        setFilterQuery((prev) => prev.slice(0, -1));
        return;
      }
      if (!key.ctrl && !key.meta && !key.upArrow && !key.downArrow && input.length > 0) {
        setFilterQuery((prev) => prev + input);
      }
      return;
    }
    if (input === "/" || input.toLowerCase() === "i") {
      setFocusMode("filter");
      return;
    }
    if (key.upArrow || input === "k") {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setSelectedIndex((prev) => Math.min(Math.max(filteredRows.length - 1, 0), prev + 1));
      return;
    }
    if (input === "g") { setSelectedIndex(0); return; }
    if (input === "G") { setSelectedIndex(Math.max(filteredRows.length - 1, 0)); return; }
    if (input === "K") { setSelectedIndex((prev) => Math.max(0, prev - 10)); return; }
    if (input === "J") { setSelectedIndex((prev) => Math.min(Math.max(filteredRows.length - 1, 0), prev + 10)); return; }
    if (input === "[") {
      const index = PROVIDERS.indexOf(provider);
      setProvider(PROVIDERS[(index - 1 + PROVIDERS.length) % PROVIDERS.length]!);
      return;
    }
    if (input === "]") {
      const index = PROVIDERS.indexOf(provider);
      setProvider(PROVIDERS[(index + 1) % PROVIDERS.length]!);
      return;
    }
    if (input.toLowerCase() === "r") {
      fetchRows(true);
      return;
    }
    if (input.toLowerCase() === "b" && selected && selected.provider !== "all") {
      setActionStatus({ tone: "running", text: messages.sessions.backupRunning });
      void backupSession(selected.provider, [selected.file_path])
        .then((data) => {
          setLastAction({
            kind: "backup_local",
            mode: "execute",
            token: "",
            targetCount: data.target_count,
            appliedCount: data.applied_count,
            validCount: data.valid_count,
            path: String(data.backup_to ?? data.backup_manifest_path ?? ""),
            backupCount: data.backed_up_count ?? 0,
            filePath: selected.file_path,
          });
          setActionStatus({ tone: "success", text: messages.sessions.backupDone(data.applied_count, data.valid_count) });
        })
        .catch((actionError) => {
          setActionStatus({ tone: "error", text: actionError instanceof Error ? actionError.message : String(actionError) });
        });
      return;
    }
    if (input === "a" && selected && selected.provider !== "all") {
      setActionStatus({ tone: "running", text: messages.sessions.archiveDryRun });
      const action = resolveArchiveSessionAction(selected);
      void runProviderAction(selected.provider, action, [selected.file_path], { dryRun: true })
        .then((data) => {
          const token = String(data.confirm_token_expected || "").trim();
          setPendingAction(token ? { kind: action, token, filePath: selected.file_path } : null);
          setLastAction({
            kind: action,
            mode: "dry-run",
            token,
            targetCount: data.target_count,
            appliedCount: data.applied_count,
            validCount: data.valid_count,
            path: String(data.archived_to ?? ""),
            backupCount: data.backed_up_count ?? 0,
            filePath: selected.file_path,
          });
          setActionStatus({
            tone: token ? "pending" : "success",
            text: token ? messages.sessions.archiveExecutePrompt(token) : messages.sessions.archiveDryRunDone(data.target_count),
          });
        })
        .catch((actionError) => {
          setActionStatus({ tone: "error", text: actionError instanceof Error ? actionError.message : String(actionError) });
        });
      return;
    }
    if (input === "d" && selected && selected.provider !== "all") {
      setActionStatus({ tone: "running", text: messages.sessions.deleteDryRun });
      void runProviderAction(selected.provider, "delete_local", [selected.file_path], { dryRun: true, backupBeforeDelete: true })
        .then((data) => {
          const token = String(data.confirm_token_expected || "").trim();
          setPendingAction(token ? { kind: "delete_local", token, filePath: selected.file_path } : null);
          setLastAction({
            kind: "delete_local",
            mode: "dry-run",
            token,
            targetCount: data.target_count,
            appliedCount: data.applied_count,
            validCount: data.valid_count,
            path: String(data.backup_to ?? data.backup_manifest_path ?? ""),
            backupCount: data.backed_up_count ?? 0,
            filePath: selected.file_path,
          });
          setActionStatus({
            tone: token ? "pending" : "success",
            text: token ? messages.sessions.deleteExecutePrompt(token) : messages.sessions.deleteDryRunDone(data.target_count),
          });
        })
        .catch((actionError) => {
          setActionStatus({ tone: "error", text: actionError instanceof Error ? actionError.message : String(actionError) });
        });
      return;
    }
    if (input === "c") {
      setPendingAction(null);
      setActionStatus({ tone: "success", text: messages.sessions.pendingTokenCleared });
      return;
    }
    if (input === "A" && selected && selected.provider !== "all") {
      const action = resolveArchiveSessionAction(selected);
      if (!pendingAction || pendingAction.kind !== action || pendingAction.filePath !== selected.file_path) {
        setActionStatus({ tone: "pending", text: messages.sessions.archiveRunDryRunFirst });
        return;
      }
      setActionStatus({ tone: "running", text: messages.sessions.archiving });
      void runProviderAction(selected.provider, action, [selected.file_path], { dryRun: false, confirmToken: pendingAction.token })
        .then((data) => {
          setPendingAction(null);
          setLastAction({
            kind: action,
            mode: "execute",
            token: "",
            targetCount: data.target_count,
            appliedCount: data.applied_count,
            validCount: data.valid_count,
            path: String(data.archived_to ?? ""),
            backupCount: data.backed_up_count ?? 0,
            filePath: selected.file_path,
          });
          setActionStatus({ tone: "success", text: messages.sessions.archiveDone(data.applied_count, data.valid_count) });
          fetchRows(true);
        })
        .catch((actionError) => {
          setActionStatus({ tone: "error", text: actionError instanceof Error ? actionError.message : String(actionError) });
        });
      return;
    }
    if (input === "D" && selected && selected.provider !== "all") {
      if (!pendingAction || pendingAction.kind !== "delete_local" || pendingAction.filePath !== selected.file_path) {
        setActionStatus({ tone: "pending", text: messages.sessions.deleteRunDryRunFirst });
        return;
      }
      setActionStatus({ tone: "running", text: messages.sessions.deleting });
      void runProviderAction(selected.provider, "delete_local", [selected.file_path], { dryRun: false, confirmToken: pendingAction.token, backupBeforeDelete: true })
        .then((data) => {
          setPendingAction(null);
          setLastAction({
            kind: "delete_local",
            mode: "execute",
            token: "",
            targetCount: data.target_count,
            appliedCount: data.applied_count,
            validCount: data.valid_count,
            path: String(data.backup_to ?? data.backup_manifest_path ?? ""),
            backupCount: data.backed_up_count ?? 0,
            filePath: selected.file_path,
          });
          setActionStatus({
            tone: "success",
            text: messages.sessions.deleteDone(data.applied_count, data.valid_count, data.backed_up_count ?? 0),
          });
          fetchRows(true);
        })
        .catch((actionError) => {
          setActionStatus({ tone: "error", text: actionError instanceof Error ? actionError.message : String(actionError) });
        });
    }
  };

  if (renderSimpleEmptyState) {
    return (
      <Box flexDirection="column" gap={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column" gap={0}>
          <Box justifyContent="space-between" alignItems="center">
            <Text color="cyan" bold>Sessions</Text>
            <Text color="gray" dimColor>{messages.sessions.summary(0)}</Text>
          </Box>
          <Box borderStyle="single" borderColor={focusMode === "filter" ? "green" : "gray"} paddingX={1}>
            <Text color="gray" dimColor>{messages.common.filterLabel}  </Text>
            <Text color="gray" dimColor>
              {focusMode === "filter" ? messages.common.filterEditingPlaceholder : messages.common.filterIdlePlaceholder}
            </Text>
          </Box>
        </Box>
        <Box gap={1} flexDirection={stackedLayout ? "column" : "row"}>
          <Box width={stackedLayout ? undefined : "55%"} borderStyle="round" borderColor={focusMode === "list" ? "cyan" : "gray"} paddingX={1} flexDirection="column">
            <Text color="cyan">Sessions</Text>
            <Text color="gray" dimColor>{messages.sessions.noSessionsFound}</Text>
          </Box>
          <Box width={stackedLayout ? undefined : "45%"} borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
            <Text color="cyan">{messages.common.detail}</Text>
            <Text color="gray" dimColor>{messages.sessions.selectSession}</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {inputEnabled ? <SessionsInputHandler onInput={handleInput} /> : null}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column" gap={0}>
        <Box justifyContent="space-between" alignItems="center">
          <Text color="cyan" bold>Sessions</Text>
          <Box gap={2}>
            {loading ? <Text key="sessions-loading" color="yellow">{messages.sessions.loading}</Text> : null}
            {summary ? (
              <Text key="sessions-summary" color="gray" dimColor>
                {summary.parse_fail > 0
                  ? messages.sessions.summaryWithFailures(summary.rows, summary.parse_fail)
                  : messages.sessions.summary(summary.rows)}
              </Text>
            ) : null}
          </Box>
        </Box>

        <Box borderStyle="single" borderColor={focusMode === "filter" ? "green" : "gray"} paddingX={1}>
          <Text key="sessions-filter-label" color="gray" dimColor>{messages.common.filterLabel}  </Text>
          {filterQuery.length > 0 ? (
            <Text key="sessions-filter-value" color={focusMode === "filter" ? "white" : "gray"}>
              {filterQuery}{focusMode === "filter" ? "▌" : ""}
            </Text>
          ) : (
            <Text key="sessions-filter-placeholder" color="gray" dimColor>
              {focusMode === "filter" ? messages.common.filterEditingPlaceholder : messages.common.filterIdlePlaceholder}
            </Text>
          )}
          {filterQuery && focusMode !== "filter" ? (
            <Text key="sessions-filter-count" color="gray" dimColor>  ({filteredRows.length}/{rows.length})</Text>
          ) : null}
        </Box>

        <Box gap={1} alignItems="center">
          <Text key="sessions-scope-label" color="gray" dimColor>{messages.sessions.scopeLabel}</Text>
          {PROVIDERS.filter((p) => p !== "all").map((p) => (
            <Text key={p} color={p === provider ? (PROVIDER_COLOR[p] ?? "white") : "gray"} bold={p === provider}>
              {p === provider ? `[${p}]` : p}
            </Text>
          ))}
          <Text key="sessions-switch-hint" color="gray" dimColor>  {messages.common.switchHint}</Text>
          {providerScan ? <Text key="sessions-provider-scan" color="gray" dimColor>  {providerScan}</Text> : null}
        </Box>

        {pendingAction ? (
          <Box gap={2} alignItems="center">
            <Text key="sessions-pending-label" color="yellow" bold>{messages.sessions.pendingLabel}</Text>
            <Text key="sessions-pending-text" color="yellow">{pendingActionText}</Text>
            <Text key="sessions-pending-clear" color="gray" dimColor>{messages.sessions.clearHint}</Text>
          </Box>
        ) : null}

        {actionStatus && shouldRenderSessionActionStatus(actionStatus, pendingActionText) ? (
          <Text color={statusToneColor(actionStatus.tone)}>
            {actionStatus.text}
          </Text>
        ) : null}

        {error ? <Text color="red">{error}</Text> : null}
      </Box>

      <Box gap={1} flexDirection={stackedLayout ? "column" : "row"}>
        <Box width={stackedLayout ? undefined : "55%"} borderStyle="round" borderColor={focusMode === "list" ? "cyan" : "gray"} paddingX={1} flexDirection="column">
          <Box justifyContent="space-between">
            <Text key="sessions-list-title" color="cyan">Sessions</Text>
            {filteredRows.length > 0 ? (
              <Text key="sessions-list-range" color="gray" dimColor>{visibleRows.start + 1}–{visibleRows.end}/{filteredRows.length}</Text>
            ) : null}
          </Box>
          {filteredRows.length === 0 ? (
            <Text color="gray" dimColor>{rows.length === 0 ? messages.sessions.noSessionsFound : messages.sessions.noResultsForFilter}</Text>
          ) : null}
          {visibleRows.items.map((row, offset) => {
            const idx = visibleRows.start + offset;
            const focused = idx === selectedIndex;
            const pColor = PROVIDER_COLOR[row.provider] ?? "white";
            return (
              <Box key={row.file_path} flexDirection="column" marginTop={1}>
                <Box gap={1}>
                  <Text color={focused ? "green" : "gray"}>{focused ? "›" : " "}</Text>
                  <Text color={pColor} dimColor={!focused}>{providerBadge(row.provider)}</Text>
                  <Text color={focused ? "white" : "gray"} bold={focused}>
                    {truncate(row.display_title || row.session_id, 52)}
                  </Text>
                </Box>
                <Box gap={2} paddingLeft={2}>
                  <Text color="gray" dimColor>{row.source}</Text>
                  <Text color="gray" dimColor>{formatBytes(row.size_bytes)}</Text>
                  <Text color="gray" dimColor>{formatDateLabel(row.mtime, locale)}</Text>
                  {!row.probe.ok ? <Text color="red" dimColor>{messages.sessions.parseFailLabel}</Text> : null}
                </Box>
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
                <Text color="white">{truncate(selected.display_title || selected.session_id, 44)}</Text>
              </Box>
              <Text color="gray" dimColor>{truncate(selected.file_path, 56)}</Text>
              <Box gap={3}>
                <Text color="gray" dimColor>{selected.source}</Text>
                <Text color="gray" dimColor>{selected.probe.format}</Text>
                <Text color="gray" dimColor>{formatDateLabel(selected.mtime, locale)}</Text>
                <Text color={selected.probe.ok ? "green" : "red"} dimColor>
                  {selected.probe.ok ? "ok" : "fail"}
                </Text>
              </Box>

              {lastAction && shouldRenderSessionLastAction(lastAction.filePath, selected.file_path) ? (
                <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
                  <Box justifyContent="space-between">
                    <ActionBadge kind={lastAction.kind} mode={lastAction.mode} />
                    <Text color="gray" dimColor>{lastAction.appliedCount}/{lastAction.validCount} applied</Text>
                  </Box>
                  {lastAction.path ? (
                    <Text color="gray" dimColor>{truncate(lastAction.path, 52)}</Text>
                  ) : null}
                </Box>
              ) : null}

              <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
                <Box justifyContent="space-between">
                  <Text color="cyan" dimColor>{messages.sessions.transcript}</Text>
                  {transcriptLoading ? <Text color="yellow" dimColor>{messages.common.loading}</Text> : (
                    <Text color="gray" dimColor>{messages.sessions.messagesCount(transcript.length)}</Text>
                  )}
                </Box>
                {!transcriptLoading && transcript.length === 0 ? (
                  <Text color="gray" dimColor>{messages.sessions.noMessages}</Text>
                ) : null}
                {transcript.map((msg) => (
                  <Box key={`${msg.idx}-${msg.ts ?? "na"}`} flexDirection="column" marginTop={1}>
                    <Box gap={2}>
                      <Text color={msg.role === "assistant" ? "magenta" : "cyan"} bold>
                        {msg.role === "assistant" ? "A" : "U"}
                      </Text>
                      <Text color="gray" dimColor>{formatDateLabel(msg.ts, locale)}</Text>
                    </Box>
                    <Text color={msg.role === "assistant" ? "white" : "gray"}>
                      {truncate((msg.text || "-").replace(/\s+/g, " ").trim(), 88)}
                    </Text>
                  </Box>
                ))}
              </Box>

              <Box flexDirection="column" marginTop={1}>
                {buildSessionActionHints(messages).map((hint) => {
                  const color = hint.startsWith("b ")
                    ? "green"
                    : hint.startsWith("d ") || hint.startsWith("D ")
                      ? "red"
                      : "yellow";
                  return (
                    <Text key={hint} color={color} dimColor>
                      {hint}
                    </Text>
                  );
                })}
              </Box>
            </>
          ) : (
            <Text color="gray" dimColor>{messages.sessions.selectSession}</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function SessionsInputHandler(props: {
  onInput: Parameters<typeof useInput>[0];
}) {
  useInput(props.onInput);
  return null;
}
