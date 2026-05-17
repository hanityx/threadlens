import path from "node:path";
import { isRecord } from "../../lib/utils.js";
import { normalizeDetectedTitle } from "./title-normalization.js";

export {
  extractCodexThreadIdFromSessionName,
  getCodexThreadTitleMap,
  invalidateCodexThreadTitleMapCache,
} from "./adapters/codex/title-map.js";
export { detectClaudeRenamedTitle } from "./adapters/claude/title.js";
export { normalizeDetectedTitle } from "./title-normalization.js";

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
