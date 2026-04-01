import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { backupSession, listProviderSessions, loadSessionTranscript, runProviderAction } from "../api.js";
import { PROVIDERS, type ProviderScope } from "../config.js";
import type { ProviderScanEntry, ProviderSessionRow, TranscriptMessage } from "../types.js";
import { formatBytes, formatDateLabel, getWindowedItems, truncate } from "../lib/format.js";
import { getSessionsFetchLimit, shouldRefetchSessions } from "../lib/sessionFetchWindow.js";

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

function ActionBadge({ kind, mode }: { kind: string; mode: string }) {
  const label = kind === "backup_local" ? "BAK" : kind === "archive_local" ? "ARC" : "DEL";
  const color = kind === "delete_local" ? "red" : kind === "archive_local" ? "yellow" : "green";
  return (
    <Box gap={1}>
      <Text color={color} bold>{label}</Text>
      <Text color="gray" dimColor>{mode}</Text>
    </Box>
  );
}

export function SessionsView(props: {
  active: boolean;
  provider: ProviderScope;
  setProvider: (provider: ProviderScope) => void;
  initialFilePath: string | null;
  initialFilter?: string;
  onInitialFilePathHandled: () => void;
  onTextEntryChange?: (locked: boolean) => void;
  onFilterChange?: (filter: string) => void;
}) {
  const { active, provider, setProvider, initialFilePath, initialFilter, onInitialFilePathHandled, onTextEntryChange, onFilterChange } = props;
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
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [pendingInitialPath, setPendingInitialPath] = useState<string | null>(initialFilePath);
  const [pendingAction, setPendingAction] = useState<{
    kind: "archive_local" | "delete_local";
    token: string;
    filePath: string;
  } | null>(null);
  const [lastAction, setLastAction] = useState<{
    kind: "backup_local" | "archive_local" | "delete_local";
    mode: "execute" | "dry-run";
    token: string;
    targetCount: number;
    appliedCount: number;
    validCount: number;
    path: string;
    backupCount: number;
  } | null>(null);

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
        const nextRows: ProviderSessionRow[] = data.rows ?? [];
        const nextProviders: ProviderScanEntry[] = data.providers ?? [];
        setRows(nextRows);
        setFetchedLimit(limit);
        setSummary(
          data.summary
            ? {
                rows: data.summary.rows ?? nextRows.length,
                parse_ok: data.summary.parse_ok ?? 0,
                parse_fail: data.summary.parse_fail ?? 0,
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
  const visibleRows = useMemo(
    () => getWindowedItems(filteredRows, selectedIndex, 12),
    [filteredRows, selectedIndex],
  );

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
      setActionStatus("Running backup…");
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
          });
          setActionStatus(`Backup done · ${data.applied_count}/${data.valid_count} applied`);
        })
        .catch((actionError) => {
          setActionStatus(actionError instanceof Error ? actionError.message : String(actionError));
        });
      return;
    }
    if (input === "a" && selected && selected.provider !== "all") {
      setActionStatus("Archive dry-run…");
      void runProviderAction(selected.provider, "archive_local", [selected.file_path], { dryRun: true })
        .then((data) => {
          const token = String(data.confirm_token_expected || "").trim();
          setPendingAction(token ? { kind: "archive_local", token, filePath: selected.file_path } : null);
          setLastAction({
            kind: "archive_local",
            mode: "dry-run",
            token,
            targetCount: data.target_count,
            appliedCount: data.applied_count,
            validCount: data.valid_count,
            path: String(data.archived_to ?? ""),
            backupCount: data.backed_up_count ?? 0,
          });
          setActionStatus(token ? `Token: ${token}  ·  Press A to execute` : `Archive dry-run done · target ${data.target_count}`);
        })
        .catch((actionError) => {
          setActionStatus(actionError instanceof Error ? actionError.message : String(actionError));
        });
      return;
    }
    if (input === "d" && selected && selected.provider !== "all") {
      setActionStatus("Delete dry-run…");
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
          });
          setActionStatus(token ? `Token: ${token}  ·  Press D to execute` : `Delete dry-run done · target ${data.target_count}`);
        })
        .catch((actionError) => {
          setActionStatus(actionError instanceof Error ? actionError.message : String(actionError));
        });
      return;
    }
    if (input === "c") {
      setPendingAction(null);
      setActionStatus("Pending token cleared");
      return;
    }
    if (input === "A" && selected && selected.provider !== "all") {
      if (!pendingAction || pendingAction.kind !== "archive_local" || pendingAction.filePath !== selected.file_path) {
        setActionStatus("Run a dry-run first (press a) to get a token.");
        return;
      }
      setActionStatus("Archiving…");
      void runProviderAction(selected.provider, "archive_local", [selected.file_path], { dryRun: false, confirmToken: pendingAction.token })
        .then((data) => {
          setPendingAction(null);
          setLastAction({
            kind: "archive_local",
            mode: "execute",
            token: "",
            targetCount: data.target_count,
            appliedCount: data.applied_count,
            validCount: data.valid_count,
            path: String(data.archived_to ?? ""),
            backupCount: data.backed_up_count ?? 0,
          });
          setActionStatus(`Archive done · ${data.applied_count}/${data.valid_count} applied`);
          fetchRows(true);
        })
        .catch((actionError) => {
          setActionStatus(actionError instanceof Error ? actionError.message : String(actionError));
        });
      return;
    }
    if (input === "D" && selected && selected.provider !== "all") {
      if (!pendingAction || pendingAction.kind !== "delete_local" || pendingAction.filePath !== selected.file_path) {
        setActionStatus("Run a dry-run first (press d) to get a token.");
        return;
      }
      setActionStatus("Deleting…");
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
          });
          setActionStatus(`Delete done · ${data.applied_count}/${data.valid_count} applied${data.backed_up_count ? ` · backup ${data.backed_up_count}` : ""}`);
          fetchRows(true);
        })
        .catch((actionError) => {
          setActionStatus(actionError instanceof Error ? actionError.message : String(actionError));
        });
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      {/* Header bar */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} flexDirection="column" gap={0}>
        <Box justifyContent="space-between" alignItems="center">
          <Text color="cyan" bold>Sessions</Text>
          <Box gap={2}>
            {loading ? <Text color="yellow">loading…</Text> : null}
            {summary ? (
              <Text color="gray" dimColor>
                {summary.rows} sessions{summary.parse_fail > 0 ? <Text color="red">  {summary.parse_fail} fail</Text> : null}
              </Text>
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

        {/* Provider scope */}
        <Box gap={1} alignItems="center">
          <Text color="gray" dimColor>scope:</Text>
          {PROVIDERS.filter((p) => p !== "all").map((p) => (
            <Text key={p} color={p === provider ? (PROVIDER_COLOR[p] ?? "white") : "gray"} bold={p === provider}>
              {p === provider ? `[${p}]` : p}
            </Text>
          ))}
          <Text color="gray" dimColor>  [ ] switch</Text>
          {providerScan ? <Text color="gray" dimColor>  {providerScan}</Text> : null}
        </Box>

        {/* Pending action indicator */}
        {pendingAction ? (
          <Box gap={2} alignItems="center">
            <Text color="yellow" bold>⚠ Pending:</Text>
            <Text color="yellow">{pendingAction.kind === "archive_local" ? "archive" : "delete"}</Text>
            <Text color="gray" dimColor>token {pendingAction.token}</Text>
            <Text color="white">{pendingAction.kind === "archive_local" ? "→ A execute" : "→ D execute"}</Text>
            <Text color="gray" dimColor>c clear</Text>
          </Box>
        ) : null}

        {/* Action status */}
        {actionStatus ? (
          <Text color={actionStatus.includes("done") || actionStatus.includes("complete") ? "green" : actionStatus.includes("…") ? "yellow" : actionStatus.includes("fail") || actionStatus.includes("error") ? "red" : "gray"}>
            {actionStatus}
          </Text>
        ) : null}

        {error ? <Text color="red">{error}</Text> : null}
      </Box>

      {/* List + Detail */}
      <Box gap={1}>
        <Box width="55%" borderStyle="round" borderColor={focusMode === "list" ? "cyan" : "gray"} paddingX={1} flexDirection="column">
          <Box justifyContent="space-between">
            <Text color="cyan">Sessions</Text>
            {filteredRows.length > 0 ? (
              <Text color="gray" dimColor>{visibleRows.start + 1}–{visibleRows.end}/{filteredRows.length}</Text>
            ) : null}
          </Box>
          {filteredRows.length === 0 ? (
            <Text color="gray" dimColor>{rows.length === 0 ? "No sessions found." : "No results for filter."}</Text>
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
                  <Text color="gray" dimColor>{formatDateLabel(row.mtime)}</Text>
                  {!row.probe.ok ? <Text color="red" dimColor>parse fail</Text> : null}
                </Box>
              </Box>
            );
          })}
        </Box>

        <Box width="45%" borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color="cyan">Detail</Text>
          {selected ? (
            <>
              {/* Session metadata */}
              <Box gap={1} alignItems="flex-start" marginTop={1}>
                <Text color={PROVIDER_COLOR[selected.provider] ?? "white"} bold>{providerBadge(selected.provider)}</Text>
                <Text color="white">{truncate(selected.display_title || selected.session_id, 44)}</Text>
              </Box>
              <Text color="gray" dimColor>{truncate(selected.file_path, 56)}</Text>
              <Box gap={3}>
                <Text color="gray" dimColor>{selected.source}</Text>
                <Text color="gray" dimColor>{selected.probe.format}</Text>
                <Text color="gray" dimColor>{formatDateLabel(selected.mtime)}</Text>
                <Text color={selected.probe.ok ? "green" : "red"} dimColor>
                  {selected.probe.ok ? "ok" : "fail"}
                </Text>
              </Box>

              {/* Last action result */}
              {lastAction ? (
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

              {/* Transcript preview */}
              <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
                <Box justifyContent="space-between">
                  <Text color="cyan" dimColor>transcript</Text>
                  {transcriptLoading ? <Text color="yellow" dimColor>loading…</Text> : (
                    <Text color="gray" dimColor>{transcript.length} msg</Text>
                  )}
                </Box>
                {!transcriptLoading && transcript.length === 0 ? (
                  <Text color="gray" dimColor>No messages.</Text>
                ) : null}
                {transcript.map((msg) => (
                  <Box key={`${msg.idx}-${msg.ts ?? "na"}`} flexDirection="column" marginTop={1}>
                    <Box gap={2}>
                      <Text color={msg.role === "assistant" ? "magenta" : "cyan"} bold>
                        {msg.role === "assistant" ? "A" : "U"}
                      </Text>
                      <Text color="gray" dimColor>{formatDateLabel(msg.ts)}</Text>
                    </Box>
                    <Text color={msg.role === "assistant" ? "white" : "gray"}>
                      {truncate((msg.text || "-").replace(/\s+/g, " ").trim(), 88)}
                    </Text>
                  </Box>
                ))}
              </Box>

              {/* Action hints */}
              <Box gap={2} marginTop={1}>
                <Text color="green" dimColor>b backup</Text>
                <Text color="yellow" dimColor>a arc-dry</Text>
                <Text color="yellow" dimColor>A arc-exec</Text>
                <Text color="red" dimColor>d del-dry</Text>
                <Text color="red" dimColor>D del-exec</Text>
              </Box>
            </>
          ) : (
            <Text color="gray" dimColor>Select a session.</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
