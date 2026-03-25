import type { Messages } from "../../i18n";
import { formatDateTime } from "../../lib/helpers";
import type { ProviderDataDepth } from "../../types";
import { formatFetchMs } from "./helpers";

export interface ProviderAdvancedShellProps {
  messages: Messages;
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  onRefreshProvidersData: () => void;
  providersRefreshing: boolean;
  providersLastRefreshAt: string;
  providerDataDepth: ProviderDataDepth;
  onProviderDataDepthChange: (value: ProviderDataDepth) => void;
  slowProviderThresholdMs: number;
  slowThresholdOptions: number[];
  onSlowProviderThresholdChange: (value: number) => void;
  canReturnHotspotScope: boolean;
  hotspotOriginLabel: string;
  onReturnHotspotScope: () => void;
  providerFetchMetrics: {
    data_sources: number | null;
    matrix: number | null;
    sessions: number | null;
    parser: number | null;
  };
  slowProviderIdsCount: number;
  providerTabCount: number;
  slowProviderSummary: string;
  hasSlowProviderFetch: boolean;
  matrixSlot: React.ReactNode;
}

export function ProviderAdvancedShell({
  messages,
  advancedOpen,
  onAdvancedOpenChange,
  onRefreshProvidersData,
  providersRefreshing,
  providersLastRefreshAt,
  providerDataDepth,
  onProviderDataDepthChange,
  slowProviderThresholdMs,
  slowThresholdOptions,
  onSlowProviderThresholdChange,
  canReturnHotspotScope,
  hotspotOriginLabel,
  onReturnHotspotScope,
  providerFetchMetrics,
  slowProviderIdsCount,
  providerTabCount,
  slowProviderSummary,
  hasSlowProviderFetch,
  matrixSlot,
}: ProviderAdvancedShellProps) {
  return (
    <details
      className="panel panel-disclosure provider-advanced-shell"
      open={advancedOpen}
      onToggle={(event) => {
        onAdvancedOpenChange((event.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary className="provider-advanced-summary">
        <span className="provider-advanced-summary-copy">
          <span className="provider-advanced-summary-kicker">
            {messages.providers.advancedTitle}
          </span>
          <strong>Refresh / scan</strong>
          <span className="provider-advanced-summary-body">
            {providersLastRefreshAt
              ? `${messages.providers.lastRefresh} ${formatDateTime(providersLastRefreshAt)}`
              : "Open scan settings, latency checks, and forced refresh."}
          </span>
        </span>
        <span className="provider-advanced-summary-pill">
          {advancedOpen ? "Hide" : "Open"}
        </span>
      </summary>
      <div className="panel-disclosure-body provider-advanced-stack">
        {advancedOpen ? (
          <>
            <section className="toolbar provider-diagnostics-toolbar">
              <button
                className="btn-outline"
                type="button"
                onClick={onRefreshProvidersData}
                disabled={providersRefreshing}
              >
                {providersRefreshing
                  ? messages.providers.refreshing
                  : messages.providers.refreshNow}
              </button>
              <span className="sub-hint">
                {providersLastRefreshAt
                  ? `${messages.providers.lastRefresh} ${formatDateTime(providersLastRefreshAt)}`
                  : "No refresh yet."}
              </span>
              <details className="inline-tools-disclosure">
                <summary>Scan settings / slow checks</summary>
                <div className="sub-toolbar inline-tools-disclosure-body">
                  <label className="provider-quick-switch">
                    <span>{messages.providers.depthLabel}</span>
                    <select
                      className="provider-quick-select"
                      value={providerDataDepth}
                      onChange={(e) =>
                        onProviderDataDepthChange(e.target.value as ProviderDataDepth)
                      }
                    >
                      <option value="fast">{messages.providers.depthFast}</option>
                      <option value="balanced">{messages.providers.depthBalanced}</option>
                      <option value="deep">{messages.providers.depthDeep}</option>
                    </select>
                  </label>
                  <label className="provider-quick-switch">
                    <span>{messages.providers.slowThresholdLabel}</span>
                    <select
                      className="provider-quick-select"
                      value={String(slowProviderThresholdMs)}
                      onChange={(e) => {
                        const nextValue = Number(e.target.value);
                        if (Number.isFinite(nextValue)) onSlowProviderThresholdChange(nextValue);
                      }}
                    >
                      {slowThresholdOptions.map((thresholdMs) => (
                        <option key={`slow-threshold-${thresholdMs}`} value={thresholdMs}>
                          {thresholdMs}ms
                        </option>
                      ))}
                    </select>
                  </label>
                  {canReturnHotspotScope ? (
                    <button
                      className="btn-outline"
                      type="button"
                      onClick={onReturnHotspotScope}
                    >
                      {messages.providers.scopeReturn} {hotspotOriginLabel}
                    </button>
                  ) : null}
                  <span className="sub-hint">
                    {messages.providers.parserHint}
                    {` · ${messages.providers.fetchMsLabel} `}
                    {`${messages.providers.fetchMsDataSources} ${formatFetchMs(providerFetchMetrics.data_sources)}`}
                    {` · ${messages.providers.fetchMsMatrix} ${formatFetchMs(providerFetchMetrics.matrix)}`}
                    {` · ${messages.providers.fetchMsSessions} ${formatFetchMs(providerFetchMetrics.sessions)}`}
                    {` · ${messages.providers.fetchMsParser} ${formatFetchMs(providerFetchMetrics.parser)}`}
                    {` · ${messages.providers.slowProvidersLabel} ${slowProviderIdsCount}/${providerTabCount}`}
                    {` · ${messages.providers.slowThresholdLabel} ${slowProviderThresholdMs}ms`}
                    {slowProviderIdsCount > 0
                      ? ` · ${slowProviderSummary}`
                      : ` · ${messages.providers.slowProvidersNone}`}
                    {hasSlowProviderFetch ? ` · ${messages.providers.fetchMsSlow}` : ""}
                  </span>
                </div>
              </details>
            </section>

            {matrixSlot}
          </>
        ) : (
          <div className="info-box compact">
            <strong>Open only when needed.</strong>
            <p>parser / slow scan / paths</p>
          </div>
        )}
      </div>
    </details>
  );
}
