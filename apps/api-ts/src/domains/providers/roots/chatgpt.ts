import { readdir } from "node:fs/promises";
import path from "node:path";
import { CHAT_DIR } from "../../../lib/constants.js";
import { pathExists } from "../../../lib/utils.js";
import type {
  ProviderRootSpec,
} from "../types.js";

type ChatGptRootsCacheEntry = {
  expires_at: number;
  roots: ProviderRootSpec[];
};

const CHATGPT_ROOT_DISCOVERY_TTL_MS = 45_000;
let chatGptRootsCache: ChatGptRootsCacheEntry | null = null;

export async function discoverChatGptConversationRoots(): Promise<ProviderRootSpec[]> {
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
