import type { Ref } from "react";
import type { Messages } from "../../i18n";
import type { ProviderParserHealthReport } from "../../types";
import { ParserErrorDetail, type ParserErrorDetailProps } from "./ParserErrorDetail";
import { ParserHealthOverview, type ParserHealthOverviewProps } from "./ParserHealthOverview";

export interface ParserHealthTableProps {
  messages: Messages;
  parserSummary: { parse_score: number | null; parse_ok?: number; scanned?: number };
  linkedSession: {
    provider: string;
    visibleInParser: boolean;
  };
  overview: Omit<
    ParserHealthOverviewProps,
    "messages" | "selectedSessionProvider" | "selectedSessionProviderVisibleInParser"
  >;
  detail: Omit<ParserErrorDetailProps, "messages">;
  detailsRef?: Ref<HTMLDetailsElement>;
}

export function ParserHealthTable(props: ParserHealthTableProps) {
  const { messages, parserSummary, linkedSession, overview, detail, detailsRef } = props;
  const scoreSummary =
    parserSummary.parse_ok != null && parserSummary.scanned != null
      ? `${messages.providers.colParseOk} ${parserSummary.parse_ok} / ${messages.providers.colScanned} ${parserSummary.scanned}`
      : "";
  const defaultOpen = detail.parserReportsWithErrors.length > 0 || Boolean(linkedSession.provider);

  return (
    <details className="panel panel-disclosure" ref={detailsRef} open={defaultOpen}>
      <summary>
        {messages.providers.parserTitle} · {messages.providers.score} {parserSummary.parse_score ?? "-"}
        {scoreSummary ? ` · ${scoreSummary}` : ""}
      </summary>
      <div className="panel-disclosure-body">
        <ParserHealthOverview
          {...overview}
          messages={messages}
          selectedSessionProvider={linkedSession.provider}
          selectedSessionProviderVisibleInParser={linkedSession.visibleInParser}
        />
        <ParserErrorDetail {...detail} messages={messages} />
      </div>
    </details>
  );
}
