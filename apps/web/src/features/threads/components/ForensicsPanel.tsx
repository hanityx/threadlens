import { useState } from "react";
import { Button } from "@/shared/ui/components/Button";
import { PanelHeader } from "@/shared/ui/components/PanelHeader";

import type { Messages } from "@/i18n";
import type {
  AnalyzeDeleteReport,
  CleanupPendingState,
  CleanupPreviewData,
  ThreadRow,
} from "@/shared/types";
import { prettyJson } from "@/shared/lib/format";
import {
  buildThreadCleanupSelectionKey,
  THREAD_CLEANUP_DEFAULT_OPTIONS,
} from "@/shared/lib/appState";

export interface ForensicsPanelProps {
  messages: Messages;
  threadActionsDisabled: boolean;
  selectedIds: string[];
  rows: ThreadRow[];
  busy: boolean;
  analyzeDelete: (ids: string[]) => void;
  cleanupDryRun: (ids: string[]) => void;
  cleanupExecute: (ids: string[]) => void;
  cleanupData: CleanupPreviewData | null;
  pendingCleanup: CleanupPendingState | null;
  selectedImpactRows: AnalyzeDeleteReport[];
  analysisRaw: unknown;
  cleanupRaw: unknown;
  analyzeDeleteError: boolean;
  cleanupDryRunError: boolean;
  cleanupExecuteError: boolean;
  analyzeDeleteErrorMessage: string;
  cleanupDryRunErrorMessage: string;
  cleanupExecuteErrorMessage: string;
}

export function ForensicsPanel(props: ForensicsPanelProps) {
  const {
    messages,
    threadActionsDisabled,
    selectedIds,
    rows,
    busy,
    analyzeDelete,
    cleanupDryRun,
    cleanupExecute,
    cleanupData,
    pendingCleanup,
    selectedImpactRows,
    analysisRaw,
    cleanupRaw,
    analyzeDeleteError,
    cleanupDryRunError,
    cleanupExecuteError,
    analyzeDeleteErrorMessage,
    cleanupDryRunErrorMessage,
    cleanupExecuteErrorMessage,
  } = props;
  const [tokenCopied, setTokenCopied] = useState(false);
  const canRetryForensics = !threadActionsDisabled && !busy && selectedIds.length > 0;
  const impactReady = selectedImpactRows.length > 0;
  const topImpactRow = selectedImpactRows[0];
  const topImpactLabel = topImpactRow?.title || (topImpactRow?.id ? `row ${topImpactRow.id.slice(0, 8)}` : "");

  const currentSelectionKey = buildThreadCleanupSelectionKey(selectedIds, THREAD_CLEANUP_DEFAULT_OPTIONS);
  const cleanupReady = Boolean(
    pendingCleanup?.confirmToken &&
    pendingCleanup.selectionKey === currentSelectionKey &&
    cleanupData?.mode !== "execute",
  );
  const cleanupSelectionChanged = Boolean(
    pendingCleanup?.confirmToken &&
    pendingCleanup.selectionKey !== currentSelectionKey,
  );
  const cleanupApplied = cleanupData?.mode === "execute" && cleanupData?.ok === true;
  const cleanupTargetCount = Number(cleanupData?.target_file_count ?? cleanupData?.targets?.length ?? 0);
  const cleanupDeletedCount = Number(cleanupData?.deleted_file_count ?? 0);
  const cleanupFailedCount = cleanupData?.failed?.length ?? 0;
  const stateRemoved = cleanupData?.state_result?.removed;
  const stateRemovedCount = Number(stateRemoved?.titles ?? 0) + Number(stateRemoved?.order ?? 0) + Number(stateRemoved?.pinned ?? 0);
  const executeReady = cleanupReady && !threadActionsDisabled && !busy;
  const cleanupCardHeadline = cleanupApplied
    ? `${messages.forensics.executeCleanup} · ${messages.providers.resultApplied}`
    : `${messages.forensics.stageDryRun} · ${cleanupReady ? messages.providers.resultPreviewReady : messages.forensics.stagePending}`;
  const cleanupCardSummary = cleanupApplied
    ? `${cleanupDeletedCount}/${cleanupTargetCount || cleanupDeletedCount} deleted · ${cleanupFailedCount} failed`
    : cleanupReady
      ? `${cleanupTargetCount} targets · ${messages.forensics.cleanupTokenReady}`
      : cleanupSelectionChanged
        ? messages.forensics.cleanupSelectionChanged
        : messages.forensics.cleanupTokenHint;
  const cleanupCardDetail = cleanupApplied
    ? messages.forensics.stateRefsUpdated.replace("{count}", String(stateRemovedCount))
    : cleanupReady
      ? messages.forensics.cleanupExecuteReadyBody
      : messages.forensics.stageDryRunBody;
  const handleCopyToken = async () => {
    const token = pendingCleanup?.confirmToken ?? cleanupData?.confirm_token_expected;
    if (!token || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(token);
      setTokenCopied(true);
      window.setTimeout(() => setTokenCopied(false), 1600);
    } catch {
      setTokenCopied(false);
    }
  };

  return (
    <section
      className={`panel impact-panel thread-review-panel ${selectedIds.length === 0 ? "is-empty-state" : ""}`.trim()}
    >
      <PanelHeader title={messages.forensics.title} />
      <div className="impact-body">
        <div className="thread-review-grid">
          <article className={`thread-review-card thread-review-card-token ${cleanupReady || cleanupApplied ? "is-ready" : ""}`.trim()}>
            <span>{messages.forensics.cleanupToken}</span>
            <strong>{cleanupCardHeadline}</strong>
            <p>{cleanupCardSummary}</p>
            <p>{cleanupCardDetail}</p>
            {(pendingCleanup?.confirmToken ?? cleanupData?.confirm_token_expected) ? (
              <code>{pendingCleanup?.confirmToken ?? cleanupData?.confirm_token_expected}</code>
            ) : null}
            {cleanupReady ? (
              <div className="sub-toolbar action-toolbar">
                <Button variant="outline" onClick={handleCopyToken}>
                  {tokenCopied ? messages.forensics.copyTokenDone : messages.forensics.copyToken}
                </Button>
                <Button
                  variant="base"
                  disabled={!executeReady}
                  onClick={() => cleanupExecute(selectedIds)}
                >
                  {messages.forensics.executeCleanup}
                </Button>
              </div>
            ) : null}
          </article>
        </div>

        {cleanupSelectionChanged ? (
          <p className="sub-hint">
            {messages.forensics.cleanupSelectionChanged}
          </p>
        ) : null}

        {cleanupApplied ? (
          <details className="detail-section" open>
            <summary>{messages.forensics.executionResult}</summary>
            <div className="detail-section-body">
              <section className="provider-result-grid provider-result-grid-compact thread-review-result-grid">
                <article className="provider-result-card provider-result-card-export">
                  <span className="overview-note-label">{messages.forensics.executionTargets}</span>
                  <strong>{cleanupTargetCount}</strong>
                  <p>{messages.forensics.executionDeleted} {cleanupDeletedCount}</p>
                </article>
                <article className="provider-result-card">
                  <span className="overview-note-label">{messages.forensics.executionBackup}</span>
                  <strong>{cleanupData?.backup?.backup_dir ? messages.providers.backedUp : "-"}</strong>
                  <p>{cleanupData?.backup?.backup_dir || messages.common.unknown}</p>
                </article>
                <article className="provider-result-card">
                  <span className="overview-note-label">{messages.forensics.executionFailures}</span>
                  <strong>{cleanupFailedCount}</strong>
                  <p>{messages.forensics.stateRefsUpdated.replace("{count}", String(stateRemovedCount))}</p>
                </article>
              </section>
            </div>
          </details>
        ) : null}

        {threadActionsDisabled ? <p className="sub-hint">{messages.forensics.backendDownHint}</p> : null}

        <div className="impact-list">
          <h3>{impactReady ? messages.forensics.impactTopRows : messages.forensics.selectedImpactSummary}</h3>
          {!impactReady ? (
            <div className="thread-review-empty-guide">
              <article>
                <span>{messages.forensics.emptyGuidePickLabel}</span>
                <strong>{messages.forensics.emptyGuidePickTitle}</strong>
                <p>{messages.forensics.emptyGuidePickBody}</p>
              </article>
              <article>
                <span>{messages.forensics.emptyGuideInspectLabel}</span>
                <strong>{messages.forensics.emptyGuideInspectTitle}</strong>
                <p>{messages.forensics.emptyGuideInspectBody}</p>
              </article>
              <article>
                <span>{messages.forensics.emptyGuidePreviewLabel}</span>
                <strong>{messages.forensics.emptyGuidePreviewTitle}</strong>
                <p>{messages.forensics.emptyGuidePreviewBody}</p>
              </article>
            </div>
          ) : (
            <ul>
              {selectedImpactRows.slice(0, 12).map((row) => (
                <li key={row.id}>
                  <div className="thread-review-impact-copy">
                    <strong>{row.title || row.id}</strong>
                    {row.summary ? <p className="thread-review-impact-summary">{row.summary}</p> : null}
                    {row.parents?.length ? (
                      <p className="thread-review-impact-note">
                        <span>{messages.forensics.impactRefs}</span>
                        {row.parents.slice(0, 2).join(" · ")}
                      </p>
                    ) : null}
                    {row.impacts?.length ? (
                      <p className="thread-review-impact-note">
                        <span>{messages.forensics.impactChanges}</span>
                        {row.impacts.slice(0, 2).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="thread-review-impact-meta">
                    <strong>{row.risk_score ?? 0}</strong>
                    <span>{row.risk_level ?? messages.common.unknown}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!threadActionsDisabled && (analyzeDeleteError || cleanupDryRunError || cleanupExecuteError) ? (
          <div className="error-box">
            <div>{messages.errors.analysisDryRun}</div>
            {analyzeDeleteErrorMessage ? <div className="mono-sub">{analyzeDeleteErrorMessage}</div> : null}
            {cleanupDryRunErrorMessage ? <div className="mono-sub">{cleanupDryRunErrorMessage}</div> : null}
            {cleanupExecuteErrorMessage ? <div className="mono-sub">{cleanupExecuteErrorMessage}</div> : null}
            <div className="sub-toolbar action-toolbar">
              <Button
                variant="outline"
                disabled={!canRetryForensics}
                onClick={() => analyzeDelete(selectedIds)}
              >
                {messages.forensics.retryImpact}
              </Button>
              <Button
                variant="outline"
                disabled={!canRetryForensics}
                onClick={() => cleanupDryRun(selectedIds)}
              >
                {messages.forensics.retryDryRun}
              </Button>
            </div>
            {!threadActionsDisabled && selectedIds.length === 0 ? (
              <div className="sub-hint">{messages.forensics.retryNeedsSelection}</div>
            ) : null}
          </div>
        ) : null}

        {analysisRaw || cleanupRaw ? (
          <details className="detail-section">
            <summary>{messages.forensics.payload}</summary>
            <div className="detail-section-body">
              {analysisRaw ? (
                <details open>
                  <summary>{messages.forensics.rawAnalysis}</summary>
                  <pre>{prettyJson(analysisRaw)}</pre>
                </details>
              ) : null}
              {cleanupRaw ? (
                <details open>
                  <summary>{cleanupData?.mode === "execute" ? messages.forensics.rawExecute : messages.forensics.rawDryRun}</summary>
                  <pre>{prettyJson(cleanupRaw)}</pre>
                </details>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
