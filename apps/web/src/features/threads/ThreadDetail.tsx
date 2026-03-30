import { useEffect, useState } from "react";
import type { Messages } from "../../i18n";
import { Button } from "../../design-system/Button";
import { PanelHeader } from "../../design-system/PanelHeader";
import type { ConversationSearchHit, ThreadRow, ThreadForensicsEnvelope } from "../../types";
import { TranscriptLog } from "../../design-system/TranscriptLog";
import type { TranscriptPayload } from "../../types";
import { formatDateTime, formatWorkspaceLabel } from "../../lib/helpers";

function formatArtifactKindLabel(kind: string) {
  if (kind === "session-log") return "session log";
  if (kind === "archived-session-log") return "archived log";
  return kind.replace(/-/g, " ");
}

function compactArtifactPath(path: string) {
  const normalized = String(path || "").trim();
  if (!normalized) return "";
  const parts = normalized.split("/").filter(Boolean);
  return parts.at(-1) ?? normalized;
}

export interface ThreadDetailProps {
  messages: Messages;
  selectedIds: string[];
  selectedThread: ThreadRow | null;
  selectedThreadId: string;
  openThreadById: (id: string) => void;
  visibleThreadCount: number;
  filteredThreadCount: number;
  nextThreadId?: string;
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
    selectedIds,
    selectedThread,
    selectedThreadId,
    openThreadById,
    visibleThreadCount,
    filteredThreadCount,
    nextThreadId,
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
  const [showFullId, setShowFullId] = useState(false);
  const normalizeDisplayValue = (value?: string | null) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return "";
    const lowered = trimmed.toLowerCase();
    if (["none", "null", "unknown", "n/a", "undefined", "-"].includes(lowered)) return "";
    return trimmed;
  };
  const fallbackContext =
    searchContext?.thread_id && searchContext.thread_id === selectedThreadId ? searchContext : null;
  const hasFocusedThread = Boolean(selectedThreadId);
  const hasExplicitSelection = selectedIds.length > 0;
  const firstSelectedThreadId = selectedIds[0] ?? "";
  const selectedRowsLabel = selectedIds.length === 1 ? "Row" : "Rows";
  const headerSubtitle =
    selectedIds.length > 0 ? `${selectedIds.length} ${selectedRowsLabel} Selected` : undefined;
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
  const displayCwd =
    resolvedCwd && resolvedCwd !== "/" ? resolvedCwd : "";
  const workspaceLabel = formatWorkspaceLabel(displayCwd);
  const fallbackNotice =
    hasFocusedThread && !selectedThread
      ? messages.threadDetail.fallbackHint
      : "";
  const artifactCount = Number(selectedThreadDetail?.artifact_count ?? 0);
  const artifactKindSummary = Object.entries(selectedThreadDetail?.artifact_count_by_kind ?? {})
    .map(([kind, count]) => `${formatArtifactKindLabel(kind)} ${count}`)
    .slice(0, 3);
  const artifactPathPreview = (selectedThreadDetail?.artifact_paths_preview ?? [])
    .map(compactArtifactPath)
    .filter(Boolean)
    .slice(0, 3);
  const compactThreadId =
    selectedThreadId.length > 13
      ? `${selectedThreadId.slice(0, 8)}…${selectedThreadId.slice(-4)}`
      : selectedThreadId;
  const displayedThreadId = showFullId ? selectedThreadId : compactThreadId;
  const transcriptTimestamps = (threadTranscriptData?.messages ?? [])
    .map((message) => String(message.ts ?? "").trim())
    .filter(Boolean)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const createdAt = transcriptTimestamps.length > 0
    ? new Date(transcriptTimestamps[0]).toISOString()
    : "";
  const updatedAt =
    normalizeDisplayValue(selectedThread?.timestamp) ||
    normalizeDisplayValue(fallbackContext?.mtime) ||
    (transcriptTimestamps.length > 0
      ? new Date(transcriptTimestamps[transcriptTimestamps.length - 1]).toISOString()
      : "");
  useEffect(() => {
    setShowFullId(false);
  }, [selectedThreadId]);

  return (
    <section className="panel thread-review-panel">
      <PanelHeader title={messages.threadDetail.title} subtitle={headerSubtitle} />
      <div className="impact-body">
        {!hasFocusedThread && !hasExplicitSelection ? (
          <div className="thread-detail-empty-state">
            <div className="thread-detail-empty-copy">
              <strong>No thread selected.</strong>
              <p>Pick one row to open the full review surface.</p>
            </div>
            {nextThreadId ? (
              <button
                type="button"
                className="thread-detail-empty-next thread-detail-empty-next-button"
                onClick={() => openThreadById(nextThreadId)}
              >
                <span className="overview-note-label">next pick</span>
                <strong>{nextThreadTitle || "thread queue"}</strong>
                <p>{nextThreadSource || "open from threads or recent review rows"}</p>
              </button>
            ) : (
              <div className="thread-detail-empty-next">
                <span className="overview-note-label">next pick</span>
                <strong>{nextThreadTitle || "thread queue"}</strong>
                <p>{nextThreadSource || "open from threads or recent review rows"}</p>
              </div>
            )}
            <p className="thread-detail-empty-opens">
              <span className="overview-note-label">opens here</span>
              Transcript, local files, and cleanup preview.
            </p>
          </div>
        ) : !hasFocusedThread ? (
          <div className="thread-detail-empty-state">
            <div className="thread-detail-empty-copy">
              <strong>{messages.threadDetail.selectionTitle}</strong>
              <p>{messages.threadDetail.selectionHint}</p>
            </div>
            {firstSelectedThreadId ? (
              <button
                type="button"
                className="thread-detail-empty-next thread-detail-empty-next-button"
                onClick={() => openThreadById(firstSelectedThreadId)}
              >
                <span className="overview-note-label">focus detail</span>
                <strong>{messages.threadDetail.openSelected}</strong>
                <p>{firstSelectedThreadId}</p>
              </button>
            ) : null}
            <p className="thread-detail-empty-opens">
              <span className="overview-note-label">bulk actions</span>
              Selection and impact totals already reflect the checked rows.
            </p>
          </div>
        ) : (
          <>
            <section className="detail-hero detail-hero-thread">
              <div className="detail-hero-copy">
                <strong>{resolvedTitle || "-"}</strong>
              </div>
              <div className="detail-hero-pills" aria-label="thread detail summary">
                {selectedThreadId ? (
                  <button
                    type="button"
                    className={`detail-hero-pill detail-hero-pill-button ${showFullId ? "is-expanded" : ""}`.trim()}
                    aria-expanded={showFullId}
                    title={selectedThreadId}
                    onClick={() => setShowFullId((value) => !value)}
                  >
                    {displayedThreadId}
                  </button>
                ) : null}
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
                <div className="impact-kv">
                  <span>{messages.threadDetail.fieldCreated}</span>
                  <strong>{createdAt ? formatDateTime(createdAt) : "-"}</strong>
                </div>
                <div className="impact-kv">
                  <span>{messages.threadDetail.fieldUpdated}</span>
                  <strong>{updatedAt ? formatDateTime(updatedAt) : "-"}</strong>
                </div>
                {workspaceLabel ? (
                  <div className="impact-kv">
                    <span>{messages.threadDetail.fieldCwd}</span>
                    <strong className="mono-sub" title={displayCwd}>{workspaceLabel}</strong>
                  </div>
                ) : null}
              </div>
            </details>
            <details className="detail-section">
              <summary>{messages.threadDetail.sectionActions}</summary>
              <div className="detail-section-body">
                <div className="chat-toolbar detail-action-bar">
                  <Button
                    variant="outline"
                    onClick={() => selectedThreadId && bulkPin([selectedThreadId])}
                    disabled={!selectedThreadId || busy || threadActionsDisabled}
                    title={disabledReason}
                  >
                    {messages.threadDetail.pin}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => selectedThreadId && bulkUnpin([selectedThreadId])}
                    disabled={!selectedThreadId || busy || threadActionsDisabled}
                    title={disabledReason}
                  >
                    {messages.threadDetail.unpin}
                  </Button>
                  <Button
                    variant="base"
                    onClick={() => selectedThreadId && bulkArchive([selectedThreadId])}
                    disabled={!selectedThreadId || busy || threadActionsDisabled}
                    title={disabledReason}
                  >
                    {messages.threadDetail.localArchive}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => selectedThreadId && analyzeDelete([selectedThreadId])}
                    disabled={!selectedThreadId || busy || threadActionsDisabled}
                    title={disabledReason}
                  >
                    {messages.threadDetail.impactAnalysis}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => selectedThreadId && cleanupDryRun([selectedThreadId])}
                    disabled={!selectedThreadId || busy || threadActionsDisabled}
                    title={disabledReason}
                  >
                    {messages.threadDetail.cleanupDryRun}
                  </Button>
                </div>
                {threadActionsDisabled ? <p className="sub-hint">{messages.threadDetail.backendDownHint}</p> : null}
              </div>
            </details>
            <details className="detail-section">
              <summary>{messages.threadDetail.sectionForensics}</summary>
              <div className="detail-section-body">
                {threadDetailLoading ? <div className="skeleton-line" /> : null}
                {selectedThreadDetail?.summary ? <p className="sub-hint">{selectedThreadDetail.summary}</p> : null}
                {artifactCount > 0 ? (
                  <div className="impact-kv">
                    <span>{messages.threadDetail.localFilesFound}</span>
                    <strong>{artifactCount} files</strong>
                  </div>
                ) : null}
                {artifactKindSummary.length ? (
                  <p className="thread-review-impact-note">
                    <span>{messages.threadDetail.fileKinds}</span>
                    {artifactKindSummary.join(" · ")}
                  </p>
                ) : null}
                {artifactPathPreview.length ? (
                  <p className="thread-review-impact-note">
                    <span>{messages.threadDetail.filePreview}</span>
                    {artifactPathPreview.join(" · ")}
                  </p>
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
                  onLoadFullSource={() => setThreadTranscriptLimit(10_000)}
                />
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
