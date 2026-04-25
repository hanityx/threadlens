import type { BulkThreadActionResult, ApiEnvelope } from "@threadlens/shared-contracts";
import type {
  LayoutView,
  ProviderSessionActionResult,
} from "@/shared/types";
import { buildApiUrl } from "@/api";
import {
  RUNTIME_BACKEND_DOWN_CACHED,
  formatMutationErrorMessage,
} from "@/shared/lib/appState";

export type ProviderSessionActionInput = {
  provider: string;
  action: "backup_local" | "archive_local" | "unarchive_local" | "delete_local";
  file_paths: string[];
  dry_run: boolean;
  confirm_token?: string;
  backup_before_delete?: boolean;
  backup_root?: string;
};

export type ProviderHardDeleteInput = {
  provider: string;
  file_paths: string[];
};

export type RecoveryBackupExportInput = {
  backupIds: string[];
  backupRoot?: string;
  exportRoot?: string;
};

export type GroupedProviderBackupInput = Array<{
  provider: string;
  file_paths: string[];
}>;

export type RecoveryBackupDownloadRequest = {
  archivePath: string;
  downloadToken?: string;
};

export const RECOVERY_BACKUP_ROOT_DEBOUNCE_MS = 250;

export function trimTrailingSlashes(value: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function normalizeRecoveryBackupRoot(value: string) {
  return String(value || "").trim();
}

export async function performProviderHardDeleteFlow(
  runAction: (input: ProviderSessionActionInput) => Promise<ProviderSessionActionResult>,
  input: ProviderHardDeleteInput,
): Promise<ProviderSessionActionResult> {
  return performProviderConfirmedActionFlow(runAction, {
    provider: input.provider,
    action: "delete_local",
    file_paths: input.file_paths,
    backup_before_delete: false,
  });
}

function assertProviderActionResultOk(result: ProviderSessionActionResult | null | undefined) {
  if (result?.ok !== false) return;
  throw new Error(String(result.error || "provider-action-failed"));
}

export async function performProviderConfirmedActionFlow(
  runAction: (input: ProviderSessionActionInput) => Promise<ProviderSessionActionResult>,
  input: {
    provider: string;
    action: "archive_local" | "unarchive_local" | "delete_local";
    file_paths: string[];
    backup_before_delete?: boolean;
  },
): Promise<ProviderSessionActionResult> {
  const preview = await runAction({
    provider: input.provider,
    action: input.action,
    file_paths: input.file_paths,
    dry_run: true,
    confirm_token: "",
    backup_before_delete: input.backup_before_delete,
  });
  assertProviderActionResultOk(preview);
  const confirmToken = String(preview.confirm_token_expected ?? "").trim();
  if (!confirmToken) {
    throw new Error("provider-action-preview-required");
  }
  const result = await runAction({
    provider: input.provider,
    action: input.action,
    file_paths: input.file_paths,
    dry_run: false,
    confirm_token: confirmToken,
    backup_before_delete: input.backup_before_delete,
  });
  assertProviderActionResultOk(result);
  return result;
}

export async function startRecoveryBackupDownload(options: RecoveryBackupDownloadRequest) {
  if (typeof document === "undefined") return;
  const normalized = String(options.archivePath || "").trim();
  if (!normalized) return;
  const normalizedDownloadToken = String(options.downloadToken || "").trim();
  if (!normalizedDownloadToken) return;
  const anchor = document.createElement("a");
  anchor.href = await buildApiUrl(
    `/api/recovery-backup-export/download?token=${encodeURIComponent(normalizedDownloadToken)}`,
  );
  anchor.download = normalized.split("/").pop() || "threadlens-backup.zip";
  anchor.click();
}

export function buildGroupedProviderBackupResult(
  results: ProviderSessionActionResult[],
  backupRoot: string,
): ProviderSessionActionResult {
  const normalizedRoot = trimTrailingSlashes(backupRoot);
  const providerActionsRoot = normalizedRoot
    ? `${normalizedRoot}/provider_actions`
    : "provider_actions";
  const backupIds = results
    .map((item) => String(item.backup_id || "").trim())
    .filter(Boolean);
  return {
    ok: true,
    provider: "all",
    action: "backup_local",
    dry_run: false,
    target_count: results.reduce((sum, item) => sum + Number(item.target_count || 0), 0),
    valid_count: results.reduce((sum, item) => sum + Number(item.valid_count || 0), 0),
    applied_count: results.reduce((sum, item) => sum + Number(item.applied_count || 0), 0),
    confirm_token_expected: "",
    confirm_token_accepted: true,
    backed_up_count: results.reduce(
      (sum, item) => sum + Number(item.backed_up_count ?? item.applied_count ?? 0),
      0,
    ),
    backup_ids: backupIds,
    backup_to: providerActionsRoot,
    backup_manifest_path: null,
    backup_summary: {
      destination: providerActionsRoot,
      manifest_path: null,
      copied_count: results.reduce(
        (sum, item) => sum + Number(item.backed_up_count ?? item.applied_count ?? 0),
        0,
      ),
      failed_count: 0,
    },
  };
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
  bulkUnarchiveError?: unknown;
  bulkPinError: unknown;
  bulkUnpinError: unknown;
  bulkArchiveIsError: boolean;
  bulkUnarchiveIsError?: boolean;
  bulkPinIsError: boolean;
  bulkUnpinIsError: boolean;
}) {
  const errorMessage = options.bulkArchiveIsError
    ? formatMutationHookError(options.bulkArchiveError)
    : options.bulkUnarchiveIsError
      ? formatMutationHookError(options.bulkUnarchiveError)
    : options.bulkPinIsError
      ? formatMutationHookError(options.bulkPinError)
      : options.bulkUnpinIsError
        ? formatMutationHookError(options.bulkUnpinError)
        : "";
  return {
    bulkActionError: options.bulkArchiveIsError || Boolean(options.bulkUnarchiveIsError) || options.bulkPinIsError || options.bulkUnpinIsError,
    bulkActionErrorMessage: errorMessage,
  };
}

export function resolveMutationBusyState(options: {
  bulkPinPending: boolean;
  bulkUnpinPending: boolean;
  bulkArchivePending: boolean;
  bulkUnarchivePending?: boolean;
  analyzeDeletePending: boolean;
  cleanupDryRunPending: boolean;
  cleanupExecutePending: boolean;
  cleanupBackupsExecutePending?: boolean;
  providerSessionActionPending: boolean;
  recoveryBackupExportPending: boolean;
}) {
  return (
    options.bulkPinPending ||
    options.bulkUnpinPending ||
    options.bulkArchivePending ||
    Boolean(options.bulkUnarchivePending) ||
    options.analyzeDeletePending ||
    options.cleanupDryRunPending ||
    options.cleanupExecutePending ||
    Boolean(options.cleanupBackupsExecutePending) ||
    options.providerSessionActionPending ||
    options.recoveryBackupExportPending
  );
}

export function resolveQueryLoadingState(isLoading: boolean, hasData: boolean) {
  return isLoading && !hasData;
}

export function resolveSmokeStatusQueryState(layoutView: LayoutView) {
  return {
    enabled: layoutView === "overview",
    refetchInterval: layoutView === "overview" ? 20000 : false,
  } as const;
}

export function resolveRecoveryQueryState(layoutView: LayoutView) {
  const wantsRecoveryData = layoutView === "overview" || layoutView === "providers";
  return {
    enabled: wantsRecoveryData,
    refetchInterval: wantsRecoveryData ? 15000 : false,
  } as const;
}

export function buildRecoveryCenterPath(backupRoot: string) {
  const normalizedBackupRoot = String(backupRoot || "").trim();
  return normalizedBackupRoot
    ? `/api/recovery-center?backup_root=${encodeURIComponent(normalizedBackupRoot)}`
    : "/api/recovery-center";
}

export type BulkThreadActionEnvelope = ApiEnvelope<BulkThreadActionResult>;
