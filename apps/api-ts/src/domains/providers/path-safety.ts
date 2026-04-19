import { lstat, realpath, readdir } from "node:fs/promises";
import path from "node:path";
import {
  PROVIDER_IDS,
  PROVIDER_LABELS,
  type ProviderId,
} from "@threadlens/shared-contracts";
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
  HOME_DIR,
} from "../../lib/constants.js";
import { pathExists } from "../../lib/utils.js";
import type { ProviderRootSpec } from "./types.js";

type ChatGptRootsCacheEntry = {
  expires_at: number;
  roots: ProviderRootSpec[];
};

const CHATGPT_ROOT_DISCOVERY_TTL_MS = 45_000;
let chatGptRootsCache: ChatGptRootsCacheEntry | null = null;

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

export function providerRootSpecs(provider: ProviderId): ProviderRootSpec[] {
  if (provider === "codex") {
    return [
      {
        source: "sessions",
        root: path.join(CODEX_HOME, "sessions"),
        exts: [".jsonl"],
      },
      {
        source: "archived_sessions",
        root: path.join(CODEX_HOME, "archived_sessions"),
        exts: [".jsonl"],
      },
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
  }
  return roots;
}

export async function providerScanRootSpecs(
  provider: ProviderId,
): Promise<ProviderRootSpec[]> {
  if (provider !== "chatgpt") return providerRootSpecs(provider);
  const discovered = await discoverChatGptConversationRoots();
  if (discovered.length > 0) return discovered;
  return providerRootSpecs(provider);
}

export function isAllowedProviderFilePath(
  provider: ProviderId,
  filePath: string,
): boolean {
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

  if (provider === "chatgpt") {
    return resolveSafePathWithinRoots(filePath, [CHAT_DIR]);
  }

  const ext = path.extname(filePath).toLowerCase();
  const matchingRoots = providerRootSpecs(provider)
    .filter(
      (spec) => spec.exts.includes(ext) && isPathInsideRoot(filePath, spec.root),
    )
    .map((spec) => spec.root);

  if (!matchingRoots.length) return null;
  return resolveSafePathWithinRoots(filePath, matchingRoots);
}
