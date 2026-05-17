import type { ProviderId, ProviderSessionAction } from "../../types.js";
import type { NormalizedProviderActionOptions } from "./selection.js";
import type { ProviderActionSkippedTarget } from "./targets.js";
import type { ProviderActionExecutionFailure } from "./execution.js";

type ProviderActionResponseBase = {
  provider: ProviderId;
  action: ProviderSessionAction;
  dryRun: boolean;
  targetCount: number;
  validCount: number;
  selectionFingerprint: string;
  options: NormalizedProviderActionOptions;
  skipped: ProviderActionSkippedTarget[];
};

type ProviderActionFailureResponseInput = ProviderActionResponseBase & {
  error: string;
  confirmTokenExpected?: string;
};

export function buildProviderActionFailureResponse({
  provider,
  action,
  dryRun,
  targetCount,
  validCount,
  selectionFingerprint,
  options,
  skipped,
  error,
  confirmTokenExpected = "",
}: ProviderActionFailureResponseInput) {
  return {
    ok: false,
    provider,
    action,
    dry_run: dryRun,
    target_count: targetCount,
    valid_count: validCount,
    applied_count: 0,
    confirm_token_expected: confirmTokenExpected,
    confirm_token_accepted: false,
    selection_fingerprint: selectionFingerprint,
    backup_before_delete: options.backup_before_delete,
    failure_summary: {
      skipped_count: skipped.length,
      failed_count: 0,
      partial_failure: false,
    },
    skipped,
    error,
  };
}

export function buildProviderActionPreviewResponse({
  provider,
  action,
  targetCount,
  validCount,
  selectionFingerprint,
  options,
  skipped,
  confirmTokenExpected,
}: ProviderActionResponseBase & {
  confirmTokenExpected: string;
}) {
  return {
    ok: true,
    provider,
    action,
    dry_run: true,
    target_count: targetCount,
    valid_count: validCount,
    applied_count: 0,
    confirm_token_expected: confirmTokenExpected,
    confirm_token_accepted: false,
    selection_fingerprint: selectionFingerprint,
    backup_before_delete: options.backup_before_delete,
    failure_summary: {
      skipped_count: skipped.length,
      failed_count: 0,
      partial_failure: false,
    },
    skipped,
    mode: "preview",
  };
}

export function buildProviderActionAppliedResponse({
  provider,
  action,
  targetCount,
  validCount,
  selectionFingerprint,
  options,
  skipped,
  failed,
  applied,
  backedUpCount,
  backupId,
  backupTo,
  backupManifestPath,
  shouldBackup,
  backupStageFailedCount,
  archivedTo,
}: {
  provider: ProviderId;
  action: ProviderSessionAction;
  targetCount: number;
  validCount: number;
  selectionFingerprint: string;
  options: NormalizedProviderActionOptions;
  skipped: ProviderActionSkippedTarget[];
  failed: ProviderActionExecutionFailure[];
  applied: number;
  backedUpCount: number;
  backupId: string | null;
  backupTo: string | null;
  backupManifestPath: string | null;
  shouldBackup: boolean;
  backupStageFailedCount: number;
  archivedTo: string | null;
}) {
  return {
    ok: failed.length === 0,
    provider,
    action,
    dry_run: false,
    target_count: targetCount,
    valid_count: validCount,
    applied_count: applied,
    confirm_token_expected: "",
    confirm_token_accepted: action === "backup_local" ? false : true,
    selection_fingerprint: selectionFingerprint,
    backup_before_delete: options.backup_before_delete,
    backed_up_count: backedUpCount,
    backup_id: backupId,
    backup_to: backupTo,
    backup_manifest_path: backupManifestPath,
    backup_summary: shouldBackup
      ? {
          destination: backupTo,
          manifest_path: backupManifestPath,
          copied_count: backedUpCount,
          failed_count: backupStageFailedCount,
        }
      : null,
    failure_summary: {
      skipped_count: skipped.length,
      failed_count: failed.length,
      partial_failure: failed.length > 0 && applied > 0,
    },
    skipped,
    failed,
    archived_to: archivedTo,
    mode: failed.length === 0 ? "applied" : applied > 0 ? "partial" : "failed",
  };
}
