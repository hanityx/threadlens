import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { backupSession, listProviderSessions, loadSessionTranscript, runProviderAction } from "../api.js";
import { PROVIDERS, type ProviderScope } from "../config.js";
import type { ProviderScanEntry, ProviderSessionRow, TranscriptMessage } from "../types.js";
import { formatBytes, formatDateLabel, getWindowedItems, truncate } from "../lib/format.js";

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
  const [actionStatus, setActionStatus] = useState<string>(
    "/·i: filter · b: backup · a: archive preview · A: archive execute · d: delete preview · D: delete execute · c: clear token · r: refresh",
  );
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

  const fetchRows = (refresh = false) => {
    setLoading(true);
    setError(null);
    void listProviderSessions(provider, refresh)
      .then((data) => {
        const nextRows: ProviderSessionRow[] = data.rows ?? [];
        const nextProviders: ProviderScanEntry[] = data.providers ?? [];
        setRows(nextRows);
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
    fetchRows(false);
  }, [provider]);

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
    if (input === "g") {
      setSelectedIndex(0);
      return;
    }
    if (input === "G") {
      setSelectedIndex(Math.max(filteredRows.length - 1, 0));
      return;
    }
    if (input === "K") {
      setSelectedIndex((prev) => Math.max(0, prev - 10));
      return;
    }
    if (input === "J") {
      setSelectedIndex((prev) => Math.min(Math.max(filteredRows.length - 1, 0), prev + 10));
      return;
    }
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
      setActionStatus("Running backup...");
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
          setActionStatus(
            `Backup complete · applied ${data.applied_count}/${data.valid_count}` +
              (data.backup_to ? ` · ${truncate(data.backup_to, 42)}` : ""),
          );
        })
        .catch((actionError) => {
          setActionStatus(actionError instanceof Error ? actionError.message : String(actionError));
        });
      return;
    }
    if (input === "a" && selected && selected.provider !== "all") {
      setActionStatus("Running archive dry-run...");
      void runProviderAction(selected.provider, "archive_local", [selected.file_path], {
        dryRun: true,
      })
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
          setActionStatus(
            `Archive dry-run · token ${token || "-"} · target ${data.target_count}` +
              (token ? " · Shift+A execute" : ""),
          );
        })
        .catch((actionError) => {
          setActionStatus(actionError instanceof Error ? actionError.message : String(actionError));
        });
      return;
    }
    if (input === "d" && selected && selected.provider !== "all") {
      setActionStatus("Running delete dry-run...");
      void runProviderAction(selected.provider, "delete_local", [selected.file_path], {
        dryRun: true,
        backupBeforeDelete: true,
      })
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
          setActionStatus(
            `Delete dry-run · token ${token || "-"} · target ${data.target_count}` +
              (token ? " · Shift+D execute" : ""),
          );
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
        setActionStatus("Run a dry-run with a on the same file first to create an archive token.");
        return;
      }
      setActionStatus("Running archive...");
      void runProviderAction(selected.provider, "archive_local", [selected.file_path], {
        dryRun: false,
        confirmToken: pendingAction.token,
      })
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
          setActionStatus(
            `Archive complete · applied ${data.applied_count}/${data.valid_count}` +
              (data.archived_to ? ` · ${truncate(data.archived_to, 34)}` : ""),
          );
          fetchRows(true);
        })
        .catch((actionError) => {
          setActionStatus(actionError instanceof Error ? actionError.message : String(actionError));
        });
      return;
    }
    if (input === "D" && selected && selected.provider !== "all") {
      if (!pendingAction || pendingAction.kind !== "delete_local" || pendingAction.filePath !== selected.file_path) {
        setActionStatus("Run a dry-run with d on the same file first to create a delete token.");
        return;
      }
      setActionStatus("Running delete...");
      void runProviderAction(selected.provider, "delete_local", [selected.file_path], {
        dryRun: false,
        confirmToken: pendingAction.token,
        backupBeforeDelete: true,
      })
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
          setActionStatus(
            `Delete complete · applied ${data.applied_count}/${data.valid_count}` +
              (data.backed_up_count ? ` · backup ${data.backed_up_count}` : ""),
          );
          fetchRows(true);
        })
        .catch((actionError) => {
          setActionStatus(actionError instanceof Error ? actionError.message : String(actionError));
        });
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
        <Text color="cyan">Sessions</Text>
        <Text color="gray">[ / ] provider · /·i filter · Esc·Enter back to list · ↑↓ or j/k · b backup · a/A archive · d/D delete · c clear token · r refresh</Text>
        <Text color="yellow">scope: {provider}</Text>
        <Text color={focusMode === "filter" ? "green" : "gray"}>
          filter: {filterQuery.length > 0 ? `${filterQuery}${focusMode === "filter" ? "▌" : ""}` : focusMode === "filter" ? "typing▌" : "none"}
        </Text>
        {summary ? (
          <Text color="gray">
            rows {summary.rows} · parse ok {summary.parse_ok} · fail {summary.parse_fail}
          </Text>
        ) : null}
        {providerScan ? <Text color="gray">{providerScan}</Text> : null}
        {pendingAction ? (
          <Text color="yellow">
            pending {pendingAction.kind === "archive_local" ? "archive" : "delete"} · {pendingAction.token}
          </Text>
        ) : null}
        <Text color="gray">{actionStatus}</Text>
        {loading ? <Text color="yellow">Scanning sessions...</Text> : null}
        {error ? <Text color="red">{error}</Text> : null}
      </Box>
      <Box gap={2}>
        <Box width="58%" borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color="cyan">List</Text>
          {filteredRows.length > 0 ? (
            <Text color="gray">
              showing {visibleRows.start + 1}-{visibleRows.end}/{filteredRows.length}
              {filterQuery.trim() ? ` · filtered from ${rows.length}` : ""}
            </Text>
          ) : null}
          {filteredRows.length === 0 ? <Text color="gray">{rows.length === 0 ? "No sessions" : "No filtered results"}</Text> : null}
          {visibleRows.items.map((row, offset) => {
            const index = visibleRows.start + offset;
            const focused = index === selectedIndex;
            return (
              <Box key={row.file_path} flexDirection="column" marginTop={1}>
                <Text color={focused ? "green" : "white"}>
                  {focused ? "›" : " "} {truncate(row.display_title || row.session_id, 66)}
                </Text>
                <Text color="gray">
                  {row.provider} · {row.source} · {row.probe.format} · {formatBytes(row.size_bytes)}
                </Text>
              </Box>
            );
          })}
        </Box>
        <Box width="42%" borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color="cyan">Session detail</Text>
          {selected ? (
            <>
              <Text>{truncate(selected.display_title || selected.session_id, 54)}</Text>
              <Text color="gray">{truncate(selected.file_path, 56)}</Text>
              <Text color="gray">
                {selected.probe.ok ? "parse ok" : "parse fail"} · {formatDateLabel(selected.mtime)}
              </Text>
              <Text color="yellow">Transcript</Text>
              {transcriptLoading ? <Text color="yellow">Loading...</Text> : null}
              {transcript.length === 0 && !transcriptLoading ? (
                <Text color="gray">No messages to display</Text>
              ) : null}
              {transcript.slice(0, 8).map((message) => (
                <Box key={`${message.idx}-${message.ts ?? "na"}`} flexDirection="column" marginTop={1}>
                  <Text color={message.role === "assistant" ? "magenta" : "cyan"}>
                    {message.role} · {formatDateLabel(message.ts)}
                  </Text>
                  <Text>{truncate(message.text || "-", 92)}</Text>
                </Box>
              ))}
              {lastAction ? (
                <>
                  <Text color="yellow">Action status</Text>
                  <Text color="gray">
                    {lastAction.kind} · {lastAction.mode} · applied {lastAction.appliedCount}/{lastAction.validCount}
                  </Text>
                  <Text color="gray">
                    target {lastAction.targetCount}
                    {lastAction.backupCount ? ` · backup ${lastAction.backupCount}` : ""}
                  </Text>
                  {lastAction.token ? <Text color="gray">token {lastAction.token}</Text> : null}
                  {lastAction.path ? <Text>{truncate(lastAction.path, 92)}</Text> : null}
                </>
              ) : null}
            </>
          ) : (
            <Text color="gray">Select a session.</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
