import type { ReactNode } from "react";
import type { Messages } from "../../i18n";
import type { DataSourceInventoryRow, ProviderMatrixProvider } from "../../types";
import { dataSourceLabel, formatFetchMs } from "./helpers";

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
  flowStateLabel: (state: "done" | "pending" | "blocked") => string;
  dataSourcesSlot?: ReactNode;
}

export function AiManagementMatrix(props: AiManagementMatrixProps) {
  const {
    messages,
    providerSummary,
    providers,
    providerMatrixLoading,
    providerScanMsById,
    slowProviderSet,
    statusLabel,
    capabilityLevelLabel,
    onJumpToProviderSessions,
    slowHotspotCards,
    providerTabCount,
    slowFocusActive,
    onFocusSlowProviders,
    onClearSlowFocus,
    onJumpToParserProvider,
    visibleFlowCards,
    flowStateLabel,
    dataSourcesSlot,
  } = props;

  return (
    <>
      <details className="panel panel-disclosure provider-panel">
        <summary>
          {messages.providers.matrixDisclosure} · {messages.providers.active}{" "}
          {providerSummary?.active ?? 0}/{providerSummary?.total ?? providers.length}
        </summary>
        <div className="panel-disclosure-body provider-table-wrap">
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
              {providers.map((provider) => {
                const providerScanMs = providerScanMsById.get(provider.provider) ?? null;
                const providerSlow = slowProviderSet.has(provider.provider);
                return (
                  <tr key={provider.provider} className={providerSlow ? "provider-slow-row" : undefined}>
                    <td className="title-col">
                      <div className="provider-name-cell">
                        <span>{provider.name}</span>
                        {providerSlow ? (
                          <span className="provider-slow-badge">
                            {messages.providers.slowProviderBadge}
                            {providerScanMs !== null ? ` ${formatFetchMs(providerScanMs)}` : ""}
                          </span>
                        ) : null}
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
                );
              })}
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
                    {messages.providers.matrixLoading}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </details>

      {dataSourcesSlot}

      {slowHotspotCards.length > 0 ? (
        <details className="panel panel-disclosure">
          <summary>
            {messages.providers.hotspotDisclosure} · {slowHotspotCards.length}/{providerTabCount}
          </summary>
          <div className="panel-disclosure-body">
            <div className="sub-toolbar">
              {!slowFocusActive ? (
                <button type="button" className="btn-outline" onClick={onFocusSlowProviders}>
                  {messages.providers.hotspotFocusSlow}
                </button>
              ) : (
                <button type="button" className="btn-outline" onClick={onClearSlowFocus}>
                  {messages.providers.hotspotClearFocus}
                </button>
              )}
            </div>
            <div className="hotspot-grid">
              {slowHotspotCards.map((card) => (
                <article key={`hotspot-${card.provider}`} className="hotspot-card">
                  <div className="hotspot-head">
                    <strong>{card.name}</strong>
                    <span className="provider-slow-badge">
                      {messages.providers.slowProviderBadge} {formatFetchMs(card.scanMs)}
                    </span>
                  </div>
                  <div className="hotspot-meta">
                    <span>{messages.providers.hotspotScan} {formatFetchMs(card.scanMs)}</span>
                    <span>{messages.providers.hotspotRows} {card.scanned}</span>
                    <span>{messages.providers.hotspotParseFail} {card.parseFail}</span>
                    <span>{messages.providers.score} {card.parseScore ?? "-"}</span>
                  </div>
                  <div className="hotspot-actions">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => onJumpToProviderSessions(card.provider, card.parseFail, { fromHotspot: true })}
                    >
                      {messages.providers.openSessions}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => onJumpToParserProvider(card.provider)}
                    >
                      {messages.providers.hotspotOpenParser}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </details>
      ) : null}

      <details className="panel panel-disclosure">
        <summary>
          {messages.providers.flowBoardTitle} · {messages.providers.flowBoardSubtitle} {visibleFlowCards.length}
        </summary>
        <div className="panel-disclosure-body provider-flow-board">
          {visibleFlowCards.map((card) => (
            <article
              key={`provider-flow-${card.providerId}`}
              className={`provider-flow-card ${card.parseFail > 0 ? "is-warning" : ""}`.trim()}
            >
              <div className="provider-flow-head">
                <div>
                  <strong>{card.name}</strong>
                  <div className="mono-sub">{card.providerId}</div>
                </div>
                <div className="provider-flow-head-meta">
                  {card.scanMs !== null ? (
                    <span className="provider-slow-badge">{formatFetchMs(card.scanMs)}</span>
                  ) : null}
                  <span className={`status-pill status-${card.status}`}>{statusLabel(card.status)}</span>
                </div>
              </div>

              <div className="provider-capability-row">
                <span className={`capability-chip ${card.canRead ? "is-on" : "is-off"}`}>{messages.providers.colRead}</span>
                <span className={`capability-chip ${card.canAnalyze ? "is-on" : "is-off"}`}>{messages.providers.colAnalyze}</span>
                <span className={`capability-chip ${card.canSafeCleanup ? "is-on" : "is-off"}`}>{messages.providers.colSafeCleanup}</span>
              </div>

              <div className="provider-flow-track">
                {card.flow.map((stage, idx) => (
                  <div key={`${card.providerId}-${stage.key}`} className="provider-flow-segment">
                    <div className={`provider-flow-node is-${stage.state}`}>
                      <span className="provider-flow-node-label">{stage.label}</span>
                      <span className="provider-flow-node-state">{flowStateLabel(stage.state)}</span>
                    </div>
                    {idx < card.flow.length - 1 ? <span className="provider-flow-arrow">→</span> : null}
                  </div>
                ))}
              </div>

              <div className="provider-flow-config-grid">
                <div className="provider-flow-config">
                  <h3>{messages.providers.configMapRoots}</h3>
                  <ul>
                    {card.roots.length === 0 ? (
                      <li className="mono-sub">{messages.providers.configMapNoRoots}</li>
                    ) : (
                      card.roots.slice(0, 3).map((root) => (
                        <li key={`${card.providerId}-root-${root}`} className="mono-sub provider-config-path" title={root}>
                          {root}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div className="provider-flow-config">
                  <h3>{messages.providers.configMapSources}</h3>
                  <ul>
                    {card.sources.length === 0 ? (
                      <li className="mono-sub">{messages.providers.configMapNoSources}</li>
                    ) : (
                      card.sources.slice(0, 3).map((source) => (
                        <li key={`${card.providerId}-source-${source.source_key}`}>
                          <strong>{dataSourceLabel(source.source_key)}</strong>
                          <span className="mono-sub provider-config-path" title={source.path}>
                            {source.path || "-"}
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              <div className="provider-flow-actions">
                <span className="sub-hint">
                  {messages.providers.flowNextLabel} {card.nextStep}
                </span>
                <span className="sub-hint">
                  {messages.providers.dataSourcesDetected} {card.presentSourceCount}/{card.sources.length} · {messages.providers.rows} {card.sessionCount}
                  {card.parseFail > 0 ? ` · ${messages.providers.colParseFail} ${card.parseFail}` : ""}
                  {card.parseScore !== null ? ` · ${messages.providers.score} ${card.parseScore}` : ""}
                </span>
                <div className="provider-flow-button-group">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => onJumpToProviderSessions(card.providerId, card.parseFail)}
                  >
                    {messages.providers.openSessions}
                  </button>
                  {card.parseFail > 0 ? (
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => onJumpToParserProvider(card.providerId)}
                    >
                      {messages.providers.hotspotOpenParser}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </details>
    </>
  );
}
