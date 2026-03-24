import type { Messages } from "../../i18n";
import { formatDateTime } from "../../lib/helpers";
import type { ProviderSessionRow, ProviderView } from "../../types";
import { compactSessionTitle } from "./helpers";

type ProviderChipTab = {
  id: ProviderView;
  name: string;
};

export interface ProviderWorkspaceBarProps {
  messages: Messages;
  providerLabel: string;
  providerView: ProviderView;
  coreProviderTabs: ProviderChipTab[];
  optionalProviderTabs: ProviderChipTab[];
  onSelectProviderView: (view: ProviderView) => void;
  summary: {
    sessions: number;
    sources: number;
    transcriptReady: number;
    parseFail: number;
  };
  providerWorkspaceRecentRows: ProviderSessionRow[];
  selectedSessionPath: string | null;
  onSelectRecentRow: (row: ProviderSessionRow) => void;
  backupHubSlot: React.ReactNode;
}

export function ProviderWorkspaceBar({
  messages,
  providerLabel,
  providerView,
  coreProviderTabs,
  optionalProviderTabs,
  onSelectProviderView,
  summary,
  providerWorkspaceRecentRows,
  selectedSessionPath,
  onSelectRecentRow,
  backupHubSlot,
}: ProviderWorkspaceBarProps) {
  return (
    <section className="panel provider-workspace-bar provider-archive-stage">
      <header>
        <h2>{messages.providers.hubTitle}</h2>
        <span>{providerLabel}</span>
      </header>
      <div className="provider-workspace-main">
        <div className="provider-workspace-primary">
          <div className="ai-management-focusbar">
            <button
              type="button"
              className={`provider-chip ${providerView === "all" ? "is-active" : ""}`.trim()}
              onClick={() => onSelectProviderView("all")}
            >
              {messages.common.allAi}
            </button>
            {coreProviderTabs.map((tab) => (
              <button
                key={`core-provider-chip-${tab.id}`}
                type="button"
                className={`provider-chip ${providerView === tab.id ? "is-active" : ""}`.trim()}
                onClick={() => onSelectProviderView(tab.id)}
              >
                {tab.name}
              </button>
            ))}
            {optionalProviderTabs.length > 0 ? (
              <details className="provider-chip-disclosure">
                <summary>{messages.providers.optionalProvidersSummary}</summary>
                <div className="provider-chip-disclosure-body">
                  {optionalProviderTabs.map((tab) => (
                    <button
                      key={`optional-provider-chip-${tab.id}`}
                      type="button"
                      className={`provider-chip ${providerView === tab.id ? "is-active" : ""}`.trim()}
                      onClick={() => onSelectProviderView(tab.id)}
                    >
                      {tab.name}
                    </button>
                  ))}
                </div>
              </details>
            ) : null}
          </div>

          <div className="provider-workspace-copy">
            <span className="overview-note-label">original sessions</span>
            <strong>{providerLabel} sessions</strong>
            <p>archive / transcript</p>
          </div>

          <div className="provider-workspace-summary">
            <article className="provider-summary-cell">
              <span>{messages.providers.hubMetricSessions}</span>
              <strong>{summary.sessions}</strong>
            </article>
            <article className="provider-summary-cell">
              <span>{messages.providers.hubMetricSources}</span>
              <strong>{summary.sources}</strong>
            </article>
            <article className="provider-summary-cell">
              <span>{messages.providers.hubMetricTranscript}</span>
              <strong>{summary.transcriptReady}</strong>
            </article>
            <article className="provider-summary-cell">
              <span>{messages.providers.hubMetricParseFail}</span>
              <strong>{summary.parseFail}</strong>
            </article>
          </div>

          {providerWorkspaceRecentRows.length > 0 ? (
            <div className="provider-workspace-recent">
              <div className="provider-workspace-recent-head">
                <span className="overview-note-label">recent rows</span>
                <span className="sub-hint">{providerWorkspaceRecentRows.length} shown</span>
              </div>
              <div className="provider-workspace-recent-list">
                {providerWorkspaceRecentRows.map((row) => (
                  <button
                    key={`workspace-recent-${row.file_path}`}
                    type="button"
                    className={`provider-workspace-recent-item ${selectedSessionPath === row.file_path ? "is-active" : ""}`.trim()}
                    onClick={() => onSelectRecentRow(row)}
                  >
                    <strong>
                      {compactSessionTitle(
                        row.display_title || row.probe.detected_title,
                        row.session_id,
                      )}
                    </strong>
                    <span className="sub-hint">
                      {providerView === "all" ? `${row.provider} · ` : ""}
                      {formatDateTime(row.mtime)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {backupHubSlot}
      </div>
    </section>
  );
}
