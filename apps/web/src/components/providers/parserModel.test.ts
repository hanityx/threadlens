import { describe, expect, it } from "vitest";
import type { ProviderParserHealthReport, ProviderSessionRow } from "../../types";
import {
  buildParserDetailState,
  filterParserReports,
  sortParserReports,
  type ParserSort,
} from "./parserModel";

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
    scan_ms: 240,
    sample_errors: [{ session_id: "codex-1", format: "jsonl", error: "bad line" }],
  },
  {
    provider: "claude",
    name: "Claude",
    status: "detected",
    scanned: 4,
    parse_ok: 4,
    parse_fail: 0,
    parse_score: 100,
    truncated: false,
    scan_ms: 980,
    sample_errors: [],
  },
  {
    provider: "gemini",
    name: "Gemini",
    status: "active",
    scanned: 7,
    parse_ok: 5,
    parse_fail: 2,
    parse_score: 75,
    truncated: false,
    scan_ms: 310,
    sample_errors: [{ session_id: "gemini-1", format: "json", error: "broken json" }],
  },
];

const sessionRows: ProviderSessionRow[] = [
  {
    provider: "claude",
    source: "history",
    session_id: "claude-1",
    display_title: "Claude session",
    file_path: "/tmp/claude-1.jsonl",
    size_bytes: 120,
    mtime: "2026-03-24T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Claude session",
      title_source: "header",
    },
  },
];

describe("parserModel", () => {
  it("filters fail-only rows and slow-provider scope", () => {
    const filtered = filterParserReports(reports, {
      parserFailOnly: true,
      effectiveSlowOnly: true,
      slowProviderSet: new Set<string>(["gemini"]),
    });

    expect(filtered.map((report) => report.provider)).toEqual(["gemini"]);
  });

  it("sorts parser rows by requested sort key", () => {
    const sorted = sortParserReports(reports, "scan_ms_desc" satisfies ParserSort);
    expect(sorted.map((report) => report.provider)).toEqual(["claude", "gemini", "codex"]);
  });

  it("builds detail state with fallback provider and selected-session visibility", () => {
    const sorted = sortParserReports(reports, "fail_desc");
    const detail = buildParserDetailState({
      sortedParserReports: sorted,
      parserDetailProvider: "missing",
      providerSessionRows: sessionRows,
      selectedSessionPath: "/tmp/claude-1.jsonl",
    });

    expect(detail.parserReportsWithErrors.map((report) => report.provider)).toEqual([
      "codex",
      "gemini",
    ]);
    expect(detail.resolvedParserDetailProvider).toBe("codex");
    expect(detail.parserDetailReport?.provider).toBe("codex");
    expect(detail.selectedSessionProvider).toBe("claude");
    expect(detail.selectedSessionProviderVisibleInParser).toBe(true);
  });
});
