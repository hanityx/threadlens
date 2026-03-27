import type { Messages } from "../../i18n";
import type { ProviderView } from "../../types";

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
    archived: number;
    lastRefreshAt: string;
  };
}

function formatRefreshAge(iso: string): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function ProviderWorkspaceBar({
  messages,
  providerLabel,
  providerView,
  coreProviderTabs,
  optionalProviderTabs,
  onSelectProviderView,
  summary,
}: ProviderWorkspaceBarProps) {
  const allTabs = [...coreProviderTabs, ...optionalProviderTabs];

  return (
    <section className="page-section-header provider-workspace-bar">
      <div className="provider-workspace-copy">
        <div className="thread-workflow-copy-eyebrow">
          <span className="overview-note-label">sessions</span>
        </div>
        <strong>{providerLabel}</strong>
        <p>Browse, back up, and export.</p>
      </div>

      <div className="ai-management-focusbar">
        <button
          type="button"
          className={`provider-chip ${providerView === "all" ? "is-active" : ""}`.trim()}
          onClick={() => onSelectProviderView("all")}
        >
          {messages.common.allAi}
        </button>
        {allTabs.map((tab) => (
          <button
            key={`provider-chip-${tab.id}`}
            type="button"
            className={`provider-chip ${providerView === tab.id ? "is-active" : ""}`.trim()}
            onClick={() => onSelectProviderView(tab.id)}
          >
            {tab.name}
          </button>
        ))}
      </div>

      <div className="provider-workspace-summary">
        <article className="provider-summary-cell">
          <span>{messages.providers.hubMetricSessions}</span>
          <strong>{summary.sessions}</strong>
        </article>
        {summary.archived > 0 ? (
          <article className="provider-summary-cell is-muted">
            <span>archived</span>
            <strong>{summary.archived}</strong>
          </article>
        ) : null}
        <article className="provider-summary-cell">
          <span>{messages.providers.hubMetricTranscript}</span>
          <strong>{summary.transcriptReady}</strong>
        </article>
        {summary.parseFail > 0 ? (
          <article className="provider-summary-cell is-warn">
            <span>{messages.providers.hubMetricParseFail}</span>
            <strong>{summary.parseFail}</strong>
          </article>
        ) : (
          <article className="provider-summary-cell is-ok">
            <span>parse</span>
            <strong>OK</strong>
          </article>
        )}
        <article className="provider-summary-cell is-muted">
          <span>synced</span>
          <strong>{formatRefreshAge(summary.lastRefreshAt)}</strong>
        </article>
      </div>
    </section>
  );
}
