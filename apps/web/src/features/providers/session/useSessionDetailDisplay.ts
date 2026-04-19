import { findProviderCapability } from "@threadlens/shared-contracts";
import { buildProviderSessionActionSummary } from "@/features/providers/model/providerPanelPresentationModel";
import { compactSessionTitle } from "@/features/providers/lib/helpers";
import type { SessionDetailProps } from "@/features/providers/session/SessionDetail";
import { formatDateTime, normalizeDisplayValue } from "@/shared/lib/format";

export function useSessionDetailDisplay(props: SessionDetailProps) {
  const {
    messages,
    selectedSession,
    selectedCount = 0,
    sessionActionResult = null,
    emptyScopeLabel,
    sessionTranscriptData,
    canRunSessionAction,
    providerDeleteBackupEnabled,
  } = props;
  const resolvedEmptyScopeLabel = emptyScopeLabel || messages.common.allAi;
  const emptyTranscriptLabel = (() => {
    if (!selectedSession) return messages.sessionDetail.emptyTranscript;
    const capability = findProviderCapability(selectedSession.provider);
    if ((sessionTranscriptData?.message_count ?? 0) === 0 && capability && !capability.read_transcript) {
      return messages.sessionDetail.emptyTranscriptChatGptDesktopCache;
    }
    if (
      (sessionTranscriptData?.message_count ?? 0) === 0 &&
      selectedSession.provider === "copilot" &&
      selectedSession.probe.format === "json"
    ) {
      return messages.sessionDetail.emptyTranscriptCopilotJson;
    }
    if (selectedSession.probe.format === "unknown") {
      return messages.sessionDetail.emptyTranscriptUnsupportedFormat;
    }
    if (selectedSession.file_path.endsWith(".metadata.json")) {
      return messages.sessionDetail.emptyTranscriptMetadataJson;
    }
    return messages.sessionDetail.emptyTranscript;
  })();
  const derivedSessionToken =
    selectedSession?.file_path.match(/[0-9a-f]{8}-[0-9a-f-]{9,}/i)?.[0] ?? "";
  const fallbackSessionTitle = derivedSessionToken
    ? `session ${derivedSessionToken.slice(0, 8)}`
    : messages.threadDetail.unknownTitle;
  const sourceLabel = normalizeDisplayValue(selectedSession?.source);
  const sessionDisplayTitle = compactSessionTitle(
    normalizeDisplayValue(selectedSession?.display_title) ||
      normalizeDisplayValue(selectedSession?.probe.detected_title) ||
      fallbackSessionTitle,
    selectedSession?.session_id,
  );
  const sessionFileName = selectedSession
    ? selectedSession.file_path.split(/[\\/]/).pop() || selectedSession.file_path
    : "";
  const sessionCompactMeta = selectedSession
    ? `${sourceLabel || selectedSession.provider} · ${formatDateTime(selectedSession.mtime)}`
    : "";
  const sessionScopedActionResult =
    sessionActionResult && sessionActionResult.target_count === 1
      ? sessionActionResult
      : null;
  const sessionActionSummary = buildProviderSessionActionSummary(messages, sessionScopedActionResult);
  const sessionActionCanExecute = Boolean(
    selectedSession &&
      sessionActionSummary?.previewReady &&
      canRunSessionAction &&
      (sessionScopedActionResult?.action !== "delete_local" ||
        providerDeleteBackupEnabled === Boolean(sessionScopedActionResult.backup_before_delete)),
  );
  const executeSessionActionLabel =
    sessionScopedActionResult
      ? `${messages.providers.executeActionPrefix} ${
          sessionScopedActionResult.action === "backup_local"
            ? messages.providers.actionBackupLocal
            : sessionScopedActionResult.action === "archive_local"
              ? messages.providers.actionArchiveLocal
              : messages.providers.actionDeleteLocal
        }`
      : "";
  const sessionActionCardClass = [
    "provider-result-card",
    sessionActionSummary?.previewReady ? "provider-result-card-selected" : "provider-result-card-export",
  ].join(" ");
  const headerSelectionCount = selectedCount > 0 ? selectedCount : selectedSession ? 1 : 0;
  const headerSubtitle = headerSelectionCount
    ? Object.entries({
        count: headerSelectionCount,
      }).reduce(
        (message, [key, value]) =>
          message.replaceAll(`{${key}}`, String(value)),
        headerSelectionCount === 1
          ? messages.sessionDetail.selectedRow
          : messages.sessionDetail.selectedRows,
      )
    : messages.sessionDetail.emptyStateBody;

  return {
    selectedSession,
    resolvedEmptyScopeLabel,
    emptyTranscriptLabel,
    sessionDisplayTitle,
    sessionFileName,
    sessionCompactMeta,
    sourceLabel,
    sessionScopedActionResult,
    sessionActionSummary,
    sessionActionCanExecute,
    executeSessionActionLabel,
    sessionActionCardClass,
    headerSubtitle,
  };
}
