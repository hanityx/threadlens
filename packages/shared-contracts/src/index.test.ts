import { describe, expect, it } from "vitest";
import {
  CORE_PROVIDER_IDS,
  findProviderCapability,
  getProviderCapability,
  INTERNAL_PROVIDER_IDS,
  OPTIONAL_PROVIDER_IDS,
  PROVIDER_IDS,
  PROVIDER_LABELS,
  PROVIDER_REGISTRY,
  SCHEMA_VERSION,
  SEARCHABLE_PROVIDER_IDS,
  SEARCHABLE_PROVIDER_LABELS,
} from "./index.js";

describe("shared contracts exports", () => {
  it("keeps the public schema version stable", () => {
    expect(SCHEMA_VERSION).toBe("2026-02-27");
  });

  it("exports the searchable provider ids in order", () => {
    expect(SEARCHABLE_PROVIDER_IDS).toEqual([
      "codex",
      "claude",
      "gemini",
      "copilot",
    ]);
  });

  it("provides labels for every searchable provider", () => {
    expect(SEARCHABLE_PROVIDER_LABELS).toEqual({
      codex: "Codex",
      claude: "Claude",
      gemini: "Gemini",
      copilot: "Copilot",
    });
  });

  it("keeps the full provider registry in one ordered source of truth", () => {
    expect(PROVIDER_IDS).toEqual([
      "codex",
      "chatgpt",
      "claude",
      "gemini",
      "copilot",
    ]);
    expect(PROVIDER_REGISTRY).toHaveLength(5);
    expect(PROVIDER_LABELS.chatgpt).toBe("ChatGPT");
  });

  it("marks chatgpt as internal read-only capability while keeping public providers visible", () => {
    expect(INTERNAL_PROVIDER_IDS).toEqual(["chatgpt"]);
    expect(CORE_PROVIDER_IDS).toEqual(["codex", "claude", "gemini"]);
    expect(OPTIONAL_PROVIDER_IDS).toEqual(["copilot"]);

    expect(getProviderCapability("chatgpt")).toMatchObject({
      docs_visibility: "internal",
      search_scope_visibility: "internal",
      provider_tab_group: "internal",
      read_sessions: true,
      read_transcript: false,
      analyze_context: true,
      safe_cleanup: false,
      hard_delete: false,
    });
  });

  it("supports safe string lookup for runtime payloads", () => {
    expect(findProviderCapability("chatgpt")?.read_transcript).toBe(false);
    expect(findProviderCapability("CLAUDE")?.search_scope_visibility).toBe("public");
    expect(findProviderCapability("unknown")).toBeUndefined();
  });
});
