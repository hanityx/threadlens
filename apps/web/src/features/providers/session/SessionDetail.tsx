import { useEffect, useRef, useState } from "react";
import { findProviderCapability } from "@threadlens/shared-contracts";
import { formatBytes } from "@/shared/lib/format";
import { PanelHeader } from "@/shared/ui/components/PanelHeader";
import type { Messages } from "@/i18n";
import type { ProviderSessionActionResult, ProviderSessionRow, TranscriptPayload } from "@/shared/types";
import { formatDateTime, normalizeDisplayValue } from "@/shared/lib/format";
import { buildProviderSessionActionSummary } from "@/features/providers/model/providerPanelPresentationModel";
import { compactSessionFileName, compactSessionTitle } from "@/features/providers/lib/helpers";
import { apiPost } from "@/api";
import {
  buildHardDeleteConfirmRequestState,
  buildHardDeleteConfirmResolvedState,
  readProviderHardDeleteSkipConfirmPref,
  writeProviderHardDeleteSkipConfirmPref,
} from "@/features/providers/model/hardDeleteConfirmModel";
import { SessionActionSection } from "@/features/providers/session/SessionActionSection";
import { SessionEmptyState } from "@/features/providers/session/SessionEmptyState";
import { SessionMetaCard } from "@/features/providers/session/SessionMetaCard";
import { SessionTranscriptPane } from "@/features/providers/session/SessionTranscriptPane";

export interface SessionDetailProps {
  messages: Messages;
  selectedSession: ProviderSessionRow | null;
  selectedCount?: number;
  sessionActionResult?: ProviderSessionActionResult | null;
  emptyScopeLabel?: string;
  emptyNextSessions?: Array<{
    title: string;
    path?: string;
    description?: string;
  }>;
  onOpenSessionPath?: (path: string) => void;
  sessionTranscriptData: TranscriptPayload | null;
  sessionTranscriptLoading: boolean;
  sessionTranscriptLimit: number;
  setSessionTranscriptLimit: React.Dispatch<React.SetStateAction<number>>;
  busy: boolean;
  canRunSessionAction: boolean;
  providerDeleteBackupEnabled: boolean;
  setProviderDeleteBackupEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  runSingleProviderAction: (
    provider: string,
    filePath: string,
    action: "backup_local" | "archive_local" | "delete_local",
    dryRun: boolean,
    options?: { backup_before_delete?: boolean },
  ) => void;
  runSingleProviderHardDelete: (provider: string, filePath: string) => Promise<ProviderSessionActionResult | null>;
}

export function SessionDetail(props: SessionDetailProps) {
  const {
    messages,
    selectedSession,
    selectedCount = 0,
    sessionActionResult = null,
    emptyScopeLabel,
    emptyNextSessions = [],
    onOpenSessionPath,
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    setSessionTranscriptLimit,
    busy,
    canRunSessionAction,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
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
    if (!selectedSession) {
      return;
    }

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
    ? `${normalizeDisplayValue(selectedSession.source) || selectedSession.provider} · ${formatDateTime(selectedSession.mtime)}`
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

  return (
    <section className={`panel session-detail-panel ${!selectedSession ? "is-empty" : ""}`.trim()}>
      <PanelHeader title={messages.sessionDetail.title} subtitle={headerSubtitle} />
      <div ref={bodyRef} className="impact-body">
        {!selectedSession ? (
          <SessionEmptyState
            messages={messages}
            emptyNextSessions={emptyNextSessions}
            emptyScopeLabel={resolvedEmptyScopeLabel}
            onOpenSessionPath={onOpenSessionPath}
          />
        ) : (
          <>
            <section className="detail-hero detail-hero-session detail-hero-session-compact">
              <div className="detail-hero-copy">
                <strong>{sessionDisplayTitle}</strong>
                <p>{sessionCompactMeta}</p>
              </div>
              <div className="detail-hero-pills" aria-label="session detail summary">
                <span className="detail-hero-pill">{selectedSession.provider}</span>
                {normalizeDisplayValue(selectedSession.source) ? (
                  <span className="detail-hero-pill">{normalizeDisplayValue(selectedSession.source)}</span>
                ) : null}
                {sessionFileName ? (
                  <button
                    type="button"
                    className={`detail-hero-pill detail-hero-pill-button ${showFullSessionFileName ? "is-expanded" : ""}`.trim()}
                    aria-expanded={showFullSessionFileName}
                    title={sessionFileName}
                    onClick={() => setShowFullSessionFileName((value) => !value)}
                  >
                    {sessionDisplayFileName}
                  </button>
                ) : null}
              </div>
            </section>
            <SessionActionSection
              messages={messages}
              selectedSession={selectedSession}
              sessionActionSummary={sessionActionSummary}
              sessionActionCardClass={sessionActionCardClass}
              sessionActionCanExecute={sessionActionCanExecute}
              executeSessionActionLabel={executeSessionActionLabel}
              busy={busy}
              executeSessionAction={executeSessionAction}
              isElectronRuntime={isElectronRuntime}
              copyNotice={copyNotice}
              onCopyTitle={() =>
                copyText(
                  normalizeDisplayValue(selectedSession.display_title) ||
                    normalizeDisplayValue(selectedSession.probe.detected_title) ||
                    "",
                  messages.sessionDetail.copyTitle,
                )
              }
              onCopyId={() => copyText(selectedSession.session_id, messages.sessionDetail.copyId)}
              onCopyPath={() => copyText(selectedSession.file_path, messages.sessionDetail.copyPath)}
              onRevealInFinder={() => void runDesktopAction("reveal", messages.sessionDetail.revealInFinder)}
              onOpenFile={() => void runDesktopAction("open", messages.sessionDetail.openFile)}
              onPreviewFile={() => void runDesktopAction("preview", messages.sessionDetail.previewFile)}
              onOpenNewWindow={() => void openDesktopWindow()}
              providerDeleteBackupEnabled={providerDeleteBackupEnabled}
              setProviderDeleteBackupEnabled={setProviderDeleteBackupEnabled}
              onRunArchiveDryRun={() =>
                runSingleProviderAction(
                  selectedSession.provider,
                  selectedSession.file_path,
                  "archive_local",
                  true,
                )
              }
              onRunDeleteDryRun={() =>
                runSingleProviderAction(
                  selectedSession.provider,
                  selectedSession.file_path,
                  "delete_local",
                  true,
                  { backup_before_delete: providerDeleteBackupEnabled },
                )
              }
              onRequestHardDeleteConfirm={openHardDeleteConfirm}
              onOpenFolder={() => void openCurrentFolder()}
              canRunSessionAction={canRunSessionAction}
              hardDeleteConfirmOpen={hardDeleteConfirmOpen}
              hardDeleteSkipConfirmChecked={hardDeleteSkipConfirmChecked}
              onToggleHardDeleteSkipConfirmChecked={setHardDeleteSkipConfirmChecked}
              onCancelHardDeleteConfirm={() => {
                const next = buildHardDeleteConfirmResolvedState(hardDeleteSkipConfirmPref);
                setHardDeleteConfirmOpen(next.confirmOpen);
                setHardDeleteSkipConfirmChecked(next.skipConfirmChecked);
              }}
              onConfirmHardDelete={confirmHardDelete}
            />
            <SessionMetaCard
              messages={messages}
              session={selectedSession}
              title={sessionDisplayTitle}
              formatBytes={formatBytes}
              formatDateTime={formatDateTime}
              normalizeDisplayValue={normalizeDisplayValue}
            />
            <SessionTranscriptPane
              messages={messages}
              sessionTranscriptData={sessionTranscriptData}
              sessionTranscriptLoading={sessionTranscriptLoading}
              sessionTranscriptLimit={sessionTranscriptLimit}
              emptyTranscriptLabel={emptyTranscriptLabel}
              setSessionTranscriptLimit={setSessionTranscriptLimit}
            />
          </>
        )}
      </div>
    </section>
  );
}
