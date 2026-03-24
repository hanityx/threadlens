import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Messages } from "../../i18n";
import type { ProviderParserHealthReport } from "../../types";
import { ParserHealthTable } from "./ParserHealthTable";

const messages = {
  providers: {
    parserTitle: "Parser health",
    score: "Score",
    parserJumpHint: "Jump into provider sessions.",
    parserLinkedProvider: "Linked provider",
    parserLinkedHidden: "Hidden",
    parserFailOnly: "Fail only",
    filteredRows: "Filtered",
    parserSortLabel: "Sort",
    parserSortFailDesc: "Fail desc",
    parserSortFailAsc: "Fail asc",
    parserSortScoreDesc: "Score desc",
    parserSortScoreAsc: "Score asc",
    parserSortScanDesc: "Scan desc",
    parserSortScanAsc: "Scan asc",
    parserSortNameAsc: "Name asc",
    parserSortNameDesc: "Name desc",
    colProvider: "Provider",
    colStatus: "Status",
    colScanned: "Scanned",
    colScanMs: "Scan ms",
    colParseOk: "Parse ok",
    colParseFail: "Parse fail",
    colScore: "Score",
    parserLoading: "Loading parser health",
    parserDetailLabel: "Error details",
    parserNoSampleErrors: "No sample errors",
    parserSelectedErrors: "Selected errors",
    parserFieldSessionId: "Session id",
    parserFieldFormat: "Format",
    parserFieldError: "Error",
    parserJumpFound: "Session found",
    parserJumpNotFound: "Session not found",
  },
} as unknown as Messages;

const reports: ProviderParserHealthReport[] = [
  {
    provider: "codex",
    name: "Codex",
    status: "active",
    scanned: 12,
    parse_ok: 10,
    parse_fail: 2,
    parse_score: 91,
    truncated: false,
    scan_ms: 125,
    sample_errors: [{ session_id: "sess-1", format: "jsonl", error: "bad line" }],
  },
];

describe("ParserHealthTable", () => {
  it("renders parser summary, table rows, and sample errors", () => {
    const onJumpToProviderSessions = vi.fn();
    const onJumpToSessionFromParserError = vi.fn();
    const html = renderToStaticMarkup(
      <ParserHealthTable
        messages={messages}
        parserSummary={{ parse_score: 91 }}
        selectedSessionProvider="codex"
        selectedSessionProviderVisibleInParser
        parserFailOnly={false}
        onParserFailOnlyChange={() => undefined}
        filteredParserReportsCount={1}
        totalParserReportsCount={1}
        parserSort="fail_desc"
        onParserSortChange={() => undefined}
        sortedParserReports={reports}
        parserLoading={false}
        slowProviderSet={new Set<string>(["codex"])}
        statusLabel={(status) => status.toUpperCase()}
        onJumpToProviderSessions={onJumpToProviderSessions}
        parserReportsWithErrors={reports}
        parserDetailProvider="codex"
        onParserDetailProviderChange={() => undefined}
        parserJumpStatus="found"
        parserDetailReport={reports[0]}
        onJumpToSessionFromParserError={onJumpToSessionFromParserError}
      />,
    );

    expect(html).toContain("Parser health");
    expect(html).toContain("Score 91");
    expect(html).toContain("Codex");
    expect(html).toContain("125ms");
    expect(html).toContain("Selected errors Codex");
    expect(html).toContain("sess-1");
    expect(html).toContain("Session found");
    expect(onJumpToProviderSessions).not.toHaveBeenCalled();
    expect(onJumpToSessionFromParserError).not.toHaveBeenCalled();
  });

  it("renders loading rows when parser data is pending", () => {
    const html = renderToStaticMarkup(
      <ParserHealthTable
        messages={messages}
        parserSummary={{ parse_score: null }}
        selectedSessionProvider=""
        selectedSessionProviderVisibleInParser
        parserFailOnly={false}
        onParserFailOnlyChange={() => undefined}
        filteredParserReportsCount={0}
        totalParserReportsCount={0}
        parserSort="fail_desc"
        onParserSortChange={() => undefined}
        sortedParserReports={[]}
        parserLoading
        slowProviderSet={new Set<string>()}
        statusLabel={(status) => status.toUpperCase()}
        onJumpToProviderSessions={() => undefined}
        parserReportsWithErrors={[]}
        parserDetailProvider=""
        onParserDetailProviderChange={() => undefined}
        parserJumpStatus="idle"
        parserDetailReport={null}
        onJumpToSessionFromParserError={() => undefined}
      />,
    );

    expect(html).toContain("skeleton-line");
  });
});
