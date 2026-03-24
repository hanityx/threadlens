import { describe, expect, it } from "vitest";
import type {
  ProviderMatrixProvider,
  ProviderParserHealthReport,
  ProviderSessionRow,
  ProviderView,
} from "../types";
import {
  buildVisibleProviderSessionSummary,
  buildVisibleParserSummary,
  buildVisibleProviderIds,
  buildVisibleProviderSummary,
  buildVisibleProviderTabs,
} from "./appShellModel";

const providerTabs: Array<{
  id: ProviderView;
  name: string;
  status: "active" | "detected" | "missing";
}> = [
  { id: "all", name: "All", status: "active" },
  { id: "gemini", name: "Gemini", status: "detected" },
  { id: "claude", name: "Claude", status: "active" },
  { id: "copilot", name: "Copilot", status: "missing" },
  { id: "chatgpt", name: "ChatGPT", status: "active" },
  { id: "zeta", name: "Zeta", status: "detected" },
];

const providers: ProviderMatrixProvider[] = [
  {
    provider: "claude",
    name: "Claude",
    status: "active",
    capability_level: "full",
    capabilities: {
      read_sessions: true,
      analyze_context: true,
      safe_cleanup: true,
      hard_delete: true,
    },
  },
  {
    provider: "gemini",
    name: "Gemini",
    status: "detected",
    capability_level: "read-only",
    capabilities: {
      read_sessions: true,
      analyze_context: true,
      safe_cleanup: false,
      hard_delete: false,
    },
  },
];

const parserReports: ProviderParserHealthReport[] = [
  {
    provider: "claude",
    name: "Claude",
    status: "active",
    scanned: 10,
    parse_ok: 8,
    parse_fail: 2,
    parse_score: 80,
    truncated: false,
  },
  {
    provider: "gemini",
    name: "Gemini",
    status: "detected",
    scanned: 5,
    parse_ok: 4,
    parse_fail: 1,
    parse_score: 80,
    truncated: false,
  },
];

const providerSessionRows: ProviderSessionRow[] = [
  {
    provider: "claude",
    source: "sessions",
    session_id: "claude-1",
    display_title: "Claude Session",
    file_path: "/tmp/claude-1.jsonl",
    size_bytes: 10,
    mtime: "2026-03-24T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Claude Session",
      title_source: "title",
    },
  },
  {
    provider: "gemini",
    source: "sessions",
    session_id: "gemini-1",
    display_title: "Gemini Session",
    file_path: "/tmp/gemini-1.jsonl",
    size_bytes: 10,
    mtime: "2026-03-23T00:00:00.000Z",
    probe: {
      ok: false,
      format: "jsonl",
      error: "parse failed",
      detected_title: "Gemini Session",
      title_source: "title",
    },
  },
];

describe("appShellModel", () => {
  it("filters hidden tabs and keeps provider display order stable", () => {
    const visibleTabs = buildVisibleProviderTabs(providerTabs);

    expect(visibleTabs.map((tab) => tab.id)).toEqual(["all", "claude", "gemini", "copilot", "zeta"]);
  });

  it("drops optional providers from overview-wide ids but keeps explicit selections", () => {
    const visibleTabs = buildVisibleProviderTabs(providerTabs);

    expect(buildVisibleProviderIds(visibleTabs, "all")).toEqual(["claude", "gemini", "zeta"]);
    expect(buildVisibleProviderIds(visibleTabs, "copilot")).toEqual([
      "claude",
      "gemini",
      "copilot",
      "zeta",
    ]);
  });

  it("falls back to tab counts when provider matrix is empty", () => {
    const visibleTabs = buildVisibleProviderTabs(providerTabs);

    expect(buildVisibleProviderSummary(visibleTabs, [])).toEqual({
      total: 4,
      active: 1,
      detected: 2,
    });
  });

  it("aggregates parser and provider-session summaries", () => {
    expect(buildVisibleProviderSummary(buildVisibleProviderTabs(providerTabs), providers)).toEqual({
      total: 2,
      active: 1,
      detected: 1,
    });

    expect(buildVisibleParserSummary(parserReports)).toEqual({
      providers: 2,
      scanned: 15,
      parse_ok: 12,
      parse_fail: 3,
      parse_score: 80,
    });
  });

  it("counts visible provider session rows by current view", () => {
    expect(
      buildVisibleProviderSessionSummary({
        providerView: "all",
        visibleProviderSessionRows: providerSessionRows,
        visibleProviders: providers,
      }),
    ).toEqual({
      providers: 2,
      rows: 2,
      parse_ok: 1,
      parse_fail: 1,
    });

    expect(
      buildVisibleProviderSessionSummary({
        providerView: "claude",
        visibleProviderSessionRows: [providerSessionRows[0]],
        visibleProviders: providers,
      }),
    ).toEqual({
      providers: 1,
      rows: 1,
      parse_ok: 1,
      parse_fail: 0,
    });
  });
});
