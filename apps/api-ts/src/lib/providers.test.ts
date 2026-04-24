import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_DATA_DIR, CHAT_DIR } from "./constants.js";
import {
  buildProviderActionToken,
  codexTranscriptSearchRoots,
  listProviderIds,
  parseProviderId,
  providerRootSpecs,
  resolveSafePathWithinRoots,
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

  it("includes Copilot workspace chat roots", () => {
    const roots = providerRootSpecs("copilot");
    expect(
      roots.some(
        (spec) =>
          spec.source === "vscode_workspace_chats" &&
          spec.exts.includes(".json"),
      ),
    ).toBe(true);
    expect(
      roots.some(
        (spec) =>
          spec.source === "cursor_workspace_chats" &&
          spec.exts.includes(".json"),
      ),
        ).toBe(true);
  });

  it("keeps Codex and dot-home providers separate from desktop app-data cache roots", () => {
    const codexRoots = providerRootSpecs("codex");
    const claudeRoots = providerRootSpecs("claude");
    const geminiRoots = providerRootSpecs("gemini");
    const chatGptRoots = providerRootSpecs("chatgpt");
    const copilotRoots = providerRootSpecs("copilot");

    expect(codexRoots.every((spec) => !spec.root.includes(APP_DATA_DIR))).toBe(true);
    expect(codexTranscriptSearchRoots().some((spec) => spec.root.includes(".codex"))).toBe(true);
    expect(claudeRoots.some((spec) => spec.root.includes(".claude"))).toBe(true);
    expect(claudeRoots.some((spec) => spec.source === "cleanup_backups")).toBe(true);
    expect(geminiRoots.some((spec) => spec.root.includes(".gemini"))).toBe(true);
    expect(geminiRoots.some((spec) => spec.source === "cleanup_backups")).toBe(true);
    expect(chatGptRoots.some((spec) => spec.root === CHAT_DIR)).toBe(true);
    expect(copilotRoots.some((spec) => spec.root.endsWith(path.join("Code", "User", "globalStorage", "github.copilot-chat")))).toBe(true);
    expect(copilotRoots.some((spec) => spec.root.endsWith(path.join("Cursor", "User", "globalStorage", "github.copilot-chat")))).toBe(true);
    expect(copilotRoots.some((spec) => spec.root.endsWith(path.join("Code", "User", "workspaceStorage")))).toBe(true);
    expect(copilotRoots.some((spec) => spec.root.endsWith(path.join("Cursor", "User", "workspaceStorage")))).toBe(true);
  });
});

describe("resolveSafePathWithinRoots", () => {
  it("allows a real file inside the allowed root", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "po-safe-root-"));
    const allowedRoot = path.join(tmpRoot, "allowed");
    await mkdir(allowedRoot, { recursive: true });
    const filePath = path.join(allowedRoot, "session.jsonl");
    await writeFile(filePath, "{}", "utf-8");

    const resolved = await resolveSafePathWithinRoots(filePath, [allowedRoot]);
    expect(resolved).toBe(await realpath(filePath));
  });

  it("rejects a symlinked file that points outside the allowed root", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "po-safe-root-"));
    const allowedRoot = path.join(tmpRoot, "allowed");
    const outsideRoot = path.join(tmpRoot, "outside");
    await mkdir(allowedRoot, { recursive: true });
    await mkdir(outsideRoot, { recursive: true });

    const outsideFile = path.join(outsideRoot, "secret.jsonl");
    await writeFile(outsideFile, "{}", "utf-8");

    const linkedFile = path.join(allowedRoot, "linked.jsonl");
    await symlink(outsideFile, linkedFile);

    const resolved = await resolveSafePathWithinRoots(linkedFile, [allowedRoot]);
    expect(resolved).toBeNull();
  });
});
