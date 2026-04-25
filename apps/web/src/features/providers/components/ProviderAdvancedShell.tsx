import type { Messages } from "@/i18n";
import { Button } from "@/shared/ui/components/Button";
import { formatDateTime } from "@/shared/lib/format";
import type { ProviderDataDepth } from "@/shared/types";
import "./providerAdvanced.css";

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
  canReturnHotspotScope,
  hotspotOriginLabel,
  onReturnHotspotScope,
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
          <strong>{messages.providers.advancedSummaryTitle}</strong>
          <span className="provider-advanced-summary-body">
            {providersLastRefreshAt
              ? `${messages.providers.lastRefresh} ${formatDateTime(providersLastRefreshAt)}`
              : messages.providers.advancedSummaryBodyClosed}
          </span>
        </span>
        <span className="provider-advanced-summary-pill">
          {advancedOpen
            ? messages.providers.advancedSummaryPillHide
            : messages.providers.advancedSummaryPillOpen}
        </span>
      </summary>
      <div className="panel-disclosure-body provider-advanced-stack">
        {advancedOpen ? (
          <>
            <section className="toolbar provider-diagnostics-toolbar">
              <Button
                variant="outline"
                onClick={onRefreshProvidersData}
                disabled={providersRefreshing}
              >
                {providersRefreshing
                  ? messages.providers.refreshing
                  : messages.providers.refreshNow}
              </Button>
              <span className="sub-hint">
                {providersLastRefreshAt
                  ? `${messages.providers.lastRefresh} ${formatDateTime(providersLastRefreshAt)}`
                  : messages.providers.advancedNoRefreshYet}
              </span>
              <div className="inline-tools-disclosure">
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
                  {canReturnHotspotScope ? (
                    <Button
                      variant="outline"
                      onClick={onReturnHotspotScope}
                    >
                      {messages.providers.scopeReturn} {hotspotOriginLabel}
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>

            {matrixSlot}
          </>
        ) : null}
      </div>
    </details>
  );
}
