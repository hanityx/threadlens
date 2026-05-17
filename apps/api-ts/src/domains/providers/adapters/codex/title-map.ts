import { readFile } from "node:fs/promises";
import path from "node:path";
import { CODEX_HOME } from "../../constants.js";
import { isRecord, safeJsonParse } from "../../../../lib/utils.js";
import { normalizeDetectedTitle } from "../../title-normalization.js";

type CodexTitleMapCacheEntry = {
  expires_at: number;
  map: Map<string, string>;
};

let codexTitleMapCache: CodexTitleMapCacheEntry | null = null;

export function invalidateCodexThreadTitleMapCache() {
  codexTitleMapCache = null;
}

function extractUuidFromText(text: string): string {
  const match = String(text || "").match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  return match ? match[0] : "";
}

export function extractCodexThreadIdFromSessionName(name: string): string {
  return extractUuidFromText(name);
}

export async function getCodexThreadTitleMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (codexTitleMapCache && codexTitleMapCache.expires_at > now) {
    return codexTitleMapCache.map;
  }
  const titleMap = new Map<string, string>();
  const globalStateTitleIds = new Set<string>();
  try {
    const raw = await readFile(
      path.join(CODEX_HOME, ".codex-global-state.json"),
      "utf-8",
    );
    const parsed = safeJsonParse(raw);
    const blob =
      isRecord(parsed) && isRecord(parsed["thread-titles"])
        ? (parsed["thread-titles"] as Record<string, unknown>)
        : null;
    const titles =
      blob && isRecord(blob.titles)
        ? (blob.titles as Record<string, unknown>)
        : null;
    if (titles) {
      for (const [id, title] of Object.entries(titles)) {
        const tid = extractUuidFromText(id);
        const txt = normalizeDetectedTitle(String(title ?? ""));
        if (tid && txt) {
          titleMap.set(tid, txt);
          globalStateTitleIds.add(tid);
        }
      }
    }
  } catch {
    // no-op
  }
  try {
    const raw = await readFile(path.join(CODEX_HOME, "session_index.jsonl"), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const parsed = safeJsonParse(line);
      if (!isRecord(parsed)) continue;
      const tid = extractUuidFromText(String(parsed.id ?? ""));
      const txt = normalizeDetectedTitle(String(parsed.thread_name ?? ""));
      if (tid && txt && !globalStateTitleIds.has(tid)) {
        titleMap.set(tid, txt);
      }
    }
  } catch {
    // no-op
  }
  codexTitleMapCache = {
    expires_at: now + 60_000,
    map: titleMap,
  };
  return titleMap;
}
