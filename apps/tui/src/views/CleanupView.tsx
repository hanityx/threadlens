import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { analyzeDelete, cleanupApply, cleanupDryRun, listThreads } from "../api.js";
import type { ThreadRow } from "../types.js";
import { getWindowedItems, truncate } from "../lib/format.js";

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
  const [analysisSummary, setAnalysisSummary] = useState<string>(
    "/·i: 필터 · a: 영향 분석 · d: 드라이런 · D: 실행 · c: 토큰지움 · space: 선택",
  );
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
        .some((value) => typeof value === "string" && value.toLowerCase().includes(needle)),
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
      setAnalysisSummary("선택 해제됨");
      return;
    }
    if (input === "c") {
      setPendingCleanup(null);
      setAnalysisSummary("정리 토큰 지움");
      return;
    }
    if (input.toLowerCase() === "r") {
      fetchRows();
      return;
    }
    if (input.toLowerCase() === "a" && selectedIds.length > 0) {
      setAnalysisSummary("영향 분석 중…");
      void analyzeDelete(selectedIds)
        .then((data) => {
          const report = data.reports?.[0];
          setLastAnalysis({
            count: data.count ?? 0,
            summary: String(report?.summary ?? "").trim(),
            impacts: report?.impacts ?? [],
            parents: report?.parents ?? [],
          });
          setAnalysisSummary(
            `영향 ${data.count ?? 0}건` +
              (report?.summary ? ` · ${truncate(report.summary, 48)}` : ""),
          );
        })
        .catch((actionError) => {
          setAnalysisSummary(actionError instanceof Error ? actionError.message : String(actionError));
        });
      return;
    }
    if (input.toLowerCase() === "d" && selectedIds.length > 0) {
      setAnalysisSummary("드라이런 중…");
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
          setAnalysisSummary(
            `드라이런 ready · token ${token || "-"}` +
              (data.target_file_count ? ` · files ${data.target_file_count}` : "") +
              (token ? " · Shift+D 실행" : ""),
          );
        })
        .catch((actionError) => {
          setAnalysisSummary(actionError instanceof Error ? actionError.message : String(actionError));
        });
      return;
    }
    if (input === "D" && normalizedSelectedIds.length > 0) {
      if (
        !pendingCleanup ||
        pendingCleanup.ids.length !== normalizedSelectedIds.length ||
        pendingCleanup.ids.some((id, index) => id !== normalizedSelectedIds[index])
      ) {
        setAnalysisSummary("먼저 현재 선택으로 d 드라이런을 다시 돌려.");
        return;
      }
      setAnalysisSummary("정리 실행 중…");
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
          setAnalysisSummary(
            `정리 완료 · deleted ${data.deleted_file_count ?? 0}/${data.target_file_count ?? 0}` +
              (data.backup?.copied_count ? ` · backup ${data.backup.copied_count}` : ""),
          );
          fetchRows();
        })
        .catch((actionError) => {
          setAnalysisSummary(actionError instanceof Error ? actionError.message : String(actionError));
        });
    }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
        <Text color="cyan">정리</Text>
        <Text color="gray">/·i 필터 · Esc·Enter 목록복귀 · ↑↓ 또는 j/k · space 선택 · a 영향분석 · d 드라이런 · D 실행 · c 토큰지움 · x 선택해제 · r 새로고침</Text>
        <Text color={focusMode === "filter" ? "green" : "gray"}>
          filter: {filterQuery.length > 0 ? `${filterQuery}${focusMode === "filter" ? "▌" : ""}` : focusMode === "filter" ? "입력 중▌" : "없음"}
        </Text>
        <Text color="yellow">selected: {selectedIds.length} / total {totalCount || rows.length}</Text>
        {pendingCleanup ? <Text color="yellow">pending cleanup · {pendingCleanup.token}</Text> : null}
        <Text color="gray">{analysisSummary}</Text>
        {loading ? <Text color="yellow">스레드 로딩 중…</Text> : null}
        {error ? <Text color="red">{error}</Text> : null}
      </Box>
      <Box gap={2}>
        <Box width="58%" borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color="cyan">스레드</Text>
          {filteredRows.length > 0 ? (
            <Text color="gray">
              showing {visibleThreads.start + 1}-{visibleThreads.end}/{filteredRows.length}
              {filterQuery.trim() ? ` · filtered from ${rows.length}` : ""}
            </Text>
          ) : null}
          {filteredRows.length === 0 ? <Text color="gray">{rows.length === 0 ? "스레드 없음" : "필터 결과 없음"}</Text> : null}
          {visibleThreads.items.map((row, offset) => {
            const index = visibleThreads.start + offset;
            const focused = index === selectedIndex;
            const checked = selectedIds.includes(row.thread_id);
            return (
              <Box key={row.thread_id} flexDirection="column" marginTop={1}>
                <Text color={focused ? "green" : "white"}>
                  {focused ? "›" : " "} [{checked ? "x" : " "}] {truncate(row.title || row.thread_id, 62)}
                </Text>
                <Text color="gray">
                  risk {row.risk_score ?? 0} · {row.is_pinned ? "pinned" : "normal"} · {row.source || "-"}
                </Text>
              </Box>
            );
          })}
        </Box>
        <Box width="42%" borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          <Text color="cyan">선택 상세</Text>
          {selected ? (
            <>
              <Text>{truncate(selected.title || selected.thread_id, 54)}</Text>
              <Text color="gray">{selected.thread_id}</Text>
              <Text color="gray">
                risk {selected.risk_score ?? 0} · {selected.risk_level || "-"}
              </Text>
              <Text color="gray">{truncate(selected.cwd || "-", 56)}</Text>
              {lastAnalysis ? (
                <>
                  <Text color="yellow">영향 분석</Text>
                  <Text color="gray">count {lastAnalysis.count}</Text>
                  {lastAnalysis.summary ? <Text>{truncate(lastAnalysis.summary, 96)}</Text> : null}
                  {lastAnalysis.impacts.slice(0, 3).map((impact, index) => (
                    <Text key={`impact-${index}`} color="gray">
                      impact {index + 1}: {truncate(impact, 72)}
                    </Text>
                  ))}
                  {lastAnalysis.parents.slice(0, 2).map((parent, index) => (
                    <Text key={`parent-${index}`} color="gray">
                      parent {index + 1}: {truncate(parent, 72)}
                    </Text>
                  ))}
                </>
              ) : null}
              {lastCleanup ? (
                <>
                  <Text color="yellow">정리 미리보기</Text>
                  <Text color="gray">
                    {lastCleanup.mode} · files {lastCleanup.fileCount}
                    {lastCleanup.deletedCount ? ` · deleted ${lastCleanup.deletedCount}` : ""}
                    {lastCleanup.backupCount ? ` · backup ${lastCleanup.backupCount}` : ""}
                  </Text>
                  {lastCleanup.token ? <Text color="gray">token {lastCleanup.token}</Text> : null}
                  {lastCleanup.help ? <Text>{truncate(lastCleanup.help, 96)}</Text> : null}
                </>
              ) : null}
            </>
          ) : (
            <Text color="gray">스레드를 선택해.</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
}
