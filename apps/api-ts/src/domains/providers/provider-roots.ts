import path from "node:path";
import type {
  ProviderId,
} from "@threadlens/shared-contracts";

import {
  CHAT_DIR,
  CODEX_HOME,
  CLAUDE_PROJECTS_DIR,
  CLAUDE_TRANSCRIPTS_DIR,
  COPILOT_CURSOR_GLOBAL,
  COPILOT_CURSOR_WORKSPACE_STORAGE,
  COPILOT_VSCODE_GLOBAL,
  COPILOT_VSCODE_WORKSPACE_STORAGE,
  GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR,
  GEMINI_HISTORY_DIR,
  GEMINI_TMP_DIR,
} from "../../lib/constants.js";
import { discoverChatGptConversationRoots } from "./roots/chatgpt.js";
import { discoverCodexCwdBackupRoots } from "./roots/codex.js";
import {
  providerArchivedRootSpec,
  providerBackupRootSpecs,
} from "./roots/backups.js";
import type {
  ProviderRootSpec,
} from "./types.js";

export { codexTranscriptSearchRoots } from "./roots/codex.js";

export function providerRootSpecs(provider: ProviderId): ProviderRootSpec[] {
  const archivedSpec = providerArchivedRootSpec(provider);
  if (provider === "codex") {
    return [
      {
        source: "sessions",
        root: path.join(CODEX_HOME, "sessions"),
        exts: [".jsonl"],
      },
      ...(archivedSpec ? [archivedSpec] : []),
      ...providerBackupRootSpecs(provider),
    ];
  }
  if (provider === "chatgpt") {
    return [{ source: "chat_cache", root: CHAT_DIR, exts: [".data"] }];
  }
  if (provider === "claude") {
    return [
      { source: "projects", root: CLAUDE_PROJECTS_DIR, exts: [".jsonl"] },
      {
        source: "transcripts",
        root: CLAUDE_TRANSCRIPTS_DIR,
        exts: [".jsonl", ".json"],
      },
      ...(archivedSpec ? [archivedSpec] : []),
      ...providerBackupRootSpecs(provider),
    ];
  }
  if (provider === "gemini") {
    return [
      { source: "tmp", root: GEMINI_TMP_DIR, exts: [".jsonl", ".json"] },
      { source: "history", root: GEMINI_HISTORY_DIR, exts: [".jsonl", ".json"] },
      {
        source: "antigravity_conversations",
        root: GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR,
        exts: [".pb"],
      },
      ...(archivedSpec ? [archivedSpec] : []),
      ...providerBackupRootSpecs(provider),
    ];
  }
  if (provider === "copilot") {
    return [
      {
        source: "vscode_global",
        root: COPILOT_VSCODE_GLOBAL,
        exts: [".jsonl", ".json"],
      },
      {
        source: "cursor_global",
        root: COPILOT_CURSOR_GLOBAL,
        exts: [".jsonl", ".json"],
      },
      {
        source: "vscode_workspace_chats",
        root: COPILOT_VSCODE_WORKSPACE_STORAGE,
        exts: [".json"],
      },
      {
        source: "cursor_workspace_chats",
        root: COPILOT_CURSOR_WORKSPACE_STORAGE,
        exts: [".json"],
      },
      ...(archivedSpec ? [archivedSpec] : []),
      ...providerBackupRootSpecs(provider),
    ];
  }
  return [];
}

export async function providerScanRootSpecs(
  provider: ProviderId,
): Promise<ProviderRootSpec[]> {
  if (provider === "chatgpt") {
    const discovered = await discoverChatGptConversationRoots();
    if (discovered.length > 0) return discovered;
    return providerRootSpecs(provider);
  }
  if (provider !== "codex") return providerRootSpecs(provider);
  const extraRoots = await discoverCodexCwdBackupRoots();
  return [...providerRootSpecs(provider), ...extraRoots];
}
