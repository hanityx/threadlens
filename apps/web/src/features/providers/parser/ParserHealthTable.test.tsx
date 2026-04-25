import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Messages } from "@/i18n";
import { getMessages } from "@/i18n/catalog";
import type { ProviderParserHealthReport } from "@/shared/types";
import { ParserHealthTable } from "@/features/providers/parser/ParserHealthTable";

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
  it("renders a compact parser summary and provider table only", () => {
    const onJumpToProviderSessions = vi.fn();
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
          onJumpToSessionFromParserError: vi.fn(),
        }}
      />,
    );

    expect(html).toContain("Parser health");
    expect(html).toContain("Score 91");
    expect(html).toContain("Parse OK 10 / Scanned 12");
    expect(html).toContain("Codex");
    expect(html).toContain("125ms");
    expect(html).not.toContain("Failing providers");
    expect(html).not.toContain("Affected sessions");
    expect(html).not.toContain("Top issue");
    expect(html).not.toContain("Open sessions for Codex");
    expect(html).not.toContain("Failures only");
    expect(html).not.toContain("Sort parser table");
    expect(html).not.toContain("Show parser errors for:");
    expect(html).not.toContain("sess-1");
    expect(onJumpToProviderSessions).not.toHaveBeenCalled();
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

  it("keeps sampled-error detail UI hidden when no parser failures exist", () => {
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

    expect(html).toContain("Claude");
    expect(html).not.toContain("Parser error detail");
    expect(html).not.toContain("Show parser errors for:");
    expect(html).not.toContain("No sampled parser errors");
  });

  it("shows a parser empty-state copy when the current scope has no rows", () => {
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

    expect(html).toContain("No parser rows match the current scope yet.");
    expect(html).not.toContain("Loading parser health...");
  });
});
