import { useEffect, useRef, useState } from "react";
import type { Messages } from "../i18n";
import type { ProviderSessionRow, TranscriptPayload } from "../types";
import { formatDateTime, formatInteger, normalizeDisplayValue } from "../lib/helpers";
import { TranscriptLog } from "./TranscriptLog";

export interface SessionDetailProps {
  messages: Messages;
  selectedSession: ProviderSessionRow | null;
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

  const emptyTranscriptLabel = (() => {
    if (!selectedSession) return messages.sessionDetail.emptyTranscript;
    if ((sessionTranscriptData?.message_count ?? 0) === 0 && selectedSession.provider === "chatgpt") {
      return "This ChatGPT Desktop file is a binary or metadata cache, so the transcript cannot be expanded directly. Detection and basic session info are available, but not the full conversation body.";
    }
    if (
      (sessionTranscriptData?.message_count ?? 0) === 0 &&
      selectedSession.provider === "copilot" &&
      selectedSession.probe.format === "json"
    ) {
      return "This Copilot session JSON parsed structurally, but the actual conversation messages are empty. Try another workspace chat row to find the full transcript.";
    }
    if (selectedSession.probe.format === "unknown") {
      return "This file format cannot expose a direct transcript yet. Only local cache or binary metadata was detected.";
    }
    if (selectedSession.file_path.endsWith(".metadata.json")) {
      return "This row is session metadata. Pick an actual chatSessions JSON row below to open the transcript.";
    }
    return messages.sessionDetail.emptyTranscript;
  })();
  const sessionModelHint = (() => {
    if (!selectedSession) return "";
    if (selectedSession.provider === "codex") {
      return "Codex also has a separate cleanup model for threads, but this panel is focused on the raw session file you selected.";
    }
    if (selectedSession.provider === "claude") {
      return "Claude is modeled around raw session files left in the project and transcript stores. Session IDs and file paths are the important anchors here.";
    }
    if (selectedSession.provider === "gemini") {
      return "Gemini is managed through history, tmp, and checkpoint-style session stores for raw conversation inspection.";
    }
    if (selectedSession.provider === "copilot") {
      return "Copilot is read from workspace and global chat artifacts, so this panel behaves more like a raw session-file inspector.";
    }
    return "This panel opens the raw session file for the selected AI and handles file-level dry-runs, archive actions, and deletes.";
  })();

  return (
    <section className="panel session-detail-panel">
      <header>
        <h2>{messages.sessionDetail.title}</h2>
        <span>{selectedSession ? selectedSession.provider : messages.common.none}</span>
      </header>
      <div ref={bodyRef} className="impact-body">
        {!selectedSession ? (
          <div className="session-detail-empty-state">
            <div className="session-detail-empty-copy">
              <span className="overview-note-label">{messages.sessionDetail.title}</span>
              <strong>Pick a source session</strong>
              <p>{messages.sessionDetail.clickHint}</p>
            </div>
            <div className="session-detail-empty-grid">
              <article className="session-detail-empty-card">
                <span className="overview-note-label">Transcript</span>
                <strong>Open the raw conversation</strong>
                <p>Review the selected session body here without leaving the Sessions workspace.</p>
              </article>
              <article className="session-detail-empty-card">
                <span className="overview-note-label">Backup</span>
                <strong>Protect before delete</strong>
                <p>Back up one session or use delete-with-backup before any real file action.</p>
              </article>
            </div>
          </div>
        ) : (
          <>
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
                    <p>{sessionModelHint}</p>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldTitle}</span>
                    <strong className="title-main">
                      {normalizeDisplayValue(selectedSession.display_title) ||
                        normalizeDisplayValue(selectedSession.probe.detected_title) ||
                        "-"}
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
            <details className="detail-section detail-section-actions" open>
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
                    <span className="overview-note-label">Danger zone</span>
                    <strong>Delete the raw source file only after backup or dry-run.</strong>
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
