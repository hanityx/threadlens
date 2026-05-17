import { describe, expect, it } from "vitest";
import {
  listProviderActionProviderIds,
  listSearchableProviderIds,
  supportsProviderAction,
} from "./capabilities.js";
import {
  buildConversationSearchProviderBudgets,
  defaultConversationSearchProviders,
  isMetadataOnlyConversationQuery,
  resolveConversationSearchLimits,
} from "./search.js";

describe("resolveConversationSearchLimits", () => {
  it("keeps scan coverage wider than the visible result limit", () => {
    expect(resolveConversationSearchLimits({ limit: 20 })).toEqual({
      resultLimit: 20,
      scanLimit: 160,
    });
    expect(resolveConversationSearchLimits({ limit: 120 })).toEqual({
      resultLimit: 120,
      scanLimit: 480,
    });
  });
});

describe("buildConversationSearchProviderBudgets", () => {
  it("splits the shared scan budget across providers", () => {
    const budgets = buildConversationSearchProviderBudgets(
      ["codex", "chatgpt", "claude", "gemini", "copilot"],
      160,
    );

    expect(budgets.map((entry) => entry.provider)).toEqual([
      "codex",
      "chatgpt",
      "claude",
      "gemini",
      "copilot",
    ]);
    expect(budgets.reduce((sum, entry) => sum + entry.limit, 0)).toBe(160);
    expect(
      Object.fromEntries(budgets.map((entry) => [entry.provider, entry.limit])),
    ).toEqual({
      codex: 42,
      chatgpt: 19,
      claude: 42,
      gemini: 31,
      copilot: 26,
    });
  });

  it("gives a single provider the full scan budget", () => {
    expect(buildConversationSearchProviderBudgets(["chatgpt"], 160)).toEqual([
      { provider: "chatgpt", limit: 160 },
    ]);
  });
});

describe("isMetadataOnlyConversationQuery", () => {
  it("detects file/session/path oriented queries", () => {
    expect(isMetadataOnlyConversationQuery("rollout-2026-03-25")).toBe(true);
    expect(isMetadataOnlyConversationQuery("agent-session.jsonl")).toBe(true);
    expect(isMetadataOnlyConversationQuery("/workspace/.codex/sessions")).toBe(true);
    expect(isMetadataOnlyConversationQuery("69ab83eb-72a0-8320-8853-72ca88526762")).toBe(true);
  });

  it("keeps normal phrase searches transcript-eligible", () => {
    expect(isMetadataOnlyConversationQuery("open the transcript")).toBe(false);
    expect(isMetadataOnlyConversationQuery("cleanup preview token")).toBe(false);
  });
});

describe("defaultConversationSearchProviders", () => {
  it("tracks the implemented api-ts searchable provider policy", () => {
    expect(defaultConversationSearchProviders()).toEqual([
      ...listSearchableProviderIds(),
    ]);
  });
});

describe("provider action policy", () => {
  it("keeps public workflow providers in provider session actions", () => {
    expect(listProviderActionProviderIds()).toEqual([
      "codex",
      "claude",
      "gemini",
      "copilot",
    ]);
    for (const provider of ["codex", "claude", "gemini", "copilot"] as const) {
      expect(supportsProviderAction(provider, "backup_local")).toBe(true);
      expect(supportsProviderAction(provider, "archive_local")).toBe(true);
      expect(supportsProviderAction(provider, "delete_local")).toBe(true);
    }
  });

  it("keeps internal read-only ChatGPT outside provider session actions", () => {
    expect(listProviderActionProviderIds()).not.toContain("chatgpt");
    expect(supportsProviderAction("chatgpt", "backup_local")).toBe(false);
    expect(supportsProviderAction("chatgpt", "archive_local")).toBe(false);
    expect(supportsProviderAction("chatgpt", "delete_local")).toBe(false);
  });
});
