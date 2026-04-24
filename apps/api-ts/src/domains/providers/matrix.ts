import path from "node:path";
import { getProviderCapability, type ProviderId } from "@threadlens/shared-contracts";
import {
  CHAT_DIR,
  CODEX_HOME,
  CLAUDE_HOME,
  CLAUDE_PROJECTS_DIR,
  CLAUDE_TRANSCRIPTS_DIR,
  COPILOT_CURSOR_GLOBAL,
  COPILOT_CURSOR_WORKSPACE_STORAGE,
  COPILOT_VSCODE_GLOBAL,
  COPILOT_VSCODE_WORKSPACE_STORAGE,
  GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR,
  GEMINI_HISTORY_DIR,
  GEMINI_HOME,
  GEMINI_TMP_DIR,
} from "../../lib/constants.js";
import {
  countFilesRecursiveByExt,
  countJsonlFilesRecursive,
  nowIsoUtc,
  pathExists,
  quickFileCount,
  walkFilesByExt,
} from "../../lib/utils.js";
import {
  codexTranscriptSearchRoots,
  providerName,
  providerRootSpecs,
  providerScanRootSpecs,
} from "./path-safety.js";
import {
  isCopilotGlobalSessionLikeFile,
  isWorkspaceChatSessionPath,
} from "./probe.js";
import type { ProviderMatrixData, ProviderStatus } from "./types.js";

type ProviderMatrixCacheEntry = {
  expires_at: number;
  data: ProviderMatrixData;
};

const PROVIDER_MATRIX_CACHE_TTL_MS = 30_000;
const COPILOT_MATRIX_SESSION_SCAN_LIMIT = 5_000;
let providerMatrixCache: ProviderMatrixCacheEntry | null = null;
let providerMatrixInflight: Promise<ProviderMatrixData> | null = null;

function supportsProviderCleanup(provider: ProviderId): boolean {
  return getProviderCapability(provider).safe_cleanup;
}

function supportsProviderHardDelete(provider: ProviderId): boolean {
  return getProviderCapability(provider).hard_delete;
}

export function providerStatus(
  rootExists: boolean,
  sessionLogs: number,
): ProviderStatus {
  if (sessionLogs > 0) return "active";
  if (rootExists) return "detected";
  return "missing";
}

export function capabilityLevel(
  status: ProviderStatus,
  safeCleanup: boolean,
): "full" | "read-only" | "unavailable" {
  if (safeCleanup) return "full";
  if (status !== "missing") return "read-only";
  return "unavailable";
}

export function invalidateProviderMatrixCache() {
  providerMatrixCache = null;
}

function shouldIncludeCopilotMatrixSessionFile(source: string, filePath: string): boolean {
  if (source === "cleanup_backups" && path.basename(filePath) === "_manifest.json") {
    return false;
  }
  if (source === "vscode_workspace_chats" || source === "cursor_workspace_chats") {
    return isWorkspaceChatSessionPath(filePath);
  }
  if (source === "vscode_global" || source === "cursor_global") {
    return isCopilotGlobalSessionLikeFile(filePath);
  }
  return true;
}

async function countCopilotMatrixSessionFiles() {
  const roots = providerRootSpecs("copilot");
  const counts = await Promise.all(
    roots.map(async (spec) => {
      const files = await walkFilesByExt(
        spec.root,
        spec.exts,
        COPILOT_MATRIX_SESSION_SCAN_LIMIT,
      );
      return files.filter((filePath) =>
        shouldIncludeCopilotMatrixSessionFile(spec.source, filePath),
      ).length;
    }),
  );
  return counts.reduce((sum, count) => sum + count, 0);
}

async function buildProviderMatrixData(): Promise<ProviderMatrixData> {
  const codexHomes = Array.from(
    new Set(codexTranscriptSearchRoots().map((spec) => path.dirname(spec.root))),
  );
  const codexRootExists = await pathExists(CODEX_HOME);
  const chatGptRootExists = await pathExists(CHAT_DIR);
  const claudeRootExists = await pathExists(CLAUDE_HOME);
  const geminiRootExists = await pathExists(GEMINI_HOME);
  const copilotVsCodeExists = await pathExists(COPILOT_VSCODE_GLOBAL);
  const copilotCursorExists = await pathExists(COPILOT_CURSOR_GLOBAL);
  const copilotVsCodeWorkspaceExists = await pathExists(
    COPILOT_VSCODE_WORKSPACE_STORAGE,
  );
  const copilotCursorWorkspaceExists = await pathExists(
    COPILOT_CURSOR_WORKSPACE_STORAGE,
  );
  const chatGptConversationRoots = await providerScanRootSpecs("chatgpt");

  const codexSessionLogs =
    (await countJsonlFilesRecursive(path.join(CODEX_HOME, "sessions"))) +
    (await countJsonlFilesRecursive(path.join(CODEX_HOME, "archived_sessions")));
  const claudeSessionLogs =
    (await countFilesRecursiveByExt(CLAUDE_PROJECTS_DIR, [".jsonl", ".json"])) +
    (await countFilesRecursiveByExt(CLAUDE_TRANSCRIPTS_DIR, [".jsonl", ".json"]));
  const geminiSessionLogs =
    (await countFilesRecursiveByExt(GEMINI_TMP_DIR, [".jsonl", ".json"])) +
    (await countFilesRecursiveByExt(GEMINI_HISTORY_DIR, [".jsonl", ".json"])) +
    (await countFilesRecursiveByExt(GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR, [".pb"]));
  const chatGptSessionLogs = (
    await Promise.all(
      chatGptConversationRoots.map((spec) => quickFileCount(spec.root)),
    )
  ).reduce((sum, count) => sum + count, 0);
  const copilotSignalFiles = await countCopilotMatrixSessionFiles();

  const codexStatus = providerStatus(codexRootExists, codexSessionLogs);
  const chatGptStatus = providerStatus(chatGptRootExists, chatGptSessionLogs);
  const claudeStatus = providerStatus(claudeRootExists, claudeSessionLogs);
  const geminiStatus = providerStatus(geminiRootExists, geminiSessionLogs);
  const copilotStatus = providerStatus(
    copilotVsCodeExists ||
      copilotCursorExists ||
      copilotVsCodeWorkspaceExists ||
      copilotCursorWorkspaceExists,
    copilotSignalFiles,
  );

  const providers = [
    {
      provider: "codex" as ProviderId,
      name: "Codex",
      status: codexStatus,
      capability_level: capabilityLevel(codexStatus, supportsProviderCleanup("codex")),
      capabilities: {
        read_sessions: true,
        analyze_context: true,
        safe_cleanup: supportsProviderCleanup("codex"),
        hard_delete: supportsProviderHardDelete("codex"),
      },
      evidence: {
        roots: codexHomes,
        session_log_count: codexSessionLogs,
        notes: "Thread logs, pinned state, and global state.",
      },
    },
    {
      provider: "chatgpt" as ProviderId,
      name: providerName("chatgpt"),
      status: chatGptStatus,
      capability_level: capabilityLevel(
        chatGptStatus,
        supportsProviderCleanup("chatgpt"),
      ),
      capabilities: {
        read_sessions: chatGptRootExists,
        analyze_context: chatGptSessionLogs > 0,
        safe_cleanup: supportsProviderCleanup("chatgpt"),
        hard_delete: supportsProviderHardDelete("chatgpt"),
      },
      evidence: {
        roots: [CHAT_DIR],
        session_log_count: chatGptSessionLogs,
        notes: "Desktop cache and conversation files.",
      },
    },
    {
      provider: "claude" as ProviderId,
      name: providerName("claude"),
      status: claudeStatus,
      capability_level: capabilityLevel(
        claudeStatus,
        supportsProviderCleanup("claude") && claudeStatus !== "missing",
      ),
      capabilities: {
        read_sessions: claudeRootExists,
        analyze_context: claudeSessionLogs > 0,
        safe_cleanup: supportsProviderCleanup("claude") && claudeStatus !== "missing",
        hard_delete:
          supportsProviderHardDelete("claude") && claudeStatus !== "missing",
      },
      evidence: {
        roots: [CLAUDE_HOME, CLAUDE_PROJECTS_DIR, CLAUDE_TRANSCRIPTS_DIR],
        session_log_count: claudeSessionLogs,
        notes: "Session and transcript files.",
      },
    },
    {
      provider: "gemini" as ProviderId,
      name: providerName("gemini"),
      status: geminiStatus,
      capability_level: capabilityLevel(
        geminiStatus,
        supportsProviderCleanup("gemini") && geminiStatus !== "missing",
      ),
      capabilities: {
        read_sessions: geminiRootExists,
        analyze_context: geminiSessionLogs > 0,
        safe_cleanup: supportsProviderCleanup("gemini") && geminiStatus !== "missing",
        hard_delete:
          supportsProviderHardDelete("gemini") && geminiStatus !== "missing",
      },
      evidence: {
        roots: [
          GEMINI_HOME,
          GEMINI_TMP_DIR,
          GEMINI_HISTORY_DIR,
          GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR,
        ],
        session_log_count: geminiSessionLogs,
        notes: "History, tmp, and checkpoint files.",
      },
    },
    {
      provider: "copilot" as ProviderId,
      name: providerName("copilot"),
      status: copilotStatus,
      capability_level: capabilityLevel(
        copilotStatus,
        supportsProviderCleanup("copilot") && copilotStatus !== "missing",
      ),
      capabilities: {
        read_sessions:
          copilotVsCodeExists ||
          copilotCursorExists ||
          copilotVsCodeWorkspaceExists ||
          copilotCursorWorkspaceExists,
        analyze_context: copilotSignalFiles > 0,
        safe_cleanup:
          supportsProviderCleanup("copilot") && copilotStatus !== "missing",
        hard_delete:
          supportsProviderHardDelete("copilot") && copilotStatus !== "missing",
      },
      evidence: {
        roots: [
          COPILOT_VSCODE_GLOBAL,
          COPILOT_CURSOR_GLOBAL,
          COPILOT_VSCODE_WORKSPACE_STORAGE,
          COPILOT_CURSOR_WORKSPACE_STORAGE,
          ...providerRootSpecs("copilot")
            .filter((spec) => spec.source === "cleanup_backups")
            .map((spec) => spec.root),
        ],
        session_log_count: copilotSignalFiles,
        notes: "Workspace chat files and editor traces.",
      },
    },
  ];

  const summary = {
    total: providers.length,
    active: providers.filter((x) => x.status === "active").length,
    detected: providers.filter((x) => x.status !== "missing").length,
    read_analyze_ready: providers.filter(
      (x) => x.capabilities.read_sessions && x.capabilities.analyze_context,
    ).length,
    safe_cleanup_ready: providers.filter((x) => x.capabilities.safe_cleanup)
      .length,
    hard_delete_ready: providers.filter((x) => x.capabilities.hard_delete)
      .length,
  };

  return {
    generated_at: nowIsoUtc(),
    mode: "multi-provider-phase-1",
    summary,
    providers,
    policy: {
      cleanup_gate: "provider capability matrix controls destructive actions",
      default_non_codex: "all detected providers are visible for local analysis",
    },
  };
}

export async function getProviderMatrixTs(options?: { forceRefresh?: boolean }) {
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();
  if (!forceRefresh && providerMatrixCache && providerMatrixCache.expires_at > now) {
    return providerMatrixCache.data;
  }
  if (forceRefresh) {
    providerMatrixCache = null;
  }
  if (providerMatrixInflight) {
    return providerMatrixInflight;
  }

  providerMatrixInflight = buildProviderMatrixData()
    .then((data) => {
      providerMatrixCache = {
        expires_at: Date.now() + PROVIDER_MATRIX_CACHE_TTL_MS,
        data,
      };
      return data;
    })
    .finally(() => {
      providerMatrixInflight = null;
    });

  return providerMatrixInflight;
}
