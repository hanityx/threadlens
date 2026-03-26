import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiEnvelope, BulkThreadActionResult } from "@threadlens/shared-contracts";
import type {
  AnalyzeDeleteData,
  CleanupPreviewData,
  LayoutView,
  ProviderSessionActionResult,
  ProviderView,
  RecoveryBackupExportResponse,
  RecoveryResponse,
  RuntimeEnvelope,
  SmokeStatusEnvelope,
} from "../types";
import { apiGet, apiPost, apiPostJsonAllowError } from "../api";
import { extractEnvelopeData } from "../lib/helpers";
import {
  RUNTIME_BACKEND_DOWN_CACHED,
  formatMutationErrorMessage,
  isTransientBackendError,
  normalizeThreadIds,
  postWithTransientRetry,
  providerActionSelectionKey,
} from "./appDataUtils";

export function useMutations(options: {
  layoutView: LayoutView;
  providerView: ProviderView;
  selectedProviderFilePaths: string[];
  providerDeleteBackupEnabled?: boolean;
}) {
  const { layoutView, providerView, selectedProviderFilePaths } = options;
  const queryClient = useQueryClient();

  /* ---- action result state ---- */
  const [analysisRaw, setAnalysisRaw] = useState<unknown>(null);
  const [cleanupRaw, setCleanupRaw] = useState<unknown>(null);
  const [providerActionRaw, setProviderActionRaw] = useState<unknown>(null);
  const [providerActionTokens, setProviderActionTokens] = useState<Record<string, string>>({});
  const [providerDeleteBackupEnabled, setProviderDeleteBackupEnabled] = useState(true);
  const [recoveryBackupExportRaw, setRecoveryBackupExportRaw] = useState<unknown>(null);

  /* ---- queries for runtime / smoke / recovery ---- */
  const runtime = useQuery({
    queryKey: ["runtime"],
    queryFn: ({ signal }) => apiGet<RuntimeEnvelope>("/api/agent-runtime", { signal }),
    refetchInterval: 10000, staleTime: 5000, refetchOnWindowFocus: false, retry: 1,
  });

  const smokeStatusQueryEnabled = layoutView === "overview";
  const smokeStatusRefetchInterval = layoutView === "overview" ? 20000 : false;
  const smokeStatus = useQuery({
    queryKey: ["smoke-status"],
    queryFn: ({ signal }) => apiGet<SmokeStatusEnvelope>("/api/smoke-status?limit=6", { signal }),
    enabled: smokeStatusQueryEnabled,
    refetchInterval: smokeStatusRefetchInterval,
    staleTime: 10000, refetchOnWindowFocus: false, retry: 1,
  });

  const wantsRecoveryData = layoutView === "overview";
  const recoveryQueryEnabled = wantsRecoveryData;
  const recoveryRefetchInterval = wantsRecoveryData ? 15000 : false;
  const recovery = useQuery({
    queryKey: ["recovery"],
    queryFn: ({ signal }) => apiGet<RecoveryResponse>("/api/recovery-center", { signal }),
    enabled: recoveryQueryEnabled,
    refetchInterval: recoveryRefetchInterval,
    staleTime: 10000, refetchOnWindowFocus: false, retry: 1,
  });

  /* ---- mutations ---- */
  const syncRuntimeAfterBackendFailure = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!isTransientBackendError(message)) return;
    queryClient.invalidateQueries({ queryKey: ["runtime"] });
  }, [queryClient]);

  const bulkPin = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      if (cachedReachable === false) throw new Error(`${RUNTIME_BACKEND_DOWN_CACHED}: runtime-down`);
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", { action: "pin", thread_ids: threadIds });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["threads"] }); },
    onError: syncRuntimeAfterBackendFailure,
  });

  const bulkUnpin = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      if (cachedReachable === false) throw new Error(`${RUNTIME_BACKEND_DOWN_CACHED}: runtime-down`);
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", { action: "unpin", thread_ids: threadIds });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["threads"] }); },
    onError: syncRuntimeAfterBackendFailure,
  });

  const bulkArchive = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      if (cachedReachable === false) throw new Error(`${RUNTIME_BACKEND_DOWN_CACHED}: runtime-down`);
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", { action: "archive_local", thread_ids: threadIds });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["threads"] }); queryClient.invalidateQueries({ queryKey: ["recovery"] }); },
    onError: syncRuntimeAfterBackendFailure,
  });

  const analyzeDelete = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      if (cachedReachable === false) throw new Error(`${RUNTIME_BACKEND_DOWN_CACHED}: runtime-down`);
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
      if (cachedReachable === false) throw new Error(`${RUNTIME_BACKEND_DOWN_CACHED}: runtime-down`);
      const ids = normalizeThreadIds(threadIds);
      if (ids.length === 0) throw new Error("no-valid-thread-ids");
      return postWithTransientRetry<unknown>("/api/local-cleanup", {
        ids, dry_run: true,
        options: { delete_cache: true, delete_session_logs: true, clean_state_refs: true },
        confirm_token: "",
      });
    },
    onSuccess: (data) => setCleanupRaw(data),
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
      const expectedToken = String(firstData?.confirm_token_expected ?? "").trim();
      const shouldReplayConfirmedAction = input.action !== "backup_local" && !input.dry_run && !String(input.confirm_token ?? "").trim() && Boolean(expectedToken);
      if (!shouldReplayConfirmedAction) throw new Error(String(firstData?.error || `provider-session-action status ${first.status}`));
      const second = await apiPostJsonAllowError<ProviderSessionActionResult>("/api/provider-session-action", { ...requestBody, confirm_token: expectedToken });
      if (!second.ok) throw new Error(String(second.data?.error || `provider-session-action status ${second.status}`));
      return second.data;
    },
    onSuccess: (data, variables) => {
      setProviderActionRaw(data);
      const actionData = extractEnvelopeData<ProviderSessionActionResult>(data);
      const expectedToken = String(actionData?.confirm_token_expected ?? "").trim();
      const key = providerActionSelectionKey(variables.provider, variables.action, variables.file_paths, { backup_before_delete: variables.backup_before_delete });
      if (expectedToken) {
        setProviderActionTokens((prev) => ({ ...prev, [key]: expectedToken }));
      } else if (actionData?.ok && !variables.dry_run) {
        setProviderActionTokens((prev) => { const next = { ...prev }; delete next[key]; return next; });
      }
      queryClient.invalidateQueries({ queryKey: ["provider-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["provider-parser-health"] });
      queryClient.invalidateQueries({ queryKey: ["provider-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
  });

  const recoveryBackupExport = useMutation({
    mutationFn: (backupIds: string[]) => apiPost<RecoveryBackupExportResponse>("/api/recovery-backup-export", { backup_ids: backupIds }),
    onSuccess: (data) => { setRecoveryBackupExportRaw(data); queryClient.invalidateQueries({ queryKey: ["recovery"] }); },
  });

  /* ---- auto-reset on backend reconnect ---- */
  const runtimeBackendReachable = runtime.data?.data?.runtime_backend?.reachable;
  useEffect(() => {
    if (runtimeBackendReachable !== true) return;
    if (!bulkPin.isError && !bulkUnpin.isError && !bulkArchive.isError && !analyzeDelete.isError && !cleanupDryRun.isError) return;
    bulkPin.reset(); bulkUnpin.reset(); bulkArchive.reset(); analyzeDelete.reset(); cleanupDryRun.reset();
  }, [runtimeBackendReachable, bulkPin, bulkUnpin, bulkArchive, analyzeDelete, cleanupDryRun]);

  /* ---- derived ---- */
  const analysisData = extractEnvelopeData<AnalyzeDeleteData>(analysisRaw);
  const cleanupData = extractEnvelopeData<CleanupPreviewData>(cleanupRaw);
  const smokeStatusRoot = extractEnvelopeData<NonNullable<SmokeStatusEnvelope["data"]>>(smokeStatus.data) ?? {};
  const smokeStatusLatest = smokeStatusRoot.latest;
  const providerActionData = extractEnvelopeData<ProviderSessionActionResult>(providerActionRaw);
  const recoveryBackupExportData = extractEnvelopeData<RecoveryBackupExportResponse>(recoveryBackupExportRaw);

  const analyzeDeleteErrorMessage = analyzeDelete.error instanceof Error ? formatMutationErrorMessage(analyzeDelete.error.message) : analyzeDelete.error ? formatMutationErrorMessage(String(analyzeDelete.error)) : "";
  const cleanupDryRunErrorMessage = cleanupDryRun.error instanceof Error ? formatMutationErrorMessage(cleanupDryRun.error.message) : cleanupDryRun.error ? formatMutationErrorMessage(String(cleanupDryRun.error)) : "";
  const bulkActionErrorMessage = bulkArchive.error instanceof Error ? formatMutationErrorMessage(bulkArchive.error.message) : bulkArchive.error ? formatMutationErrorMessage(String(bulkArchive.error)) : bulkPin.error instanceof Error ? formatMutationErrorMessage(bulkPin.error.message) : bulkPin.error ? formatMutationErrorMessage(String(bulkPin.error)) : bulkUnpin.error instanceof Error ? formatMutationErrorMessage(bulkUnpin.error.message) : bulkUnpin.error ? formatMutationErrorMessage(String(bulkUnpin.error)) : "";
  const bulkActionError = bulkArchive.isError || bulkPin.isError || bulkUnpin.isError;
  const providerSessionActionErrorMessage = providerSessionAction.error instanceof Error ? formatMutationErrorMessage(providerSessionAction.error.message) : providerSessionAction.error ? formatMutationErrorMessage(String(providerSessionAction.error)) : "";
  const recoveryBackupExportErrorMessage = recoveryBackupExport.error instanceof Error ? formatMutationErrorMessage(recoveryBackupExport.error.message) : recoveryBackupExport.error ? formatMutationErrorMessage(String(recoveryBackupExport.error)) : "";

  const busy = bulkPin.isPending || bulkUnpin.isPending || bulkArchive.isPending || analyzeDelete.isPending || cleanupDryRun.isPending || providerSessionAction.isPending || recoveryBackupExport.isPending;
  const runtimeLoading = runtime.isLoading && !runtime.data;
  const smokeStatusLoading = smokeStatus.isLoading && !smokeStatus.data;
  const recoveryLoading = recovery.isLoading && !recovery.data;

  /* ---- action dispatchers ---- */
  const runProviderAction = (action: "backup_local" | "archive_local" | "delete_local", dryRun: boolean, actionOptions?: { backup_before_delete?: boolean }) => {
    if (providerView === "all" || selectedProviderFilePaths.length === 0) return;
    if (providerSessionAction.isError) providerSessionAction.reset();
    const key = providerActionSelectionKey(providerView, action, selectedProviderFilePaths, actionOptions);
    const scopedToken = providerActionTokens[key] ?? "";
    providerSessionAction.mutate({ provider: providerView, action, file_paths: selectedProviderFilePaths, dry_run: dryRun, confirm_token: dryRun ? "" : scopedToken, backup_before_delete: actionOptions?.backup_before_delete });
  };

  const runSingleProviderAction = (provider: string, filePath: string, action: "backup_local" | "archive_local" | "delete_local", dryRun: boolean, actionOptions?: { backup_before_delete?: boolean }) => {
    if (providerSessionAction.isError) providerSessionAction.reset();
    const key = providerActionSelectionKey(provider, action, [filePath], actionOptions);
    const scopedToken = providerActionTokens[key] ?? "";
    providerSessionAction.mutate({ provider, action, file_paths: [filePath], dry_run: dryRun, confirm_token: dryRun ? "" : scopedToken, backup_before_delete: actionOptions?.backup_before_delete });
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
    analyzeDeleteError: analyzeDelete.isError,
    cleanupDryRunError: cleanupDryRun.isError,
    analyzeDeleteErrorMessage, cleanupDryRunErrorMessage,
    bulkActionError, bulkActionErrorMessage,
    providerSessionActionError: providerSessionAction.isError,
    providerSessionActionErrorMessage,
    analysisRaw, cleanupRaw,
    analysisData, cleanupData,
    smokeStatusLatest,
    providerActionData,
    providerDeleteBackupEnabled, setProviderDeleteBackupEnabled,
    recoveryBackupExportData,
    recoveryBackupExportError: recoveryBackupExport.isError,
    recoveryBackupExportErrorMessage,
    busy,
    runtimeLoading, smokeStatusLoading, recoveryLoading,
    runProviderAction, runSingleProviderAction, runRecoveryBackupExport,
  };
}
