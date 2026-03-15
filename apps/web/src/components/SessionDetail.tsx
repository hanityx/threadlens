import { useEffect, useState } from "react";
import type { Messages } from "../i18n";
import type { ProviderSessionRow, TranscriptPayload } from "../types";
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
  runSingleProviderAction: (
    provider: string,
    filePath: string,
    action: "archive_local" | "delete_local",
    dryRun: boolean,
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
    runSingleProviderAction,
  } = props;
  const [copyNotice, setCopyNotice] = useState("");

  useEffect(() => {
    if (!copyNotice) return;
    const timer = window.setTimeout(() => setCopyNotice(""), 1400);
    return () => window.clearTimeout(timer);
  }, [copyNotice]);

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

  return (
    <section className="panel">
      <header>
        <h2>{messages.sessionDetail.title}</h2>
        <span>{selectedSession ? selectedSession.provider : messages.common.none}</span>
      </header>
      <div className="impact-body">
        {!selectedSession ? (
          <p className="sub-hint">{messages.sessionDetail.clickHint}</p>
        ) : (
          <>
            <details className="detail-section" open>
              <summary>{messages.sessionDetail.sectionOverview}</summary>
              <div className="detail-section-body">
                <div className="impact-kv">
                  <span>{messages.sessionDetail.fieldTitle}</span>
                  <strong className="title-main">
                    {selectedSession.display_title || selectedSession.probe.detected_title || "-"}
                  </strong>
                </div>
                <div className="impact-kv">
                  <span>{messages.sessionDetail.fieldTitleSource}</span>
                  <strong>{selectedSession.probe.title_source ?? "-"}</strong>
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
                  <strong>{selectedSession.source}</strong>
                </div>
                <div className="impact-kv">
                  <span>{messages.sessionDetail.fieldFormatProbe}</span>
                  <strong>
                    {selectedSession.probe.format} / {selectedSession.probe.ok ? messages.common.ok : messages.common.fail}
                  </strong>
                </div>
                <div className="impact-kv">
                  <span>{messages.sessionDetail.fieldPath}</span>
                  <strong className="mono-sub">{selectedSession.file_path}</strong>
                </div>
                <div className="impact-kv">
                  <span>{messages.sessionDetail.fieldSize}</span>
                  <strong>{selectedSession.size_bytes.toLocaleString()}</strong>
                </div>
                <div className="impact-kv">
                  <span>{messages.sessionDetail.fieldModified}</span>
                  <strong>{selectedSession.mtime || "-"}</strong>
                </div>
              </div>
            </details>
            <details className="detail-section" open>
              <summary>{messages.sessionDetail.sectionActions}</summary>
              <div className="detail-section-body">
                <div className="chat-toolbar detail-action-bar">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() =>
                      copyText(
                        selectedSession.display_title || selectedSession.probe.detected_title || "",
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
                <div className="chat-toolbar detail-action-bar">
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
                    className="btn-accent"
                    onClick={() =>
                      runSingleProviderAction(
                        selectedSession.provider,
                        selectedSession.file_path,
                        "delete_local",
                        false,
                      )
                    }
                    disabled={busy || !canRunSessionAction}
                  >
                    {messages.sessionDetail.delete}
                  </button>
                </div>
                {!canRunSessionAction ? (
                  <p className="sub-hint">{messages.sessionDetail.readOnlyHint}</p>
                ) : null}
              </div>
            </details>
            <details className="detail-section detail-section-transcript">
              <summary>{messages.sessionDetail.sectionTranscript}</summary>
              <div className="detail-section-body">
                <TranscriptLog
                  messages={messages}
                  transcript={sessionTranscriptData?.messages ?? []}
                  loading={sessionTranscriptLoading}
                  truncated={sessionTranscriptData?.truncated ?? false}
                  messageCount={sessionTranscriptData?.message_count ?? 0}
                  limit={sessionTranscriptLimit}
                  emptyLabel={messages.sessionDetail.emptyTranscript}
                  onLoadMore={() => setSessionTranscriptLimit((prev) => Math.min(prev + 250, 2000))}
                />
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
