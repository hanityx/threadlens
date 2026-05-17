import path from "node:path";
import type {
  ProviderId,
} from "@threadlens/shared-contracts";

import {
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
} from "../constants.js";
import { discoverCodexCwdBackupRoots } from "../adapters/codex/roots.js";
import {
  providerArchivedRootSpec,
  providerBackupRootSpecs,
} from "./backup-roots.js";
import type {
  ProviderRootSpec,
} from "../types.js";

export { codexTranscriptSearchRoots } from "../adapters/codex/roots.js";

const PROVIDER_ROOT_SOURCE_PATTERN = /^[a-z0-9][a-z0-9_]*$/;

export function isValidProviderRootSource(source: string): boolean {
  return PROVIDER_ROOT_SOURCE_PATTERN.test(source);
}

export function isValidProviderRootSpec(spec: ProviderRootSpec): boolean {
  return (
    isValidProviderRootSource(spec.source) &&
    path.isAbsolute(spec.root) &&
    spec.exts.length > 0 &&
    spec.exts.every((ext) => ext.startsWith(".") && ext === ext.toLowerCase())
  );
}

export function validateProviderRootSpecs(
  specs: ProviderRootSpec[],
): ProviderRootSpec[] {
  return specs.filter(isValidProviderRootSpec);
}

export function providerRootSpecs(provider: ProviderId): ProviderRootSpec[] {
  const archivedSpec = providerArchivedRootSpec(provider);
  if (provider === "codex") {
    return validateProviderRootSpecs([
      {
        source: "sessions",
        root: path.join(CODEX_HOME, "sessions"),
        exts: [".jsonl"],
      },
      ...(archivedSpec ? [archivedSpec] : []),
      ...providerBackupRootSpecs(provider),
    ]);
  }
  if (provider === "claude") {
    return validateProviderRootSpecs([
      { source: "projects", root: CLAUDE_PROJECTS_DIR, exts: [".jsonl"] },
      {
        source: "transcripts",
        root: CLAUDE_TRANSCRIPTS_DIR,
        exts: [".jsonl", ".json"],
      },
      ...(archivedSpec ? [archivedSpec] : []),
      ...providerBackupRootSpecs(provider),
    ]);
  }
  if (provider === "gemini") {
    return validateProviderRootSpecs([
      { source: "tmp", root: GEMINI_TMP_DIR, exts: [".jsonl", ".json"] },
      { source: "history", root: GEMINI_HISTORY_DIR, exts: [".jsonl", ".json"] },
      {
        source: "antigravity_conversations",
        root: GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR,
        exts: [".pb"],
      },
      ...(archivedSpec ? [archivedSpec] : []),
      ...providerBackupRootSpecs(provider),
    ]);
  }
  if (provider === "copilot") {
    return validateProviderRootSpecs([
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
    ]);
  }
  return [];
}

export async function providerScanRootSpecs(
  provider: ProviderId,
): Promise<ProviderRootSpec[]> {
  if (provider !== "codex") return providerRootSpecs(provider);
  const extraRoots = await discoverCodexCwdBackupRoots();
  return validateProviderRootSpecs([...providerRootSpecs(provider), ...extraRoots]);
}
