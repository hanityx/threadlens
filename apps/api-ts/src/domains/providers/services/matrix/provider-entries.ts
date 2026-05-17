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
  ProviderStatus,
} from "../../types.js";

function providerActionReadiness(
  provider: ProviderId,
  status: ProviderStatus,
) {
  const runtimeReady = status !== "missing";
  return {
    safeCleanup: supportsProviderCleanup(provider) && runtimeReady,
    hardDelete: supportsProviderHardDelete(provider) && runtimeReady,
  };
}

export function buildProviderMatrixProviders(
  signals: ProviderMatrixSignals,
): ProviderMatrixData["providers"] {
  const codexStatus = providerStatus(signals.codexRootExists, signals.codexSessionLogs);
  const chatGptStatus = providerStatus(signals.chatGptRootExists, signals.chatGptSessionLogs);
  const claudeStatus = providerStatus(signals.claudeRootExists, signals.claudeSessionLogs);
  const geminiStatus = providerStatus(signals.geminiRootExists, signals.geminiSessionLogs);
  const copilotStatus = providerStatus(signals.copilotRootExists, signals.copilotSignalFiles);
  const codexReady = providerActionReadiness("codex", codexStatus);
  const chatGptReady = providerActionReadiness("chatgpt", chatGptStatus);
  const claudeReady = providerActionReadiness("claude", claudeStatus);
  const geminiReady = providerActionReadiness("gemini", geminiStatus);
  const copilotReady = providerActionReadiness("copilot", copilotStatus);

  return [
    {
      provider: "codex" as ProviderId,
      name: providerLabel("codex"),
      status: codexStatus,
      capability_level: capabilityLevel(codexStatus, codexReady.safeCleanup),
      capabilities: {
        read_sessions: signals.codexRootExists,
        analyze_context: signals.codexSessionLogs > 0,
        safe_cleanup: codexReady.safeCleanup,
        hard_delete: codexReady.hardDelete,
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
      capability_level: capabilityLevel(chatGptStatus, chatGptReady.safeCleanup),
      capabilities: {
        read_sessions: signals.chatGptRootExists,
        analyze_context: signals.chatGptSessionLogs > 0,
        safe_cleanup: chatGptReady.safeCleanup,
        hard_delete: chatGptReady.hardDelete,
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
      capability_level: capabilityLevel(claudeStatus, claudeReady.safeCleanup),
      capabilities: {
        read_sessions: signals.claudeRootExists,
        analyze_context: signals.claudeSessionLogs > 0,
        safe_cleanup: claudeReady.safeCleanup,
        hard_delete: claudeReady.hardDelete,
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
      capability_level: capabilityLevel(geminiStatus, geminiReady.safeCleanup),
      capabilities: {
        read_sessions: signals.geminiRootExists,
        analyze_context: signals.geminiSessionLogs > 0,
        safe_cleanup: geminiReady.safeCleanup,
        hard_delete: geminiReady.hardDelete,
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
      capability_level: capabilityLevel(copilotStatus, copilotReady.safeCleanup),
      capabilities: {
        read_sessions: signals.copilotRootExists,
        analyze_context: signals.copilotSignalFiles > 0,
        safe_cleanup: copilotReady.safeCleanup,
        hard_delete: copilotReady.hardDelete,
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
