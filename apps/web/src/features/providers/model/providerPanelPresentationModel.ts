import type { Messages } from "@/i18n";
import type { ProviderActionSelection, ProviderSessionActionResult, ProviderView, RecoveryBackupExportResponse } from "@/shared/types";
import { providerActionSelectionKey } from "@/shared/lib/appState";

type ProviderFlowState = "done" | "pending" | "blocked";
export type ProviderWorkflowStage = {
  label: string;
  className: "status-active" | "status-missing" | "status-preview";
};

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
  action: ProviderSessionActionResult["action"],
) {
  if (action === "backup_local") return messages.providers.actionBackupLocal;
  if (action === "archive_local") return messages.providers.actionArchiveLocal;
  if (action === "unarchive_local") return messages.providers.actionUnarchiveLocal;
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

export function getProviderWorkflowStage(
  messages: Messages,
  options: {
    action: "archive_local" | "delete_local";
    actionResult: ProviderSessionActionResult | null;
    actionSelection: ProviderActionSelection | null;
    currentSelectionKey: string;
  },
): ProviderWorkflowStage {
  const { action, actionResult, actionSelection, currentSelectionKey } = options;
  const pendingStage: ProviderWorkflowStage = {
    label: messages.forensics.stagePending,
    className: "status-preview",
  };

  if (!actionResult || actionResult.action !== action || !actionSelection || actionSelection.action !== action) {
    return pendingStage;
  }

  const previewSelectionKey = providerActionSelectionKey(
    actionSelection.provider,
    actionSelection.action,
    actionSelection.file_paths,
    { backup_before_delete: actionSelection.backup_before_delete },
  );

  if (!currentSelectionKey || previewSelectionKey !== currentSelectionKey) {
    return pendingStage;
  }

  if (actionResult.applied_count > 0) {
    return {
      label: messages.providers.resultApplied,
      className: "status-active",
    };
  }

  if (actionResult.dry_run || String(actionResult.confirm_token_expected ?? "").trim()) {
    return {
      label: messages.forensics.stageReady,
      className: "status-active",
    };
  }

  return pendingStage;
}

export function buildProviderPanelPresentationModel(options: {
  messages: Messages;
  providerView: ProviderView;
  selectedProviderLabel: string | null;
  providerActionData: ProviderSessionActionResult | null;
  recoveryBackupExportData: RecoveryBackupExportResponse | null;
  selectedProviderFilePathsCount: number;
  providerActionProvider: string;
  providerDeleteBackupEnabled: boolean;
  hotspotScopeOrigin: ProviderView | null;
  slowOnly: boolean;
  canApplySlowOnly: boolean;
}) {
  const formatProviderMessage = (template: string, replacements: Record<string, string | number>) =>
    Object.entries(replacements).reduce(
      (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
      template,
    );
  const providerLabel =
    options.providerView === "all"
      ? options.messages.common.allAi
      : options.selectedProviderLabel ?? options.providerView;
  const backupActionResult =
    options.providerActionData?.action === "backup_local" ? options.providerActionData : null;
  const sessionFileActionResult =
    options.providerActionData && options.providerActionData.action !== "backup_local"
      ? options.providerActionData
      : null;
  const latestBackupCount =
    backupActionResult?.backed_up_count ?? (backupActionResult?.backup_to ? 1 : 0);
  const latestBackupPath =
    backupActionResult?.backup_to ?? options.messages.providers.backupNoneYet;
  const latestExportCount = options.recoveryBackupExportData?.exported_count ?? 0;
  const backupFlowHint =
    options.selectedProviderFilePathsCount > 0
      ? formatProviderMessage(options.messages.providers.backupFlowHintSelected, {
          count: options.selectedProviderFilePathsCount,
        })
      : options.messages.providers.backupFlowHintEmpty;
  const deleteBackupModeLabel = options.providerDeleteBackupEnabled
    ? options.messages.providers.deleteBackupModeOn
    : options.messages.providers.deleteBackupModeOff;
  const canRunProviderBackup =
    Boolean(options.providerActionProvider) && options.selectedProviderFilePathsCount > 0;
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
