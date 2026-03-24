import { describe, expect, it } from "vitest";
import type { ProviderSessionRow, ProviderView } from "../../types";
import {
  buildHotspotOriginLabel,
  buildJumpToParserProviderState,
  buildJumpToProviderSessionsState,
  buildJumpToSessionFromParserErrorState,
  canFocusPendingParserProvider,
  resolvePendingSessionJump,
} from "./providerJumpModel";

const sessionRows: ProviderSessionRow[] = [
  {
    provider: "codex",
    source: "history",
    session_id: "sess-1",
    display_title: "Codex session",
    file_path: "/tmp/codex.jsonl",
    size_bytes: 120,
    mtime: "2026-03-24T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Codex session",
      title_source: "header",
    },
  },
];

describe("providerJumpModel", () => {
  it("builds provider-session jump state with hotspot origin and fail filter", () => {
    expect(
      buildJumpToProviderSessionsState({
        currentProviderView: "claude",
        providerId: "codex",
        parseFail: 2,
        fromHotspot: true,
      }),
    ).toEqual({
      hotspotScopeOrigin: "claude",
      providerView: "codex",
      probeFilter: "fail",
      parserDetailProvider: "codex",
      sessionFilter: "",
    });
  });

  it("builds parser-provider and parser-error jump state", () => {
    expect(buildJumpToParserProviderState("gemini")).toEqual({
      advancedOpen: true,
      parserFailOnly: false,
      parserDetailProvider: "gemini",
      pendingParserFocusProvider: "gemini",
    });
    expect(
      buildJumpToSessionFromParserErrorState({
        providerId: "codex",
        sessionId: "sess-1",
      }),
    ).toEqual({
      hotspotScopeOrigin: null,
      providerView: "codex",
      probeFilter: "all",
      sessionFilter: "",
      parserDetailProvider: "codex",
      pendingSessionJump: { provider: "codex", sessionId: "sess-1" },
      parserJumpStatus: "idle",
    });
  });

  it("resolves pending session jump to found or not_found", () => {
    expect(
      resolvePendingSessionJump({
        pendingSessionJump: { provider: "codex", sessionId: "sess-1" },
        providerView: "codex",
        providerSessionsLoading: false,
        providerSessionRows: sessionRows,
      }),
    ).toEqual({
      selectedSessionPath: "/tmp/codex.jsonl",
      parserJumpStatus: "found",
    });

    expect(
      resolvePendingSessionJump({
        pendingSessionJump: { provider: "codex", sessionId: "missing" },
        providerView: "codex",
        providerSessionsLoading: false,
        providerSessionRows: sessionRows,
      }),
    ).toEqual({
      selectedSessionPath: null,
      parserJumpStatus: "not_found",
    });
  });

  it("waits on unresolved pending jumps and parser focus targets", () => {
    expect(
      resolvePendingSessionJump({
        pendingSessionJump: { provider: "codex", sessionId: "sess-1" },
        providerView: "claude",
        providerSessionsLoading: false,
        providerSessionRows: sessionRows,
      }),
    ).toBeNull();
    expect(
      resolvePendingSessionJump({
        pendingSessionJump: { provider: "codex", sessionId: "sess-1" },
        providerView: "codex",
        providerSessionsLoading: true,
        providerSessionRows: sessionRows,
      }),
    ).toBeNull();
    expect(canFocusPendingParserProvider("codex", [{ provider: "codex" }, { provider: "claude" }])).toBe(true);
    expect(canFocusPendingParserProvider("gemini", [{ provider: "codex" }, { provider: "claude" }])).toBe(false);
  });

  it("builds hotspot origin labels from current scope", () => {
    const providerTabById = new Map<ProviderView, { name: string }>([
      ["all", { name: "All" }],
      ["codex", { name: "Codex" }],
      ["claude", { name: "Claude" }],
    ]);

    expect(
      buildHotspotOriginLabel({
        hotspotScopeOrigin: "all",
        providerTabById,
        allAiLabel: "All AI",
      }),
    ).toBe("All AI");
    expect(
      buildHotspotOriginLabel({
        hotspotScopeOrigin: "claude",
        providerTabById,
        allAiLabel: "All AI",
      }),
    ).toBe("Claude");
    expect(
      buildHotspotOriginLabel({
        hotspotScopeOrigin: null,
        providerTabById,
        allAiLabel: "All AI",
      }),
    ).toBe("");
  });
});
