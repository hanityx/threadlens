import { useEffect, useRef, useState } from "react";
import type { Messages } from "../i18n";
import type { ProviderSessionRow, TranscriptPayload } from "../types";
import { formatDateTime, formatInteger, normalizeDisplayValue } from "../lib/helpers";
import { TranscriptLog } from "./TranscriptLog";

export interface SessionDetailProps {
  messages: Messages;
  selectedSession: ProviderSessionRow | null;
  emptyScopeLabel?: string;
  emptyScopeRows?: number;
  emptyScopeReady?: number;
  emptyNextSessionTitle?: string;
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
}

export function SessionDetail(props: SessionDetailProps) {
  const {
    messages,
    selectedSession,
    emptyScopeLabel = "All ai",
    emptyScopeRows = 0,
    emptyScopeReady = 0,
    emptyNextSessionTitle = "",
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    setSessionTranscriptLimit,
    busy,
    canRunSessionAction,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    runSingleProviderAction,
  } = props;
  const [copyNotice, setCopyNotice] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const desktopBridge =
    typeof window !== "undefined" ? window.threadLensDesktop : undefined;
  const isElectronRuntime = desktopBridge?.runtime === "electron";

  useEffect(() => {
    if (!copyNotice) return;
    const timer = window.setTimeout(() => setCopyNotice(""), 1400);
    return () => window.clearTimeout(timer);
  }, [copyNotice]);

  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = 0;
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

  const emptyTranscriptLabel = (() => {
    if (!selectedSession) return messages.sessionDetail.emptyTranscript;
    if ((sessionTranscriptData?.message_count ?? 0) === 0 && selectedSession.provider === "chatgpt") {
      return "ChatGPT desktop cache does not open transcript directly.";
    }
    if (
      (sessionTranscriptData?.message_count ?? 0) === 0 &&
      selectedSession.provider === "copilot" &&
      selectedSession.probe.format === "json"
    ) {
      return "This Copilot JSON is empty. Open another workspace chat row.";
    }
    if (selectedSession.probe.format === "unknown") {
      return "This format does not open transcript directly yet.";
    }
    if (selectedSession.file_path.endsWith(".metadata.json")) {
      return "This is metadata. Pick the real chatSessions JSON row.";
    }
    return messages.sessionDetail.emptyTranscript;
  })();
  const compactToken = (value: string) =>
    value && value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
  const derivedSessionToken =
    selectedSession?.file_path.match(/[0-9a-f]{8}-[0-9a-f-]{9,}/i)?.[0] ?? "";
  const fallbackSessionTitle = derivedSessionToken
    ? `session ${derivedSessionToken.slice(0, 8)}`
    : messages.threadDetail.unknownTitle;
  const sessionDisplayTitle =
    normalizeDisplayValue(selectedSession?.display_title) ||
    normalizeDisplayValue(selectedSession?.probe.detected_title) ||
    fallbackSessionTitle;
  const sessionProbeLabel = selectedSession
    ? `${selectedSession.probe.format} / ${selectedSession.probe.ok ? messages.common.ok : messages.common.fail}`
    : "";
  const sessionHeaderMeta = selectedSession
    ? normalizeDisplayValue(selectedSession.source) || selectedSession.provider
    : emptyScopeLabel;
  const sessionCompactMeta = selectedSession
    ? `${normalizeDisplayValue(selectedSession.source) || selectedSession.provider} · ${formatDateTime(selectedSession.mtime)}`
    : "";

  return (
    <section className={`panel session-detail-panel ${!selectedSession ? "is-empty" : ""}`.trim()}>
      <header>
        <h2>{messages.sessionDetail.title}</h2>
        <span>{sessionHeaderMeta}</span>
      </header>
      <div ref={bodyRef} className="impact-body">
        {!selectedSession ? (
          <div className="session-detail-empty-state">
            <div className="session-detail-empty-copy">
              <span className="overview-note-label">{messages.sessionDetail.title}</span>
              <strong>Select next.</strong>
              <p>View transcript and manage session.</p>
            </div>
            <div className="session-detail-empty-summary" aria-label="session detail scope">
              <article>
                <span>scope</span>
                <strong>{emptyScopeLabel}</strong>
              </article>
              <article>
                <span>rows</span>
                <strong>{formatInteger(emptyScopeRows)}</strong>
              </article>
              <article>
                <span>ready</span>
                <strong>{formatInteger(emptyScopeReady)}</strong>
              </article>
            </div>
            {emptyNextSessionTitle ? (
              <div className="session-detail-empty-next">
                <span className="overview-note-label">next session</span>
                <strong>{emptyNextSessionTitle}</strong>
                <p>open from recent rows or archive</p>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <section className="detail-hero detail-hero-session detail-hero-session-compact">
              <div className="detail-hero-copy">
                <strong>{sessionDisplayTitle}</strong>
                <p>{sessionCompactMeta}</p>
              </div>
              <div className="detail-hero-pills" aria-label="session detail summary">
                <span className="detail-hero-pill">{selectedSession.provider}</span>
                {derivedSessionToken ? <span className="detail-hero-pill mono-sub">{compactToken(derivedSessionToken)}</span> : null}
                <span className="detail-hero-pill">{sessionProbeLabel}</span>
              </div>
            </section>
            {isElectronRuntime ? (
              <section className="detail-section detail-section-desktop-quick-actions detail-section-static">
                <div className="detail-section-static-head">{messages.sessionDetail.desktopQuickActions}</div>
                <div className="detail-section-body">
                  <div className="chat-toolbar detail-action-bar detail-action-bar-compact detail-action-bar-desktop">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void runDesktopAction("reveal", messages.sessionDetail.revealInFinder)}
                    >
                      {messages.sessionDetail.revealInFinder}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void runDesktopAction("preview", messages.sessionDetail.previewFile)}
                    >
                      {messages.sessionDetail.previewFile}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void openDesktopWindow()}
                    >
                      {messages.sessionDetail.openInNewWindow}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
            <section className="detail-section detail-section-transcript detail-section-static">
              <div className="detail-section-static-head">{messages.sessionDetail.sectionTranscript}</div>
              <div className="detail-section-body">
                <TranscriptLog
                  messages={messages}
                  transcript={sessionTranscriptData?.messages ?? []}
                  loading={sessionTranscriptLoading}
                  truncated={sessionTranscriptData?.truncated ?? false}
                  messageCount={sessionTranscriptData?.message_count ?? 0}
                  limit={sessionTranscriptLimit}
                  maxLimit={10_000}
                  initialVisibleCount={10}
                  visibleStep={10}
                  emptyLabel={emptyTranscriptLabel}
                  onLoadMore={() => setSessionTranscriptLimit((prev) => Math.min(prev + 120, 10_000))}
                />
              </div>
            </section>
            <div className="session-detail-top-grid">
              <details className="detail-section">
                <summary>{messages.sessionDetail.sectionOverview}</summary>
                <div className="detail-section-body">
                <div className="info-box compact">
                  <strong>{messages.sessionDetail.modelTitle}</strong>
                  <p>{selectedSession.provider}</p>
                </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldTitle}</span>
                    <strong className="title-main">
                      {sessionDisplayTitle || "-"}
                    </strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldTitleSource}</span>
                    <strong>{normalizeDisplayValue(selectedSession.probe.title_source) || "-"}</strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldSessionId}</span>
                    <strong className="mono-sub">{selectedSession.session_id}</strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldProvider}</span>
                    <strong>{selectedSession.provider}</strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldSource}</span>
                    <strong>{normalizeDisplayValue(selectedSession.source) || "-"}</strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldFormatProbe}</span>
                    <strong>
                      {selectedSession.probe.format} / {selectedSession.probe.ok ? messages.common.ok : messages.common.fail}
                    </strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldSize}</span>
                    <strong>{formatInteger(selectedSession.size_bytes)}</strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldModified}</span>
                    <strong>{formatDateTime(selectedSession.mtime)}</strong>
                  </div>
                </div>
              </details>
            </div>
            <details className="detail-section detail-section-actions">
              <summary>{messages.sessionDetail.sectionActions}</summary>
              <div className="detail-section-body">
                <div className="impact-kv">
                  <span>{messages.sessionDetail.fieldPath}</span>
                  <strong className="mono-sub">{selectedSession.file_path}</strong>
                </div>
                <div className="info-box compact">
                  <p>{messages.sessionDetail.rawActionHint}</p>
                </div>
                <div className="chat-toolbar detail-action-bar detail-action-bar-compact">
                  <button
                    type="button"
                    className="btn-outline"
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
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => copyText(selectedSession.session_id, messages.sessionDetail.copyId)}
                  >
                    {messages.sessionDetail.copyId}
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => copyText(selectedSession.file_path, messages.sessionDetail.copyPath)}
                  >
                    {messages.sessionDetail.copyPath}
                  </button>
                </div>
                {isElectronRuntime ? (
                  <div className="chat-toolbar detail-action-bar detail-action-bar-compact detail-action-bar-desktop">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void runDesktopAction("reveal", messages.sessionDetail.revealInFinder)}
                    >
                      {messages.sessionDetail.revealInFinder}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void runDesktopAction("open", messages.sessionDetail.openFile)}
                    >
                      {messages.sessionDetail.openFile}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void runDesktopAction("preview", messages.sessionDetail.previewFile)}
                    >
                      {messages.sessionDetail.previewFile}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void openDesktopWindow()}
                    >
                      {messages.sessionDetail.openInNewWindow}
                    </button>
                  </div>
                ) : null}
                {copyNotice ? <p className="sub-hint">{copyNotice}</p> : null}
                <div className="detail-actions-primary">
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={providerDeleteBackupEnabled}
                      onChange={(event) => setProviderDeleteBackupEnabled(event.target.checked)}
                    />
                    {messages.sessionDetail.deleteWithBackup}
                  </label>
                  <div className="chat-toolbar detail-action-bar">
                    <button
                      type="button"
                      className="btn-base"
                      onClick={() =>
                        runSingleProviderAction(
                          selectedSession.provider,
                          selectedSession.file_path,
                          "backup_local",
                          false,
                        )
                      }
                      disabled={busy || !selectedSession}
                    >
                      {messages.sessionDetail.backup}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
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
                    </button>
                    <button
                      type="button"
                      className="btn-base"
                      onClick={() =>
                        runSingleProviderAction(
                          selectedSession.provider,
                          selectedSession.file_path,
                          "archive_local",
                          false,
                        )
                      }
                      disabled={busy || !canRunSessionAction}
                    >
                      {messages.sessionDetail.archive}
                    </button>
                  </div>
                </div>
                <div className="danger-zone">
                <div className="danger-zone-head">
                  <span className="overview-note-label">danger zone</span>
                  <strong>Delete last.</strong>
                </div>
                  <div className="chat-toolbar detail-action-bar detail-action-bar-danger">
                    <button
                      type="button"
                      className="btn-outline"
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
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() =>
                        runSingleProviderAction(
                          selectedSession.provider,
                          selectedSession.file_path,
                          "delete_local",
                          false,
                          { backup_before_delete: providerDeleteBackupEnabled },
                        )
                      }
                      disabled={busy || !canRunSessionAction}
                    >
                      {messages.sessionDetail.delete}
                    </button>
                  </div>
                </div>
                <p className="sub-hint">
                  {providerDeleteBackupEnabled
                    ? messages.sessionDetail.deleteWithBackupHint
                    : messages.sessionDetail.rawActionHint}
                </p>
                {!canRunSessionAction ? (
                  <p className="sub-hint">{messages.sessionDetail.readOnlyHint}</p>
                ) : null}
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
