import { useCallback, useEffect, useState } from "react";
import { useMutation, type QueryClient } from "@tanstack/react-query";
import type { ApiEnvelope, BulkThreadActionResult } from "@threadlens/shared-contracts";
import type {
  AnalyzeDeleteData,
  CleanupPendingState,
  CleanupPreviewData,
  RuntimeEnvelope,
} from "@/shared/types";
import { apiPost, apiPostJsonAllowError } from "@/api";
import { extractEnvelopeData } from "@/shared/lib/format";
import {
  buildThreadCleanupSelectionKey,
  isTransientBackendError,
  normalizeThreadIds,
  postWithTransientRetry,
  THREAD_CLEANUP_DEFAULT_OPTIONS,
} from "@/shared/lib/appState";
import { assertRuntimeBackendReachable } from "@/app/hooks/useMutationCore";

type UseThreadMutationActionsOptions = {
  queryClient: QueryClient;
  runtimeData: RuntimeEnvelope | undefined;
  invalidateProviderSurfaceQueries: () => void;
};

type ThreadsCacheData = {
  rows?: Array<Record<string, unknown>>;
  total?: number;
};

function normalizeCacheString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCachePaths(value: unknown) {
  return Array.isArray(value)
    ? value.map((path) => normalizeCacheString(path)).filter(Boolean)
    : [];
}

export function removeBackupCleanupTargetsFromThreadsCache(queryClient: QueryClient, payload: unknown) {
  const cleanupData = extractEnvelopeData<CleanupPreviewData>(payload);
  const targets = Array.isArray(cleanupData?.targets) ? cleanupData.targets : [];
  const targetPaths = new Set(targets.map((target) => normalizeCacheString(target.path)).filter(Boolean));
  const targetIds = new Set(targets.map((target) => normalizeCacheString(target.thread_id)).filter(Boolean));
  if (targetPaths.size === 0 && targetIds.size === 0) return;
  const removeAppliedCleanupTargets =
    normalizeCacheString(cleanupData?.mode) === "applied" &&
    Number(cleanupData?.deleted_file_count ?? 0) > 0;

  queryClient.setQueriesData<ThreadsCacheData>({ queryKey: ["threads"] }, (current) => {
    if (!current || !Array.isArray(current.rows)) return current;
    const nextRows = current.rows.filter((row) => {
      const source = normalizeCacheString(row.source);
      if (source !== "cleanup_backups" && !removeAppliedCleanupTargets) return true;
      const rowPaths = normalizeCachePaths(row.local_cache_paths);
      if (rowPaths.some((path) => targetPaths.has(path))) return false;
      const rowId = normalizeCacheString(row.thread_id || row.id);
      return !(rowPaths.length === 0 && rowId && targetIds.has(rowId));
    });
    if (nextRows.length === current.rows.length) return current;
    const removed = current.rows.length - nextRows.length;
    const total = typeof current.total === "number" ? Math.max(0, current.total - removed) : current.total;
    return { ...current, rows: nextRows, total };
  });
}

export function useThreadMutationActions(options: UseThreadMutationActionsOptions) {
  const { queryClient, runtimeData, invalidateProviderSurfaceQueries } = options;
  const [analysisRaw, setAnalysisRaw] = useState<unknown>(null);
  const [cleanupRaw, setCleanupRaw] = useState<unknown>(null);
  const [pendingCleanup, setPendingCleanup] = useState<CleanupPendingState | null>(null);

  const syncRuntimeAfterBackendFailure = useCallback(
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!isTransientBackendError(message)) return;
      queryClient.invalidateQueries({ queryKey: ["runtime"] });
    },
    [queryClient],
  );

  const bulkPin = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtimeData?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", {
        action: "pin",
        thread_ids: threadIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: syncRuntimeAfterBackendFailure,
  });

  const bulkUnpin = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtimeData?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", {
        action: "unpin",
        thread_ids: threadIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: syncRuntimeAfterBackendFailure,
  });

  const bulkArchive = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtimeData?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", {
        action: "archive_local",
        thread_ids: threadIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
    onError: syncRuntimeAfterBackendFailure,
  });

  const bulkUnarchive = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtimeData?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", {
        action: "unarchive_local",
        thread_ids: threadIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
    onError: syncRuntimeAfterBackendFailure,
  });

  const analyzeDelete = useMutation({
    mutationFn: ({
      ids: threadIds,
      sessionScanLimit,
    }: {
      ids: string[];
      sessionScanLimit?: number;
    }) => {
      const cachedReachable = runtimeData?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      const ids = normalizeThreadIds(threadIds);
      if (ids.length === 0) throw new Error("no-valid-thread-ids");
      return postWithTransientRetry<unknown>("/api/analyze-delete", {
        ids,
        ...(sessionScanLimit ? { session_scan_limit: sessionScanLimit } : {}),
      });
    },
    onSuccess: (data) => setAnalysisRaw(data),
    onError: syncRuntimeAfterBackendFailure,
  });

  const cleanupDryRun = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtimeData?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      const ids = normalizeThreadIds(threadIds);
      if (ids.length === 0) throw new Error("no-valid-thread-ids");
      return postWithTransientRetry<unknown>("/api/local-cleanup", {
        ids,
        dry_run: true,
        options: THREAD_CLEANUP_DEFAULT_OPTIONS,
        confirm_token: "",
      });
    },
    onSuccess: (data, threadIds) => {
      setCleanupRaw(data);
      const ids = normalizeThreadIds(threadIds);
      const cleanupData = extractEnvelopeData<CleanupPreviewData>(data);
      const confirmToken = String(cleanupData?.confirm_token_expected ?? "").trim();
      if (!confirmToken) {
        setPendingCleanup(null);
        return;
      }
      setPendingCleanup({
        ids,
        confirmToken,
        selectionKey: buildThreadCleanupSelectionKey(ids, THREAD_CLEANUP_DEFAULT_OPTIONS),
        options: THREAD_CLEANUP_DEFAULT_OPTIONS,
      });
    },
    onError: syncRuntimeAfterBackendFailure,
  });

  const cleanupExecute = useMutation({
    mutationFn: async (threadIds: string[]) => {
      const cachedReachable = runtimeData?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      const ids = normalizeThreadIds(threadIds);
      if (ids.length === 0) throw new Error("no-valid-thread-ids");
      if (!pendingCleanup?.confirmToken) throw new Error("cleanup-preview-required");
      const selectionKey = buildThreadCleanupSelectionKey(ids, pendingCleanup.options);
      if (selectionKey !== pendingCleanup.selectionKey) {
        throw new Error("cleanup-selection-changed");
      }

      const response = await apiPostJsonAllowError<CleanupPreviewData>("/api/local-cleanup", {
        ids,
        dry_run: false,
        options: pendingCleanup.options,
        confirm_token: pendingCleanup.confirmToken,
      });
      const cleanupData = extractEnvelopeData<CleanupPreviewData>(response.data);
      if (!response.ok) {
        setCleanupRaw(response.data);
        const nextToken = String(cleanupData?.confirm_token_expected ?? "").trim();
        if (nextToken) {
          setPendingCleanup({
            ids,
            confirmToken: nextToken,
            selectionKey,
            options: pendingCleanup.options,
          });
        }
        throw new Error(String(cleanupData?.error ?? `local-cleanup status ${response.status}`));
      }
      return response.data;
    },
    onSuccess: (data) => {
      setCleanupRaw(data);
      setPendingCleanup(null);
      removeBackupCleanupTargetsFromThreadsCache(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      invalidateProviderSurfaceQueries();
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
    onError: syncRuntimeAfterBackendFailure,
  });

  const cleanupBackupsExecute = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtimeData?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      const ids = normalizeThreadIds(threadIds);
      if (ids.length === 0) throw new Error("no-valid-thread-ids");
      return postWithTransientRetry<unknown>("/api/local-cleanup-backups", { ids });
    },
    onSuccess: (data) => {
      setCleanupRaw(data);
      setPendingCleanup(null);
      removeBackupCleanupTargetsFromThreadsCache(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      invalidateProviderSurfaceQueries();
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
    onError: syncRuntimeAfterBackendFailure,
  });

  const runtimeBackendReachable = runtimeData?.data?.runtime_backend?.reachable;
  useEffect(() => {
    if (runtimeBackendReachable !== true) return;
    if (
      !bulkPin.isError &&
      !bulkUnpin.isError &&
      !bulkArchive.isError &&
      !bulkUnarchive.isError &&
      !analyzeDelete.isError &&
      !cleanupDryRun.isError &&
      !cleanupExecute.isError &&
      !cleanupBackupsExecute.isError
    ) {
      return;
    }
    bulkPin.reset();
    bulkUnpin.reset();
    bulkArchive.reset();
    bulkUnarchive.reset();
    analyzeDelete.reset();
    cleanupDryRun.reset();
    cleanupExecute.reset();
    cleanupBackupsExecute.reset();
  }, [
    runtimeBackendReachable,
    bulkPin,
    bulkUnpin,
    bulkArchive,
    bulkUnarchive,
    analyzeDelete,
    cleanupDryRun,
    cleanupExecute,
    cleanupBackupsExecute,
  ]);

  return {
    analysisRaw,
    cleanupRaw,
    pendingCleanup,
    bulkPin,
    bulkUnpin,
    bulkArchive,
    bulkUnarchive,
    analyzeDelete,
    cleanupDryRun,
    cleanupExecute,
    cleanupBackupsExecute,
  };
}
