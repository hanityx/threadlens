import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages, type Messages } from "../../i18n";
import type { ProviderParserHealthReport } from "../../types";
import { ParserHealthTable } from "./ParserHealthTable";

const messages = getMessages("en");

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
        parserSummary={{ parse_score: 91, parse_ok: 10, scanned: 12 }}
        linkedSession={{
          provider: "codex",
          visibleInParser: true,
        }}
        overview={{
          parserFailOnly: false,
          onParserFailOnlyChange: () => undefined,
          filteredParserReportsCount: 1,
          totalParserReportsCount: 1,
          parserSort: "fail_desc",
          onParserSortChange: () => undefined,
          sortedParserReports: reports,
          parserLoading: false,
          slowProviderSet: new Set<string>(["codex"]),
          statusLabel: (status) => status.toUpperCase(),
          onJumpToProviderSessions,
        }}
        detail={{
          parserReportsWithErrors: reports,
          parserDetailProvider: "codex",
          onParserDetailProviderChange: () => undefined,
          parserJumpStatus: "found",
          parserDetailReport: reports[0],
          onJumpToSessionFromParserError,
        }}
      />,
    );

    expect(html).toContain("Parser health");
    expect(html).toContain("Score 91");
    expect(html).toContain("Parse OK 10 / Scanned 12");
    expect(html).toContain("Codex");
    expect(html).toContain("125ms");
    expect(html).toContain("Show parser errors for: Codex");
    expect(html).toContain("sess-1");
    expect(html).toContain("A matching session was selected in the provider table.");
    expect(onJumpToProviderSessions).not.toHaveBeenCalled();
    expect(onJumpToSessionFromParserError).not.toHaveBeenCalled();
  });

  it("renders loading rows when parser data is pending", () => {
    const html = renderToStaticMarkup(
      <ParserHealthTable
        messages={messages}
        parserSummary={{ parse_score: null }}
        linkedSession={{
          provider: "",
          visibleInParser: true,
        }}
        overview={{
          parserFailOnly: false,
          onParserFailOnlyChange: () => undefined,
          filteredParserReportsCount: 0,
          totalParserReportsCount: 0,
          parserSort: "fail_desc",
          onParserSortChange: () => undefined,
          sortedParserReports: [],
          parserLoading: true,
          slowProviderSet: new Set<string>(),
          statusLabel: (status) => status.toUpperCase(),
          onJumpToProviderSessions: () => undefined,
        }}
        detail={{
          parserReportsWithErrors: [],
          parserDetailProvider: "",
          onParserDetailProviderChange: () => undefined,
          parserJumpStatus: "idle",
          parserDetailReport: null,
          onJumpToSessionFromParserError: () => undefined,
        }}
      />,
    );

    expect(html).toContain("skeleton-line");
  });

  it("shows the parser empty hint without rendering the detail selector when no sampled errors exist", () => {
    const html = renderToStaticMarkup(
      <ParserHealthTable
        messages={messages}
        parserSummary={{ parse_score: 100, parse_ok: 4, scanned: 4 }}
        linkedSession={{
          provider: "claude",
          visibleInParser: true,
        }}
        overview={{
          parserFailOnly: false,
          onParserFailOnlyChange: () => undefined,
          filteredParserReportsCount: 1,
          totalParserReportsCount: 1,
          parserSort: "score_desc",
          onParserSortChange: () => undefined,
          sortedParserReports: [
            {
              provider: "claude",
              name: "Claude",
              status: "active",
              scanned: 4,
              parse_ok: 4,
              parse_fail: 0,
              parse_score: 100,
              truncated: false,
              scan_ms: 40,
              sample_errors: [],
            },
          ],
          parserLoading: false,
          slowProviderSet: new Set<string>(),
          statusLabel: (status) => status.toUpperCase(),
          onJumpToProviderSessions: () => undefined,
        }}
        detail={{
          parserReportsWithErrors: [],
          parserDetailProvider: "",
          onParserDetailProviderChange: () => undefined,
          parserJumpStatus: "idle",
          parserDetailReport: null,
          onJumpToSessionFromParserError: () => undefined,
        }}
      />,
    );

    expect(html).toContain("No sampled parser errors");
    expect(html).not.toContain("Parser error detail");
    expect(html).not.toContain("Show parser errors for:");
  });
});
