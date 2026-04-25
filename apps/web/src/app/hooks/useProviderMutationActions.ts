import { useState, type MutableRefObject } from "react";
import { useMutation, type QueryClient } from "@tanstack/react-query";
import type {
  ProviderActionSelection,
  ProviderSessionActionResult,
  RecoveryBackupExportResponse,
} from "@/shared/types";
import { apiPost, apiPostJsonAllowError } from "@/api";
import { extractEnvelopeData } from "@/shared/lib/format";
import {
  providerActionSelectionKey,
} from "@/shared/lib/appState";
import {
  buildGroupedProviderBackupResult,
  performProviderHardDeleteFlow,
  performProviderConfirmedActionFlow,
  type GroupedProviderBackupInput,
  type RecoveryBackupExportInput,
  startRecoveryBackupDownload,
  type ProviderSessionActionInput,
  shouldReturnProviderActionPreview,
  updateProviderActionTokenState,
} from "@/app/hooks/useMutationCore";

type UseProviderMutationActionsOptions = {
  queryClient: QueryClient;
  providerActionProvider: string;
  selectedProviderFilePaths: string[];
  invalidateProviderSurfaceQueries: () => void;
  providerDeleteBackupEnabled: boolean;
  setProviderDeleteBackupEnabled: (value: boolean | ((previous: boolean) => boolean)) => void;
  backupRoot: string;
  setBackupRoot: (value: string) => void;
  backupRootRef: MutableRefObject<string>;
  exportRoot: string;
  setExportRoot: (value: string) => void;
  exportRootRef: MutableRefObject<string>;
  latestExportArchivePath: string;
  setLatestExportArchivePath: (value: string) => void;
};

export type GroupedBackupProgress = {
  current: number;
  total: number;
  provider: string;
};

export function useProviderMutationActions(options: UseProviderMutationActionsOptions) {
  const {
    queryClient,
    providerActionProvider,
    selectedProviderFilePaths,
    invalidateProviderSurfaceQueries,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    backupRoot,
    setBackupRoot,
    backupRootRef,
    exportRoot,
    setExportRoot,
    exportRootRef,
    latestExportArchivePath,
    setLatestExportArchivePath,
  } = options;
  const [providerActionRaw, setProviderActionRaw] = useState<unknown>(null);
  const [providerActionSelection, setProviderActionSelection] =
    useState<ProviderActionSelection | null>(null);
  const [providerActionTokens, setProviderActionTokens] = useState<Record<string, string>>({});
  const [recoveryBackupExportRaw, setRecoveryBackupExportRaw] = useState<unknown>(null);
  const [groupedBackupProgress, setGroupedBackupProgress] =
    useState<GroupedBackupProgress | null>(null);

  const providerSessionAction = useMutation({
    mutationFn: async (input: ProviderSessionActionInput) => {
      const requestBody = { ...input, confirm_token: input.confirm_token ?? "" };
      const first = await apiPostJsonAllowError<ProviderSessionActionResult>(
        "/api/provider-session-action",
        requestBody,
      );
      const firstData = extractEnvelopeData<ProviderSessionActionResult>(first.data) ?? first.data;
      if (first.ok) return firstData;
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
        backup_root: String(variables.backup_root || "").trim(),
      });
      const actionData = extractEnvelopeData<ProviderSessionActionResult>(data);
      const expectedToken = String(actionData?.confirm_token_expected ?? "").trim();
      const key = providerActionSelectionKey(
        variables.provider,
        variables.action,
        variables.file_paths,
        {
          backup_before_delete: variables.backup_before_delete,
          backup_root: variables.backup_root,
        },
      );
      setProviderActionTokens((previous) =>
        updateProviderActionTokenState(
          previous,
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
    mutationFn: (input: RecoveryBackupExportInput) =>
      apiPost<RecoveryBackupExportResponse>("/api/recovery-backup-export", {
        backup_ids: input.backupIds,
        backup_root: input.backupRoot ?? "",
        export_root: input.exportRoot ?? "",
      }),
    onSuccess: (data) => {
      setRecoveryBackupExportRaw(data);
      const exportData = extractEnvelopeData<RecoveryBackupExportResponse>(data);
      if (exportData?.ok && exportData.archive_path) {
        const archivePath = String(exportData.archive_path || "").trim();
        setLatestExportArchivePath(archivePath);
        void startRecoveryBackupDownload({
          archivePath: exportData.archive_path,
          downloadToken: exportData.download_token,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
  });

  const runProviderAction = (
    action: "backup_local" | "archive_local" | "unarchive_local" | "delete_local",
    dryRun: boolean,
    actionOptions?: { backup_before_delete?: boolean },
    filePathsOverride?: string[],
  ) => {
    const targetFilePaths = filePathsOverride?.length
      ? filePathsOverride
      : selectedProviderFilePaths;
    if (!providerActionProvider || targetFilePaths.length === 0) return;
    if (providerSessionAction.isError) providerSessionAction.reset();
    const key = providerActionSelectionKey(providerActionProvider, action, targetFilePaths, {
      ...actionOptions,
      backup_root: backupRoot,
    });
    const scopedToken = providerActionTokens[key] ?? "";
    providerSessionAction.mutate({
      provider: providerActionProvider,
      action,
      file_paths: targetFilePaths,
      dry_run: dryRun,
      confirm_token: dryRun ? "" : scopedToken,
      backup_before_delete: actionOptions?.backup_before_delete,
      backup_root: backupRootRef.current,
    });
  };

  const runSingleProviderAction = (
    provider: string,
    filePath: string,
    action: "backup_local" | "archive_local" | "unarchive_local" | "delete_local",
    dryRun: boolean,
    actionOptions?: { backup_before_delete?: boolean },
  ) => {
    if (providerSessionAction.isError) providerSessionAction.reset();
    const key = providerActionSelectionKey(provider, action, [filePath], {
      ...actionOptions,
      backup_root: backupRoot,
    });
    const scopedToken = providerActionTokens[key] ?? "";
    providerSessionAction.mutate({
      provider,
      action,
      file_paths: [filePath],
      dry_run: dryRun,
      confirm_token: dryRun ? "" : scopedToken,
      backup_before_delete: actionOptions?.backup_before_delete,
      backup_root: backupRootRef.current,
    });
  };

  const runSingleProviderHardDelete = async (provider: string, filePath: string) => {
    if (providerSessionAction.isError) providerSessionAction.reset();
    return performProviderHardDeleteFlow(
      (input) =>
        providerSessionAction.mutateAsync({ ...input, backup_root: backupRootRef.current }),
      {
        provider,
        file_paths: [filePath],
      },
    );
  };

  const runProviderHardDelete = async (filePathsOverride?: string[]) => {
    const targetFilePaths = filePathsOverride?.length
      ? filePathsOverride
      : selectedProviderFilePaths;
    if (!providerActionProvider || targetFilePaths.length === 0) return null;
    if (providerSessionAction.isError) providerSessionAction.reset();
    return performProviderHardDeleteFlow(
      (input) =>
        providerSessionAction.mutateAsync({ ...input, backup_root: backupRootRef.current }),
      {
        provider: providerActionProvider,
        file_paths: targetFilePaths,
      },
    );
  };

  const runProviderConfirmedAction = async (
    action: "archive_local" | "unarchive_local",
    actionOptions?: { backup_before_delete?: boolean },
    filePathsOverride?: string[],
  ) => {
    const targetFilePaths = filePathsOverride?.length
      ? filePathsOverride
      : selectedProviderFilePaths;
    if (!providerActionProvider || targetFilePaths.length === 0) return null;
    if (providerSessionAction.isError) providerSessionAction.reset();
    return performProviderConfirmedActionFlow(
      (input) =>
        providerSessionAction.mutateAsync({ ...input, backup_root: backupRootRef.current }),
      {
        provider: providerActionProvider,
        action,
        file_paths: targetFilePaths,
        backup_before_delete: actionOptions?.backup_before_delete,
      },
    );
  };

  const runPreparedProviderAction = async (selection: ProviderActionSelection) => {
    if (!selection.provider || selection.file_paths.length === 0) return null;
    if (selection.action === "backup_local") return null;
    if (providerSessionAction.isError) providerSessionAction.reset();
    return performProviderConfirmedActionFlow(
      (input) =>
        providerSessionAction.mutateAsync({ ...input, backup_root: backupRootRef.current }),
      {
        provider: selection.provider,
        action: selection.action,
        file_paths: selection.file_paths,
        backup_before_delete: selection.backup_before_delete,
      },
    );
  };

  const runRecoveryBackupExport = (backupIds: string[]) => {
    if (recoveryBackupExport.isError) recoveryBackupExport.reset();
    recoveryBackupExport.mutate({
      backupIds,
      backupRoot: backupRootRef.current || undefined,
      exportRoot: exportRootRef.current || undefined,
    });
  };

  const runGroupedProviderBackup = async (groups: GroupedProviderBackupInput) => {
    const normalizedGroups = groups
      .map((group) => ({
        provider: String(group.provider || "").trim(),
        file_paths: Array.from(
          new Set(group.file_paths.map((item) => String(item || "").trim()).filter(Boolean)),
        ),
      }))
      .filter((group) => group.provider && group.file_paths.length > 0);
    if (normalizedGroups.length === 0) return null;
    if (providerSessionAction.isError) providerSessionAction.reset();

    const results: ProviderSessionActionResult[] = [];
    try {
      for (const [index, group] of normalizedGroups.entries()) {
        setGroupedBackupProgress({
          current: index + 1,
          total: normalizedGroups.length,
          provider: group.provider,
        });
        const response = await providerSessionAction.mutateAsync({
          provider: group.provider,
          action: "backup_local",
          file_paths: group.file_paths,
          dry_run: false,
          confirm_token: "",
          backup_root: backupRootRef.current,
        });
        const actionData = extractEnvelopeData<ProviderSessionActionResult>(response);
        if (!actionData?.ok) {
          throw new Error(String(actionData?.error || "grouped-provider-backup-failed"));
        }
        results.push(actionData);
      }
    } finally {
      setGroupedBackupProgress(null);
    }

    const combined = buildGroupedProviderBackupResult(results, backupRootRef.current);
    setProviderActionRaw(combined);
    setProviderActionSelection({
      provider: "all",
      action: "backup_local",
      file_paths: normalizedGroups.flatMap((group) => group.file_paths),
      dry_run: false,
      backup_root: backupRootRef.current,
    });
    return combined;
  };

  const runGroupedProviderBackupExport = async (groups: GroupedProviderBackupInput) => {
    const result = await runGroupedProviderBackup(groups);
    const backupIds = result?.backup_ids?.filter(Boolean) ?? [];
    if (backupIds.length > 0) {
      if (recoveryBackupExport.isError) recoveryBackupExport.reset();
      recoveryBackupExport.mutate({
        backupIds,
        backupRoot: backupRootRef.current || undefined,
        exportRoot: exportRootRef.current || undefined,
      });
    }
    return result;
  };

  return {
    providerActionRaw,
    providerActionSelection,
    providerDeleteBackupEnabled,
    recoveryBackupExportRaw,
    groupedBackupProgress,
    backupRoot,
    exportRoot,
    latestExportArchivePath,
    providerSessionAction,
    recoveryBackupExport,
    setBackupRoot,
    setExportRoot,
    setProviderDeleteBackupEnabled,
    runProviderAction,
    runProviderConfirmedAction,
    runPreparedProviderAction,
    runProviderHardDelete,
    runSingleProviderAction,
    runSingleProviderHardDelete,
    runRecoveryBackupExport,
    runGroupedProviderBackup,
    runGroupedProviderBackupExport,
  };
}
