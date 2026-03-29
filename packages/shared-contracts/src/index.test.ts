import { describe, expect, it } from "vitest";
import {
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
});
