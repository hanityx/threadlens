import { useEffect, useMemo, useState, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ThreadsResponse, ThreadRow, FilterMode, LayoutView } from "@/shared/types";
import { PAGE_SIZE, INITIAL_CHUNK, CHUNK_SIZE } from "@/shared/types";
import { apiGet } from "@/api";
import { extractEnvelopeData, normalizeThreadRow } from "@/shared/lib/format";
import {
  nowMs,
  readStorageValue,
  writeStorageValue,
  THREADS_BOOTSTRAP_CACHE_KEY,
  LEGACY_THREADS_BOOTSTRAP_CACHE_KEY,
  THREADS_FAST_BOOT_LIMIT,
} from "@/shared/lib/appState";

export function restoreThreadsBootstrapRows(raw: string | null) {
  if (!raw) return [] as ThreadRow[];
  try {
    const parsed = JSON.parse(raw) as { rows?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.rows)) return [];
    return parsed.rows.map((row) => normalizeThreadRow(row)).slice(0, PAGE_SIZE);
  } catch {
    return [];
  }
}

export function resolveThreadsQueryLimit(layoutView: LayoutView, threadsFastBoot: boolean) {
  if (layoutView === "threads") {
    return threadsFastBoot ? THREADS_FAST_BOOT_LIMIT : PAGE_SIZE;
  }
  return 60;
}

export function filterThreadRows(rows: ThreadRow[], query: string, filterMode: FilterMode) {
  const normalizedQuery = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (normalizedQuery && !`${row.title ?? ""} ${row.thread_id}`.toLowerCase().includes(normalizedQuery)) {
      return false;
    }
    if (filterMode === "high-risk") return Number(row.risk_score ?? 0) >= 70;
    if (filterMode === "pinned") return Boolean(row.is_pinned);
    return true;
  });
}

export function pruneSelectedThreads(
  selected: Record<string, boolean>,
  availableThreadIds: Set<string>,
) {
  let changed = false;
  const next: Record<string, boolean> = {};
  for (const [threadId, isSelected] of Object.entries(selected)) {
    if (!isSelected) continue;
    if (availableThreadIds.has(threadId)) {
      next[threadId] = true;
      continue;
    }
    changed = true;
  }
  return changed ? next : selected;
}

export function resolveAllFilteredSelected(
  filteredRows: Array<Pick<ThreadRow, "thread_id">>,
  selectedIds: string[],
) {
  const selectedSet = new Set(selectedIds);
  return (
    filteredRows.length > 0 &&
    filteredRows.every((row) => selectedSet.has(row.thread_id))
  );
}

export function resolveThreadsLoadingState(
  isLoading: boolean,
  rowCount: number,
  threadsFastBoot: boolean,
  isThreadsFocused: boolean,
  isFetching: boolean,
) {
  return {
    threadsLoading: isLoading && rowCount === 0,
    threadsFastBooting:
      threadsFastBoot &&
      isThreadsFocused &&
      (isLoading || isFetching),
  };
}

export function useThreadsData(layoutView: LayoutView) {
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [threadsFastBoot, setThreadsFastBoot] = useState(true);
  const [renderLimit, setRenderLimit] = useState(INITIAL_CHUNK);
  const [threadsFetchMs, setThreadsFetchMs] = useState<number | null>(null);
  const [threadsBootstrapRows, setThreadsBootstrapRows] = useState<ThreadRow[]>(() => {
    if (typeof window === "undefined") return [];
    return restoreThreadsBootstrapRows(
      readStorageValue([
        THREADS_BOOTSTRAP_CACHE_KEY,
        LEGACY_THREADS_BOOTSTRAP_CACHE_KEY,
      ]),
    );
  });

  const deferredQuery = useDeferredValue(query);
  const isThreadsFocused = layoutView === "threads";
  const threadsQueryLimit = resolveThreadsQueryLimit(layoutView, threadsFastBoot);

  const threads = useQuery({
    queryKey: ["threads", deferredQuery, threadsQueryLimit],
    queryFn: async ({ signal }) => {
      const startedAt = nowMs();
      try {
        return await apiGet<ThreadsResponse>(
          `/api/threads?offset=0&limit=${threadsQueryLimit}&q=${encodeURIComponent(deferredQuery)}&sort=updated_desc`,
          { signal },
        );
      } finally {
        if (!signal.aborted) {
          setThreadsFetchMs(Math.max(0, Math.round(nowMs() - startedAt)));
        }
      }
    },
    placeholderData: (previous) => previous,
    staleTime: 10000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  useEffect(() => {
    if (!threadsFastBoot) return;
    if (!isThreadsFocused) return;
    if (!threads.isSuccess) return;
    setThreadsFastBoot(false);
  }, [threadsFastBoot, isThreadsFocused, threads.isSuccess]);

  /* ---- derived rows ---- */
  const rowsFromApi = useMemo(
    () => ((threads.data?.rows ?? []) as Array<Record<string, unknown>>).map((row) => normalizeThreadRow(row)),
    [threads.data?.rows],
  );
  const hasApiRows = Array.isArray(threads.data?.rows);
  const rows = hasApiRows ? rowsFromApi : threadsBootstrapRows;

  useEffect(() => {
    if (!hasApiRows || rowsFromApi.length === 0) return;
    setThreadsBootstrapRows(rowsFromApi);
    if (typeof window === "undefined") return;
    try {
      writeStorageValue(
        THREADS_BOOTSTRAP_CACHE_KEY,
        JSON.stringify({
          saved_at: Date.now(),
          rows: rowsFromApi.slice(0, PAGE_SIZE),
        }),
      );
    } catch {
      // ignore storage write failure
    }
  }, [hasApiRows, rowsFromApi]);

  const filteredRows = useMemo(() => {
    return filterThreadRows(rows, deferredQuery, filterMode);
  }, [rows, deferredQuery, filterMode]);

  /* progressive rendering */
  useEffect(() => {
    setRenderLimit(INITIAL_CHUNK);
    if (filteredRows.length <= INITIAL_CHUNK) return;
    let raf = 0;
    let cancelled = false;
    const step = () => {
      if (cancelled) return;
      setRenderLimit((prev) => {
        const next = Math.min(prev + CHUNK_SIZE, filteredRows.length);
        if (next < filteredRows.length) {
          raf = requestAnimationFrame(step);
        }
        return next;
      });
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [filteredRows.length]);

  const visibleRows = filteredRows.slice(0, renderLimit);
  const availableThreadIds = useMemo(
    () => new Set(rows.map((row) => row.thread_id).filter(Boolean)),
    [rows],
  );
  const selectedIds = Object.entries(selected)
    .filter(([, on]) => on)
    .map(([id]) => id);
  useEffect(() => {
    if (!selectedThreadId) return;
    if (availableThreadIds.has(selectedThreadId)) return;
    setSelectedThreadId("");
  }, [availableThreadIds, selectedThreadId]);
  useEffect(() => {
    setSelected((prev) => {
      return pruneSelectedThreads(prev, availableThreadIds);
    });
  }, [availableThreadIds]);

  const allFilteredSelected = resolveAllFilteredSelected(filteredRows, selectedIds);
  const pinnedCount = useMemo(() => rows.filter((r) => r.is_pinned).length, [rows]);
  const highRiskCount = useMemo(() => rows.filter((r) => Number(r.risk_score || 0) >= 70).length, [rows]);

  const { threadsLoading, threadsFastBooting } = resolveThreadsLoadingState(
    threads.isLoading,
    rows.length,
    threadsFastBoot,
    isThreadsFocused,
    threads.isFetching,
  );

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      const next: Record<string, boolean> = {};
      filteredRows.forEach((row) => {
        next[row.thread_id] = true;
      });
      setSelected(next);
      return;
    }
    setSelected({});
  };

  return {
    query, setQuery,
    filterMode, setFilterMode,
    selected, setSelected,
    selectedThreadId, setSelectedThreadId,
    threads,
    deferredQuery,
    rows, filteredRows, visibleRows,
    selectedIds, allFilteredSelected,
    pinnedCount, highRiskCount,
    threadsLoading, threadsFastBooting,
    threadsFetchMs,
    toggleSelectAllFiltered,
  };
}
