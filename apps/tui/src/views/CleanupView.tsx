import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { analyzeDelete, cleanupApply, cleanupDryRun, listThreads } from "../api.js";
import { getMessages } from "../i18n/index.js";
import type { Locale, TuiMessages } from "../i18n/types.js";
import type { ThreadRow } from "../types.js";
import { getWindowedItems, truncate } from "../lib/format.js";
import { isReservedGlobalShortcut } from "../lib/globalShortcut.js";
import { canonicalizeCleanupRows, filterCleanupRows } from "../lib/cleanupFilter.js";
import { statusToneColor, type StatusTone } from "../lib/statusTone.js";

const RISK_COLOR: Record<string, string> = {
  high: "red",
  medium: "yellow",
  low: "green",
};

function haveSameSelectedIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

export function shouldKeepPendingCleanup(pendingIds: string[], selectedIds: string[]): boolean {
  return haveSameSelectedIds(pendingIds, selectedIds);
}

export function shouldRenderCleanupStatus(
  statusMessage: { tone: StatusTone; text: string } | null,
  pendingCleanupText: string | null,
): boolean {
  if (!statusMessage) return false;
  if (!pendingCleanupText) return true;
  return statusMessage.text !== pendingCleanupText;
}

export function shouldClearCleanupSelectionStatus(
  statusText: string | null,
  selectedCount: number,
  selectThreadText: string,
): boolean {
  return selectedCount > 0 && statusText === selectThreadText;
}

export function shouldRenderCleanupSelectionDetails(
  targetIds: string[],
  selectedThreadId: string | null,
): boolean {
  if (!selectedThreadId) return false;
  return targetIds.includes(selectedThreadId);
}

export function CleanupView(props: {
  active: boolean;
  locale?: Locale;
  messages?: TuiMessages;
  inputEnabled?: boolean;
  initialThreadId: string | null;
  initialFilter?: string;
  reserveUpdateShortcuts?: boolean;
  onInitialThreadIdHandled: () => void;
  onTextEntryChange?: (locked: boolean) => void;
  onFilterChange?: (filter: string) => void;
}) {
  const {
    active,
    locale = "en",
    messages: providedMessages,
    inputEnabled = true,
    initialThreadId,
    initialFilter,
    reserveUpdateShortcuts = false,
    onInitialThreadIdHandled,
    onTextEntryChange,
    onFilterChange,
  } = props;
  const messages = providedMessages ?? getMessages(locale);
  const [rows, setRows] = useState<ThreadRow[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [filterQuery, setFilterQuery] = useState(initialFilter ?? "");
  const [focusMode, setFocusMode] = useState<"list" | "filter">("list");
  const [statusMessage, setStatusMessage] = useState<{ tone: StatusTone; text: string } | null>(null);
  const [pendingInitialThreadId, setPendingInitialThreadId] = useState<string | null>(initialThreadId);
  const [pendingCleanup, setPendingCleanup] = useState<{ token: string; ids: string[] } | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<{
    ids: string[];
    count: number;
    summary: string;
    impacts: string[];
    parents: string[];
  } | null>(null);
  const [lastCleanup, setLastCleanup] = useState<{
    ids: string[];
    mode: string;
    token: string;
    fileCount: number;
    deletedCount: number;
    backupCount: number;
    help: string;
  } | null>(null);
  const { stdout } = useStdout();
  const stackedLayout = (stdout?.columns ?? process.stdout.columns ?? 120) < 108;

  useEffect(() => {
    setPendingInitialThreadId(initialThreadId);
  }, [initialThreadId]);

  useEffect(() => {
    onTextEntryChange?.(active && focusMode === "filter");
  }, [active, focusMode, onTextEntryChange]);

  useEffect(() => {
    onFilterChange?.(filterQuery);
  }, [filterQuery, onFilterChange]);

  const fetchRows = () => {
    setLoading(true);
    setError(null);
    void listThreads()
      .then((data) => {
        const nextRows = canonicalizeCleanupRows(data.rows ?? []);
        setRows(nextRows);
        setTotalCount(nextRows.length);
        if (pendingInitialThreadId) {
          const nextIndex = nextRows.findIndex((row) => row.thread_id === pendingInitialThreadId);
          setSelectedIndex(nextIndex >= 0 ? nextIndex : 0);
          setPendingInitialThreadId(null);
          onInitialThreadIdHandled();
        } else {
          setSelectedIndex(0);
        }
      })
      .catch((fetchError) => {
        setRows([]);
        setTotalCount(0);
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const filteredRows = useMemo(() => {
    return filterCleanupRows(rows, filterQuery);
  }, [filterQuery, rows]);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(Math.max(filteredRows.length - 1, 0), prev));
  }, [filteredRows.length]);

  const selected = filteredRows[selectedIndex] ?? null;
  const visibleThreads = useMemo(
    () => getWindowedItems(filteredRows, selectedIndex, 12),
    [filteredRows, selectedIndex],
  );
  const normalizedSelectedIds = useMemo(() => [...selectedIds].sort(), [selectedIds]);
  const pendingCleanupText = pendingCleanup ? messages.cleanup.executePrompt(pendingCleanup.token) : null;
  const renderSimpleEmptyState =
    !loading &&
    !error &&
    rows.length === 0 &&
    filteredRows.length === 0 &&
    !pendingCleanup &&
    !statusMessage &&
    !selected;

  const requireSelection = (): boolean => {
    if (selectedIds.length > 0) return true;
    setStatusMessage({ tone: "pending", text: messages.cleanup.selectThread });
    return false;
  };

  useEffect(() => {
    if (!shouldClearCleanupSelectionStatus(statusMessage?.text ?? null, selectedIds.length, messages.cleanup.selectThread)) return;
    setStatusMessage(null);
  }, [messages.cleanup.selectThread, selectedIds.length, statusMessage]);

  useEffect(() => {
    if (!pendingCleanup) return;
    if (shouldKeepPendingCleanup(pendingCleanup.ids, normalizedSelectedIds)) return;
    setPendingCleanup(null);
    setStatusMessage((current) => (current?.text === pendingCleanupText ? null : current));
  }, [normalizedSelectedIds, pendingCleanup, pendingCleanupText]);

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
    if (input === "/" || input.toLowerCase() === "i") { setFocusMode("filter"); return; }
    if (key.upArrow || input === "k") { setSelectedIndex((prev) => Math.max(0, prev - 1)); return; }
    if (key.downArrow || input === "j") { setSelectedIndex((prev) => Math.min(Math.max(filteredRows.length - 1, 0), prev + 1)); return; }
    if (input === "g") { setSelectedIndex(0); return; }
    if (input === "G") { setSelectedIndex(Math.max(filteredRows.length - 1, 0)); return; }
    if (input === "K") { setSelectedIndex((prev) => Math.max(0, prev - 10)); return; }
    if (input === "J") { setSelectedIndex((prev) => Math.min(Math.max(filteredRows.length - 1, 0), prev + 10)); return; }
    if (input === " " && selected) {
      setSelectedIds((prev) =>
        prev.includes(selected.thread_id)
          ? prev.filter((id) => id !== selected.thread_id)
          : [...prev, selected.thread_id],
      );
      return;
    }
    if (input.toLowerCase() === "x") {
      setSelectedIds([]);
      setStatusMessage({ tone: "success", text: messages.cleanup.selectionCleared });
      return;
    }
    if (input === "c") {
      setPendingCleanup(null);
      setStatusMessage({ tone: "success", text: messages.cleanup.pendingTokenCleared });
      return;
    }
    if (input.toLowerCase() === "r") {
      fetchRows();
      return;
    }
    if (input === "a") {
      if (!requireSelection()) return;
      setStatusMessage({ tone: "running", text: messages.cleanup.analyzingImpact });
      void analyzeDelete(selectedIds)
        .then((data) => {
          const report = data.reports?.[0];
          const summary = String(report?.summary ?? "").trim();
          setLastAnalysis({
            ids: [...normalizedSelectedIds],
            count: data.count ?? 0,
            summary,
            impacts: report?.impacts ?? [],
            parents: report?.parents ?? [],
          });
          setStatusMessage({ tone: "success", text: messages.cleanup.impactDone(data.count ?? 0, summary || null) });
        })
        .catch((err) => {
          setStatusMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
        });
      return;
    }
    if (input === "d") {
      if (!requireSelection()) return;
      setStatusMessage({ tone: "running", text: messages.cleanup.dryRunRunning });
      void cleanupDryRun(selectedIds)
        .then((data) => {
          const token = String(data.confirm_token_expected ?? "").trim();
          setPendingCleanup(token ? { token, ids: [...normalizedSelectedIds] } : null);
          setLastCleanup({
            ids: [...normalizedSelectedIds],
            mode: String(data.mode ?? "dry-run"),
            token,
            fileCount: data.target_file_count ?? 0,
            deletedCount: 0,
            backupCount: data.backup?.copied_count ?? 0,
            help: String(data.confirm_help ?? "").trim(),
          });
          setStatusMessage({
            tone: token ? "pending" : "success",
            text: token ? messages.cleanup.executePrompt(token) : messages.cleanup.dryRunDone(data.target_file_count ?? 0),
          });
        })
        .catch((err) => {
          setStatusMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
        });
      return;
    }
    if (input === "D") {
      if (!requireSelection()) return;
      if (
        !pendingCleanup ||
        pendingCleanup.ids.length !== normalizedSelectedIds.length ||
        pendingCleanup.ids.some((id, index) => id !== normalizedSelectedIds[index])
      ) {
        setStatusMessage({ tone: "pending", text: messages.cleanup.executeRunDryRunFirst });
        return;
      }
      setStatusMessage({ tone: "running", text: messages.cleanup.executingCleanup });
      void cleanupApply(normalizedSelectedIds, pendingCleanup.token)
        .then((data) => {
          setPendingCleanup(null);
          setSelectedIds([]);
          setLastCleanup({
            ids: [...normalizedSelectedIds],
            mode: String(data.mode ?? "execute"),
            token: String(data.confirm_token_expected ?? "").trim(),
            fileCount: data.target_file_count ?? 0,
            deletedCount: data.deleted_file_count ?? 0,
            backupCount: data.backup?.copied_count ?? 0,
            help: String(data.confirm_help ?? "").trim(),
          });
          setStatusMessage({
            tone: "success",
            text: messages.cleanup.cleanupDone(data.deleted_file_count ?? 0, data.target_file_count ?? 0, data.backup?.copied_count ?? 0),
          });
          fetchRows();
        })
        .catch((err) => {
          setStatusMessage({ tone: "error", text: err instanceof Error ? err.message : String(err) });
        });
    }
  };

  if (renderSimpleEmptyState) {
    return (
      <Box flexDirection="column" gap={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column" gap={0}>
          <Box justifyContent="space-between" alignItems="center">
            <Text color="cyan" bold>Cleanup</Text>
            <Text color="gray" dimColor>0 {messages.common.threadsUnit}</Text>
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
            <Text color="cyan">Threads</Text>
            <Text color="gray" dimColor>{messages.cleanup.noThreadsFound}</Text>
          </Box>
          <Box width={stackedLayout ? undefined : "45%"} borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
            <Text color="cyan">{messages.common.detail}</Text>
            <Text color="gray" dimColor>{messages.cleanup.selectThread}</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      {inputEnabled ? <CleanupInputHandler onInput={handleInput} /> : null}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column" gap={0}>
        <Box key="cleanup-header" justifyContent="space-between" alignItems="center">
          <Text color="cyan" bold>Cleanup</Text>
          <Box gap={2}>
            {loading ? <Text color="yellow">{messages.cleanup.loading}</Text> : null}
            <Text color="gray" dimColor>{totalCount || rows.length} {messages.common.threadsUnit}</Text>
            {selectedIds.length > 0 ? (
              <Text color="yellow" bold>{messages.cleanup.selectedCount(selectedIds.length)}</Text>
            ) : null}
          </Box>
        </Box>

        <Box key="cleanup-filter" borderStyle="single" borderColor={focusMode === "filter" ? "green" : "gray"} paddingX={1}>
          <Text color="gray" dimColor>{messages.common.filterLabel}  </Text>
          {filterQuery.length > 0 ? (
            <Text color={focusMode === "filter" ? "white" : "gray"}>
              {filterQuery}{focusMode === "filter" ? "▌" : ""}
            </Text>
          ) : (
            <Text color="gray" dimColor>
              {focusMode === "filter" ? messages.common.filterEditingPlaceholder : messages.common.filterIdlePlaceholder}
            </Text>
          )}
          {filterQuery && focusMode !== "filter" ? (
            <Text color="gray" dimColor>  ({filteredRows.length}/{rows.length})</Text>
          ) : null}
        </Box>

        {pendingCleanup ? (
          <Box key="cleanup-pending" gap={2} alignItems="center">
            <Text color="red" bold>{messages.cleanup.pendingDeleteLabel}</Text>
            <Text color="gray" dimColor>token {pendingCleanup.token}</Text>
            <Text color="white">{pendingCleanup.ids.length} {messages.common.threadsUnit}</Text>
            <Text color="white">→ D execute</Text>
            <Text color="gray" dimColor>{messages.cleanup.clearHint}</Text>
          </Box>
        ) : null}

        {statusMessage && shouldRenderCleanupStatus(statusMessage, pendingCleanupText) ? (
          <Text key="cleanup-status" color={statusToneColor(statusMessage.tone)}>
            {statusMessage.text}
          </Text>
        ) : null}

        {error ? <Text key="cleanup-error" color="red">{error}</Text> : null}
      </Box>

      <Box key="cleanup-panels" gap={1} flexDirection={stackedLayout ? "column" : "row"}>
        <Box key="cleanup-list-panel" width={stackedLayout ? undefined : "55%"} borderStyle="round" borderColor={focusMode === "list" ? "cyan" : "gray"} paddingX={1} flexDirection="column">
          <Box justifyContent="space-between">
            <Text color="cyan">Threads</Text>
            {filteredRows.length > 0 ? (
              <Text color="gray" dimColor>{visibleThreads.start + 1}–{visibleThreads.end}/{filteredRows.length}</Text>
            ) : null}
          </Box>
          {filteredRows.length === 0 ? (
            <Text color="gray" dimColor>{rows.length === 0 ? messages.cleanup.noThreadsFound : messages.cleanup.noResultsForFilter}</Text>
          ) : null}
          {visibleThreads.items.map((row, offset) => {
            const idx = visibleThreads.start + offset;
            const focused = idx === selectedIndex;
            const checked = selectedIds.includes(row.thread_id);
            const riskColor = RISK_COLOR[row.risk_level ?? ""] ?? "gray";
            return (
              <Box key={row.thread_id} flexDirection="column" marginTop={1}>
                <Box gap={1}>
                  <Text color={focused ? "green" : "gray"}>{focused ? "›" : " "}</Text>
                  <Text color={checked ? "yellow" : "gray"}>{checked ? "[✓]" : "[ ]"}</Text>
                  <Text color={focused ? "white" : "gray"} bold={focused}>
                    {truncate(row.title || row.thread_id, 48)}
                  </Text>
                </Box>
                <Box gap={2} paddingLeft={2}>
                  <Text color={riskColor} dimColor>{messages.cleanup.riskLabel(row.risk_score ?? 0)}</Text>
                  <Text color="gray" dimColor>{row.risk_level ?? "?"}</Text>
                  {row.is_pinned ? <Text color="cyan" dimColor>{messages.cleanup.pinned}</Text> : null}
                  <Text color="gray" dimColor>{row.source || "-"}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>

        <Box key="cleanup-detail-panel" width={stackedLayout ? undefined : "45%"} borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color="cyan">{messages.common.detail}</Text>
          {selected ? (
            <>
              <Box marginTop={1} flexDirection="column">
                <Text color="white" bold>{truncate(selected.title || selected.thread_id, 50)}</Text>
                <Text color="gray" dimColor>{truncate(selected.thread_id, 50)}</Text>
                <Box gap={3}>
                  <Text color={RISK_COLOR[selected.risk_level ?? ""] ?? "gray"}>
                    {messages.cleanup.riskLabel(selected.risk_score ?? 0)}
                  </Text>
                  <Text color="gray" dimColor>{selected.risk_level ?? "?"}</Text>
                  {selected.is_pinned ? <Text color="cyan">{messages.cleanup.pinned}</Text> : null}
                </Box>
                {selected.cwd ? (
                  <Text color="gray" dimColor>{truncate(selected.cwd, 52)}</Text>
                ) : null}
                {(selected.risk_tags ?? []).length > 0 ? (
                  <Text color="gray" dimColor>{messages.cleanup.tagsLabel(selected.risk_tags ?? [])}</Text>
                ) : null}
              </Box>

              {lastAnalysis && shouldRenderCleanupSelectionDetails(lastAnalysis.ids, selected.thread_id) ? (
                <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
                  <Text color="yellow" dimColor>{messages.cleanup.impactAnalysis}</Text>
                  <Text color="gray" dimColor>{messages.cleanup.itemsCount(lastAnalysis.count)}</Text>
                  {lastAnalysis.summary ? (
                    <Text color="white">{truncate(lastAnalysis.summary, 52)}</Text>
                  ) : null}
                  {lastAnalysis.impacts.slice(0, 2).map((impact, i) => (
                    <Text key={`impact-${i}`} color="gray" dimColor>· {truncate(impact, 50)}</Text>
                  ))}
                </Box>
              ) : null}

              {lastCleanup && shouldRenderCleanupSelectionDetails(lastCleanup.ids, selected.thread_id) ? (
                <Box flexDirection="column" borderStyle="single" borderColor={lastCleanup.deletedCount > 0 ? "red" : "gray"} paddingX={1} marginTop={1}>
                  <Box justifyContent="space-between">
                    <Text color={lastCleanup.deletedCount > 0 ? "red" : "gray"} dimColor>
                      {lastCleanup.mode}
                    </Text>
                    <Text color="gray" dimColor>{messages.cleanup.itemsCount(lastCleanup.fileCount)}</Text>
                  </Box>
                  {lastCleanup.deletedCount > 0 ? (
                    <Text color="red">{messages.cleanup.deletedCount(lastCleanup.deletedCount)}</Text>
                  ) : null}
                  {lastCleanup.backupCount > 0 ? (
                    <Text color="green" dimColor>{messages.cleanup.backupCount(lastCleanup.backupCount)}</Text>
                  ) : null}
                  {lastCleanup.token ? (
                    <Text color="yellow" dimColor>token {lastCleanup.token}</Text>
                  ) : null}
                </Box>
              ) : null}

              <Box gap={2} marginTop={1} flexWrap="wrap">
                <Text color="gray" dimColor>{messages.cleanup.actionSelect}</Text>
                <Text color="cyan" dimColor>{messages.cleanup.actionAnalysis}</Text>
                <Text color="yellow" dimColor>{messages.cleanup.actionDryRun}</Text>
                <Text color="red" dimColor>{messages.cleanup.actionExecute}</Text>
                <Text color="gray" dimColor>{messages.cleanup.actionClear}</Text>
              </Box>
            </>
          ) : (
            <Text color="gray" dimColor>{messages.cleanup.selectThread}</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}

function CleanupInputHandler(props: {
  onInput: Parameters<typeof useInput>[0];
}) {
  useInput(props.onInput);
  return null;
}
