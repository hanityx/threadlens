import { describe, expect, it } from "vitest";
import type { ProviderParserHealthReport, ProviderSessionRow } from "../../types";
import {
  buildParserWorkspaceView,
  createParserWorkspaceState,
  parserWorkspaceReducer,
  type ParserWorkspaceState,
} from "./parserWorkspaceModel";

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

describe("parserWorkspaceModel", () => {
  it("builds filtered, sorted, and resolved detail state from parser workspace state", () => {
    const state = {
      ...createParserWorkspaceState(),
      parserFailOnly: true,
      parserSort: "scan_ms_desc",
      parserDetailProvider: "missing",
    } as const;

    const view = buildParserWorkspaceView({
      state,
      parserReports: reports,
      providerSessionRows: sessionRows,
      selectedSessionPath: "/tmp/claude-1.jsonl",
      effectiveSlowOnly: true,
      slowProviderSet: new Set<string>(["gemini"]),
    });

    expect(view.filteredParserReports.map((report) => report.provider)).toEqual(["gemini"]);
    expect(view.sortedParserReports.map((report) => report.provider)).toEqual(["gemini"]);
    expect(view.parserReportsWithErrors.map((report) => report.provider)).toEqual(["gemini"]);
    expect(view.resolvedParserDetailProvider).toBe("gemini");
    expect(view.parserDetailReport?.provider).toBe("gemini");
    expect(view.selectedSessionProvider).toBe("claude");
    expect(view.selectedSessionProviderVisibleInParser).toBe(false);
  });

  it("updates parser focus and pending session jump through reducer actions", () => {
    const initial: ParserWorkspaceState = {
      ...createParserWorkspaceState(),
      parserFailOnly: true,
      parserJumpStatus: "found",
    };

    const afterParserJump = parserWorkspaceReducer(initial, {
      type: "jump_to_parser_provider",
      providerId: "codex",
    });
    expect(afterParserJump).toMatchObject({
      parserFailOnly: false,
      parserDetailProvider: "codex",
      pendingParserFocusProvider: "codex",
      parserJumpStatus: "found",
    });

    const afterErrorJump = parserWorkspaceReducer(afterParserJump, {
      type: "jump_to_session_from_parser_error",
      providerId: "gemini",
      sessionId: "gemini-1",
    });
    expect(afterErrorJump).toMatchObject({
      parserDetailProvider: "gemini",
      parserJumpStatus: "idle",
      pendingSessionJump: { provider: "gemini", sessionId: "gemini-1" },
    });

    const afterResolve = parserWorkspaceReducer(afterErrorJump, {
      type: "resolve_pending_session_jump",
      parserJumpStatus: "not_found",
    });
    expect(afterResolve).toMatchObject({
      parserJumpStatus: "not_found",
      pendingSessionJump: null,
    });

    const afterFocusClear = parserWorkspaceReducer(afterResolve, {
      type: "clear_pending_parser_focus",
    });
    expect(afterFocusClear.pendingParserFocusProvider).toBe("");
  });
});
