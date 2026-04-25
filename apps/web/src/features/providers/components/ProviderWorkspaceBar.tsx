import type { Messages } from "@/i18n";
import { Chip } from "@/shared/ui/components/Chip";
import type { ProviderView } from "@/shared/types";
import "./providerWorkspaceBar.css";

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
  searchSlot?: React.ReactNode;
}

function formatProviderMessage(
  template: string,
  replacements: Record<string, string | number>,
): string {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function formatRefreshAge(messages: Messages, iso: string): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) {
    return formatProviderMessage(messages.providers.refreshAgeSeconds, { count: s });
  }
  const m = Math.floor(s / 60);
  if (m < 60) {
    return formatProviderMessage(messages.providers.refreshAgeMinutes, { count: m });
  }
  return formatProviderMessage(messages.providers.refreshAgeHours, {
    count: Math.floor(m / 60),
  });
}

export function ProviderWorkspaceBar({
  messages,
  providerLabel,
  providerView,
  coreProviderTabs,
  optionalProviderTabs,
  onSelectProviderView,
  summary,
  searchSlot,
}: ProviderWorkspaceBarProps) {
  const allTabs = [...coreProviderTabs, ...optionalProviderTabs];

  return (
    <section className="page-section-header provider-workspace-bar">
      <div className="provider-workspace-copy">
        <strong className="provider-workspace-title">
          {providerLabel}
        </strong>
        <p>{messages.providers.hubBody}</p>
      </div>

      <div className="ai-management-focusbar">
        <Chip active={providerView === "all"} onClick={() => onSelectProviderView("all")}>
          {messages.common.allAi}
        </Chip>
        {allTabs.map((tab) => (
          <Chip
            key={`provider-chip-${tab.id}`}
            active={providerView === tab.id}
            onClick={() => onSelectProviderView(tab.id)}
          >
            {tab.name}
          </Chip>
        ))}
      </div>

      <div className="provider-workspace-summary">
        <article className="provider-summary-cell">
          <span>{messages.providers.hubMetricSessions}</span>
          <strong>{summary.sessions}</strong>
        </article>
        {summary.archived > 0 ? (
          <article className="provider-summary-cell is-muted">
            <span>{messages.providers.hubMetricArchived}</span>
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
            <span>{messages.providers.hubMetricParse}</span>
            <strong>{messages.common.ok}</strong>
          </article>
        )}
        <article className="provider-summary-cell is-muted">
          <span>{messages.providers.hubMetricSynced}</span>
          <strong>{formatRefreshAge(messages, summary.lastRefreshAt)}</strong>
        </article>
      </div>
      {searchSlot}
    </section>
  );
}
