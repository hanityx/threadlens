import type { Messages } from "../../i18n";
import type { ProviderSessionActionResult, ProviderView, RecoveryBackupExportResponse } from "../../types";

type ProviderFlowState = "done" | "pending" | "blocked";

export function getProviderStatusLabel(
  messages: Messages,
  status: "active" | "detected" | "missing",
) {
  if (status === "active") return messages.providers.statusActive;
  if (status === "detected") return messages.providers.statusDetected;
  return messages.providers.statusMissing;
}

export function getProviderActionLabel(
  messages: Messages,
  action: "backup_local" | "archive_local" | "delete_local",
) {
  if (action === "backup_local") return messages.providers.actionBackupLocal;
  if (action === "archive_local") return messages.providers.actionArchiveLocal;
  return messages.providers.actionDeleteLocal;
}

export function getProviderFlowStateLabel(messages: Messages, state: ProviderFlowState) {
  if (state === "done") return messages.providers.flowStatusDone;
  if (state === "blocked") return messages.providers.flowStatusBlocked;
  return messages.providers.flowStatusPending;
}

export function getCapabilityLevelLabel(level: string) {
  if (level === "full") return "Full access";
  if (level === "read-only") return "Read only";
  if (level === "unavailable") return "Unavailable";
  return level;
}

export function buildProviderSessionActionSummary(
  messages: Messages,
  result: ProviderSessionActionResult | null,
) {
  if (!result) return null;

  const actionLabel = getProviderActionLabel(messages, result.action);
  const expectedToken = String(result.confirm_token_expected ?? "").trim();
  const previewReady =
    result.action !== "backup_local" &&
    Boolean(expectedToken) &&
    !result.confirm_token_accepted &&
    result.applied_count === 0;
  const countSummary = `${messages.providers.valid} ${result.valid_count} · ${messages.providers.applied} ${result.applied_count}${
    typeof result.backed_up_count === "number"
      ? ` · ${messages.providers.backedUp} ${result.backed_up_count}`
      : ""
  }`;

  if (result.dry_run || previewReady) {
    return {
      headline: `${actionLabel} · ${previewReady ? messages.providers.resultPreviewReady : messages.providers.resultPreview}`,
      countSummary,
      detail: previewReady
        ? messages.providers.resultExecuteFromCardHint
        : messages.providers.resultPreviewOnlyHint,
      token: previewReady ? expectedToken : "",
      previewReady,
    };
  }

  let detail = messages.providers.resultBackupAppliedHint;
  if (result.action === "archive_local") {
    detail = messages.providers.resultArchiveAppliedHint;
  } else if (result.action === "delete_local") {
    detail = result.backup_before_delete
      ? messages.providers.resultDeleteBackedUpHint
      : messages.providers.resultDeleteDirectHint;
  }

  return {
    headline: `${actionLabel} · ${messages.providers.resultApplied}`,
    countSummary,
    detail,
    token: "",
    previewReady: false,
  };
}

export function buildProviderPanelPresentationModel(options: {
  messages: Messages;
  providerView: ProviderView;
  selectedProviderLabel: string;
  providerActionData: ProviderSessionActionResult | null;
  recoveryBackupExportData: RecoveryBackupExportResponse | null;
  selectedProviderFilePathsCount: number;
  providerDeleteBackupEnabled: boolean;
  hotspotScopeOrigin: ProviderView | null;
  slowOnly: boolean;
  canApplySlowOnly: boolean;
}) {
  const providerLabel =
    options.providerView === "all" ? options.messages.common.allAi : options.selectedProviderLabel;
  const backupActionResult =
    options.providerActionData?.action === "backup_local" ? options.providerActionData : null;
  const sessionFileActionResult =
    options.providerActionData && options.providerActionData.action !== "backup_local"
      ? options.providerActionData
      : null;
  const latestBackupCount =
    backupActionResult?.backed_up_count ?? (backupActionResult?.backup_to ? 1 : 0);
  const latestBackupPath =
    backupActionResult?.backup_to ?? "No selected backup created in this session yet.";
  const latestExportCount = options.recoveryBackupExportData?.exported_count ?? 0;
  const backupFlowHint =
    options.selectedProviderFilePathsCount > 0
      ? `Back up ${options.selectedProviderFilePathsCount} selected sessions first, then run archive or delete dry-runs below.`
      : "Pick sessions first, then start with backup.";
  const deleteBackupModeLabel = options.providerDeleteBackupEnabled ? "On" : "Off";
  const canRunProviderBackup =
    options.providerView !== "all" && options.selectedProviderFilePathsCount > 0;
  const canReturnHotspotScope = Boolean(
    options.hotspotScopeOrigin && options.hotspotScopeOrigin !== options.providerView,
  );
  const slowFocusActive = options.canApplySlowOnly && options.slowOnly;
  const showProviderColumn = options.providerView === "all";

  return {
    providerLabel,
    backupActionResult,
    sessionFileActionResult,
    latestBackupCount,
    latestBackupPath,
    latestExportCount,
    backupFlowHint,
    deleteBackupModeLabel,
    canRunProviderBackup,
    canReturnHotspotScope,
    slowFocusActive,
    showProviderColumn,
  };
}
