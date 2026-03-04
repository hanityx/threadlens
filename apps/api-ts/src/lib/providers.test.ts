import { describe, expect, it } from "vitest";
import {
  buildProviderActionToken,
  listProviderIds,
  parseProviderId,
  providerRootSpecs,
} from "./providers";

describe("buildProviderActionToken", () => {
  it("is stable regardless of file path order", () => {
    const a = buildProviderActionToken("codex", "archive_local", [
      "/tmp/a.jsonl",
      "/tmp/b.jsonl",
    ]);
    const b = buildProviderActionToken("codex", "archive_local", [
      "/tmp/b.jsonl",
      "/tmp/a.jsonl",
    ]);
    expect(a).toBe(b);
  });

  it("changes when file set changes even if count is the same", () => {
    const a = buildProviderActionToken("codex", "archive_local", [
      "/tmp/a.jsonl",
      "/tmp/b.jsonl",
    ]);
    const b = buildProviderActionToken("codex", "archive_local", [
      "/tmp/c.jsonl",
      "/tmp/d.jsonl",
    ]);
    expect(a).not.toBe(b);
  });

  it("changes by provider/action", () => {
    const base = ["/tmp/a.jsonl"];
    const codexArchive = buildProviderActionToken(
      "codex",
      "archive_local",
      base,
    );
    const codexDelete = buildProviderActionToken("codex", "delete_local", base);
    const claudeArchive = buildProviderActionToken(
      "claude",
      "archive_local",
      base,
    );
    expect(codexArchive).not.toBe(codexDelete);
    expect(codexArchive).not.toBe(claudeArchive);
  });
});

describe("provider registry", () => {
  it("includes chatgpt provider in dynamic list", () => {
    expect(listProviderIds()).toContain("chatgpt");
  });

  it("parses provider id case-insensitively", () => {
    expect(parseProviderId("CHATGPT")).toBe("chatgpt");
    expect(parseProviderId("CoDeX")).toBe("codex");
  });

  it("includes Gemini antigravity conversation root for pb sessions", () => {
    const roots = providerRootSpecs("gemini");
    const hasPbRoot = roots.some(
      (spec) =>
        spec.source === "antigravity_conversations" &&
        spec.exts.includes(".pb"),
    );
    expect(hasPbRoot).toBe(true);
  });
});
