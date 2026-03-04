import { useMemo, useState } from "react";
import type { Messages } from "../i18n";
import type {
  ProviderMatrixProvider,
  ProviderView,
  ProviderSessionRow,
  ProviderSessionActionResult,
} from "../types";
import { SKELETON_ROWS } from "../types";

export interface ProvidersPanelProps {
  messages: Messages;

  providers: ProviderMatrixProvider[];
  providerSummary?: { total: number; active: number; detected: number } | undefined;
  providerMatrixLoading: boolean;

  providerTabs: Array<{
    id: ProviderView;
    name: string;
    status: "active" | "detected" | "missing";
    scanned: number;
  }>;
  providerView: ProviderView;
  setProviderView: (v: ProviderView) => void;

  providerSessionRows: ProviderSessionRow[];
  providerSessionSummary: {
    providers: number;
    rows: number;
    parse_ok: number;
    parse_fail: number;
  };
  providerSessionsLoading: boolean;
  selectedProviderFiles: Record<string, boolean>;
  setSelectedProviderFiles: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  allProviderRowsSelected: boolean;
  toggleSelectAllProviderRows: (checked: boolean) => void;
  selectedProviderLabel: string;
  selectedProviderFilePaths: string[];
  canRunProviderAction: boolean;
  busy: boolean;
  runProviderAction: (action: "archive_local" | "delete_local", dryRun: boolean) => void;
  providerActionData: ProviderSessionActionResult | null;

  parserReports: Array<{
    provider: string;
    name: string;
    status: "active" | "detected" | "missing";
    scanned: number;
    parse_ok: number;
    parse_fail: number;
    parse_score: number | null;
    truncated: boolean;
    sample_errors?: Array<{ session_id: string; format: string; error: string | null }>;
  }>;
  parserLoading: boolean;
  parserSummary: {
    providers: number;
    scanned: number;
    parse_ok: number;
    parse_fail: number;
    parse_score: number | null;
  };

  selectedSessionPath: string;
  setSelectedSessionPath: (path: string) => void;
}

export function ProvidersPanel(props: ProvidersPanelProps) {
  const {
    messages,
    providers,
    providerSummary,
    providerMatrixLoading,
    providerTabs,
    providerView,
    setProviderView,
    providerSessionRows,
    providerSessionSummary,
    providerSessionsLoading,
    selectedProviderFiles,
    setSelectedProviderFiles,
    allProviderRowsSelected,
    toggleSelectAllProviderRows,
    selectedProviderLabel,
    selectedProviderFilePaths,
    canRunProviderAction,
    busy,
    runProviderAction,
    providerActionData,
    parserReports,
    parserLoading,
    parserSummary,
    selectedSessionPath,
    setSelectedSessionPath,
  } = props;
  const [sessionFilter, setSessionFilter] = useState("");

  const statusLabel = (status: "active" | "detected" | "missing") => {
    if (status === "active") return messages.providers.statusActive;
    if (status === "detected") return messages.providers.statusDetected;
    return messages.providers.statusMissing;
  };

  const actionLabel = (action: "archive_local" | "delete_local") => {
    if (action === "archive_local") return messages.providers.actionArchiveLocal;
    return messages.providers.actionDeleteLocal;
  };

  const providerLabel = providerView === "all" ? messages.common.allAi : selectedProviderLabel;
  const filteredProviderSessionRows = useMemo(() => {
    const q = sessionFilter.trim().toLowerCase();
    if (!q) return providerSessionRows;
    return providerSessionRows.filter((row) => {
      const text = [
        row.display_title,
        row.probe?.detected_title,
        row.session_id,
        row.file_path,
        row.provider,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });
  }, [providerSessionRows, sessionFilter]);

  return (
    <>
      <section className="panel provider-panel">
        <header>
          <h2>{messages.providers.matrixTitle}</h2>
          <span>
            {messages.providers.active} {providerSummary?.active ?? 0}/{providerSummary?.total ?? providers.length}
          </span>
        </header>
        <div className="provider-table-wrap">
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
              {providers.map((p) => (
                <tr key={p.provider}>
                  <td className="title-col">{p.name}</td>
                  <td>
                    <span className={`status-pill status-${p.status}`}>{statusLabel(p.status)}</span>
                  </td>
                  <td>{p.capability_level}</td>
                  <td>{p.capabilities.read_sessions ? messages.common.yes : "-"}</td>
                  <td>{p.capabilities.analyze_context ? messages.common.yes : "-"}</td>
                  <td>{p.capabilities.safe_cleanup ? messages.common.yes : "-"}</td>
                  <td>{p.capabilities.hard_delete ? messages.common.yes : "-"}</td>
                  <td>{p.evidence?.session_log_count ?? 0}</td>
                  <td className="notes-col">
                    {p.status === "detected" && (p.evidence?.session_log_count ?? 0) === 0
                      ? messages.providers.installDetected
                      : p.evidence?.notes ?? "-"}
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
                    {messages.providers.matrixLoading}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="provider-tabs" role="tablist" aria-label={messages.providers.providerTabsLabel}>
        {providerTabs.map((tab) => (
          <button
            key={`provider-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={providerView === tab.id}
            className={`provider-tab ${providerView === tab.id ? "is-active" : ""}`}
            onClick={() => setProviderView(tab.id)}
          >
            <span className="provider-tab-title">{tab.id === "all" ? messages.common.allAi : tab.name}</span>
            <span className="provider-tab-meta">
              {tab.scanned} {messages.providers.sessionsSuffix}
            </span>
            <span className={`status-pill status-${tab.status}`}>{statusLabel(tab.status)}</span>
          </button>
        ))}
      </section>

      <section className="toolbar">
        <span className="sub-hint">{messages.providers.parserHint}</span>
      </section>

      <section className="provider-ops-layout">
        <section className="panel">
          <header>
            <h2>{messages.providers.sessionsTitle}</h2>
            <span>
              {providerSessionSummary.rows ?? providerSessionRows.length} {messages.providers.rows} · {messages.providers.parseOk}{" "}
              {providerSessionSummary.parse_ok ?? 0}
            </span>
          </header>
          <div className="sub-toolbar">
            <input
              className="search-input"
              placeholder={messages.providers.sessionSearchPlaceholder}
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
            />
            <span className="sub-hint">
              {messages.providers.filteredRows} {filteredProviderSessionRows.length}/{providerSessionRows.length}
            </span>
          </div>
          <div className="sub-toolbar">
            <label className="check-inline">
              <input
                type="checkbox"
                checked={allProviderRowsSelected}
                onChange={(e) => toggleSelectAllProviderRows(e.target.checked)}
              />
              {messages.providers.selectAllInTab}
            </label>
            <span className="sub-hint">
              {providerLabel} · {messages.providers.selected} {selectedProviderFilePaths.length}
            </span>
          </div>
          <div className="sub-toolbar">
            <button
              className="btn-outline"
              disabled={!canRunProviderAction || busy}
              onClick={() => runProviderAction("archive_local", true)}
            >
              {messages.providers.archiveDryRun}
            </button>
            <button
              className="btn-base"
              disabled={!canRunProviderAction || busy}
              onClick={() => runProviderAction("archive_local", false)}
            >
              {messages.providers.archive}
            </button>
            <button
              className="btn-outline"
              disabled={!canRunProviderAction || busy}
              onClick={() => runProviderAction("delete_local", true)}
            >
              {messages.providers.deleteDryRun}
            </button>
            <button
              className="btn-accent"
              disabled={!canRunProviderAction || busy}
              onClick={() => runProviderAction("delete_local", false)}
            >
              {messages.providers.delete}
            </button>
            <span className="sub-hint">{messages.providers.alwaysDryRun}</span>
          </div>
          <div className="provider-table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>{messages.providers.colProvider}</th>
                  <th>{messages.providers.colSession}</th>
                  <th>{messages.threadDetail.fieldSource}</th>
                  <th>{messages.providers.colFormat}</th>
                  <th>{messages.providers.colProbe}</th>
                  <th>{messages.providers.colSize}</th>
                </tr>
              </thead>
              <tbody>
                {filteredProviderSessionRows.slice(0, 120).map((row) => (
                  <tr
                    key={`${row.provider}-${row.session_id}-${row.file_path}`}
                    className={selectedSessionPath === row.file_path ? "active-row" : undefined}
                    onClick={() => {
                      setSelectedSessionPath(row.file_path);
                      setSelectedProviderFiles((prev) => ({ ...prev, [row.file_path]: true }));
                    }}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedProviderFiles[row.file_path])}
                        onChange={(e) =>
                          setSelectedProviderFiles((prev) => ({ ...prev, [row.file_path]: e.target.checked }))
                        }
                      />
                    </td>
                    <td>{row.provider}</td>
                    <td className="title-col">
                      <div className="title-main">{row.display_title || row.probe.detected_title || row.session_id}</div>
                      <div className="mono-sub">{row.session_id}</div>
                    </td>
                    <td>{row.source}</td>
                    <td>{row.probe.format}</td>
                    <td>{row.probe.ok ? messages.common.ok : messages.common.fail}</td>
                    <td>{row.size_bytes.toLocaleString()}</td>
                  </tr>
                ))}
                {providerSessionsLoading
                  ? Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
                      <tr key={`provider-session-skeleton-${idx}`}>
                        <td colSpan={7}>
                          <div className="skeleton-line" />
                        </td>
                      </tr>
                    ))
                  : null}
                {filteredProviderSessionRows.length === 0 && !providerSessionsLoading ? (
                  <tr>
                    <td colSpan={7} className="sub-hint">
                      {messages.providers.sessionsLoading}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {providerActionData ? (
            <div className="sub-toolbar">
              <span className="sub-hint">
                {messages.providers.action} {actionLabel(providerActionData.action)} · {messages.providers.valid}{" "}
                {providerActionData.valid_count} · {messages.providers.applied} {providerActionData.applied_count} · {messages.providers.token}{" "}
                {providerActionData.confirm_token_expected}
              </span>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <header>
            <h2>{messages.providers.parserTitle}</h2>
            <span>
              {messages.providers.score} {parserSummary.parse_score ?? "-"}
            </span>
          </header>
          <div className="provider-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{messages.providers.colProvider}</th>
                  <th>{messages.providers.colStatus}</th>
                  <th>{messages.providers.colScanned}</th>
                  <th>{messages.providers.colParseOk}</th>
                  <th>{messages.providers.colParseFail}</th>
                  <th>{messages.providers.colScore}</th>
                </tr>
              </thead>
              <tbody>
                {parserReports.map((report) => (
                  <tr key={`parser-${report.provider}`}>
                    <td>{report.name}</td>
                    <td>
                      <span className={`status-pill status-${report.status}`}>{statusLabel(report.status)}</span>
                    </td>
                    <td>{report.scanned}</td>
                    <td>{report.parse_ok}</td>
                    <td>{report.parse_fail}</td>
                    <td>{report.parse_score ?? "-"}</td>
                  </tr>
                ))}
                {parserLoading
                  ? Array.from({ length: 4 }).map((_, idx) => (
                      <tr key={`parser-health-skeleton-${idx}`}>
                        <td colSpan={6}>
                          <div className="skeleton-line" />
                        </td>
                      </tr>
                    ))
                  : null}
                {parserReports.length === 0 && !parserLoading ? (
                  <tr>
                    <td colSpan={6} className="sub-hint">
                      {messages.providers.parserLoading}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </>
  );
}
