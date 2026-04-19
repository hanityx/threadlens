import type { Messages } from "@/i18n";
import type { ProviderParserHealthReport } from "@/shared/types";
import { formatFetchMs } from "@/features/providers/lib/helpers";

export interface ParserHealthOverviewProps {
  messages: Messages;
  selectedSessionProvider: string;
  selectedSessionProviderVisibleInParser: boolean;
  parserFailOnly: boolean;
  onParserFailOnlyChange: (value: boolean) => void;
  filteredParserReportsCount: number;
  totalParserReportsCount: number;
  parserSort: string;
  onParserSortChange: (value: string) => void;
  sortedParserReports: ProviderParserHealthReport[];
  parserLoading: boolean;
  slowProviderSet: ReadonlySet<string>;
  statusLabel: (status: ProviderParserHealthReport["status"]) => string;
  onJumpToProviderSessions: (providerId: string, parseFail: number) => void;
}

export function ParserHealthOverview(props: ParserHealthOverviewProps) {
  const {
    messages,
    selectedSessionProvider,
    selectedSessionProviderVisibleInParser,
    parserFailOnly,
    onParserFailOnlyChange,
    filteredParserReportsCount,
    totalParserReportsCount,
    parserSort,
    onParserSortChange,
    sortedParserReports,
    parserLoading,
    slowProviderSet,
    statusLabel,
    onJumpToProviderSessions,
  } = props;

  return (
    <>
      <div className="sub-toolbar">
        <span className="sub-hint">{messages.providers.parserJumpHint}</span>
        {selectedSessionProvider ? (
          <span className="sub-hint">
            {messages.providers.parserLinkedProvider} {selectedSessionProvider}
            {!selectedSessionProviderVisibleInParser ? ` · ${messages.providers.parserLinkedHidden}` : ""}
          </span>
        ) : null}
      </div>
      <div className="sub-toolbar">
        <label className="check-inline">
          <input
            type="checkbox"
            checked={parserFailOnly}
            onChange={(e) => onParserFailOnlyChange(e.target.checked)}
          />
          {messages.providers.parserFailOnly}
        </label>
        <span className="sub-hint">
          {messages.providers.filteredRows} {filteredParserReportsCount}/{totalParserReportsCount}
        </span>
        <select
          className="filter-select"
          aria-label={messages.providers.parserSortLabel}
          value={parserSort}
          onChange={(e) => onParserSortChange(e.target.value)}
        >
          <option value="fail_desc">{messages.providers.parserSortFailDesc}</option>
          <option value="fail_asc">{messages.providers.parserSortFailAsc}</option>
          <option value="score_desc">{messages.providers.parserSortScoreDesc}</option>
          <option value="score_asc">{messages.providers.parserSortScoreAsc}</option>
          <option value="scan_ms_desc">{messages.providers.parserSortScanDesc}</option>
          <option value="scan_ms_asc">{messages.providers.parserSortScanAsc}</option>
          <option value="name_asc">{messages.providers.parserSortNameAsc}</option>
          <option value="name_desc">{messages.providers.parserSortNameDesc}</option>
        </select>
      </div>
      <div className="provider-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{messages.providers.colProvider}</th>
              <th>{messages.providers.colStatus}</th>
              <th>{messages.providers.colScanned}</th>
              <th>{messages.providers.colScanMs}</th>
              <th>{messages.providers.colParseOk}</th>
              <th>{messages.providers.colParseFail}</th>
              <th>{messages.providers.colScore}</th>
            </tr>
          </thead>
          <tbody>
            {sortedParserReports.map((report) => (
              <tr
                key={`parser-${report.provider}`}
                data-parser-provider-key={encodeURIComponent(report.provider)}
                className={[
                  "parser-jump-row",
                  selectedSessionProvider === report.provider ? "parser-linked-row" : "",
                  slowProviderSet.has(report.provider) ? "provider-slow-row" : "",
                ].filter(Boolean).join(" ")}
                role="button"
                tabIndex={0}
                onClick={() => onJumpToProviderSessions(report.provider, Number(report.parse_fail))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onJumpToProviderSessions(report.provider, Number(report.parse_fail));
                  }
                }}
              >
                <td>{report.name}</td>
                <td>
                  <span className={`status-pill status-${report.status}`}>{statusLabel(report.status)}</span>
                </td>
                <td>{report.scanned}</td>
                <td>{formatFetchMs(report.scan_ms ?? null)}</td>
                <td>{report.parse_ok}</td>
                <td>{report.parse_fail}</td>
                <td>{report.parse_score ?? "-"}</td>
              </tr>
            ))}
            {parserLoading
              ? Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={`parser-health-skeleton-${idx}`}>
                    <td colSpan={7}>
                      <div className="skeleton-line" />
                    </td>
                  </tr>
                ))
              : null}
            {sortedParserReports.length === 0 && !parserLoading ? (
              <tr>
                <td colSpan={7} className="sub-hint">
                  {messages.providers.parserLoading}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
