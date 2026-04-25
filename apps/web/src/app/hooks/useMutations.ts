import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AnalyzeDeleteData,
  CleanupPreviewData,
  LayoutView,
  RecoveryBackupExportResponse,
  SmokeStatusEnvelope,
  ProviderSessionActionResult,
} from "@/shared/types";
import { extractEnvelopeData } from "@/shared/lib/format";
import {
  formatMutationHookError,
  resolveBulkActionErrorState,
  resolveMutationBusyState,
} from "@/app/hooks/useMutationCore";
import { useMutationQueries } from "@/app/hooks/useMutationQueries";
import { useMutationPreferences } from "@/app/hooks/useMutationPreferences";
import { useThreadMutationActions } from "@/app/hooks/useThreadMutationActions";
import { useProviderMutationActions } from "@/app/hooks/useProviderMutationActions";

export {
  assertRuntimeBackendReachable,
  buildRecoveryCenterPath,
  formatMutationHookError,
  performProviderHardDeleteFlow,
  resolveBulkActionErrorState,
  resolveMutationBusyState,
  resolveQueryLoadingState,
  resolveRecoveryQueryState,
  resolveSmokeStatusQueryState,
  shouldReturnProviderActionPreview,
  startRecoveryBackupDownload,
  updateProviderActionTokenState,
} from "@/app/hooks/useMutationCore";

export function useMutations(options: {
  layoutView: LayoutView;
  providerActionProvider: string;
  selectedProviderFilePaths: string[];
  providerDeleteBackupEnabled?: boolean;
}) {
  const { layoutView, providerActionProvider, selectedProviderFilePaths } = options;
  const queryClient = useQueryClient();
  const preferences = useMutationPreferences();

  const invalidateProviderSurfaceQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["data-sources"] });
    queryClient.invalidateQueries({ queryKey: ["provider-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["provider-sessions-summary"] });
    queryClient.invalidateQueries({ queryKey: ["provider-parser-health"] });
    queryClient.invalidateQueries({ queryKey: ["provider-parser-health-summary"] });
    queryClient.invalidateQueries({ queryKey: ["provider-matrix"] });
  }, [queryClient]);

  const queryState = useMutationQueries(layoutView, preferences.backupRoot);
  const threadMutations = useThreadMutationActions({
    queryClient,
    runtimeData: queryState.runtime.data,
    invalidateProviderSurfaceQueries,
  });
  const providerMutations = useProviderMutationActions({
    queryClient,
    providerActionProvider,
    selectedProviderFilePaths,
    invalidateProviderSurfaceQueries,
    providerDeleteBackupEnabled: preferences.providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled: preferences.setProviderDeleteBackupEnabled,
    backupRoot: preferences.backupRoot,
    setBackupRoot: preferences.setBackupRoot,
    backupRootRef: preferences.backupRootRef,
    exportRoot: preferences.exportRoot,
    setExportRoot: preferences.setExportRoot,
    exportRootRef: preferences.exportRootRef,
    latestExportArchivePath: preferences.latestExportArchivePath,
    setLatestExportArchivePath: preferences.setLatestExportArchivePath,
  });

  const analysisData = extractEnvelopeData<AnalyzeDeleteData>(threadMutations.analysisRaw);
  const cleanupData = extractEnvelopeData<CleanupPreviewData>(threadMutations.cleanupRaw);
  const providerActionData = extractEnvelopeData<ProviderSessionActionResult>(
    providerMutations.providerActionRaw,
  );
  const recoveryBackupExportData = extractEnvelopeData<RecoveryBackupExportResponse>(
    providerMutations.recoveryBackupExportRaw,
  );
  const smokeStatusRoot =
    extractEnvelopeData<NonNullable<SmokeStatusEnvelope["data"]>>(queryState.smokeStatus.data) ?? {};
  const smokeStatusLatest = queryState.smokeStatusLatest ?? smokeStatusRoot.latest;

  const analyzeDeleteErrorMessage = formatMutationHookError(
    threadMutations.analyzeDelete.error,
  );
  const cleanupDryRunErrorMessage = formatMutationHookError(
    threadMutations.cleanupDryRun.error,
  );
  const cleanupExecuteErrorMessage = formatMutationHookError(
    threadMutations.cleanupExecute.error,
  );
  const { bulkActionError, bulkActionErrorMessage } = resolveBulkActionErrorState({
    bulkArchiveError: threadMutations.bulkArchive.error,
    bulkUnarchiveError: threadMutations.bulkUnarchive.error,
    bulkPinError: threadMutations.bulkPin.error,
    bulkUnpinError: threadMutations.bulkUnpin.error,
    bulkArchiveIsError: threadMutations.bulkArchive.isError,
    bulkUnarchiveIsError: threadMutations.bulkUnarchive.isError,
    bulkPinIsError: threadMutations.bulkPin.isError,
    bulkUnpinIsError: threadMutations.bulkUnpin.isError,
  });
  const providerSessionActionErrorMessage = formatMutationHookError(
    providerMutations.providerSessionAction.error,
  );
  const recoveryBackupExportErrorMessage = formatMutationHookError(
    providerMutations.recoveryBackupExport.error,
  );

  const busy = resolveMutationBusyState({
    bulkPinPending: threadMutations.bulkPin.isPending,
    bulkUnpinPending: threadMutations.bulkUnpin.isPending,
    bulkArchivePending: threadMutations.bulkArchive.isPending,
    bulkUnarchivePending: threadMutations.bulkUnarchive.isPending,
    analyzeDeletePending: threadMutations.analyzeDelete.isPending,
    cleanupDryRunPending: threadMutations.cleanupDryRun.isPending,
    cleanupExecutePending: threadMutations.cleanupExecute.isPending,
    cleanupBackupsExecutePending: threadMutations.cleanupBackupsExecute.isPending,
    providerSessionActionPending: providerMutations.providerSessionAction.isPending,
    recoveryBackupExportPending: providerMutations.recoveryBackupExport.isPending,
  });

  return {
    runtime: queryState.runtime,
    smokeStatus: queryState.smokeStatus,
    recovery: queryState.recovery,
    bulkPin: (ids: string[]) => threadMutations.bulkPin.mutate(ids),
    bulkUnpin: (ids: string[]) => threadMutations.bulkUnpin.mutate(ids),
    bulkArchive: (ids: string[]) => threadMutations.bulkArchive.mutate(ids),
    bulkUnarchive: (ids: string[]) => threadMutations.bulkUnarchive.mutate(ids),
    analyzeDelete: (ids: string[], sessionScanLimit?: number) =>
      threadMutations.analyzeDelete.mutate({ ids, sessionScanLimit }),
    cleanupDryRun: (ids: string[]) => threadMutations.cleanupDryRun.mutate(ids),
    cleanupExecute: (ids: string[]) => threadMutations.cleanupExecute.mutate(ids),
    cleanupBackupsExecute: (ids: string[]) => threadMutations.cleanupBackupsExecute.mutate(ids),
    analyzeDeleteError: threadMutations.analyzeDelete.isError,
    cleanupDryRunError: threadMutations.cleanupDryRun.isError,
    cleanupExecuteError: threadMutations.cleanupExecute.isError,
    analyzeDeleteErrorMessage,
    cleanupDryRunErrorMessage,
    cleanupExecuteErrorMessage,
    bulkActionError,
    bulkActionErrorMessage,
    providerSessionActionError: providerMutations.providerSessionAction.isError,
    providerSessionActionErrorMessage,
    analysisRaw: threadMutations.analysisRaw,
    cleanupRaw: threadMutations.cleanupRaw,
    analysisData,
    cleanupData,
    pendingCleanup: threadMutations.pendingCleanup,
    smokeStatusLatest,
    providerActionData,
    providerActionSelection: providerMutations.providerActionSelection,
    providerDeleteBackupEnabled: providerMutations.providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled: providerMutations.setProviderDeleteBackupEnabled,
    recoveryBackupExportData,
    recoveryBackupExportError: providerMutations.recoveryBackupExport.isError,
    recoveryBackupExportErrorMessage,
    providerSessionActionPending: providerMutations.providerSessionAction.isPending,
    recoveryBackupExportPending: providerMutations.recoveryBackupExport.isPending,
    groupedBackupProgress: providerMutations.groupedBackupProgress,
    backupRoot: providerMutations.backupRoot,
    exportRoot: providerMutations.exportRoot,
    latestExportArchivePath: providerMutations.latestExportArchivePath,
    setBackupRoot: providerMutations.setBackupRoot,
    setExportRoot: providerMutations.setExportRoot,
    busy,
    runtimeLoading: queryState.runtimeLoading,
    smokeStatusLoading: queryState.smokeStatusLoading,
    recoveryLoading: queryState.recoveryLoading,
    runProviderAction: providerMutations.runProviderAction,
    runProviderConfirmedAction: providerMutations.runProviderConfirmedAction,
    runPreparedProviderAction: providerMutations.runPreparedProviderAction,
    runProviderHardDelete: providerMutations.runProviderHardDelete,
    runSingleProviderAction: providerMutations.runSingleProviderAction,
    runSingleProviderHardDelete: providerMutations.runSingleProviderHardDelete,
    runRecoveryBackupExport: providerMutations.runRecoveryBackupExport,
    runGroupedProviderBackup: providerMutations.runGroupedProviderBackup,
    runGroupedProviderBackupExport: providerMutations.runGroupedProviderBackupExport,
  };
}
