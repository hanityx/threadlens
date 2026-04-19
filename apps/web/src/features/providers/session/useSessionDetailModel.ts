import { useEffect, useRef, useState } from "react";
import { findProviderCapability } from "@threadlens/shared-contracts";
import { apiPost } from "@/api";
import {
  buildHardDeleteConfirmRequestState,
  buildHardDeleteConfirmResolvedState,
  readProviderHardDeleteSkipConfirmPref,
  writeProviderHardDeleteSkipConfirmPref,
} from "@/features/providers/model/hardDeleteConfirmModel";
import { buildProviderSessionActionSummary } from "@/features/providers/model/providerPanelPresentationModel";
import { compactSessionFileName, compactSessionTitle } from "@/features/providers/lib/helpers";
import type { SessionDetailProps } from "@/features/providers/session/SessionDetail";
import { formatDateTime, normalizeDisplayValue } from "@/shared/lib/format";

export function useSessionDetailModel(props: SessionDetailProps) {
  const {
    messages,
    selectedSession,
    selectedCount = 0,
    sessionActionResult = null,
    emptyScopeLabel,
    sessionTranscriptData,
    busy,
    canRunSessionAction,
    providerDeleteBackupEnabled,
    runSingleProviderAction,
    runSingleProviderHardDelete,
  } = props;
  const [copyNotice, setCopyNotice] = useState("");
  const [hardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState(false);
  const [showFullSessionFileName, setShowFullSessionFileName] = useState(false);
  const [hardDeleteSkipConfirmChecked, setHardDeleteSkipConfirmChecked] = useState(false);
  const [hardDeleteSkipConfirmPref, setHardDeleteSkipConfirmPref] = useState(
    readProviderHardDeleteSkipConfirmPref,
  );
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const desktopBridge =
    typeof window !== "undefined" ? window.threadLensDesktop : undefined;
  const isElectronRuntime = desktopBridge?.runtime === "electron";
  const resolvedEmptyScopeLabel = emptyScopeLabel || messages.common.allAi;

  const formatSessionDetailMessage = (
    template: string,
    values: Record<string, string | number>,
  ) =>
    Object.entries(values).reduce(
      (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
      template,
    );

  useEffect(() => {
    if (!copyNotice) return;
    const timer = window.setTimeout(() => setCopyNotice(""), 1400);
    return () => window.clearTimeout(timer);
  }, [copyNotice]);

  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = 0;
  }, [selectedSession?.file_path]);

  useEffect(() => {
    setShowFullSessionFileName(false);
  }, [selectedSession?.file_path]);

  const copyText = async (text: string, label: string) => {
    const value = String(text ?? "").trim();
    if (!value) return;
    try {
      if (window?.navigator?.clipboard?.writeText) {
        await window.navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement("textarea");
        input.value = value;
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopyNotice(`${label} ${messages.sessionDetail.copied}`);
    } catch {
      setCopyNotice(`${messages.errors.providerAction}`);
    }
  };

  const runDesktopAction = async (
    action: "reveal" | "open" | "preview",
    label: string,
  ) => {
    if (!selectedSession || !desktopBridge) return;

    const actionMap = {
      reveal: desktopBridge.revealPath,
      open: desktopBridge.openPath,
      preview: desktopBridge.previewPath,
    } as const;
    const handler = actionMap[action];

    if (!handler) {
      setCopyNotice(messages.sessionDetail.desktopUnavailable);
      return;
    }

    const result = await handler(selectedSession.file_path);
    if (!result?.ok) {
      setCopyNotice(result?.error || messages.sessionDetail.desktopUnavailable);
      return;
    }

    if (action === "reveal") {
      setCopyNotice(messages.sessionDetail.revealSuccess);
      return;
    }
    if (action === "preview") {
      setCopyNotice(messages.sessionDetail.previewSuccess);
      return;
    }
    setCopyNotice(`${label} ${messages.sessionDetail.desktopActionReady}`);
  };

  const openDesktopWindow = async () => {
    if (!selectedSession || !desktopBridge?.openWorkbenchWindow) {
      setCopyNotice(messages.sessionDetail.desktopUnavailable);
      return;
    }

    const result = await desktopBridge.openWorkbenchWindow({
      view: "providers",
      provider: selectedSession.provider,
      filePath: selectedSession.file_path,
    });

    if (!result?.ok) {
      setCopyNotice(result?.error || messages.sessionDetail.desktopUnavailable);
      return;
    }

    setCopyNotice(messages.sessionDetail.newWindowSuccess);
  };

  const openCurrentFolder = async () => {
    if (!selectedSession) return;

    const folderPath =
      selectedSession.file_path.replace(/[\\/][^\\/]+$/, "") || selectedSession.file_path;

    try {
      if (desktopBridge?.openPath) {
        const result = await desktopBridge.openPath(folderPath);
        if (!result?.ok) {
          setCopyNotice(result?.error || messages.sessionDetail.desktopUnavailable);
          return;
        }
      } else {
        await apiPost("/api/provider-open-folder", {
          provider: selectedSession.provider,
          file_path: selectedSession.file_path,
        });
      }
      setCopyNotice(messages.sessionDetail.openFolderSuccess);
    } catch (error) {
      setCopyNotice(error instanceof Error ? error.message : messages.sessionDetail.desktopUnavailable);
    }
  };

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
  const sessionDisplayFileName = showFullSessionFileName
    ? sessionFileName
    : compactSessionFileName(sessionFileName);
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
  const executeSessionAction = () => {
    if (!selectedSession || !sessionScopedActionResult) return;
    runSingleProviderAction(
      selectedSession.provider,
      selectedSession.file_path,
      sessionScopedActionResult.action,
      false,
      sessionScopedActionResult.action === "delete_local"
        ? { backup_before_delete: providerDeleteBackupEnabled }
        : undefined,
    );
  };
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
    ? formatSessionDetailMessage(
        headerSelectionCount === 1
          ? messages.sessionDetail.selectedRow
          : messages.sessionDetail.selectedRows,
        { count: headerSelectionCount },
      )
    : messages.sessionDetail.emptyStateBody;

  const openHardDeleteConfirm = () => {
    const next = buildHardDeleteConfirmRequestState({
      enabled: Boolean(selectedSession && !busy && canRunSessionAction),
      skipConfirmPref: hardDeleteSkipConfirmPref,
    });
    if (!selectedSession) return;
    if (next.shouldRunImmediately) {
      void runSingleProviderHardDelete(selectedSession.provider, selectedSession.file_path);
      return;
    }
    setHardDeleteSkipConfirmChecked(next.skipConfirmChecked);
    setHardDeleteConfirmOpen(next.confirmOpen);
  };

  const confirmHardDelete = () => {
    if (!selectedSession || busy || !canRunSessionAction) return;
    writeProviderHardDeleteSkipConfirmPref(hardDeleteSkipConfirmChecked);
    const next = buildHardDeleteConfirmResolvedState(hardDeleteSkipConfirmChecked);
    setHardDeleteSkipConfirmPref(next.skipConfirmPref);
    setHardDeleteConfirmOpen(next.confirmOpen);
    void runSingleProviderHardDelete(selectedSession.provider, selectedSession.file_path).finally(() => {
      setHardDeleteSkipConfirmChecked(next.skipConfirmChecked);
    });
  };

  const resetHardDeleteConfirm = () => {
    const next = buildHardDeleteConfirmResolvedState(hardDeleteSkipConfirmPref);
    setHardDeleteConfirmOpen(next.confirmOpen);
    setHardDeleteSkipConfirmChecked(next.skipConfirmChecked);
  };

  return {
    bodyRef,
    selectedSession,
    isElectronRuntime,
    copyNotice,
    emptyTranscriptLabel,
    resolvedEmptyScopeLabel,
    sessionDisplayTitle,
    sessionFileName,
    sessionDisplayFileName,
    sessionCompactMeta,
    sourceLabel,
    showFullSessionFileName,
    setShowFullSessionFileName,
    sessionActionSummary,
    sessionActionCardClass,
    sessionActionCanExecute,
    executeSessionActionLabel,
    headerSubtitle,
    hardDeleteConfirmOpen,
    hardDeleteSkipConfirmChecked,
    setHardDeleteSkipConfirmChecked,
    executeSessionAction,
    openHardDeleteConfirm,
    confirmHardDelete,
    resetHardDeleteConfirm,
    actions: {
      copyTitle: () =>
        copyText(
          normalizeDisplayValue(selectedSession?.display_title) ||
            normalizeDisplayValue(selectedSession?.probe.detected_title) ||
            "",
          messages.sessionDetail.copyTitle,
        ),
      copyId: () => copyText(selectedSession?.session_id ?? "", messages.sessionDetail.copyId),
      copyPath: () => copyText(selectedSession?.file_path ?? "", messages.sessionDetail.copyPath),
      revealInFinder: () => void runDesktopAction("reveal", messages.sessionDetail.revealInFinder),
      openFile: () => void runDesktopAction("open", messages.sessionDetail.openFile),
      previewFile: () => void runDesktopAction("preview", messages.sessionDetail.previewFile),
      openNewWindow: () => void openDesktopWindow(),
      openFolder: () => void openCurrentFolder(),
    },
  };
}
