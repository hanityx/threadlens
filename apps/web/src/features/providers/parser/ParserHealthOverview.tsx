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
    sortedParserReports,
    parserLoading,
    slowProviderSet,
    statusLabel,
    onJumpToProviderSessions,
  } = props;

  return (
    <>
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
                  {messages.providers.parserEmpty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}
