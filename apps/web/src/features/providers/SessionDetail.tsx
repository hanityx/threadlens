import { useEffect, useRef, useState } from "react";
import { Button } from "../../design-system/Button";
import { PanelHeader } from "../../design-system/PanelHeader";
import type { Messages } from "../../i18n";
import type { ProviderSessionActionResult, ProviderSessionRow, TranscriptPayload } from "../../types";
import { formatDateTime, normalizeDisplayValue } from "../../lib/helpers";
import { TranscriptLog } from "../../design-system/TranscriptLog";
import { buildProviderSessionActionSummary } from "./providerPanelPresentationModel";
import { compactSessionFileName, compactSessionTitle, formatBytes } from "./helpers";
import { readStorageValue, writeStorageValue } from "../../hooks/appDataUtils";
import { apiPost } from "../../api";

const PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY = "po-provider-hard-delete-skip-confirm";
const LEGACY_PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY = "cmc-provider-hard-delete-skip-confirm";

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
  const [hardDeleteSkipConfirmPref, setHardDeleteSkipConfirmPref] = useState(() => {
    const raw = readStorageValue([
      PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY,
      LEGACY_PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY,
    ]);
    return raw === "true";
  });
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
    if ((sessionTranscriptData?.message_count ?? 0) === 0 && selectedSession.provider === "chatgpt") {
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
    if (!selectedSession || busy || !canRunSessionAction) return;
    if (hardDeleteSkipConfirmPref) {
      void runSingleProviderHardDelete(selectedSession.provider, selectedSession.file_path);
      return;
    }
    setHardDeleteSkipConfirmChecked(false);
    setHardDeleteConfirmOpen(true);
  };

  const confirmHardDelete = () => {
    if (!selectedSession || busy || !canRunSessionAction) return;
    writeStorageValue(
      PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY,
      hardDeleteSkipConfirmChecked ? "true" : "false",
    );
    setHardDeleteSkipConfirmPref(hardDeleteSkipConfirmChecked);
    setHardDeleteConfirmOpen(false);
    void runSingleProviderHardDelete(selectedSession.provider, selectedSession.file_path).finally(() => {
      setHardDeleteSkipConfirmChecked(false);
    });
  };

  return (
    <section className={`panel session-detail-panel ${!selectedSession ? "is-empty" : ""}`.trim()}>
      <PanelHeader title={messages.sessionDetail.title} subtitle={headerSubtitle} />
      <div ref={bodyRef} className="impact-body">
        {!selectedSession ? (
          <div className="session-detail-empty-state">
            {emptyNextSessions.length > 0 ? (
              <div className="session-detail-empty-grid">
                {emptyNextSessions.map((item, index) =>
                  item.path && onOpenSessionPath ? (
                    <button
                      key={`${item.path}-${index}`}
                      type="button"
                      className="session-detail-empty-next session-detail-empty-next-button"
                      onClick={() => onOpenSessionPath(item.path!)}
                    >
                      <strong>{item.title}</strong>
                      <p>{item.description || `${resolvedEmptyScopeLabel} ${messages.sessionDetail.emptyNextBody}`}</p>
                    </button>
                  ) : (
                    <div key={`${item.title}-${index}`} className="session-detail-empty-next">
                      <strong>{item.title}</strong>
                      <p>{item.description || `${resolvedEmptyScopeLabel} ${messages.sessionDetail.emptyNextBody}`}</p>
                    </div>
                  ),
                )}
              </div>
            ) : null}
            <p className="session-detail-empty-opens">
              <span className="overview-note-label">{messages.sessionDetail.emptyOpensHereLabel}</span>
              {messages.sessionDetail.emptyOpensHereBody}
            </p>
          </div>
        ) : (
          <>
            <section className="detail-hero detail-hero-session detail-hero-session-compact">
              <div className="detail-hero-copy">
                <span className="overview-note-label">{messages.sessionDetail.title}</span>
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
            {sessionActionSummary ? (
              <section className="provider-result-grid provider-result-grid-compact session-result-stage">
                <article className={sessionActionCardClass}>
                  <span className="overview-note-label">{messages.providers.actionResultTitle}</span>
                  <strong>{sessionActionSummary.headline}</strong>
                  <p>{sessionActionSummary.countSummary}</p>
                  <p>{sessionActionSummary.detail}</p>
                  {sessionActionSummary.token ? <code>{sessionActionSummary.token}</code> : null}
                  {sessionActionSummary.previewReady ? (
                    sessionActionCanExecute ? (
                      <div className="sub-toolbar provider-result-actions">
                        <Button
                          variant={sessionScopedActionResult?.action === "delete_local" ? "danger" : "base"}
                          onClick={executeSessionAction}
                          disabled={busy}
                        >
                          {executeSessionActionLabel}
                        </Button>
                      </div>
                    ) : (
                      <p className="sub-hint">{messages.providers.resultSelectionChangedHint}</p>
                    )
                  ) : null}
                </article>
              </section>
            ) : null}
            <div className="session-detail-top-grid">
              <details className="detail-section detail-section-actions">
                <summary>{messages.sessionDetail.sectionActions}</summary>
                <div className="detail-section-body">
                  <div className="chat-toolbar detail-action-bar detail-action-bar-compact session-copy-actions">
                    <Button
                      variant="outline"
                      onClick={() =>
                        copyText(
                          normalizeDisplayValue(selectedSession.display_title) ||
                            normalizeDisplayValue(selectedSession.probe.detected_title) ||
                            "",
                          messages.sessionDetail.copyTitle,
                        )
                      }
                    >
                      {messages.sessionDetail.copyTitle}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => copyText(selectedSession.session_id, messages.sessionDetail.copyId)}
                    >
                      {messages.sessionDetail.copyId}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => copyText(selectedSession.file_path, messages.sessionDetail.copyPath)}
                    >
                      {messages.sessionDetail.copyPath}
                    </Button>
                  </div>
                  {isElectronRuntime ? (
                    <div className="chat-toolbar detail-action-bar detail-action-bar-compact detail-action-bar-desktop session-desktop-actions">
                      <Button
                        variant="outline"
                        onClick={() => void runDesktopAction("reveal", messages.sessionDetail.revealInFinder)}
                      >
                        {messages.sessionDetail.revealInFinder}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void runDesktopAction("open", messages.sessionDetail.openFile)}
                      >
                        {messages.sessionDetail.openFile}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void runDesktopAction("preview", messages.sessionDetail.previewFile)}
                      >
                        {messages.sessionDetail.previewFile}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => void openDesktopWindow()}
                      >
                        {messages.sessionDetail.openInNewWindow}
                      </Button>
                    </div>
                  ) : null}
                {copyNotice ? <p className="sub-hint">{copyNotice}</p> : null}
                <div className="detail-actions-primary session-detail-actions-primary">
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={providerDeleteBackupEnabled}
                      onChange={(event) => setProviderDeleteBackupEnabled(event.target.checked)}
                    />
                      {messages.sessionDetail.deleteWithBackup}
                    </label>
                  <div className="chat-toolbar detail-action-bar session-manage-actions">
                    <Button
                      variant="outline"
                      onClick={() =>
                        runSingleProviderAction(
                          selectedSession.provider,
                          selectedSession.file_path,
                          "archive_local",
                          true,
                        )
                      }
                      disabled={busy || !canRunSessionAction}
                    >
                      {messages.sessionDetail.archiveDryRun}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        runSingleProviderAction(
                          selectedSession.provider,
                          selectedSession.file_path,
                          "delete_local",
                          true,
                          { backup_before_delete: providerDeleteBackupEnabled },
                        )
                      }
                      disabled={busy || !canRunSessionAction}
                    >
                      {messages.sessionDetail.deleteDryRun}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={openHardDeleteConfirm}
                      disabled={busy || !canRunSessionAction}
                    >
                      {messages.providers.delete}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void openCurrentFolder()}
                      disabled={!selectedSession}
                    >
                      {messages.sessionDetail.openFolder}
                    </Button>
                  </div>
                </div>
                {hardDeleteConfirmOpen ? (
                  <div className="provider-hard-delete-confirm session-hard-delete-confirm" role="dialog" aria-modal="true">
                    <div className="provider-hard-delete-confirm-card">
                      <span className="overview-note-label">{messages.providers.delete}</span>
                      <strong>{messages.providers.hardDeleteConfirmTitle}</strong>
                      <p>{messages.providers.hardDeleteConfirmBody}</p>
                      <label className="check-inline">
                        <input
                          type="checkbox"
                          checked={hardDeleteSkipConfirmChecked}
                          onChange={(event) => setHardDeleteSkipConfirmChecked(event.target.checked)}
                        />
                        {messages.providers.hardDeleteConfirmSkipFuture}
                      </label>
                      <div className="chat-toolbar detail-action-bar detail-action-bar-danger provider-hard-delete-confirm-actions">
                        <Button variant="outline" onClick={() => setHardDeleteConfirmOpen(false)}>
                          {messages.providers.hardDeleteConfirmCancel}
                        </Button>
                        <Button variant="danger" disabled={busy} onClick={confirmHardDelete}>
                          {messages.providers.hardDeleteConfirmExecute}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {!canRunSessionAction ? (
                  <p className="sub-hint">{messages.sessionDetail.readOnlyHint}</p>
                ) : null}
              </div>
              </details>
              <details className="detail-section session-detail-overview-section">
                <summary>{messages.sessionDetail.sectionOverview}</summary>
                <div className="detail-section-body">
                  <div className="session-overview-grid">
                    <div className="impact-kv session-overview-kv session-overview-kv-wide">
                      <span>{messages.sessionDetail.fieldTitle}</span>
                      <strong className="title-main">{sessionDisplayTitle || "-"}</strong>
                    </div>
                    <div className="impact-kv session-overview-kv">
                      <span>{messages.sessionDetail.fieldTitleSource}</span>
                      <strong>{normalizeDisplayValue(selectedSession.probe.title_source) || "-"}</strong>
                    </div>
                    <div className="impact-kv session-overview-kv">
                      <span>{messages.sessionDetail.fieldSource}</span>
                      <strong>{normalizeDisplayValue(selectedSession.source) || "-"}</strong>
                    </div>
                    <div className="impact-kv session-overview-kv session-overview-kv-wide">
                      <span>{messages.sessionDetail.fieldSessionId}</span>
                      <strong className="mono-sub">{selectedSession.session_id}</strong>
                    </div>
                    <div className="impact-kv session-overview-kv session-overview-kv-wide">
                      <span>{messages.sessionDetail.fieldPath}</span>
                      <strong className="mono-sub">{selectedSession.file_path}</strong>
                    </div>
                    <div className="impact-kv session-overview-kv">
                      <span>{messages.sessionDetail.fieldSize}</span>
                      <strong>{formatBytes(selectedSession.size_bytes)}</strong>
                    </div>
                    <div className="impact-kv session-overview-kv">
                      <span>{messages.sessionDetail.fieldModified}</span>
                      <strong>{formatDateTime(selectedSession.mtime)}</strong>
                    </div>
                  </div>
                </div>
              </details>
            </div>
            <details className="detail-section detail-section-transcript" open>
              <summary>{messages.sessionDetail.sectionTranscript}</summary>
              <div className="detail-section-body">
                <TranscriptLog
                  messages={messages}
                  transcript={sessionTranscriptData?.messages ?? []}
                  loading={sessionTranscriptLoading}
                  truncated={sessionTranscriptData?.truncated ?? false}
                  messageCount={sessionTranscriptData?.message_count ?? 0}
                  limit={sessionTranscriptLimit}
                  initialVisibleCount={16}
                  visibleStep={16}
                  maxLimit={10_000}
                  emptyLabel={emptyTranscriptLabel}
                  onLoadMore={() => setSessionTranscriptLimit((prev) => Math.min(prev + 120, 10_000))}
                  onLoadFullSource={() => setSessionTranscriptLimit(10_000)}
                />
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
