import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Messages } from "../../i18n";
import type { ProviderMatrixProvider } from "../../types";
import { AiManagementMatrix } from "./AiManagementMatrix";

const messages = {
  common: {
    yes: "Yes",
  },
  providers: {
    matrixDisclosure: "Matrix",
    active: "Active",
    colProvider: "Provider",
    colStatus: "Status",
    colCapability: "Capability",
    colRead: "Read",
    colAnalyze: "Analyze",
    colSafeCleanup: "Safe cleanup",
    colHardDelete: "Hard delete",
    colLogs: "Logs",
    colNotes: "Notes",
    openSessions: "Open sessions",
    installDetected: "Detected only",
    rootsLabel: "Roots",
    rootsNone: "No roots",
    matrixLoading: "Loading matrix",
    hotspotDisclosure: "Hotspots",
    hotspotFocusSlow: "Focus slow",
    hotspotClearFocus: "Clear slow",
    slowProviderBadge: "Slow",
    hotspotScan: "Scan",
    hotspotRows: "Rows",
    hotspotParseFail: "Parse fail",
    score: "Score",
    hotspotOpenParser: "Open parser",
    flowBoardTitle: "Flow board",
    flowBoardSubtitle: "Visible",
    configMapRoots: "Roots",
    configMapNoRoots: "No roots",
    configMapSources: "Sources",
    configMapNoSources: "No sources",
    flowNextLabel: "Next",
    dataSourcesDetected: "Detected",
    rows: "Rows",
    colParseFail: "Parse fail",
  },
} as unknown as Messages;

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
      session_log_count: 12,
      notes: "Healthy",
      roots: ["/tmp/codex"],
    },
  },
];

describe("AiManagementMatrix", () => {
  it("renders provider matrix, hotspot cards, and flow board", () => {
    const onJumpToProviderSessions = vi.fn();
    const onFocusSlowProviders = vi.fn();
    const onClearSlowFocus = vi.fn();
    const onJumpToParserProvider = vi.fn();

    const html = renderToStaticMarkup(
      <AiManagementMatrix
        messages={messages}
        providerSummary={{ active: 1, total: 1 }}
        providers={providers}
        providerMatrixLoading={false}
        providerScanMsById={new Map([["codex", 125]])}
        slowProviderSet={new Set<string>(["codex"])}
        statusLabel={(status) => status.toUpperCase()}
        capabilityLevelLabel={(level) => level}
        onJumpToProviderSessions={onJumpToProviderSessions}
        slowHotspotCards={[
          { provider: "codex", name: "Codex", scanMs: 125, scanned: 12, parseFail: 2, parseScore: 91 },
        ]}
        providerTabCount={1}
        slowFocusActive={false}
        onFocusSlowProviders={onFocusSlowProviders}
        onClearSlowFocus={onClearSlowFocus}
        onJumpToParserProvider={onJumpToParserProvider}
        visibleFlowCards={[
          {
            providerId: "codex",
            name: "Codex",
            status: "active",
            scanMs: 125,
            parseFail: 2,
            parseScore: 91,
            canRead: true,
            canAnalyze: true,
            canSafeCleanup: true,
            roots: ["/tmp/codex"],
            sources: [{ source_key: "codex_root", path: "/tmp/codex" }],
            presentSourceCount: 1,
            sessionCount: 12,
            nextStep: "Investigate parser failures.",
            flow: [
              { key: "source", label: "Detect", state: "done" },
              { key: "parser", label: "Parser", state: "blocked" },
            ],
          },
        ]}
        flowStateLabel={(state) => state.toUpperCase()}
      />,
    );

    expect(html).toContain("Matrix");
    expect(html).toContain("Codex");
    expect(html).toContain("Open sessions");
    expect(html).toContain("Hotspots");
    expect(html).toContain("Slow 125ms");
    expect(html).toContain("Flow board");
    expect(html).toContain("Investigate parser failures.");
    expect(html).toContain("Codex root");
    expect(onJumpToProviderSessions).not.toHaveBeenCalled();
    expect(onFocusSlowProviders).not.toHaveBeenCalled();
    expect(onClearSlowFocus).not.toHaveBeenCalled();
    expect(onJumpToParserProvider).not.toHaveBeenCalled();
  });

  it("renders skeleton state for a loading provider matrix", () => {
    const html = renderToStaticMarkup(
      <AiManagementMatrix
        messages={messages}
        providerSummary={{ active: 0, total: 0 }}
        providers={[]}
        providerMatrixLoading
        providerScanMsById={new Map()}
        slowProviderSet={new Set<string>()}
        statusLabel={(status) => status.toUpperCase()}
        capabilityLevelLabel={(level) => level}
        onJumpToProviderSessions={() => undefined}
        slowHotspotCards={[]}
        providerTabCount={0}
        slowFocusActive={false}
        onFocusSlowProviders={() => undefined}
        onClearSlowFocus={() => undefined}
        onJumpToParserProvider={() => undefined}
        visibleFlowCards={[]}
        flowStateLabel={(state) => state.toUpperCase()}
      />,
    );

    expect(html).toContain("skeleton-line");
  });
});
