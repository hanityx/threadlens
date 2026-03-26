import { useState } from "react";
import { Button } from "../../design-system/Button";
import { PanelHeader } from "../../design-system/PanelHeader";

import type { Messages } from "../../i18n";
import type { ThreadRow, AnalyzeDeleteReport, CleanupPreviewData } from "../../types";
import { prettyJson } from "../../lib/helpers";

export interface ForensicsPanelProps {
  messages: Messages;
  threadActionsDisabled: boolean;
  selectedIds: string[];
  rows: ThreadRow[];
  busy: boolean;
  analyzeDelete: (ids: string[]) => void;
  cleanupDryRun: (ids: string[]) => void;
  cleanupData: CleanupPreviewData | null;
  selectedImpactRows: AnalyzeDeleteReport[];
  analysisRaw: unknown;
  cleanupRaw: unknown;
  analyzeDeleteError: boolean;
  cleanupDryRunError: boolean;
  analyzeDeleteErrorMessage: string;
  cleanupDryRunErrorMessage: string;
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
    cleanupData,
    selectedImpactRows,
    analysisRaw,
    cleanupRaw,
    analyzeDeleteError,
    cleanupDryRunError,
    analyzeDeleteErrorMessage,
    cleanupDryRunErrorMessage,
  } = props;
  const [tokenCopied, setTokenCopied] = useState(false);
  const canRetryForensics = !threadActionsDisabled && !busy && selectedIds.length > 0;
  const highRiskCount = selectedIds.filter((id) => (rows.find((r) => r.thread_id === id)?.risk_score ?? 0) >= 70).length;
  const impactReady = selectedImpactRows.length > 0;
  const cleanupReady = Boolean(cleanupData?.confirm_token_expected);
  const topImpactRow = selectedImpactRows[0];
  const topImpactLabel = topImpactRow?.title || (topImpactRow?.id ? `row ${topImpactRow.id.slice(0, 8)}` : "");
  const heroTitle = cleanupReady
    ? `${selectedIds.length} rows ready for dry-run`
    : impactReady
      ? `${selectedImpactRows.length} impact summaries ready`
      : selectedIds.length > 0
        ? `${selectedIds.length} rows selected`
        : messages.forensics.nextStepPending;
  const heroBody = cleanupReady
    ? "Copy the token only when the review looks safe."
    : impactReady
      ? `${topImpactLabel} · ${topImpactRow?.risk_level ?? "risk"} / ${topImpactRow?.risk_score ?? 0}`
      : selectedIds.length > 0
        ? `${highRiskCount} flagged · run impact next`
        : "pick rows first";
  const handleCopyToken = async () => {
    const token = cleanupData?.confirm_token_expected;
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
      <PanelHeader title={messages.forensics.title} subtitle="review · next steps" />
      <div className="impact-body">
        <section className="detail-hero detail-hero-forensics">
          <div className="detail-hero-copy">
            <strong>{heroTitle}</strong>
            <p>{heroBody}</p>
          </div>
        </section>

        <div className="thread-review-grid">
          <article className={`thread-review-card ${selectedIds.length > 0 ? "thread-review-card-emphasis" : ""}`.trim()}>
            <span>{messages.forensics.selectedThreads}</span>
            <strong>{selectedIds.length}</strong>
            <p>rows</p>
          </article>
          <article className={`thread-review-card ${highRiskCount > 0 ? "thread-review-card-emphasis" : ""}`.trim()}>
            <span>{messages.forensics.includesHighRisk}</span>
            <strong>{highRiskCount}</strong>
            <p>flagged</p>
          </article>
          <article className={`thread-review-card ${cleanupReady ? "is-ready" : ""}`.trim()}>
            <span>{messages.forensics.cleanupToken}</span>
            <strong>{cleanupData?.confirm_token_expected ?? "-"}</strong>
            <p>{cleanupReady ? "copy ready" : "run first"}</p>
            {cleanupReady ? (
              <div className="sub-toolbar action-toolbar">
                <Button variant="outline" onClick={handleCopyToken}>
                  {tokenCopied ? messages.forensics.copyTokenDone : messages.forensics.copyToken}
                </Button>
              </div>
            ) : null}
          </article>
        </div>

        {threadActionsDisabled ? <p className="sub-hint">{messages.forensics.backendDownHint}</p> : null}

        <div className="impact-list">
          <h3>{impactReady ? "Top rows" : messages.forensics.selectedImpactSummary}</h3>
          {!impactReady ? (
            <div className="thread-review-empty-guide">
              <article>
                <span>1</span>
                <strong>select rows</strong>
                <p>use visible, flagged, or pinned.</p>
              </article>
              <article>
                <span>2</span>
                <strong>run impact</strong>
                <p>inspect risk and cleanup scope first.</p>
              </article>
              <article>
                <span>3</span>
                <strong>confirm dry-run</strong>
                <p>copy the token only after review.</p>
              </article>
            </div>
          ) : (
            <ul>
              {selectedImpactRows.slice(0, 12).map((row) => (
                <li key={row.id}>
                  <strong>{row.title || row.id}</strong>
                  <span>
                    {row.risk_level ?? messages.common.unknown} / {row.risk_score ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!threadActionsDisabled && (analyzeDeleteError || cleanupDryRunError) ? (
          <div className="error-box">
            <div>{messages.errors.analysisDryRun}</div>
            {analyzeDeleteErrorMessage ? <div className="mono-sub">{analyzeDeleteErrorMessage}</div> : null}
            {cleanupDryRunErrorMessage ? <div className="mono-sub">{cleanupDryRunErrorMessage}</div> : null}
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
            <summary>payload</summary>
            <div className="detail-section-body">
              {analysisRaw ? (
                <details open>
                  <summary>{messages.forensics.rawAnalysis}</summary>
                  <pre>{prettyJson(analysisRaw)}</pre>
                </details>
              ) : null}
              {cleanupRaw ? (
                <details open>
                  <summary>{messages.forensics.rawDryRun}</summary>
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
