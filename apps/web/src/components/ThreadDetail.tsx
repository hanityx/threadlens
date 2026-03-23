import type { Messages } from "../i18n";
import type { ConversationSearchHit, ThreadRow, ThreadForensicsEnvelope } from "../types";
import { TranscriptLog } from "./TranscriptLog";
import type { TranscriptPayload } from "../types";

export interface ThreadDetailProps {
  messages: Messages;
  selectedThread: ThreadRow | null;
  selectedThreadId: string;
  visibleThreadCount: number;
  filteredThreadCount: number;
  highRiskCount: number;
  nextThreadTitle?: string;
  nextThreadSource?: string;
  searchContext: ConversationSearchHit | null;
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
    visibleThreadCount,
    filteredThreadCount,
    highRiskCount,
    nextThreadTitle,
    nextThreadSource,
    searchContext,
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
  const normalizeDisplayValue = (value?: string | null) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return "";
    const lowered = trimmed.toLowerCase();
    if (["none", "null", "unknown", "n/a", "undefined", "-"].includes(lowered)) return "";
    return trimmed;
  };
  const fallbackContext =
    searchContext?.thread_id && searchContext.thread_id === selectedThreadId ? searchContext : null;
  const hasSelection = Boolean(selectedThreadId);
  const compactThreadId = selectedThreadId
    ? `${selectedThreadId.slice(0, 8)}…${selectedThreadId.slice(-4)}`
    : "";
  const fallbackThreadTitle = selectedThreadId
    ? `thread ${selectedThreadId.slice(0, 8)}`
    : messages.threadDetail.unknownTitle;
  const resolvedTitle =
    normalizeDisplayValue(selectedThread?.title) ||
    normalizeDisplayValue(selectedThreadDetail?.title) ||
    normalizeDisplayValue(fallbackContext?.display_title) ||
    normalizeDisplayValue(fallbackContext?.title) ||
    normalizeDisplayValue(fallbackContext?.session_id) ||
    fallbackThreadTitle;
  const resolvedSource =
    normalizeDisplayValue(selectedThread?.source) ||
    normalizeDisplayValue(selectedThread?.project_bucket) ||
    normalizeDisplayValue(fallbackContext?.source) ||
    normalizeDisplayValue(fallbackContext?.provider) ||
    normalizeDisplayValue(threadTranscriptData?.provider) ||
    messages.threadDetail.unknownSource;
  const resolvedRiskScore =
    selectedThread?.risk_score ??
    selectedThreadDetail?.impact?.risk_score ??
    0;
  const resolvedRiskLevel =
    selectedThread?.risk_level ??
    selectedThreadDetail?.impact?.risk_level ??
    messages.common.unknown;
  const resolvedCwd =
    selectedThread?.cwd ||
    selectedThreadDetail?.cwd ||
    "";
  const fallbackNotice =
    hasSelection && !selectedThread
      ? messages.threadDetail.fallbackHint
      : "";

  return (
    <section className="panel thread-review-panel">
      <header>
        <h2>{messages.threadDetail.title}</h2>
      </header>
      <div className="impact-body">
        {!hasSelection ? (
          <div className="thread-detail-empty-state">
            <div className="thread-detail-empty-copy">
              <strong>Open after select.</strong>
              <p>risk / transcript</p>
            </div>
            <div className="thread-detail-empty-summary" aria-label="thread detail scope">
              <article>
                <span>visible</span>
                <strong>{visibleThreadCount}</strong>
              </article>
              <article>
                <span>total</span>
                <strong>{filteredThreadCount}</strong>
              </article>
              <article>
                <span>flagged</span>
                <strong>{highRiskCount}</strong>
              </article>
            </div>
            <div className="thread-detail-empty-next">
              <span className="overview-note-label">next thread</span>
              <strong>{nextThreadTitle || "thread queue"}</strong>
              <p>{nextThreadSource || "open from threads or recent review rows"}</p>
            </div>
          </div>
        ) : (
          <>
            <section className="detail-hero detail-hero-thread">
              <div className="detail-hero-copy">
                <strong>{resolvedTitle || "-"}</strong>
                <p>{resolvedSource || messages.threadDetail.unknownSource}</p>
              </div>
              <div className="detail-hero-pills" aria-label="thread detail summary">
                {compactThreadId ? <span className="detail-hero-pill mono-sub">{compactThreadId}</span> : null}
                <span className="detail-hero-pill">
                  {resolvedRiskScore}
                  {resolvedRiskLevel ? ` · ${resolvedRiskLevel}` : ""}
                </span>
                {resolvedSource ? <span className="detail-hero-pill">{resolvedSource}</span> : null}
              </div>
            </section>
            <details className="detail-section">
              <summary>{messages.threadDetail.sectionOverview}</summary>
              <div className="detail-section-body">
                {fallbackNotice ? (
                  <div className="info-box compact">
                    <strong>{messages.threadDetail.fallbackTitle}</strong>
                    <p>{fallbackNotice}</p>
                  </div>
                ) : null}
                <div className="impact-kv">
                  <span>{messages.threadDetail.fieldId}</span>
                  <strong className="mono-sub">{selectedThreadId}</strong>
                </div>
                <div className="impact-kv">
                  <span>{messages.threadDetail.fieldSource}</span>
                  <strong>{resolvedSource || "-"}</strong>
                </div>
                {resolvedCwd ? (
                  <div className="impact-kv">
                    <span>{messages.threadDetail.fieldCwd}</span>
                    <strong className="mono-sub">{resolvedCwd}</strong>
                  </div>
                ) : null}
              </div>
            </details>
            <details className="detail-section">
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
            <details className="detail-section">
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
            <details className="detail-section detail-section-transcript" open>
              <summary>{messages.threadDetail.sectionTranscript}</summary>
              <div className="detail-section-body">
                <TranscriptLog
                  messages={messages}
                  transcript={threadTranscriptData?.messages ?? []}
                  loading={threadTranscriptLoading}
                  truncated={threadTranscriptData?.truncated ?? false}
                  messageCount={threadTranscriptData?.message_count ?? 0}
                  limit={threadTranscriptLimit}
                  maxLimit={10_000}
                  onLoadMore={() => setThreadTranscriptLimit((prev) => Math.min(prev + 250, 10_000))}
                />
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
