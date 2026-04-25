import type { Messages } from "@/i18n";
import type {
  ProviderActionSelection,
  ProviderSessionActionResult,
  ProviderView,
  RecoveryBackupExportResponse,
  RecoveryResponse,
} from "@/shared/types";
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

export function getCapabilityLevelLabel(messages: Messages, level: string) {
  if (level === "full") return messages.routing.capabilityFull;
  if (level === "read-only") return messages.routing.capabilityReadonly;
  if (level === "unavailable") return messages.routing.capabilityUnavailable;
  return level;
}

function normalizeRoot(value: string) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function pathMatchesRoot(candidate: string, root: string) {
  const normalizedPath = String(candidate || "").trim();
  const normalizedRoot = normalizeRoot(root);
  if (!normalizedPath) return false;
  if (!normalizedRoot) return true;
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

function formatProviderMessage(template: string, replacements: Record<string, string | number>) {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
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
        ? messages.providers.resultReviewAffectedHint
        : messages.providers.resultPreviewOnlyHint,
      token: "",
      previewReady,
    };
  }

  let detail = messages.providers.resultBackupAppliedHint;
  if (result.action === "archive_local") {
    detail = messages.providers.resultArchiveAppliedHint;
  } else if (result.action === "unarchive_local") {
    detail = messages.providers.resultUnarchiveAppliedHint;
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
    action: "archive_local" | "unarchive_local" | "delete_local";
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
    {
      backup_before_delete: actionSelection.backup_before_delete,
      backup_root: actionSelection.backup_root,
    },
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
  recoveryData: RecoveryResponse | null;
  recoveryBackupExportData: RecoveryBackupExportResponse | null;
  backupRoot: string;
  exportRoot: string;
  latestExportArchivePath: string;
  selectedProviderFilePathsCount: number;
  selectedBackupEligibleFilePathsCount: number;
  selectedBackupSourceCount: number;
  selectedProviderIdsCount: number;
  providerActionProvider: string;
  providerDeleteBackupEnabled: boolean;
  hotspotScopeOrigin: ProviderView | null;
  slowOnly: boolean;
  canApplySlowOnly: boolean;
}) {
  const providerLabel =
    options.providerView === "all"
      ? options.messages.common.allAi
      : options.selectedProviderLabel ?? options.providerView;
  const configuredBackupRoot = String(options.backupRoot || "").trim();
  const configuredExportRoot = String(options.exportRoot || "").trim();
  const backupActionResult =
    options.providerActionData?.action === "backup_local" ? options.providerActionData : null;
  const sessionFileActionResult =
    options.providerActionData && options.providerActionData.action !== "backup_local"
      ? options.providerActionData
      : null;
  const effectiveBackupRoot =
    configuredBackupRoot ||
    String(options.recoveryData?.backup_root || "").trim() ||
    String(options.recoveryData?.default_backup_root || "").trim() ||
    options.messages.providers.backupDefaultRoot;
  const effectiveExportRoot =
    configuredExportRoot ||
    String(options.recoveryBackupExportData?.export_root || "").trim() ||
    String(options.recoveryData?.default_export_root || "").trim() ||
    options.messages.providers.exportDefaultRoot;
  const backupSets = Array.isArray(options.recoveryData?.backup_sets)
    ? options.recoveryData.backup_sets
    : [];
  const scopedBackupSets =
    options.providerView === "all"
      ? backupSets
      : backupSets.filter((set) =>
          set.path.includes(`/provider_actions/${options.providerView}/`),
        );
  const legacyBackupSets = Array.isArray(options.recoveryData?.legacy_backup_sets)
    ? options.recoveryData.legacy_backup_sets
    : [];
  const scopedLegacyBackupSets =
    options.providerView === "all"
      ? legacyBackupSets
      : legacyBackupSets.filter((set) =>
          set.path.includes(`/provider_actions/${options.providerView}/`),
        );
  const availableBackupSets =
    options.providerView === "all"
      ? options.recoveryData?.backup_total ??
        options.recoveryData?.summary?.backup_sets ??
        backupSets.length
      : scopedBackupSets.length;
  const latestBackupInventoryPath = scopedBackupSets[0]?.path ?? "";
  const latestBackupCandidate = backupActionResult?.backup_to ?? latestBackupInventoryPath;
  const latestBackupPath = pathMatchesRoot(latestBackupCandidate, effectiveBackupRoot)
    ? latestBackupCandidate || options.messages.providers.backupNoneYet
    : options.messages.providers.backupNoneYet;
  const latestExportCandidate =
    String(options.latestExportArchivePath || "").trim() ||
    String(options.recoveryBackupExportData?.archive_path || "").trim();
  const latestExportPath = pathMatchesRoot(latestExportCandidate, effectiveExportRoot)
    ? latestExportCandidate || options.messages.providers.exportNoneYet
    : options.messages.providers.exportNoneYet;
  const backupFolderHint =
    options.providerView === "all"
      ? options.messages.providers.backupFolderHelperAll.replace("{path}", effectiveBackupRoot)
      : options.messages.providers.backupFolderHelper
          .replace("{provider}", providerLabel)
          .replace("{path}", `${effectiveBackupRoot}/provider_actions/${options.providerView}`);
  const deleteBackupModeLabel = options.providerDeleteBackupEnabled
    ? options.messages.providers.deleteBackupModeOn
    : options.messages.providers.deleteBackupModeOff;
  const canRunProviderBackup =
    options.selectedBackupEligibleFilePathsCount > 0 &&
    (options.providerView !== "all" || options.selectedProviderIdsCount > 0);
  let backupSelectionHint =
    options.selectedBackupSourceCount > 0 &&
    options.selectedBackupEligibleFilePathsCount === 0
      ? options.messages.providers.backupSelectionSourceOnlyHint
      : options.selectedBackupSourceCount > 0
        ? formatProviderMessage(options.messages.providers.backupSelectionSourceSkippedHint, {
            count: options.selectedBackupSourceCount,
          })
        : "";
  if (
    options.providerView === "all" &&
    options.selectedBackupEligibleFilePathsCount > 0 &&
    options.selectedProviderIdsCount > 1
  ) {
    backupSelectionHint = formatProviderMessage(
      options.messages.providers.backupSelectionGroupedHint,
      {
        count: options.selectedProviderIdsCount,
      },
    );
  }
  const actionSelectionHint =
    options.selectedBackupSourceCount > 0 &&
    options.selectedBackupEligibleFilePathsCount === 0
      ? ""
      : options.selectedBackupSourceCount > 0
        ? formatProviderMessage(options.messages.providers.actionSelectionSourceSkippedHint, {
            count: options.selectedBackupSourceCount,
          })
        : "";
  const canReturnHotspotScope = Boolean(
    options.hotspotScopeOrigin && options.hotspotScopeOrigin !== options.providerView,
  );
  const slowFocusActive = options.canApplySlowOnly && options.slowOnly;
  const showProviderColumn = options.providerView === "all";

  return {
    providerLabel,
    backupActionResult,
    sessionFileActionResult,
    availableBackupSets,
    legacyBackupSets: scopedLegacyBackupSets,
    latestBackupPath,
    latestBackupFolder: effectiveBackupRoot,
    backupFolderHint,
    latestExportPath,
    exportFolder: effectiveExportRoot,
    deleteBackupModeLabel,
    canRunProviderBackup,
    backupSelectionHint,
    actionSelectionHint,
    selectedBackupEligibleFilePathsCount: options.selectedBackupEligibleFilePathsCount,
    canReturnHotspotScope,
    slowFocusActive,
    showProviderColumn,
  };
}
