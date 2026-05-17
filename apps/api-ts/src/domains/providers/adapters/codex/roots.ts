import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  BACKUP_ROOT,
  CODEX_HOME,
  HOME_DIR,
} from "../../../../lib/constants.js";
import type {
  ProviderRootSpec,
} from "../../types.js";

type CodexCwdBackupRootsCacheEntry = {
  expires_at: number;
  roots: ProviderRootSpec[];
};

const CODEX_CWD_BACKUP_ROOT_DISCOVERY_TTL_MS = 60_000;
let codexCwdBackupRootsCache: CodexCwdBackupRootsCacheEntry | null = null;

export function codexTranscriptSearchRoots(): ProviderRootSpec[] {
  const homes = Array.from(
    new Set([
      CODEX_HOME,
      path.join(HOME_DIR, ".codex-cli"),
      path.join(HOME_DIR, ".codex"),
    ].filter(Boolean)),
  );
  const roots: ProviderRootSpec[] = [];
  roots.push({
    source: "cleanup_backups",
    root: path.join(BACKUP_ROOT, "provider_actions", "codex"),
    exts: [".jsonl"],
  });
  for (const home of homes) {
    roots.push({
      source: "sessions",
      root: path.join(home, "sessions"),
      exts: [".jsonl"],
    });
    roots.push({
      source: "archived_sessions",
      root: path.join(home, "archived_sessions"),
      exts: [".jsonl"],
    });
    roots.push({
      source: "recovered_sessions",
      root: path.join(home, "recovered-sessions"),
      exts: [".jsonl"],
    });
    roots.push({
      source: "cleanup_backups",
      root: path.join(home, "local_cleanup_backups", "provider_actions", "codex"),
      exts: [".jsonl"],
    });
  }
  return roots;
}

export async function discoverCodexCwdBackupRoots(): Promise<ProviderRootSpec[]> {
  if (codexCwdBackupRootsCache && codexCwdBackupRootsCache.expires_at > Date.now()) {
    return codexCwdBackupRootsCache.roots;
  }
  const entries = await readdir(CODEX_HOME, { withFileTypes: true }).catch(() => []);
  const roots = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("jsonl-cwd-backups-"))
    .map((entry) => ({
      source: "cwd_backups",
      root: path.join(CODEX_HOME, entry.name),
      exts: [".jsonl"],
    }));
  codexCwdBackupRootsCache = {
    expires_at: Date.now() + CODEX_CWD_BACKUP_ROOT_DISCOVERY_TTL_MS,
    roots,
  };
  return roots;
}
