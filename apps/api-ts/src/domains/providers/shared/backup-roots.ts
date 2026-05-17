import path from "node:path";
import type { ProviderId } from "@threadlens/shared-contracts";

import { BACKUP_ROOT } from "../../recovery/constants.js";
import { CODEX_HOME } from "../constants.js";
import type { ProviderRootSpec } from "../types.js";

function providerActionBackupRoots(provider: ProviderId): string[] {
  return Array.from(
    new Set([
      path.join(BACKUP_ROOT, "provider_actions", provider),
      path.join(CODEX_HOME, "local_cleanup_backups", "provider_actions", provider),
    ]),
  );
}

export function providerBackupRootSpecs(provider: ProviderId): ProviderRootSpec[] {
  const cleanupRoots = () =>
    providerActionBackupRoots(provider).map((root) => ({
      source: "cleanup_backups",
      root,
      exts: [".jsonl", ".json"],
    }));
  if (provider === "codex") {
    return [
      {
        source: "recovered_sessions",
        root: path.join(CODEX_HOME, "recovered-sessions"),
        exts: [".jsonl"],
      },
      ...cleanupRoots().map((spec) => ({ ...spec, exts: [".jsonl"] })),
    ];
  }
  if (provider === "claude") {
    return cleanupRoots();
  }
  if (provider === "gemini") {
    return cleanupRoots().map((spec) => ({ ...spec, exts: [".jsonl", ".json", ".pb"] }));
  }
  if (provider === "copilot") {
    return cleanupRoots();
  }
  return [];
}

export function providerArchivedRootSpec(provider: ProviderId): ProviderRootSpec | null {
  if (provider === "codex") {
    return {
      source: "archived_sessions",
      root: path.join(CODEX_HOME, "archived_sessions"),
      exts: [".jsonl"],
    };
  }
  if (provider === "claude") {
    return {
      source: "archived_sessions",
      root: path.join(CODEX_HOME, "archived_sessions", "claude"),
      exts: [".jsonl", ".json"],
    };
  }
  if (provider === "gemini") {
    return {
      source: "archived_sessions",
      root: path.join(CODEX_HOME, "archived_sessions", "gemini"),
      exts: [".jsonl", ".json", ".pb"],
    };
  }
  if (provider === "copilot") {
    return {
      source: "archived_sessions",
      root: path.join(CODEX_HOME, "archived_sessions", "copilot"),
      exts: [".jsonl", ".json"],
    };
  }
  return null;
}
