import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@threadlens/shared-contracts", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@threadlens/shared-contracts")>();
  return {
    ...actual,
    getProviderCapability: (provider: string) => ({
      safe_cleanup: provider !== "chatgpt",
      hard_delete: provider !== "chatgpt",
    }),
  };
});

vi.mock("./constants.js", () => ({
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

vi.mock("../recovery/constants.js", () => ({
  BACKUP_ROOT: "/mock/backups",
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

import { listProviderAdapters } from "./registry.js";
import { getProviderMatrixTs, invalidateProviderMatrixCache } from "./matrix.js";
import { buildProviderMatrixProviders } from "./services/matrix/provider-entries.js";

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

  it("keeps matrix rows aligned with the provider adapter registry", async () => {
    const data = await getProviderMatrixTs({ forceRefresh: true });

    expect(data.providers.map((provider) => provider.provider)).toEqual(
      listProviderAdapters().map((adapter) => adapter.id),
    );
    expect(data.providers.map((provider) => provider.name)).toEqual(
      listProviderAdapters().map((adapter) => adapter.label),
    );
  });

  it("counts Copilot matrix sessions with the same roots used by provider sessions", async () => {
    const data = await getProviderMatrixTs({ forceRefresh: true });
    const copilot = data.providers.find((provider) => provider.provider === "copilot");

    expect(copilot?.evidence.session_log_count).toBeGreaterThanOrEqual(3);
    expect(copilot?.evidence.roots).toContain("/mock/backups/provider_actions/copilot");
  });

  it("uses adapter health evidence for Gemini without changing the matrix shape", async () => {
    const data = await getProviderMatrixTs({ forceRefresh: true });
    const gemini = data.providers.find((provider) => provider.provider === "gemini");

    expect(gemini).toMatchObject({
      provider: "gemini",
      status: "active",
      evidence: {
        roots: [
          "/mock/gemini",
          "/mock/gemini/tmp",
          "/mock/gemini/history",
          "/mock/gemini/checkpoints",
        ],
        session_log_count: 3,
        notes: "History, tmp, and checkpoint files.",
      },
    });
  });

  it("does not report Codex cleanup readiness when its runtime roots are missing", () => {
    const providers = buildProviderMatrixProviders({
      codexHomes: ["/mock/codex"],
      codexRootExists: false,
      codexSessionLogs: 0,
      chatGptRootExists: false,
      chatGptSessionLogs: 0,
      claudeRootExists: false,
      claudeSessionLogs: 0,
      geminiRootExists: false,
      geminiSessionLogs: 0,
      geminiRoots: [],
      geminiNotes: "History, tmp, and checkpoint files.",
      copilotProviderRoots: [],
      copilotRootExists: false,
      copilotSignalFiles: 0,
    });
    const codex = providers.find((provider) => provider.provider === "codex");

    expect(codex).toMatchObject({
      status: "missing",
      capability_level: "unavailable",
      capabilities: {
        read_sessions: false,
        analyze_context: false,
        safe_cleanup: false,
        hard_delete: false,
      },
    });
  });

  it("does not report ChatGPT cleanup readiness when its runtime roots are missing", () => {
    const providers = buildProviderMatrixProviders({
      codexHomes: [],
      codexRootExists: false,
      codexSessionLogs: 0,
      chatGptRootExists: false,
      chatGptSessionLogs: 0,
      claudeRootExists: false,
      claudeSessionLogs: 0,
      geminiRootExists: false,
      geminiSessionLogs: 0,
      geminiRoots: [],
      geminiNotes: "History, tmp, and checkpoint files.",
      copilotProviderRoots: [],
      copilotRootExists: false,
      copilotSignalFiles: 0,
    });
    const chatgpt = providers.find((provider) => provider.provider === "chatgpt");

    expect(chatgpt).toMatchObject({
      status: "missing",
      capability_level: "unavailable",
      capabilities: {
        read_sessions: false,
        analyze_context: false,
        safe_cleanup: false,
        hard_delete: false,
      },
    });
  });

  it("keeps detected ChatGPT read-only in matrix", () => {
    const providers = buildProviderMatrixProviders({
      codexHomes: [],
      codexRootExists: false,
      codexSessionLogs: 0,
      chatGptRootExists: true,
      chatGptSessionLogs: 3,
      claudeRootExists: false,
      claudeSessionLogs: 0,
      geminiRootExists: false,
      geminiSessionLogs: 0,
      geminiRoots: [],
      geminiNotes: "History, tmp, and checkpoint files.",
      copilotProviderRoots: [],
      copilotRootExists: false,
      copilotSignalFiles: 0,
    });
    const chatgpt = providers.find((provider) => provider.provider === "chatgpt");

    expect(chatgpt).toMatchObject({
      status: "active",
      capability_level: "read-only",
      capabilities: {
        read_sessions: true,
        analyze_context: true,
        safe_cleanup: false,
        hard_delete: false,
      },
    });
  });
});
