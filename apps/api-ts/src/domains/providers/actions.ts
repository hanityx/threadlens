import { BACKUP_ROOT } from "../../lib/constants.js";
import {
  deriveProviderBackupId,
  resolveProviderActionBackupRoot,
  stageProviderActionBackup,
} from "./actions/backups.js";
import {
  consumeProviderActionConfirmToken,
  issueProviderActionConfirmToken,
  pruneProviderActionTokens,
} from "./actions/confirm-tokens.js";
import {
  buildProviderActionFingerprint,
  normalizeProviderActionOptions,
} from "./actions/selection.js";
import {
  buildProviderActionAppliedResponse,
  buildProviderActionFailureResponse,
  buildProviderActionPreviewResponse,
} from "./actions/responses.js";
import {
  type ProviderActionExecutionFailure,
  runArchiveProviderAction,
  runDeleteProviderAction,
  runUnarchiveProviderAction,
} from "./actions/execution.js";
import {
  normalizeProviderActionTargetPaths,
  resolveProviderActionTargets,
} from "./actions/targets.js";
import type {
  ProviderId,
  ProviderSessionAction,
  ProviderSessionActionOptions,
} from "./types.js";

type ProviderActionDeps = {
  resolveAllowedProviderFilePath: (
    provider: ProviderId,
    filePath: string,
  ) => Promise<string | null>;
  supportsProviderAction: (
    provider: ProviderId,
    action: ProviderSessionAction,
  ) => boolean;
  invalidateProviderCaches: (provider: ProviderId) => void;
};

export { buildProviderActionFingerprint, buildProviderActionToken } from "./actions/selection.js";
export { deriveProviderBackupRelativePath } from "./actions/backups.js";

export async function runProviderSessionAction(
  deps: ProviderActionDeps,
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  dryRun: boolean,
  confirmToken: string,
  options?: ProviderSessionActionOptions,
) {
  pruneProviderActionTokens();
  const normalizedOptions = normalizeProviderActionOptions(options);
  const uniquePaths = normalizeProviderActionTargetPaths(filePaths);
  if (!deps.supportsProviderAction(provider, action)) {
    return buildProviderActionFailureResponse({
      provider,
      action,
      dryRun,
      targetCount: uniquePaths.length,
      validCount: 0,
      selectionFingerprint: "",
      options: normalizedOptions,
      skipped: [],
      error: "cleanup-disabled-provider",
    });
  }
  const { skipped, valid } = await resolveProviderActionTargets(
    provider,
    uniquePaths,
    deps.resolveAllowedProviderFilePath,
  );
  if (!valid.length && !dryRun) {
    return buildProviderActionFailureResponse({
      provider,
      action,
      dryRun: false,
      targetCount: uniquePaths.length,
      validCount: valid.length,
      selectionFingerprint: "",
      options: normalizedOptions,
      skipped,
      error: "no-valid-targets",
    });
  }

  const selectionFingerprint = valid.length
    ? buildProviderActionFingerprint(provider, action, valid, normalizedOptions)
    : "";
  const shouldBackup =
    action === "backup_local" ||
    normalizedOptions.backup_before_delete;
  const backupRootResult = await resolveProviderActionBackupRoot(
    normalizedOptions.backup_root,
  );
  if (shouldBackup && !backupRootResult.ok) {
    return buildProviderActionFailureResponse({
      provider,
      action,
      dryRun,
      targetCount: uniquePaths.length,
      validCount: valid.length,
      selectionFingerprint,
      options: normalizedOptions,
      skipped,
      error: backupRootResult.error,
    });
  }

  if (dryRun) {
    const expectedToken = valid.length
      ? issueProviderActionConfirmToken(provider, action, valid, normalizedOptions)
      : "";
    return buildProviderActionPreviewResponse({
      provider,
      action,
      dryRun: true,
      targetCount: uniquePaths.length,
      validCount: valid.length,
      selectionFingerprint,
      options: normalizedOptions,
      skipped,
      confirmTokenExpected: expectedToken,
    });
  }

  if (action !== "backup_local") {
    const consume = consumeProviderActionConfirmToken(
      confirmToken,
      provider,
      action,
      valid,
      normalizedOptions,
    );
    if (!consume.ok) {
      const expectedToken = valid.length
        ? issueProviderActionConfirmToken(provider, action, valid, normalizedOptions)
        : "";
      return buildProviderActionFailureResponse({
        provider,
        action,
        dryRun: false,
        targetCount: uniquePaths.length,
        validCount: valid.length,
        selectionFingerprint,
        options: normalizedOptions,
        skipped,
        confirmTokenExpected: expectedToken,
        error: consume.reason,
      });
    }
  }

  let applied = 0;
  let archivedTo: string | null = null;
  let backupTo: string | null = null;
  let backupManifestPath: string | null = null;
  let backedUpCount = 0;
  const failed: ProviderActionExecutionFailure[] = [];
  const backupRoot = shouldBackup
    ? backupRootResult.ok
      ? backupRootResult.backupRoot
      : (() => {
          throw new Error(`unreachable invalid backup root: ${backupRootResult.error}`);
        })()
    : BACKUP_ROOT;
  const backupStage = shouldBackup
    ? await stageProviderActionBackup(provider, action, valid, backupRoot)
    : null;
  if (backupStage) {
    failed.push(...backupStage.failed);
    backupTo = backupStage.destination;
    backupManifestPath = backupStage.manifest_path;
    backedUpCount = backupStage.items.length;
  }
  const backupManifestWriteFailed =
    backupStage?.failed.some((failure) => failure.step === "manifest_write") ?? false;
  if (backupManifestWriteFailed && action !== "backup_local") {
    return buildProviderActionAppliedResponse({
      provider,
      action,
      targetCount: uniquePaths.length,
      validCount: valid.length,
      selectionFingerprint,
      options: normalizedOptions,
      skipped,
      failed,
      applied: 0,
      backedUpCount,
      backupId: deriveProviderBackupId(backupRoot, backupTo),
      backupTo,
      backupManifestPath,
      shouldBackup,
      backupStageFailedCount: backupStage?.failed.length ?? 0,
      archivedTo,
    });
  }

  if (action === "backup_local") {
    applied = backupStage?.items.length ?? 0;
  } else if (action === "archive_local") {
    const result = await runArchiveProviderAction(provider, valid);
    applied = result.applied;
    archivedTo = result.archivedTo;
    failed.push(...result.failed);
  } else if (action === "unarchive_local") {
    const result = await runUnarchiveProviderAction(provider, valid);
    applied = result.applied;
    failed.push(...result.failed);
  } else {
    const deleteTargets = backupStage?.items.map((item) => item.source_path) ?? valid;
    const result = await runDeleteProviderAction(deleteTargets);
    applied = result.applied;
    failed.push(...result.failed);
  }

  deps.invalidateProviderCaches(provider);

  return buildProviderActionAppliedResponse({
    provider,
    action,
    targetCount: uniquePaths.length,
    validCount: valid.length,
    selectionFingerprint,
    options: normalizedOptions,
    skipped,
    failed,
    applied,
    backedUpCount,
    backupId: deriveProviderBackupId(backupRoot, backupTo),
    backupTo,
    backupManifestPath,
    shouldBackup,
    backupStageFailedCount: backupStage?.failed.length ?? 0,
    archivedTo,
  });
}
