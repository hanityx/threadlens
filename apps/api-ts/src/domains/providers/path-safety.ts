import { lstat, realpath, readdir } from "node:fs/promises";
import path from "node:path";
import {
  PROVIDER_IDS,
  PROVIDER_LABELS,
  type ProviderId,
} from "@threadlens/shared-contracts";
import {
  BACKUP_ROOT,
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
  HOME_DIR,
} from "../../lib/constants.js";
import { pathExists } from "../../lib/utils.js";
import type { ProviderRootSpec } from "./types.js";

type ChatGptRootsCacheEntry = {
  expires_at: number;
  roots: ProviderRootSpec[];
};

type CodexCwdBackupRootsCacheEntry = {
  expires_at: number;
  roots: ProviderRootSpec[];
};

const CHATGPT_ROOT_DISCOVERY_TTL_MS = 45_000;
const CODEX_CWD_BACKUP_ROOT_DISCOVERY_TTL_MS = 60_000;
let chatGptRootsCache: ChatGptRootsCacheEntry | null = null;
let codexCwdBackupRootsCache: CodexCwdBackupRootsCacheEntry | null = null;

export function providerName(provider: ProviderId): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

export function listProviderIds(): ProviderId[] {
  return [...PROVIDER_IDS];
}

export function parseProviderId(raw: unknown): ProviderId | undefined {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if ((PROVIDER_IDS as readonly string[]).includes(value)) {
    return value as ProviderId;
  }
  return undefined;
}

export function isPathInsideRoot(
  targetPath: string,
  rootPath: string,
): boolean {
  const fullTarget = path.resolve(targetPath);
  const fullRoot = path.resolve(rootPath);
  return (
    fullTarget === fullRoot || fullTarget.startsWith(`${fullRoot}${path.sep}`)
  );
}

function isCodexCwdBackupPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".jsonl") return false;
  if (!isPathInsideRoot(filePath, CODEX_HOME)) return false;
  const relativePath = path.relative(CODEX_HOME, path.resolve(filePath));
  const [firstSegment = ""] = relativePath.split(path.sep);
  return (
    firstSegment.startsWith("jsonl-cwd-backups-") &&
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== ".."
  );
}

async function discoverChatGptConversationRoots(): Promise<ProviderRootSpec[]> {
  const now = Date.now();
  if (chatGptRootsCache && chatGptRootsCache.expires_at > now) {
    return chatGptRootsCache.roots;
  }
  if (!(await pathExists(CHAT_DIR))) return [];
  const out = new Map<string, ProviderRootSpec>();
  const push = (source: string, root: string) => {
    if (!out.has(root)) out.set(root, { source, root, exts: [".data"] });
  };

  const topLevel = await readdir(CHAT_DIR, { withFileTypes: true }).catch(
    () => [],
  );

  for (const entry of topLevel) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("conversations-v3-")) {
      push("conversations", path.join(CHAT_DIR, entry.name));
      continue;
    }
    const nestedRoot = path.join(CHAT_DIR, entry.name);
    const nested = await readdir(nestedRoot, { withFileTypes: true }).catch(
      () => [],
    );
    for (const child of nested) {
      if (!child.isDirectory()) continue;
      if (!child.name.startsWith("conversations-v3-")) continue;
      push(entry.name, path.join(nestedRoot, child.name));
    }
  }

  const roots = Array.from(out.values());
  chatGptRootsCache = {
    expires_at: now + CHATGPT_ROOT_DISCOVERY_TTL_MS,
    roots,
  };
  return roots;
}

function providerActionBackupRoots(provider: ProviderId): string[] {
  return Array.from(
    new Set([
      path.join(BACKUP_ROOT, "provider_actions", provider),
      path.join(CODEX_HOME, "local_cleanup_backups", "provider_actions", provider),
    ]),
  );
}

function providerBackupRootSpecs(provider: ProviderId): ProviderRootSpec[] {
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

function providerArchivedRootSpec(provider: ProviderId): ProviderRootSpec | null {
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

async function discoverCodexCwdBackupRoots(): Promise<ProviderRootSpec[]> {
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

export function isAllowedProviderFilePath(
  provider: ProviderId,
  filePath: string,
): boolean {
  if (provider === "codex" && isCodexCwdBackupPath(filePath)) {
    return true;
  }
  if (provider === "chatgpt") {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".data") return false;
    if (!isPathInsideRoot(filePath, CHAT_DIR)) return false;
    const normalized = path.resolve(filePath);
    return /(^|[\\/])conversations-v3-[^\\/]+[\\/]/.test(normalized);
  }
  const specs = providerRootSpecs(provider);
  const ext = path.extname(filePath).toLowerCase();
  return specs.some(
    (spec) => spec.exts.includes(ext) && isPathInsideRoot(filePath, spec.root),
  );
}

export async function resolveSafePathWithinRoots(
  filePath: string,
  rootPaths: string[],
): Promise<string | null> {
  const normalizedTarget = path.resolve(filePath);
  let targetLstat;
  try {
    targetLstat = await lstat(normalizedTarget);
  } catch {
    return null;
  }
  if (targetLstat.isSymbolicLink()) return null;

  let realTarget = "";
  try {
    realTarget = await realpath(normalizedTarget);
  } catch {
    return null;
  }

  for (const rootPath of rootPaths) {
    try {
      const realRoot = await realpath(rootPath);
      if (
        realTarget === realRoot ||
        realTarget.startsWith(`${realRoot}${path.sep}`)
      ) {
        return realTarget;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function resolveAllowedProviderFilePath(
  provider: ProviderId,
  filePath: string,
): Promise<string | null> {
  if (!isAllowedProviderFilePath(provider, filePath)) return null;
  const specs = await providerScanRootSpecs(provider);
  const ext = path.extname(filePath).toLowerCase();
  const matchingRoots = specs
    .filter(
      (spec) => spec.exts.includes(ext) && isPathInsideRoot(filePath, spec.root),
    )
    .map((spec) => spec.root);

  if (!matchingRoots.length) return null;
  return resolveSafePathWithinRoots(filePath, matchingRoots);
}
