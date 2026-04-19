import { describe, expect, it } from "vitest";
import type {
  DataSourceInventoryRow,
  ProviderMatrixProvider,
  ProviderParserHealthReport,
  ProviderSessionRow,
  ProviderView,
} from "@/shared/types";
import { buildProviderFlowModel } from "@/features/providers/model/providerFlowModel";

const providers: ProviderMatrixProvider[] = [
  {
    provider: "codex",
    name: "Codex",
    status: "active",
    capability_level: "full",
    capabilities: {
      read_sessions: true,
      analyze_context: true,
      safe_cleanup: true,
      hard_delete: false,
    },
    evidence: {
      roots: ["/tmp/codex"],
    },
  },
  {
    provider: "claude",
    name: "Claude",
    status: "detected",
    capability_level: "read-only",
    capabilities: {
      read_sessions: true,
      analyze_context: false,
      safe_cleanup: false,
      hard_delete: false,
    },
    evidence: {
      roots: ["/tmp/claude"],
    },
  },
  {
    provider: "copilot",
    name: "Copilot",
    status: "missing",
    capability_level: "unavailable",
    capabilities: {
      read_sessions: false,
      analyze_context: false,
      safe_cleanup: false,
      hard_delete: false,
    },
  },
];

const providerTabs: Array<{
  id: ProviderView;
  name: string;
  status: "active" | "detected" | "missing";
  scanned: number;
  scan_ms: number | null;
  is_slow: boolean;
}> = [
  { id: "all", name: "All", status: "active", scanned: 0, scan_ms: null, is_slow: false },
  { id: "codex", name: "Codex", status: "active", scanned: 12, scan_ms: 320, is_slow: false },
  { id: "claude", name: "Claude", status: "detected", scanned: 4, scan_ms: 980, is_slow: true },
  { id: "copilot", name: "Copilot", status: "missing", scanned: 1, scan_ms: 450, is_slow: true },
];

const parserReports: ProviderParserHealthReport[] = [
  {
    provider: "codex",
    name: "Codex",
    status: "active",
    scanned: 12,
    parse_ok: 12,
    parse_fail: 0,
    parse_score: 100,
    truncated: false,
    scan_ms: 320,
  },
  {
    provider: "claude",
    name: "Claude",
    status: "detected",
    scanned: 4,
    parse_ok: 2,
    parse_fail: 2,
    parse_score: 70,
    truncated: false,
    scan_ms: 980,
  },
];

const sessionRows: ProviderSessionRow[] = [
  {
    provider: "codex",
    source: "history",
    session_id: "codex-1",
    display_title: "Codex 1",
    file_path: "/tmp/codex-1.jsonl",
    size_bytes: 120,
    mtime: "2026-03-24T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Codex 1",
      title_source: "header",
    },
  },
];

const dataSourceRows: DataSourceInventoryRow[] = [
  {
    source_key: "codex_root",
    path: "/tmp/codex",
    present: true,
    file_count: 10,
    dir_count: 1,
    total_bytes: 1024,
    latest_mtime: "2026-03-24T00:00:00.000Z",
  },
  {
    source_key: "claude_root",
    path: "/tmp/claude",
    present: true,
    file_count: 0,
    dir_count: 1,
    total_bytes: 0,
    latest_mtime: "2026-03-24T00:00:00.000Z",
  },
];

const providerMessages = {
  flowNextCollect: "Collect",
  flowNextCollectSessions: "Collect sessions",
  flowNextParse: "Parse",
  flowNextReadonly: "Readonly",
  flowNextExecute: "Execute",
  flowNextDryRun: "Dry run",
  flowStageDetect: "Detect",
  flowStageSessions: "Sessions",
  flowStageParser: "Parser",
  flowStageSafeCleanup: "Safe cleanup",
  flowStageApply: "Apply",
};

describe("providerFlowModel", () => {
  it("builds flow cards with next-step and state labels", () => {
    const model = buildProviderFlowModel({
      providers,
      providerTabs,
      parserReports,
      allParserReports: parserReports,
      allProviderSessionRows: sessionRows,
      dataSourceRows,
      slowProviderIds: ["claude", "copilot"],
      providerView: "all",
      providerMessages,
    });

    expect(model.providerFlowCards.map((card) => [card.providerId, card.nextStep])).toEqual([
      ["codex", "Execute"],
      ["claude", "Collect sessions"],
      ["copilot", "Readonly"],
    ]);
    expect(model.providerFlowCards[0]?.flow.map((step) => step.state)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "done",
    ]);
  });

  it("sorts slow hotspot cards by latency first and exposes selected-provider stats", () => {
    const model = buildProviderFlowModel({
      providers,
      providerTabs,
      parserReports,
      allParserReports: parserReports,
      allProviderSessionRows: sessionRows,
      dataSourceRows,
      slowProviderIds: ["copilot", "claude"],
      providerView: "codex",
      providerMessages,
    });

    expect(model.slowHotspotCards.map((card) => card.provider)).toEqual(["claude", "copilot"]);
    expect(model.selectedProviderTranscriptReady).toBe(1);
    expect(model.selectedProviderPresentSources).toBe(1);
    expect(model.selectedProviderSessionCount).toBe(1);
    expect(model.visibleFlowCards.map((card) => card.providerId)).toEqual(["codex"]);
  });

  it("hides optional providers from all-view visible cards while keeping full flow inventory", () => {
    const model = buildProviderFlowModel({
      providers,
      providerTabs,
      parserReports,
      allParserReports: parserReports,
      allProviderSessionRows: sessionRows,
      dataSourceRows,
      slowProviderIds: [],
      providerView: "all",
      providerMessages,
    });

    expect(model.providerFlowCards.map((card) => card.providerId)).toEqual([
      "codex",
      "claude",
      "copilot",
    ]);
    expect(model.visibleFlowCards.map((card) => card.providerId)).toEqual([
      "codex",
      "claude",
    ]);
  });
});
