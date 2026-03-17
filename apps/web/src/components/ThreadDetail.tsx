import type { Messages } from "../i18n";
import type { ThreadRow, ThreadForensicsEnvelope } from "../types";
import { TranscriptLog } from "./TranscriptLog";
import type { TranscriptPayload } from "../types";

export interface ThreadDetailProps {
  messages: Messages;
  selectedThread: ThreadRow | null;
  selectedThreadId: string;
  threadDetailLoading: boolean;
  selectedThreadDetail: NonNullable<ThreadForensicsEnvelope["reports"]>[0] | null;
  threadTranscriptData: TranscriptPayload | null;
  threadTranscriptLoading: boolean;
  threadTranscriptLimit: number;
  setThreadTranscriptLimit: React.Dispatch<React.SetStateAction<number>>;
  busy: boolean;
  threadActionsDisabled: boolean;
  bulkPin: (ids: string[]) => void;
  bulkUnpin: (ids: string[]) => void;
  bulkArchive: (ids: string[]) => void;
  analyzeDelete: (ids: string[]) => void;
  cleanupDryRun: (ids: string[]) => void;
}

export function ThreadDetail(props: ThreadDetailProps) {
  const {
    messages,
    selectedThread,
    selectedThreadId,
    threadDetailLoading,
    selectedThreadDetail,
    threadTranscriptData,
    threadTranscriptLoading,
    threadTranscriptLimit,
    setThreadTranscriptLimit,
    busy,
    threadActionsDisabled,
    bulkPin,
    bulkUnpin,
    bulkArchive,
    analyzeDelete,
    cleanupDryRun,
  } = props;
  const disabledReason = threadActionsDisabled
    ? messages.threadDetail.backendDownHint
    : undefined;

  return (
    <section className="panel">
      <header>
        <h2>{messages.threadDetail.title}</h2>
        <span>{selectedThreadId ? messages.common.selected : messages.common.none}</span>
      </header>
      <div className="impact-body">
        {!selectedThread ? (
          <p className="sub-hint">{messages.threadDetail.clickHint}</p>
        ) : (
          <>
            <details className="detail-section" open>
              <summary>{messages.threadDetail.sectionOverview}</summary>
              <div className="detail-section-body">
                <div className="impact-kv">
                  <span>{messages.threadDetail.fieldTitle}</span>
                  <strong className="title-main">{selectedThread.title || "-"}</strong>
                </div>
                <div className="impact-kv">
                  <span>{messages.threadDetail.fieldId}</span>
                  <strong className="mono-sub">{selectedThread.thread_id}</strong>
                </div>
                <div className="impact-kv">
                  <span>{messages.threadDetail.fieldSource}</span>
                  <strong>{selectedThread.source || selectedThread.project_bucket || "-"}</strong>
                </div>
                <div className="impact-kv">
                  <span>{messages.threadDetail.fieldRisk}</span>
                  <strong>
                    {selectedThread.risk_score ?? 0}
                    {selectedThread.risk_level ? ` (${selectedThread.risk_level})` : ""}
                  </strong>
                </div>
                {selectedThread.cwd ? (
                  <div className="impact-kv">
                    <span>{messages.threadDetail.fieldCwd}</span>
                    <strong className="mono-sub">{selectedThread.cwd}</strong>
                  </div>
                ) : null}
              </div>
            </details>
            <details className="detail-section" open>
              <summary>{messages.threadDetail.sectionActions}</summary>
              <div className="detail-section-body">
                <div className="chat-toolbar detail-action-bar">
                  <button
                    type="button"
                    className="btn-base"
                    onClick={() => selectedThreadId && bulkPin([selectedThreadId])}
                    disabled={!selectedThreadId || busy || threadActionsDisabled}
                    title={disabledReason}
                  >
                    {messages.threadDetail.pin}
                  </button>
                  <button
                    type="button"
                    className="btn-base"
                    onClick={() => selectedThreadId && bulkUnpin([selectedThreadId])}
                    disabled={!selectedThreadId || busy || threadActionsDisabled}
                    title={disabledReason}
                  >
                    {messages.threadDetail.unpin}
                  </button>
                  <button
                    type="button"
                    className="btn-accent"
                    onClick={() => selectedThreadId && bulkArchive([selectedThreadId])}
                    disabled={!selectedThreadId || busy || threadActionsDisabled}
                    title={disabledReason}
                  >
                    {messages.threadDetail.localArchive}
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => selectedThreadId && analyzeDelete([selectedThreadId])}
                    disabled={!selectedThreadId || busy || threadActionsDisabled}
                    title={disabledReason}
                  >
                    {messages.threadDetail.impactAnalysis}
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => selectedThreadId && cleanupDryRun([selectedThreadId])}
                    disabled={!selectedThreadId || busy || threadActionsDisabled}
                    title={disabledReason}
                  >
                    {messages.threadDetail.cleanupDryRun}
                  </button>
                </div>
                {threadActionsDisabled ? <p className="sub-hint">{messages.threadDetail.backendDownHint}</p> : null}
              </div>
            </details>
            <details className="detail-section" open>
              <summary>{messages.threadDetail.sectionForensics}</summary>
              <div className="detail-section-body">
                {threadDetailLoading ? <div className="skeleton-line" /> : null}
                {selectedThreadDetail?.summary ? <p className="sub-hint">{selectedThreadDetail.summary}</p> : null}
                {selectedThreadDetail?.artifact_count ? (
                  <div className="impact-kv">
                    <span>{messages.threadDetail.artifacts}</span>
                    <strong>{selectedThreadDetail.artifact_count}</strong>
                  </div>
                ) : null}
              </div>
            </details>
            <details className="detail-section detail-section-transcript">
              <summary>{messages.threadDetail.sectionTranscript}</summary>
              <div className="detail-section-body">
                <TranscriptLog
                  messages={messages}
                  transcript={threadTranscriptData?.messages ?? []}
                  loading={threadTranscriptLoading}
                  truncated={threadTranscriptData?.truncated ?? false}
                  messageCount={threadTranscriptData?.message_count ?? 0}
                  limit={threadTranscriptLimit}
                  onLoadMore={() => setThreadTranscriptLimit((prev) => Math.min(prev + 250, 2000))}
                />
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
