import type { ReactNode } from "react";
import type { Messages } from "@/i18n";
import type { DataSourceInventoryRow, ProviderMatrixProvider } from "@/shared/types";
import type { ProviderView } from "@/shared/types";
import "./aiManagementMatrix.css";

export interface SlowHotspotCard {
  provider: string;
  name: string;
  scanMs: number | null;
  scanned: number;
  parseFail: number;
  parseScore: number | null;
}

export interface ProviderFlowCard {
  providerId: string;
  name: string;
  status: "active" | "detected" | "missing";
  scanMs: number | null;
  isSlow: boolean;
  parseFail: number;
  parseScore: number | null;
  canRead: boolean;
  canAnalyze: boolean;
  canSafeCleanup: boolean;
  roots: string[];
  sources: Array<Pick<DataSourceInventoryRow, "source_key" | "path">>;
  presentSourceCount: number;
  sessionCount: number;
  nextStep: string;
  flow: Array<{ key: string; label: string; state: "done" | "pending" | "blocked" }>;
}

export interface AiManagementMatrixProps {
  messages: Messages;
  providerSummary?: { active: number; total: number };
  providers: ProviderMatrixProvider[];
  providerMatrixLoading: boolean;
  providerScanMsById: ReadonlyMap<string, number | null>;
  slowProviderSet: ReadonlySet<string>;
  statusLabel: (status: ProviderMatrixProvider["status"]) => string;
  capabilityLevelLabel: (level: string) => string;
  onJumpToProviderSessions: (providerId: string, parseFail?: number, options?: { fromHotspot?: boolean }) => void;
  slowHotspotCards: SlowHotspotCard[];
  providerTabCount: number;
  slowFocusActive: boolean;
  onFocusSlowProviders: () => void;
  onClearSlowFocus: () => void;
  onJumpToParserProvider: (providerId: string) => void;
  visibleFlowCards: ProviderFlowCard[];
  providerView: ProviderView;
  allViewHiddenCount: number;
  flowStateLabel: (state: "done" | "pending" | "blocked") => string;
  dataSourcesSlot?: ReactNode;
}

export function AiManagementMatrix(props: AiManagementMatrixProps) {
  const {
    messages,
    providers,
    providerMatrixLoading,
    statusLabel,
    capabilityLevelLabel,
    onJumpToProviderSessions,
    dataSourcesSlot,
  } = props;

  return (
    <>
      <div className="provider-table-wrap provider-matrix-compact" aria-label={messages.providers.matrixDisclosure}>
        <table>
          <thead>
            <tr>
              <th>{messages.providers.colProvider}</th>
              <th>{messages.providers.colStatus}</th>
              <th>{messages.providers.colCapability}</th>
              <th>{messages.providers.colRead}</th>
              <th>{messages.providers.colAnalyze}</th>
              <th>{messages.providers.colSafeCleanup}</th>
              <th>{messages.providers.colHardDelete}</th>
              <th>{messages.providers.colLogs}</th>
              <th>{messages.providers.colNotes}</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.provider}>
                <td className="title-col">
                  <div className="provider-name-cell">
                    <span>{provider.name}</span>
                    <button
                      type="button"
                      className="inline-link-btn"
                      onClick={() => onJumpToProviderSessions(provider.provider)}
                    >
                      {messages.providers.openSessions}
                    </button>
                  </div>
                </td>
                <td>
                  <span className={`status-pill status-${provider.status}`}>{statusLabel(provider.status)}</span>
                </td>
                <td>{capabilityLevelLabel(provider.capability_level)}</td>
                <td>{provider.capabilities.read_sessions ? messages.common.yes : "-"}</td>
                <td>{provider.capabilities.analyze_context ? messages.common.yes : "-"}</td>
                <td>{provider.capabilities.safe_cleanup ? messages.common.yes : "-"}</td>
                <td>{provider.capabilities.hard_delete ? messages.common.yes : "-"}</td>
                <td>{provider.evidence?.session_log_count ?? 0}</td>
                <td className="notes-col">
                  <div>
                    {provider.status === "detected" && (provider.evidence?.session_log_count ?? 0) === 0
                      ? messages.providers.installDetected
                      : provider.evidence?.notes ?? "-"}
                  </div>
                  <details className="provider-roots">
                    <summary>
                      {messages.providers.rootsLabel} ({provider.evidence?.roots?.length ?? 0})
                    </summary>
                    <ul>
                      {(provider.evidence?.roots ?? []).length === 0 ? (
                        <li className="mono-sub">{messages.providers.rootsNone}</li>
                      ) : (
                        (provider.evidence?.roots ?? []).map((root) => (
                          <li key={`${provider.provider}-${root}`} className="mono-sub">
                            {root}
                          </li>
                        ))
                      )}
                    </ul>
                  </details>
                </td>
              </tr>
            ))}
            {providerMatrixLoading
              ? Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={`provider-matrix-skeleton-${idx}`}>
                    <td colSpan={9}>
                      <div className="skeleton-line" />
                    </td>
                  </tr>
                ))
              : null}
            {providers.length === 0 && !providerMatrixLoading ? (
              <tr>
                <td colSpan={9} className="sub-hint">
                  {messages.providers.matrixEmpty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {dataSourcesSlot}
    </>
  );
}
