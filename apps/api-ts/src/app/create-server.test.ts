import { describe, expect, it } from "vitest";
import { parseConversationSearchProviders } from "./create-server.js";

describe("parseConversationSearchProviders", () => {
  it("accepts comma-separated provider ids", () => {
    expect(
      parseConversationSearchProviders("codex,chatgpt,copilot"),
    ).toEqual({
      providers: ["codex", "chatgpt", "copilot"],
      invalid: [],
    });
  });

  it("dedupes repeated providers and reports invalid tokens", () => {
    expect(
      parseConversationSearchProviders(["codex,chatgpt", "codex,unknown"]),
    ).toEqual({
      providers: ["codex", "chatgpt"],
      invalid: ["unknown"],
    });
  });
});
