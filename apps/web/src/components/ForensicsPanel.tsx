import type { Messages } from "../i18n";
import type { ThreadRow, AnalyzeDeleteReport, CleanupPreviewData } from "../types";
import { prettyJson } from "../lib/helpers";

export interface ForensicsPanelProps {
  messages: Messages;
  selectedIds: string[];
  rows: ThreadRow[];
  cleanupData: CleanupPreviewData | null;
  selectedImpactRows: AnalyzeDeleteReport[];
  analysisRaw: unknown;
  cleanupRaw: unknown;
  analyzeDeleteError: boolean;
  cleanupDryRunError: boolean;
}

export function ForensicsPanel(props: ForensicsPanelProps) {
  const {
    messages,
    selectedIds,
    rows,
    cleanupData,
    selectedImpactRows,
    analysisRaw,
    cleanupRaw,
    analyzeDeleteError,
    cleanupDryRunError,
  } = props;

  return (
    <section className="panel impact-panel">
      <header>
        <h2>{messages.forensics.title}</h2>
        <span>{messages.forensics.subtitle}</span>
      </header>
      <div className="impact-body">
        <div className="impact-kv">
          <span>{messages.forensics.selectedThreads}</span>
          <strong>{selectedIds.length}</strong>
        </div>
        <div className="impact-kv">
          <span>{messages.forensics.includesHighRisk}</span>
          <strong>
            {selectedIds.filter((id) => (rows.find((r) => r.thread_id === id)?.risk_score ?? 0) >= 70).length}
          </strong>
        </div>
        <div className="impact-kv">
          <span>{messages.forensics.cleanupToken}</span>
          <strong>{cleanupData?.confirm_token_expected ?? "-"}</strong>
        </div>
        <p className="sub-hint">{cleanupData?.confirm_help ?? messages.forensics.cleanupTokenHint}</p>

        <div className="impact-list">
          <h3>{messages.forensics.selectedImpactSummary}</h3>
          {selectedImpactRows.length === 0 ? (
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

        {analysisRaw ? (
          <details>
            <summary>{messages.forensics.rawAnalysis}</summary>
            <pre>{prettyJson(analysisRaw)}</pre>
          </details>
        ) : null}
        {cleanupRaw ? (
          <details>
            <summary>{messages.forensics.rawDryRun}</summary>
            <pre>{prettyJson(cleanupRaw)}</pre>
          </details>
        ) : null}
        {analyzeDeleteError || cleanupDryRunError ? (
          <div className="error-box">{messages.errors.analysisDryRun}</div>
        ) : null}
      </div>
    </section>
  );
}
