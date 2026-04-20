import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiEnvelope, BulkThreadActionResult } from "@threadlens/shared-contracts";
import type {
  AnalyzeDeleteData,
  CleanupPendingState,
  CleanupPreviewData,
  LayoutView,
  ProviderActionSelection,
  ProviderSessionActionResult,
  RecoveryBackupExportResponse,
  RecoveryResponse,
  RuntimeEnvelope,
  SmokeStatusEnvelope,
} from "@/shared/types";
import { apiGet, apiPost, apiPostJsonAllowError, buildApiUrl } from "@/api";
import { extractEnvelopeData } from "@/shared/lib/format";
import {
  RUNTIME_BACKEND_DOWN_CACHED,
  buildThreadCleanupSelectionKey,
  formatMutationErrorMessage,
  isTransientBackendError,
  normalizeThreadIds,
  postWithTransientRetry,
  providerActionSelectionKey,
  THREAD_CLEANUP_DEFAULT_OPTIONS,
} from "@/shared/lib/appState";

type ProviderSessionActionInput = {
  provider: string;
  action: "backup_local" | "archive_local" | "delete_local";
  file_paths: string[];
  dry_run: boolean;
  confirm_token?: string;
  backup_before_delete?: boolean;
};

type ProviderHardDeleteInput = {
  provider: string;
  file_paths: string[];
};

export async function performProviderHardDeleteFlow(
  runAction: (input: ProviderSessionActionInput) => Promise<ProviderSessionActionResult>,
  input: ProviderHardDeleteInput,
): Promise<ProviderSessionActionResult> {
  const preview = await runAction({
    provider: input.provider,
    action: "delete_local",
    file_paths: input.file_paths,
    dry_run: true,
    confirm_token: "",
    backup_before_delete: false,
  });
  const confirmToken = String(preview.confirm_token_expected ?? "").trim();
  if (!confirmToken) {
    throw new Error("provider-hard-delete-preview-required");
  }
  return runAction({
    provider: input.provider,
    action: "delete_local",
    file_paths: input.file_paths,
    dry_run: false,
    confirm_token: confirmToken,
    backup_before_delete: false,
  });
}

export async function startRecoveryBackupDownload(archivePath: string) {
  if (typeof document === "undefined") return;
  const normalized = String(archivePath || "").trim();
  if (!normalized) return;
  const anchor = document.createElement("a");
  anchor.href = await buildApiUrl(
    `/api/recovery-backup-export/download?archive_path=${encodeURIComponent(normalized)}`,
  );
  anchor.download = normalized.split("/").pop() || "threadlens-backup.zip";
  anchor.click();
}

export function resolveSmokeStatusQueryState(layoutView: LayoutView) {
  return {
    enabled: layoutView === "overview",
    refetchInterval: layoutView === "overview" ? 20000 : false,
  } as const;
}

export function resolveRecoveryQueryState(layoutView: LayoutView) {
  const wantsRecoveryData = layoutView === "overview";
  return {
    enabled: wantsRecoveryData,
    refetchInterval: wantsRecoveryData ? 15000 : false,
  } as const;
}

export function assertRuntimeBackendReachable(cachedReachable: boolean | undefined) {
  if (cachedReachable === false) {
    throw new Error(`${RUNTIME_BACKEND_DOWN_CACHED}: runtime-down`);
  }
}

export function shouldReturnProviderActionPreview(
  input: ProviderSessionActionInput,
  firstData: ProviderSessionActionResult | null | undefined,
): boolean {
  const expectedToken = String(firstData?.confirm_token_expected ?? "").trim();
  return (
    input.action !== "backup_local" &&
    !input.dry_run &&
    !String(input.confirm_token ?? "").trim() &&
    Boolean(expectedToken)
  );
}

export function updateProviderActionTokenState(
  previous: Record<string, string>,
  key: string,
  expectedToken: string,
  actionOk: boolean,
  dryRun: boolean,
) {
  if (expectedToken) {
    return { ...previous, [key]: expectedToken };
  }
  if (actionOk && !dryRun) {
    const next = { ...previous };
    delete next[key];
    return next;
  }
  return previous;
}

export function formatMutationHookError(error: unknown): string {
  if (error instanceof Error) return formatMutationErrorMessage(error.message);
  if (error) return formatMutationErrorMessage(String(error));
  return "";
}

export function resolveBulkActionErrorState(options: {
  bulkArchiveError: unknown;
  bulkPinError: unknown;
  bulkUnpinError: unknown;
  bulkArchiveIsError: boolean;
  bulkPinIsError: boolean;
  bulkUnpinIsError: boolean;
}) {
  const errorMessage = options.bulkArchiveIsError
    ? formatMutationHookError(options.bulkArchiveError)
    : options.bulkPinIsError
      ? formatMutationHookError(options.bulkPinError)
      : options.bulkUnpinIsError
        ? formatMutationHookError(options.bulkUnpinError)
        : "";
  return {
    bulkActionError: options.bulkArchiveIsError || options.bulkPinIsError || options.bulkUnpinIsError,
    bulkActionErrorMessage: errorMessage,
  };
}

export function resolveMutationBusyState(options: {
  bulkPinPending: boolean;
  bulkUnpinPending: boolean;
  bulkArchivePending: boolean;
  analyzeDeletePending: boolean;
  cleanupDryRunPending: boolean;
  cleanupExecutePending: boolean;
  providerSessionActionPending: boolean;
  recoveryBackupExportPending: boolean;
}) {
  return (
    options.bulkPinPending ||
    options.bulkUnpinPending ||
    options.bulkArchivePending ||
    options.analyzeDeletePending ||
    options.cleanupDryRunPending ||
    options.cleanupExecutePending ||
    options.providerSessionActionPending ||
    options.recoveryBackupExportPending
  );
}

export function resolveQueryLoadingState(isLoading: boolean, hasData: boolean) {
  return isLoading && !hasData;
}

export function useMutations(options: {
  layoutView: LayoutView;
  providerActionProvider: string;
  selectedProviderFilePaths: string[];
  providerDeleteBackupEnabled?: boolean;
}) {
  const { layoutView, providerActionProvider, selectedProviderFilePaths } = options;
  const queryClient = useQueryClient();

  /* ---- action result state ---- */
  const [analysisRaw, setAnalysisRaw] = useState<unknown>(null);
  const [cleanupRaw, setCleanupRaw] = useState<unknown>(null);
  const [pendingCleanup, setPendingCleanup] = useState<CleanupPendingState | null>(null);
  const [providerActionRaw, setProviderActionRaw] = useState<unknown>(null);
  const [providerActionSelection, setProviderActionSelection] = useState<ProviderActionSelection | null>(null);
  const [providerActionTokens, setProviderActionTokens] = useState<Record<string, string>>({});
  const [providerDeleteBackupEnabled, setProviderDeleteBackupEnabled] = useState(true);
  const [recoveryBackupExportRaw, setRecoveryBackupExportRaw] = useState<unknown>(null);

  /* ---- queries for runtime / smoke / recovery ---- */
  const runtime = useQuery({
    queryKey: ["runtime"],
    queryFn: ({ signal }) => apiGet<RuntimeEnvelope>("/api/agent-runtime", { signal }),
    refetchInterval: 10000, staleTime: 5000, refetchOnWindowFocus: false, retry: 1,
  });

  const smokeStatusQueryState = resolveSmokeStatusQueryState(layoutView);
  const smokeStatus = useQuery({
    queryKey: ["smoke-status"],
    queryFn: ({ signal }) => apiGet<SmokeStatusEnvelope>("/api/smoke-status?limit=6", { signal }),
    enabled: smokeStatusQueryState.enabled,
    refetchInterval: smokeStatusQueryState.refetchInterval,
    staleTime: 10000, refetchOnWindowFocus: false, retry: 1,
  });

  const recoveryQueryState = resolveRecoveryQueryState(layoutView);
  const recovery = useQuery({
    queryKey: ["recovery"],
    queryFn: ({ signal }) => apiGet<RecoveryResponse>("/api/recovery-center", { signal }),
    enabled: recoveryQueryState.enabled,
    refetchInterval: recoveryQueryState.refetchInterval,
    staleTime: 10000, refetchOnWindowFocus: false, retry: 1,
  });

  /* ---- mutations ---- */
  const syncRuntimeAfterBackendFailure = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!isTransientBackendError(message)) return;
    queryClient.invalidateQueries({ queryKey: ["runtime"] });
  }, [queryClient]);
  const invalidateProviderSurfaceQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    queryClient.invalidateQueries({ queryKey: ["provider-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["provider-sessions-summary"] });
    queryClient.invalidateQueries({ queryKey: ["provider-parser-health"] });
    queryClient.invalidateQueries({ queryKey: ["provider-parser-health-summary"] });
    queryClient.invalidateQueries({ queryKey: ["provider-matrix"] });
  };

  const bulkPin = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", { action: "pin", thread_ids: threadIds });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["threads"] }); },
    onError: syncRuntimeAfterBackendFailure,
  });

  const bulkUnpin = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", { action: "unpin", thread_ids: threadIds });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["threads"] }); },
    onError: syncRuntimeAfterBackendFailure,
  });

  const bulkArchive = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", { action: "archive_local", thread_ids: threadIds });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["threads"] }); queryClient.invalidateQueries({ queryKey: ["recovery"] }); },
    onError: syncRuntimeAfterBackendFailure,
  });

  const analyzeDelete = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      const ids = normalizeThreadIds(threadIds);
      if (ids.length === 0) throw new Error("no-valid-thread-ids");
      return postWithTransientRetry<unknown>("/api/analyze-delete", { ids });
    },
    onSuccess: (data) => setAnalysisRaw(data),
    onError: syncRuntimeAfterBackendFailure,
  });

  const cleanupDryRun = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      const ids = normalizeThreadIds(threadIds);
      if (ids.length === 0) throw new Error("no-valid-thread-ids");
      return postWithTransientRetry<unknown>("/api/local-cleanup", {
        ids, dry_run: true,
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
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      assertRuntimeBackendReachable(cachedReachable);
      const ids = normalizeThreadIds(threadIds);
      if (ids.length === 0) throw new Error("no-valid-thread-ids");
      if (!pendingCleanup?.confirmToken) throw new Error("cleanup-preview-required");
      const selectionKey = buildThreadCleanupSelectionKey(ids, pendingCleanup.options);
      if (selectionKey !== pendingCleanup.selectionKey) throw new Error("cleanup-selection-changed");

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
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      invalidateProviderSurfaceQueries();
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
    onError: syncRuntimeAfterBackendFailure,
  });

  const providerSessionAction = useMutation({
    mutationFn: async (input: {
      provider: string;
      action: "backup_local" | "archive_local" | "delete_local";
      file_paths: string[];
      dry_run: boolean;
      confirm_token?: string;
      backup_before_delete?: boolean;
    }) => {
      const requestBody = { ...input, confirm_token: input.confirm_token ?? "" };
      const first = await apiPostJsonAllowError<ProviderSessionActionResult>("/api/provider-session-action", requestBody);
      if (first.ok) return first.data;
      const firstData = first.data;
      const previewReady = shouldReturnProviderActionPreview(input, firstData);
      if (previewReady) return firstData;
      throw new Error(String(firstData?.error || `provider-session-action status ${first.status}`));
    },
    onSuccess: (data, variables) => {
      setProviderActionRaw(data);
      setProviderActionSelection({
        provider: variables.provider,
        action: variables.action,
        file_paths: variables.file_paths,
        dry_run: variables.dry_run,
        backup_before_delete: variables.backup_before_delete,
      });
      const actionData = extractEnvelopeData<ProviderSessionActionResult>(data);
      const expectedToken = String(actionData?.confirm_token_expected ?? "").trim();
      const key = providerActionSelectionKey(variables.provider, variables.action, variables.file_paths, { backup_before_delete: variables.backup_before_delete });
      setProviderActionTokens((prev) =>
        updateProviderActionTokenState(
          prev,
          key,
          expectedToken,
          Boolean(actionData?.ok),
          variables.dry_run,
        ),
      );
      if (actionData?.ok) {
        invalidateProviderSurfaceQueries();
        queryClient.invalidateQueries({ queryKey: ["recovery"] });
      }
    },
  });

  const recoveryBackupExport = useMutation({
    mutationFn: (backupIds: string[]) => apiPost<RecoveryBackupExportResponse>("/api/recovery-backup-export", { backup_ids: backupIds }),
    onSuccess: (data) => {
      setRecoveryBackupExportRaw(data);
      const exportData = extractEnvelopeData<RecoveryBackupExportResponse>(data);
      if (exportData?.ok && exportData.archive_path) {
        void startRecoveryBackupDownload(exportData.archive_path);
      }
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
  });

  /* ---- auto-reset on backend reconnect ---- */
  const runtimeBackendReachable = runtime.data?.data?.runtime_backend?.reachable;
  useEffect(() => {
    if (runtimeBackendReachable !== true) return;
    if (!bulkPin.isError && !bulkUnpin.isError && !bulkArchive.isError && !analyzeDelete.isError && !cleanupDryRun.isError && !cleanupExecute.isError) return;
    bulkPin.reset(); bulkUnpin.reset(); bulkArchive.reset(); analyzeDelete.reset(); cleanupDryRun.reset(); cleanupExecute.reset();
  }, [runtimeBackendReachable, bulkPin, bulkUnpin, bulkArchive, analyzeDelete, cleanupDryRun, cleanupExecute]);

  /* ---- derived ---- */
  const analysisData = extractEnvelopeData<AnalyzeDeleteData>(analysisRaw);
  const cleanupData = extractEnvelopeData<CleanupPreviewData>(cleanupRaw);
  const smokeStatusRoot = extractEnvelopeData<NonNullable<SmokeStatusEnvelope["data"]>>(smokeStatus.data) ?? {};
  const smokeStatusLatest = smokeStatusRoot.latest;
  const providerActionData = extractEnvelopeData<ProviderSessionActionResult>(providerActionRaw);
  const recoveryBackupExportData = extractEnvelopeData<RecoveryBackupExportResponse>(recoveryBackupExportRaw);

  const analyzeDeleteErrorMessage = formatMutationHookError(analyzeDelete.error);
  const cleanupDryRunErrorMessage = formatMutationHookError(cleanupDryRun.error);
  const cleanupExecuteErrorMessage = formatMutationHookError(cleanupExecute.error);
  const { bulkActionError, bulkActionErrorMessage } = resolveBulkActionErrorState({
    bulkArchiveError: bulkArchive.error,
    bulkPinError: bulkPin.error,
    bulkUnpinError: bulkUnpin.error,
    bulkArchiveIsError: bulkArchive.isError,
    bulkPinIsError: bulkPin.isError,
    bulkUnpinIsError: bulkUnpin.isError,
  });
  const providerSessionActionErrorMessage = formatMutationHookError(providerSessionAction.error);
  const recoveryBackupExportErrorMessage = formatMutationHookError(recoveryBackupExport.error);

  const busy = resolveMutationBusyState({
    bulkPinPending: bulkPin.isPending,
    bulkUnpinPending: bulkUnpin.isPending,
    bulkArchivePending: bulkArchive.isPending,
    analyzeDeletePending: analyzeDelete.isPending,
    cleanupDryRunPending: cleanupDryRun.isPending,
    cleanupExecutePending: cleanupExecute.isPending,
    providerSessionActionPending: providerSessionAction.isPending,
    recoveryBackupExportPending: recoveryBackupExport.isPending,
  });
  const runtimeLoading = resolveQueryLoadingState(runtime.isLoading, Boolean(runtime.data));
  const smokeStatusLoading = resolveQueryLoadingState(smokeStatus.isLoading, Boolean(smokeStatus.data));
  const recoveryLoading = resolveQueryLoadingState(recovery.isLoading, Boolean(recovery.data));

  /* ---- action dispatchers ---- */
  const runProviderAction = (action: "backup_local" | "archive_local" | "delete_local", dryRun: boolean, actionOptions?: { backup_before_delete?: boolean }) => {
    if (!providerActionProvider || selectedProviderFilePaths.length === 0) return;
    if (providerSessionAction.isError) providerSessionAction.reset();
    const key = providerActionSelectionKey(providerActionProvider, action, selectedProviderFilePaths, actionOptions);
    const scopedToken = providerActionTokens[key] ?? "";
    providerSessionAction.mutate({ provider: providerActionProvider, action, file_paths: selectedProviderFilePaths, dry_run: dryRun, confirm_token: dryRun ? "" : scopedToken, backup_before_delete: actionOptions?.backup_before_delete });
  };

  const runSingleProviderAction = (provider: string, filePath: string, action: "backup_local" | "archive_local" | "delete_local", dryRun: boolean, actionOptions?: { backup_before_delete?: boolean }) => {
    if (providerSessionAction.isError) providerSessionAction.reset();
    const key = providerActionSelectionKey(provider, action, [filePath], actionOptions);
    const scopedToken = providerActionTokens[key] ?? "";
    providerSessionAction.mutate({ provider, action, file_paths: [filePath], dry_run: dryRun, confirm_token: dryRun ? "" : scopedToken, backup_before_delete: actionOptions?.backup_before_delete });
  };

  const runSingleProviderHardDelete = async (provider: string, filePath: string) => {
    if (providerSessionAction.isError) providerSessionAction.reset();
    return performProviderHardDeleteFlow(
      (input) => providerSessionAction.mutateAsync(input),
      {
        provider,
        file_paths: [filePath],
      },
    );
  };

  const runProviderHardDelete = async () => {
    if (!providerActionProvider || selectedProviderFilePaths.length === 0) return null;
    if (providerSessionAction.isError) providerSessionAction.reset();
    return performProviderHardDeleteFlow(
      (input) => providerSessionAction.mutateAsync(input),
      {
        provider: providerActionProvider,
        file_paths: selectedProviderFilePaths,
      },
    );
  };

  const runRecoveryBackupExport = (backupIds: string[]) => {
    if (recoveryBackupExport.isError) recoveryBackupExport.reset();
    recoveryBackupExport.mutate(backupIds);
  };

  return {
    runtime, smokeStatus, recovery,
    bulkPin: (ids: string[]) => bulkPin.mutate(ids),
    bulkUnpin: (ids: string[]) => bulkUnpin.mutate(ids),
    bulkArchive: (ids: string[]) => bulkArchive.mutate(ids),
    analyzeDelete: (ids: string[]) => analyzeDelete.mutate(ids),
    cleanupDryRun: (ids: string[]) => cleanupDryRun.mutate(ids),
    cleanupExecute: (ids: string[]) => cleanupExecute.mutate(ids),
    analyzeDeleteError: analyzeDelete.isError,
    cleanupDryRunError: cleanupDryRun.isError,
    cleanupExecuteError: cleanupExecute.isError,
    analyzeDeleteErrorMessage, cleanupDryRunErrorMessage, cleanupExecuteErrorMessage,
    bulkActionError, bulkActionErrorMessage,
    providerSessionActionError: providerSessionAction.isError,
    providerSessionActionErrorMessage,
    analysisRaw, cleanupRaw,
    analysisData, cleanupData, pendingCleanup,
    smokeStatusLatest,
    providerActionData,
    providerActionSelection,
    providerDeleteBackupEnabled, setProviderDeleteBackupEnabled,
    recoveryBackupExportData,
    recoveryBackupExportError: recoveryBackupExport.isError,
    recoveryBackupExportErrorMessage,
    busy,
    runtimeLoading, smokeStatusLoading, recoveryLoading,
    runProviderAction, runProviderHardDelete, runSingleProviderAction, runSingleProviderHardDelete, runRecoveryBackupExport,
  };
}
