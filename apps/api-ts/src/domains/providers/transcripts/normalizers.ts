import type {
  ProviderId,
  TranscriptMessage,
} from "../types.js";

export function inferFormat(filePath: string): "jsonl" | "json" | "unknown" {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jsonl")) return "jsonl";
  if (lower.endsWith(".json")) return "json";
  return "unknown";
}

export function inferSessionId(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const match =
    normalizedPath.match(/\/([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl?$/i) ||
    normalizedPath.match(/\/([^/]+)\.jsonl?$/i);
  return match ? match[1] : normalizedPath.split("/").pop() || normalizedPath;
}

export function extractCodexThreadIdFromSessionName(name: string): string {
  const match = String(name || "").match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  return match ? match[0] : "";
}

export function normalizeDetectedTitle(text: string, maxLen = 96): string {
  const singleLine = String(text || "").replace(/\s+/g, " ").trim();
  if (!singleLine) return "";
  return singleLine.length > maxLen
    ? `${singleLine.slice(0, maxLen - 1).trimEnd()}…`
    : singleLine;
}

export function isBoilerplateTitle(text: string): boolean {
  const normalized = String(text || "").trim().toLowerCase();
  return (
    normalized === "assistant" ||
    normalized === "user" ||
    normalized === "system" ||
    normalized === "developer" ||
    normalized === "tool"
  );
}

export function looksLikeIdOnly(text: string): boolean {
  const normalized = String(text || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(normalized);
}

export function parseTranscriptRole(raw: unknown): TranscriptMessage["role"] {
  const role = String(raw ?? "").toLowerCase();
  if (
    role === "user" ||
    role === "assistant" ||
    role === "developer" ||
    role === "system" ||
    role === "tool"
  ) {
    return role;
  }
  return "unknown";
}

export function parseProviderLikeRole(
  raw: unknown,
  provider?: ProviderId,
): TranscriptMessage["role"] {
  const direct = parseTranscriptRole(raw);
  if (direct !== "unknown") return direct;
  const role = String(raw ?? "").trim().toLowerCase();
  if (role === "human" || role === "prompt" || role === "request" || role === "question") {
    return "user";
  }
  if (
    role === "model" ||
    role === "reply" ||
    role === "response" ||
    role === "thinking" ||
    role === "gemini" ||
    role === "claude" ||
    role === "chatgpt" ||
    role === "copilot"
  ) {
    return "assistant";
  }
  if (role.includes("tool")) return "tool";
  if (!role && provider && provider !== "codex") return "assistant";
  return "unknown";
}

export function normalizeTranscriptTimestamp(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    try {
      return new Date(raw).toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

export function extractTranscriptText(value: unknown, depth = 0): string {
  if (depth > 5 || value === null || value === undefined) return "";
  if (typeof value === "string") return normalizeDetectedTitle(value, 2000);
  if (Array.isArray(value)) {
    const chunks = value
      .slice(0, 30)
      .map((item) => extractTranscriptText(item, depth + 1))
      .filter(Boolean);
    return normalizeDetectedTitle(chunks.join(" "), 2000);
  }
  if (typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  for (const key of ["text", "input_text", "output_text", "content", "message", "body", "value"]) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const hit = extractTranscriptText(obj[key], depth + 1);
    if (hit) return hit;
  }
  const fallback = Object.values(obj)
    .slice(0, 12)
    .map((item) => extractTranscriptText(item, depth + 1))
    .find(Boolean);
  return fallback ? normalizeDetectedTitle(fallback, 2000) : "";
}
