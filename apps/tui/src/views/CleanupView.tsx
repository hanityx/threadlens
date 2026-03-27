import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { analyzeDelete, cleanupApply, cleanupDryRun, listThreads } from "../api.js";
import type { ThreadRow } from "../types.js";
import { getWindowedItems, truncate } from "../lib/format.js";

const RISK_COLOR: Record<string, string> = {
  high: "red",
  medium: "yellow",
  low: "green",
};

export function CleanupView(props: {
  active: boolean;
  initialThreadId: string | null;
  initialFilter?: string;
  onInitialThreadIdHandled: () => void;
  onTextEntryChange?: (locked: boolean) => void;
  onFilterChange?: (filter: string) => void;
}) {
  const { active, initialThreadId, initialFilter, onInitialThreadIdHandled, onTextEntryChange, onFilterChange } = props;
  const [rows, setRows] = useState<ThreadRow[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [filterQuery, setFilterQuery] = useState(initialFilter ?? "");
  const [focusMode, setFocusMode] = useState<"list" | "filter">("list");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingInitialThreadId, setPendingInitialThreadId] = useState<string | null>(initialThreadId);
  const [pendingCleanup, setPendingCleanup] = useState<{ token: string; ids: string[] } | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<{
    count: number;
    summary: string;
    impacts: string[];
    parents: string[];
  } | null>(null);
  const [lastCleanup, setLastCleanup] = useState<{
    mode: string;
    token: string;
    fileCount: number;
    deletedCount: number;
    backupCount: number;
    help: string;
  } | null>(null);

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
        const nextRows: ThreadRow[] = data.rows ?? [];
        setRows(nextRows);
        setTotalCount(data.total ?? data.rows?.length ?? 0);
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
    const needle = filterQuery.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      [
        row.title,
        row.thread_id,
        row.cwd,
        row.source,
        row.risk_level,
        ...(row.risk_tags ?? []),
      ]
        .some((value) => typeof value === "string" && value.toLowerCase().includes(value)),
    );
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

  useInput((input, key) => {
    if (!active) return;
    if (focusMode === "filter") {
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
      setStatusMessage("Selection cleared");
      return;
    }
    if (input === "c") {
      setPendingCleanup(null);
      setStatusMessage("Pending token cleared");
      return;
    }
    if (input.toLowerCase() === "r") {
      fetchRows();
      return;
    }
    if (input === "a" && selectedIds.length > 0) {
      setStatusMessage("Analyzing impact…");
      void analyzeDelete(selectedIds)
        .then((data) => {
          const report = data.reports?.[0];
          setLastAnalysis({
            count: data.count ?? 0,
            summary: String(report?.summary ?? "").trim(),
            impacts: report?.impacts ?? [],
            parents: report?.parents ?? [],
          });
          setStatusMessage(`Impact: ${data.count ?? 0} items${report?.summary ? " · " + truncate(report.summary, 48) : ""}`);
        })
        .catch((err) => {
          setStatusMessage(err instanceof Error ? err.message : String(err));
        });
      return;
    }
    if (input === "d" && selectedIds.length > 0) {
      setStatusMessage("Dry-run…");
      void cleanupDryRun(selectedIds)
        .then((data) => {
          const token = String(data.confirm_token_expected ?? "").trim();
          setPendingCleanup(token ? { token, ids: [...normalizedSelectedIds] } : null);
          setLastCleanup({
            mode: String(data.mode ?? "dry-run"),
            token,
            fileCount: data.target_file_count ?? 0,
            deletedCount: 0,
            backupCount: data.backup?.copied_count ?? 0,
            help: String(data.confirm_help ?? "").trim(),
          });
          setStatusMessage(token ? `Token: ${token}  ·  Press D to execute` : `Dry-run done · ${data.target_file_count ?? 0} files`);
        })
        .catch((err) => {
          setStatusMessage(err instanceof Error ? err.message : String(err));
        });
      return;
    }
    if (input === "D" && normalizedSelectedIds.length > 0) {
      if (
        !pendingCleanup ||
        pendingCleanup.ids.length !== normalizedSelectedIds.length ||
        pendingCleanup.ids.some((id, index) => id !== normalizedSelectedIds[index])
      ) {
        setStatusMessage("Run dry-run first (press d) with current selection.");
        return;
      }
      setStatusMessage("Executing cleanup…");
      void cleanupApply(normalizedSelectedIds, pendingCleanup.token)
        .then((data) => {
          setPendingCleanup(null);
          setSelectedIds([]);
          setLastCleanup({
            mode: String(data.mode ?? "execute"),
            token: String(data.confirm_token_expected ?? "").trim(),
            fileCount: data.target_file_count ?? 0,
            deletedCount: data.deleted_file_count ?? 0,
            backupCount: data.backup?.copied_count ?? 0,
            help: String(data.confirm_help ?? "").trim(),
          });
          setStatusMessage(`Done · deleted ${data.deleted_file_count ?? 0}/${data.target_file_count ?? 0}${data.backup?.copied_count ? ` · backup ${data.backup.copied_count}` : ""}`);
          fetchRows();
        })
        .catch((err) => {
          setStatusMessage(err instanceof Error ? err.message : String(err));
        });
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column" gap={0}>
        <Box justifyContent="space-between" alignItems="center">
          <Text color="cyan" bold>Cleanup</Text>
          <Box gap={2}>
            {loading ? <Text color="yellow">loading…</Text> : null}
            <Text color="gray" dimColor>{totalCount || rows.length} threads</Text>
            {selectedIds.length > 0 ? (
              <Text color="yellow" bold>{selectedIds.length} selected</Text>
            ) : null}
          </Box>
        </Box>

        {/* Filter bar */}
        <Box borderStyle="single" borderColor={focusMode === "filter" ? "green" : "gray"} paddingX={1}>
          <Text color="gray" dimColor>filter  </Text>
          {filterQuery.length > 0 ? (
            <Text color={focusMode === "filter" ? "white" : "gray"}>
              {filterQuery}{focusMode === "filter" ? "▌" : ""}
            </Text>
          ) : (
            <Text color="gray" dimColor>
              {focusMode === "filter" ? "type to filter▌" : "/·i to filter"}
            </Text>
          )}
          {filterQuery && focusMode !== "filter" ? (
            <Text color="gray" dimColor>  ({filteredRows.length}/{rows.length})</Text>
          ) : null}
        </Box>

        {/* Pending cleanup indicator */}
        {pendingCleanup ? (
          <Box gap={2} alignItems="center">
            <Text color="red" bold>⚠ Pending delete:</Text>
            <Text color="gray" dimColor>token {pendingCleanup.token}</Text>
            <Text color="white">{pendingCleanup.ids.length} threads</Text>
            <Text color="white">→ D execute</Text>
            <Text color="gray" dimColor>c clear</Text>
          </Box>
        ) : null}

        {/* Status message */}
        {statusMessage ? (
          <Text color={
            statusMessage.includes("Done") || statusMessage.includes("complete") ? "green" :
            statusMessage.includes("…") ? "yellow" :
            statusMessage.includes("error") || statusMessage.includes("fail") ? "red" : "gray"
          }>
            {statusMessage}
          </Text>
        ) : null}

        {error ? <Text color="red">{error}</Text> : null}
      </Box>

      {/* List + Detail */}
      <Box gap={1}>
        <Box width="55%" borderStyle="round" borderColor={focusMode === "list" ? "cyan" : "gray"} paddingX={1} flexDirection="column">
          <Box justifyContent="space-between">
            <Text color="cyan">Threads</Text>
            {filteredRows.length > 0 ? (
              <Text color="gray" dimColor>{visibleThreads.start + 1}–{visibleThreads.end}/{filteredRows.length}</Text>
            ) : null}
          </Box>
          {filteredRows.length === 0 ? (
            <Text color="gray" dimColor>{rows.length === 0 ? "No threads found." : "No results for filter."}</Text>
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
                  <Text color={riskColor} dimColor>risk {row.risk_score ?? 0}</Text>
                  <Text color="gray" dimColor>{row.risk_level ?? "?"}</Text>
                  {row.is_pinned ? <Text color="cyan" dimColor>pinned</Text> : null}
                  <Text color="gray" dimColor>{row.source || "-"}</Text>
                </Box>
              </Box>
            );
          })}
        </Box>

        <Box width="45%" borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color="cyan">Detail</Text>
          {selected ? (
            <>
              <Box marginTop={1} flexDirection="column">
                <Text color="white" bold>{truncate(selected.title || selected.thread_id, 50)}</Text>
                <Text color="gray" dimColor>{truncate(selected.thread_id, 50)}</Text>
                <Box gap={3}>
                  <Text color={RISK_COLOR[selected.risk_level ?? ""] ?? "gray"}>
                    risk {selected.risk_score ?? 0}
                  </Text>
                  <Text color="gray" dimColor>{selected.risk_level ?? "?"}</Text>
                  {selected.is_pinned ? <Text color="cyan">pinned</Text> : null}
                </Box>
                {selected.cwd ? (
                  <Text color="gray" dimColor>{truncate(selected.cwd, 52)}</Text>
                ) : null}
                {(selected.risk_tags ?? []).length > 0 ? (
                  <Text color="gray" dimColor>tags: {selected.risk_tags!.join(", ")}</Text>
                ) : null}
              </Box>

              {/* Impact analysis result */}
              {lastAnalysis ? (
                <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1} marginTop={1}>
                  <Text color="yellow" dimColor>impact analysis</Text>
                  <Text color="gray" dimColor>{lastAnalysis.count} items</Text>
                  {lastAnalysis.summary ? (
                    <Text color="white">{truncate(lastAnalysis.summary, 52)}</Text>
                  ) : null}
                  {lastAnalysis.impacts.slice(0, 2).map((impact, i) => (
                    <Text key={`impact-${i}`} color="gray" dimColor>· {truncate(impact, 50)}</Text>
                  ))}
                </Box>
              ) : null}

              {/* Cleanup dry-run / execute result */}
              {lastCleanup ? (
                <Box flexDirection="column" borderStyle="single" borderColor={lastCleanup.deletedCount > 0 ? "red" : "gray"} paddingX={1} marginTop={1}>
                  <Box justifyContent="space-between">
                    <Text color={lastCleanup.deletedCount > 0 ? "red" : "gray"} dimColor>
                      {lastCleanup.mode}
                    </Text>
                    <Text color="gray" dimColor>{lastCleanup.fileCount} files</Text>
                  </Box>
                  {lastCleanup.deletedCount > 0 ? (
                    <Text color="red">deleted {lastCleanup.deletedCount}</Text>
                  ) : null}
                  {lastCleanup.backupCount > 0 ? (
                    <Text color="green" dimColor>backup {lastCleanup.backupCount}</Text>
                  ) : null}
                  {lastCleanup.token ? (
                    <Text color="yellow" dimColor>token {lastCleanup.token}</Text>
                  ) : null}
                </Box>
              ) : null}

              {/* Action hints */}
              <Box gap={2} marginTop={1} flexWrap="wrap">
                <Text color="gray" dimColor>Space select</Text>
                <Text color="cyan" dimColor>a analysis</Text>
                <Text color="yellow" dimColor>d dry-run</Text>
                <Text color="red" dimColor>D execute</Text>
                <Text color="gray" dimColor>x clear</Text>
              </Box>
            </>
          ) : (
            <Text color="gray" dimColor>Select a thread.</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
