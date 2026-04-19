import { readFile } from "node:fs/promises";
import path from "node:path";
import { CODEX_HOME, CLAUDE_PROJECTS_DIR } from "../../lib/constants.js";
import { isRecord, readFileTail, safeJsonParse } from "../../lib/utils.js";
import { isPathInsideRoot } from "./path-safety.js";

type CodexTitleMapCacheEntry = {
  expires_at: number;
  map: Map<string, string>;
};

let codexTitleMapCache: CodexTitleMapCacheEntry | null = null;

export function invalidateCodexThreadTitleMapCache() {
  codexTitleMapCache = null;
}

export function fallbackDisplayTitle(
  detectedTitle: string,
  source: string,
  filePath: string,
  sessionId: string,
): string {
  return (
    normalizeDetectedTitle(detectedTitle) ||
    normalizeDetectedTitle(source) ||
    normalizeDetectedTitle(path.basename(filePath)) ||
    normalizeDetectedTitle(sessionId) ||
    "Untitled session"
  );
}

function extractUuidFromText(text: string): string {
  const match = String(text || "").match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  return match ? match[0] : "";
}

export function extractCodexThreadIdFromSessionName(name: string): string {
  return extractUuidFromText(name);
}

export function normalizeDetectedTitle(text: string, maxLen = 96): string {
  const singleLine = String(text || "").replace(/\s+/g, " ").trim();
  if (!singleLine) return "";
  return singleLine.length > maxLen
    ? `${singleLine.slice(0, maxLen - 1).trimEnd()}…`
    : singleLine;
}

function isBoilerplateTitle(text: string): boolean {
  const normalized = String(text || "").trim().toLowerCase();
  return (
    normalized === "assistant" ||
    normalized === "user" ||
    normalized === "system" ||
    normalized === "developer" ||
    normalized === "tool"
  );
}

function looksLikeIdOnly(text: string): boolean {
  const normalized = String(text || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(normalized);
}

function looksLikeTimestampOnly(text: string): boolean {
  const normalized = String(text || "").trim();
  return (
    /^\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2}/i.test(normalized) ||
    /^\d{4}-\d{2}-\d{2}$/i.test(normalized)
  );
}

function pickTextCandidate(value: unknown, depth = 0): string {
  if (depth > 5 || value === null || value === undefined) return "";
  if (typeof value === "string") {
    const hit = normalizeDetectedTitle(value);
    if (
      !hit ||
      isBoilerplateTitle(hit) ||
      looksLikeIdOnly(hit) ||
      looksLikeTimestampOnly(hit)
    ) {
      return "";
    }
    return hit;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = pickTextCandidate(item, depth + 1);
      if (hit) return hit;
    }
    return "";
  }
  if (!isRecord(value)) return "";
  const obj = value as Record<string, unknown>;
  for (const key of [
    "customTitle",
    "title",
    "display_title",
    "thread_name",
    "session_name",
    "conversation_name",
    "summary",
    "text",
    "name",
    "label",
  ]) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const hit = pickTextCandidate(obj[key], depth + 1);
    if (hit) return hit;
  }
  const fallbackEntries = Object.entries(obj).filter(([key]) => {
    const normalized = key.toLowerCase();
    return (
      normalized.includes("title") ||
      normalized.includes("name") ||
      normalized.includes("summary") ||
      normalized.includes("text")
    );
  });
  for (const [, candidate] of fallbackEntries) {
    const hit = pickTextCandidate(candidate, depth + 1);
    if (hit) return hit;
  }
  return "";
}

export function detectSessionTitleFromHead(
  rawHead: string,
  format: "jsonl" | "json" | "unknown",
): { title: string; source: string | null } {
  const trimmed = rawHead.trim();
  if (!trimmed) return { title: "", source: null };

  if (format === "jsonl") {
    const lines = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 24);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const hit = pickTextCandidate(parsed);
        if (hit) return { title: hit, source: "jsonl-content" };
      } catch {
        continue;
      }
    }
    const fallbackLine = normalizeDetectedTitle(
      lines.find((line) => !line.startsWith("{")) ?? "",
    );
    return { title: fallbackLine, source: fallbackLine ? "jsonl-line" : null };
  }

  if (format === "json") {
    try {
      const obj = JSON.parse(trimmed);
      const hit = pickTextCandidate(obj);
      if (hit) return { title: hit, source: "json-content" };
    } catch {
      const m = trimmed.match(/"title"\s*:\s*"([^"]+)"/i);
      const hit = normalizeDetectedTitle(m?.[1] ?? "");
      if (hit) return { title: hit, source: "json-title-field" };
    }
  }

  return { title: "", source: null };
}

export async function detectClaudeRenamedTitle(
  filePath: string,
  format: "jsonl" | "json" | "unknown",
): Promise<{ title: string; source: string | null } | null> {
  if (
    format !== "jsonl" ||
    !isPathInsideRoot(filePath, CLAUDE_PROJECTS_DIR)
  ) {
    return null;
  }
  const tail = await readFileTail(filePath, 262_144);
  if (!tail.text.trim()) return null;
  let customTitle = "";
  let agentName = "";
  for (const line of tail.text.split(/\r?\n/)) {
    const parsed = safeJsonParse(line);
    if (!isRecord(parsed)) continue;
    const type = String(parsed.type ?? "");
    if (type === "custom-title") {
      const value = normalizeDetectedTitle(String(parsed.customTitle ?? ""));
      if (value) customTitle = value;
      continue;
    }
    if (type === "agent-name") {
      const value = normalizeDetectedTitle(String(parsed.agentName ?? ""));
      if (value) agentName = value;
    }
  }
  if (customTitle) {
    return { title: customTitle, source: "claude-custom-title" };
  }
  if (agentName) {
    return { title: agentName, source: "claude-agent-name" };
  }
  return null;
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
