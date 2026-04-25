import { normalizeDisplayValue } from "@/shared/lib/format";
import type { SessionDetailProps } from "@/features/providers/session/SessionDetail";
import { useSessionDetailActions } from "@/features/providers/session/useSessionDetailActions";
import { useSessionDetailDisplay } from "@/features/providers/session/useSessionDetailDisplay";

export function useSessionDetailModel(props: SessionDetailProps) {
  const {
    messages,
    providerDeleteBackupEnabled,
    runSingleProviderAction,
    runPreparedProviderAction,
    sessionActionSelection,
  } = props;
  const actionState = useSessionDetailActions(props);
  const display = useSessionDetailDisplay(props);

  const executeSessionAction = () => {
    if (!display.sessionScopedActionResult) return;
    if (
      display.sessionScopedActionResult.target_count > 1 &&
      sessionActionSelection &&
      runPreparedProviderAction
    ) {
      void runPreparedProviderAction(sessionActionSelection);
      return;
    }
    if (!display.selectedSession) return;
    runSingleProviderAction(
      display.selectedSession.provider,
      display.selectedSession.file_path,
      display.sessionScopedActionResult.action,
      false,
      display.sessionScopedActionResult.action === "delete_local"
        ? { backup_before_delete: providerDeleteBackupEnabled }
        : undefined,
    );
  };

  return {
    bodyRef: actionState.bodyRef,
    selectedSession: display.selectedSession,
    isElectronRuntime: actionState.isElectronRuntime,
    copyNotice: actionState.copyNotice,
    emptyTranscriptLabel: display.emptyTranscriptLabel,
    resolvedEmptyScopeLabel: display.resolvedEmptyScopeLabel,
    sessionDisplayTitle: display.sessionDisplayTitle,
    sessionFileName: display.sessionFileName,
    sessionCompactMeta: display.sessionCompactMeta,
    sourceLabel: display.sourceLabel,
    sessionActionSummary: display.sessionActionSummary,
    sessionActionCardClass: display.sessionActionCardClass,
    sessionActionCanExecute: display.sessionActionCanExecute,
    executeSessionActionLabel: display.executeSessionActionLabel,
    headerSubtitle: display.headerSubtitle,
    hardDeleteConfirmOpen: actionState.hardDeleteConfirmOpen,
    hardDeleteSkipConfirmChecked: actionState.hardDeleteSkipConfirmChecked,
    setHardDeleteSkipConfirmChecked: actionState.setHardDeleteSkipConfirmChecked,
    executeSessionAction,
    openHardDeleteConfirm: actionState.openHardDeleteConfirm,
    confirmHardDelete: actionState.confirmHardDelete,
    resetHardDeleteConfirm: actionState.resetHardDeleteConfirm,
    actions: {
      copyTitle: () =>
        actionState.actions.copyText(
          normalizeDisplayValue(display.selectedSession?.display_title) ||
            normalizeDisplayValue(display.selectedSession?.probe.detected_title) ||
            "",
          messages.sessionDetail.copyTitle,
        ),
      copyId: () =>
        actionState.actions.copyText(
          display.selectedSession?.session_id ?? "",
          messages.sessionDetail.copyId,
        ),
      copyPath: () =>
        actionState.actions.copyText(
          display.selectedSession?.file_path ?? "",
          messages.sessionDetail.copyPath,
        ),
      revealInFinder: actionState.actions.revealInFinder,
      openFile: actionState.actions.openFile,
      previewFile: actionState.actions.previewFile,
      openNewWindow: actionState.actions.openNewWindow,
      openFolder: actionState.actions.openFolder,
    },
  };
}
