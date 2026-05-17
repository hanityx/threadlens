import type { ProviderId } from "@threadlens/shared-contracts";
import {
  CHAT_DIR,
  CLAUDE_HOME,
  CLAUDE_PROJECTS_DIR,
  CLAUDE_TRANSCRIPTS_DIR,
  COPILOT_CURSOR_GLOBAL,
  COPILOT_CURSOR_WORKSPACE_STORAGE,
  COPILOT_VSCODE_GLOBAL,
  COPILOT_VSCODE_WORKSPACE_STORAGE,
} from "../../constants.js";
import {
  providerLabel,
  supportsProviderCleanup,
  supportsProviderHardDelete,
} from "./adapter-access.js";
import {
  capabilityLevel,
  providerStatus,
} from "./summary.js";
import type {
  ProviderMatrixSignals,
} from "./signals.js";
import type {
  ProviderMatrixData,
} from "../../types.js";

export function buildProviderMatrixProviders(
  signals: ProviderMatrixSignals,
): ProviderMatrixData["providers"] {
  const codexStatus = providerStatus(signals.codexRootExists, signals.codexSessionLogs);
  const chatGptStatus = providerStatus(signals.chatGptRootExists, signals.chatGptSessionLogs);
  const claudeStatus = providerStatus(signals.claudeRootExists, signals.claudeSessionLogs);
  const geminiStatus = providerStatus(signals.geminiRootExists, signals.geminiSessionLogs);
  const copilotStatus = providerStatus(signals.copilotRootExists, signals.copilotSignalFiles);
  const codexCleanupReady = supportsProviderCleanup("codex") && codexStatus !== "missing";
  const codexHardDeleteReady =
    supportsProviderHardDelete("codex") && codexStatus !== "missing";

  return [
    {
      provider: "codex" as ProviderId,
      name: providerLabel("codex"),
      status: codexStatus,
      capability_level: capabilityLevel(codexStatus, codexCleanupReady),
      capabilities: {
        read_sessions: signals.codexRootExists,
        analyze_context: signals.codexSessionLogs > 0,
        safe_cleanup: codexCleanupReady,
        hard_delete: codexHardDeleteReady,
      },
      evidence: {
        roots: signals.codexHomes,
        session_log_count: signals.codexSessionLogs,
        notes: "Thread logs, pinned state, and global state.",
      },
    },
    {
      provider: "chatgpt" as ProviderId,
      name: providerLabel("chatgpt"),
      status: chatGptStatus,
      capability_level: capabilityLevel(
        chatGptStatus,
        supportsProviderCleanup("chatgpt"),
      ),
      capabilities: {
        read_sessions: signals.chatGptRootExists,
        analyze_context: signals.chatGptSessionLogs > 0,
        safe_cleanup: supportsProviderCleanup("chatgpt"),
        hard_delete: supportsProviderHardDelete("chatgpt"),
      },
      evidence: {
        roots: [CHAT_DIR],
        session_log_count: signals.chatGptSessionLogs,
        notes: "Desktop cache and conversation files.",
      },
    },
    {
      provider: "claude" as ProviderId,
      name: providerLabel("claude"),
      status: claudeStatus,
      capability_level: capabilityLevel(
        claudeStatus,
        supportsProviderCleanup("claude") && claudeStatus !== "missing",
      ),
      capabilities: {
        read_sessions: signals.claudeRootExists,
        analyze_context: signals.claudeSessionLogs > 0,
        safe_cleanup: supportsProviderCleanup("claude") && claudeStatus !== "missing",
        hard_delete:
          supportsProviderHardDelete("claude") && claudeStatus !== "missing",
      },
      evidence: {
        roots: [CLAUDE_HOME, CLAUDE_PROJECTS_DIR, CLAUDE_TRANSCRIPTS_DIR],
        session_log_count: signals.claudeSessionLogs,
        notes: "Session and transcript files.",
      },
    },
    {
      provider: "gemini" as ProviderId,
      name: providerLabel("gemini"),
      status: geminiStatus,
      capability_level: capabilityLevel(
        geminiStatus,
        supportsProviderCleanup("gemini") && geminiStatus !== "missing",
      ),
      capabilities: {
        read_sessions: signals.geminiRootExists,
        analyze_context: signals.geminiSessionLogs > 0,
        safe_cleanup: supportsProviderCleanup("gemini") && geminiStatus !== "missing",
        hard_delete:
          supportsProviderHardDelete("gemini") && geminiStatus !== "missing",
      },
      evidence: {
        roots: signals.geminiRoots,
        session_log_count: signals.geminiSessionLogs,
        notes: signals.geminiNotes,
      },
    },
    {
      provider: "copilot" as ProviderId,
      name: providerLabel("copilot"),
      status: copilotStatus,
      capability_level: capabilityLevel(
        copilotStatus,
        supportsProviderCleanup("copilot") && copilotStatus !== "missing",
      ),
      capabilities: {
        read_sessions: signals.copilotRootExists,
        analyze_context: signals.copilotSignalFiles > 0,
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
          ...signals.copilotProviderRoots
            .filter((spec) => spec.source === "cleanup_backups")
            .map((spec) => spec.root),
        ],
        session_log_count: signals.copilotSignalFiles,
        notes: "Workspace chat files and editor traces.",
      },
    },
  ];
}
