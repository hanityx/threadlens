import type { Messages } from "@/i18n";
import type { ProviderParserHealthReport } from "@/shared/types";

export interface ParserErrorDetailProps {
  messages: Messages;
  parserReportsWithErrors: ProviderParserHealthReport[];
  parserDetailProvider: string;
  onParserDetailProviderChange: (providerId: string) => void;
  parserJumpStatus: "idle" | "found" | "not_found";
  parserDetailReport: ProviderParserHealthReport | null;
  onJumpToSessionFromParserError: (providerId: string, sessionId: string) => void;
}

export function ParserErrorDetail(props: ParserErrorDetailProps) {
  const {
    messages,
    parserReportsWithErrors,
    parserDetailProvider,
    onParserDetailProviderChange,
    parserJumpStatus,
    parserDetailReport,
    onJumpToSessionFromParserError,
  } = props;

  const hasSampleErrors = parserReportsWithErrors.length > 0;

  return (
    <div className="parser-errors">
      {parserJumpStatus === "found" ? (
        <p className="sub-hint">{messages.providers.parserJumpFound}</p>
      ) : null}
      {parserJumpStatus === "not_found" ? (
        <p className="sub-hint">{messages.providers.parserJumpNotFound}</p>
      ) : null}
      {!hasSampleErrors ? (
        <p className="sub-hint">{messages.providers.parserNoSampleErrors}</p>
      ) : (
        <>
          <div className="sub-toolbar">
            <label className="provider-quick-switch">
              <span>{messages.providers.parserDetailLabel}</span>
              <select
                className="provider-quick-select"
                value={parserDetailProvider}
                onChange={(e) => onParserDetailProviderChange(e.target.value)}
              >
                {parserReportsWithErrors.map((report) => (
                  <option key={`parser-detail-${report.provider}`} value={report.provider}>
                    {report.name} ({report.sample_errors?.length ?? 0})
                  </option>
                ))}
              </select>
            </label>
          </div>
          {parserDetailReport?.sample_errors?.length ? (
            <>
              <p className="sub-hint">
                {messages.providers.parserSelectedErrors} {parserDetailReport.name}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>{messages.providers.parserFieldSessionId}</th>
                    <th>{messages.providers.parserFieldFormat}</th>
                    <th>{messages.providers.parserFieldError}</th>
                  </tr>
                </thead>
                <tbody>
                  {parserDetailReport.sample_errors.map((entry, idx) => (
                    <tr
                      key={`parser-error-${parserDetailReport.provider}-${entry.session_id}-${idx}`}
                      className="parser-error-jump-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => onJumpToSessionFromParserError(parserDetailReport.provider, entry.session_id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onJumpToSessionFromParserError(parserDetailReport.provider, entry.session_id);
                        }
                      }}
                    >
                      <td className="mono-sub">{entry.session_id}</td>
                      <td>{entry.format}</td>
                      <td>{entry.error ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="sub-hint">{messages.providers.parserNoSampleErrors}</p>
          )}
        </>
      )}
    </div>
  );
}
