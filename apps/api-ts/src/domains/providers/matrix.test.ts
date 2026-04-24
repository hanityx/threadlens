import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@threadlens/shared-contracts", () => ({
  getProviderCapability: () => ({ safe_cleanup: true, hard_delete: true }),
}));

vi.mock("../../lib/constants.js", () => ({
  CHAT_DIR: "/mock/chat",
  CODEX_HOME: "/mock/codex",
  CLAUDE_HOME: "/mock/claude",
  CLAUDE_PROJECTS_DIR: "/mock/claude/projects",
  CLAUDE_TRANSCRIPTS_DIR: "/mock/claude/transcripts",
  COPILOT_CURSOR_GLOBAL: "/mock/copilot/cursor-global",
  COPILOT_CURSOR_WORKSPACE_STORAGE: "/mock/copilot/cursor-workspaces",
  COPILOT_VSCODE_GLOBAL: "/mock/copilot/vscode-global",
  COPILOT_VSCODE_WORKSPACE_STORAGE: "/mock/copilot/vscode-workspaces",
  GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR: "/mock/gemini/checkpoints",
  GEMINI_HISTORY_DIR: "/mock/gemini/history",
  GEMINI_HOME: "/mock/gemini",
  GEMINI_TMP_DIR: "/mock/gemini/tmp",
}));

vi.mock("../../lib/utils.js", () => ({
  countFilesRecursiveByExt: vi.fn(async () => 1),
  countJsonlFilesRecursive: vi.fn(async () => 1),
  nowIsoUtc: () => "2026-04-21T00:00:00.000Z",
  pathExists: vi.fn(async () => true),
  quickFileCount: vi.fn(async () => 1),
  walkFilesByExt: vi.fn(async () => ["/mock/session.json"]),
}));

vi.mock("./path-safety.js", () => ({
  codexTranscriptSearchRoots: () => [{ root: "/mock/codex/sessions" }],
  providerName: (provider: string) =>
    ({
      chatgpt: "ChatGPT",
      claude: "Claude",
      gemini: "Gemini",
      copilot: "Copilot",
      codex: "Codex",
    })[provider] ?? provider,
  providerRootSpecs: (provider: string) =>
    provider === "copilot"
      ? [
          { source: "vscode_global", root: "/mock/copilot/vscode-global", exts: [".json"] },
          { source: "vscode_workspace_chats", root: "/mock/copilot/vscode-workspaces", exts: [".json"] },
          { source: "cleanup_backups", root: "/mock/backups/copilot", exts: [".json"] },
        ]
      : [],
  providerScanRootSpecs: async (provider: string) =>
    provider === "chatgpt" ? [{ root: "/mock/chat/conversations" }] : [],
}));

vi.mock("./probe.js", () => ({
  isCopilotGlobalSessionLikeFile: () => true,
  isWorkspaceChatSessionPath: () => true,
}));

import { getProviderMatrixTs, invalidateProviderMatrixCache } from "./matrix.js";

describe("provider matrix notes", () => {
  beforeEach(() => {
    invalidateProviderMatrixCache();
  });

  it("uses concise provider notes for matrix surfaces", async () => {
    const data = await getProviderMatrixTs({ forceRefresh: true });

    expect(data.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "codex",
          evidence: expect.objectContaining({
            notes: "Thread logs, pinned state, and global state.",
          }),
        }),
        expect.objectContaining({
          provider: "chatgpt",
          evidence: expect.objectContaining({
            notes: "Desktop cache and conversation files.",
          }),
        }),
        expect.objectContaining({
          provider: "claude",
          evidence: expect.objectContaining({
            notes: "Session and transcript files.",
          }),
        }),
        expect.objectContaining({
          provider: "gemini",
          evidence: expect.objectContaining({
            notes: "History, tmp, and checkpoint files.",
          }),
        }),
        expect.objectContaining({
          provider: "copilot",
          evidence: expect.objectContaining({
            notes: "Workspace chat files and editor traces.",
          }),
        }),
      ]),
    );
  });

  it("counts Copilot matrix sessions with the same roots used by provider sessions", async () => {
    const data = await getProviderMatrixTs({ forceRefresh: true });
    const copilot = data.providers.find((provider) => provider.provider === "copilot");

    expect(copilot?.evidence.session_log_count).toBe(3);
    expect(copilot?.evidence.roots).toContain("/mock/backups/copilot");
  });
});
