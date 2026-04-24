import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_DATA_DIR, CHAT_DIR, CODEX_HOME } from "../../lib/constants.js";
import {
  codexTranscriptSearchRoots,
  isAllowedProviderFilePath,
  listProviderIds,
  parseProviderId,
  providerRootSpecs,
  resolveAllowedProviderFilePath,
  resolveSafePathWithinRoots,
} from "./path-safety.js";

describe("provider path safety", () => {
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
    expect(
      claudeRoots.some((spec) => spec.source === "cleanup_backups"),
    ).toBe(true);
    expect(geminiRoots.some((spec) => spec.root.includes(".gemini"))).toBe(true);
    expect(
      geminiRoots.some((spec) => spec.source === "cleanup_backups"),
    ).toBe(true);
    expect(chatGptRoots.some((spec) => spec.root === CHAT_DIR)).toBe(true);
    expect(
      copilotRoots.some((spec) =>
        spec.root.endsWith(path.join("Code", "User", "globalStorage", "github.copilot-chat")),
      ),
    ).toBe(true);
    expect(
      copilotRoots.some((spec) =>
        spec.root.endsWith(path.join("Cursor", "User", "globalStorage", "github.copilot-chat")),
      ),
    ).toBe(true);
    expect(
      copilotRoots.some((spec) =>
        spec.root.endsWith(path.join("Code", "User", "workspaceStorage")),
      ),
    ).toBe(true);
    expect(
      copilotRoots.some((spec) =>
        spec.root.endsWith(path.join("Cursor", "User", "workspaceStorage")),
      ),
    ).toBe(true);
  });

  it("allows codex cwd backup session paths", () => {
    const backupFilePath = path.join(
      CODEX_HOME,
      "jsonl-cwd-backups-20260421-000000",
      "rollout-2026-04-21T00-00-00-019d0000-1111-7222-8333-444444444444.jsonl",
    );
    expect(isAllowedProviderFilePath("codex", backupFilePath)).toBe(true);
  });

  it("rejects loose ChatGPT data files outside conversations-v3 roots", async () => {
    const testDir = path.join(CHAT_DIR, "__threadlens-vitest__");
    const looseFile = path.join(testDir, "loose.data");
    try {
      await mkdir(testDir, { recursive: true });
      await writeFile(looseFile, "{}", "utf-8");

      await expect(resolveAllowedProviderFilePath("chatgpt", looseFile)).resolves.toBeNull();
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
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
