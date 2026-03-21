import { useState } from "react";

import type { Messages } from "../i18n";
import type { ThreadRow, AnalyzeDeleteReport, CleanupPreviewData } from "../types";
import { prettyJson } from "../lib/helpers";

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
    <section className="panel impact-panel thread-review-panel">
      <header>
        <h2>{messages.forensics.title}</h2>
        <span>{messages.forensics.subtitle}</span>
      </header>
      <div className="impact-body">
        <div className="thread-review-grid">
          <article className="thread-review-card thread-review-card-emphasis">
            <span>{messages.forensics.nextStepLabel}</span>
            <strong>
              {cleanupReady
                ? messages.forensics.nextStepDryRunReady
                : impactReady
                  ? messages.forensics.nextStepImpactReady
                  : messages.forensics.nextStepPending}
            </strong>
            <p>{cleanupReady ? messages.forensics.cleanupTokenReadyBody : messages.forensics.explanationImpact}</p>
          </article>
          <article className="thread-review-card">
            <span>{messages.forensics.selectedThreads}</span>
            <strong>{selectedIds.length}</strong>
            <p>{messages.forensics.stageSelectBody}</p>
          </article>
          <article className="thread-review-card">
            <span>{messages.forensics.includesHighRisk}</span>
            <strong>{highRiskCount}</strong>
            <p>{messages.forensics.stageImpactBody}</p>
          </article>
          <article className={`thread-review-card ${cleanupReady ? "is-ready" : ""}`.trim()}>
            <span>{messages.forensics.cleanupToken}</span>
            <strong>{cleanupData?.confirm_token_expected ?? "-"}</strong>
            <p>{cleanupReady ? messages.forensics.cleanupTokenReadyBody : messages.forensics.cleanupTokenHint}</p>
            {cleanupReady ? (
              <div className="sub-toolbar action-toolbar">
                <button type="button" className="btn-outline" onClick={handleCopyToken}>
                  {tokenCopied ? messages.forensics.copyTokenDone : messages.forensics.copyToken}
                </button>
              </div>
            ) : null}
          </article>
        </div>

        <div className="info-box compact">
          <strong>{messages.forensics.explanationTitle}</strong>
          <p>{messages.forensics.explanationImpact}</p>
          <p>{messages.forensics.explanationDryRun}</p>
          <p>Use Sessions for raw file actions. This panel is only for Codex cleanup review.</p>
        </div>

        <div className="thread-review-stage-list">
          <article className="thread-review-stage">
            <div>
              <strong>{messages.forensics.stageSelect}</strong>
              <p>{messages.forensics.stageSelectBody}</p>
            </div>
            <span className={`status-pill ${selectedIds.length > 0 ? "status-active" : "status-missing"}`}>
              {selectedIds.length > 0 ? messages.forensics.stageDone : messages.forensics.stagePending}
            </span>
          </article>
          <article className="thread-review-stage">
            <div>
              <strong>{messages.forensics.stageImpact}</strong>
              <p>{messages.forensics.stageImpactBody}</p>
            </div>
            <span className={`status-pill ${impactReady ? "status-detected" : "status-preview"}`}>
              {impactReady ? messages.forensics.stageDone : messages.forensics.stagePending}
            </span>
          </article>
          <article className="thread-review-stage">
            <div>
              <strong>{messages.forensics.stageDryRun}</strong>
              <p>{messages.forensics.stageDryRunBody}</p>
            </div>
            <span className={`status-pill ${cleanupReady ? "status-active" : "status-preview"}`}>
              {cleanupReady ? messages.forensics.stageReady : messages.forensics.stagePending}
            </span>
          </article>
        </div>

        {threadActionsDisabled ? <p className="sub-hint">{messages.forensics.backendDownHint}</p> : null}

        <div className="impact-list">
          <h3>{messages.forensics.selectedImpactSummary}</h3>
          {!impactReady ? (
            <p className="sub-hint">{messages.forensics.impactEmpty}</p>
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
              <button
                type="button"
                className="btn-outline"
                disabled={!canRetryForensics}
                onClick={() => analyzeDelete(selectedIds)}
              >
                {messages.forensics.retryImpact}
              </button>
              <button
                type="button"
                className="btn-outline"
                disabled={!canRetryForensics}
                onClick={() => cleanupDryRun(selectedIds)}
              >
                {messages.forensics.retryDryRun}
              </button>
            </div>
            {!threadActionsDisabled && selectedIds.length === 0 ? (
              <div className="sub-hint">{messages.forensics.retryNeedsSelection}</div>
            ) : null}
          </div>
        ) : null}

        {analysisRaw || cleanupRaw ? (
          <details className="detail-section">
            <summary>{messages.forensics.explanationTitle} / JSON</summary>
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
