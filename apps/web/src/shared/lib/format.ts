import type { ThreadRow } from "@/shared/types";

const HOME_PREFIX_PATTERN = /^\/(?:Users|home)\/[^/]+/;

/** Unwrap an ApiEnvelope or pass-through when already unwrapped */
export function extractEnvelopeData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  const r = payload as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(r, "data")) {
    return (r.data as T | null) ?? null;
  }
  return payload as T;
}

/** Safely pretty-print any value as indented JSON */
export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

/** Parse unknown to a finite number, defaulting to 0 */
export function parseNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDateYmd(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

export function formatInteger(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat("en-US").format(Math.round(num));
}

export function formatBytes(value: number): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[idx]}`;
}

export function formatBytesCompact(value: number): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0B";
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  const digits = size >= 10 ? 0 : 1;
  return `${size.toFixed(digits)}${units[idx]}`;
}

export function compactPath(value: string | null | undefined, keep = 28): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const normalized = raw.replace(HOME_PREFIX_PATTERN, "~");
  if (normalized.length <= keep * 2 + 3) return normalized;
  return `${normalized.slice(0, keep)}…${normalized.slice(-keep)}`;
}

export function formatWorkspaceLabel(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "/") return "";
  const normalized = raw.replace(HOME_PREFIX_PATTERN, "~");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0] ?? "";
  const tail = parts.slice(-2).join("/");
  return normalized.startsWith("~") ? `~/${tail}` : tail;
}

export function formatProviderDisplayName(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase().replace(/\s+/g, "-");
  if (normalized === "codex") return "Codex";
  if (normalized === "chatgpt" || normalized === "chatgpt-desktop") return "ChatGPT";
  if (normalized === "claude" || normalized === "claude-cli") return "Claude";
  if (normalized === "gemini" || normalized === "gemini-cli") return "Gemini";
  if (normalized === "copilot" || normalized === "copilot-chat") return "Copilot";
  return raw;
}

export function normalizeDisplayValue(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  const lowered = trimmed.toLowerCase();
  if (
    lowered === "none" ||
    lowered === "null" ||
    lowered === "undefined" ||
    lowered === "unknown" ||
    lowered === "n/a" ||
    lowered === "-"
  ) {
    return "";
  }
  return trimmed;
}

/** Normalize a raw row record into a well-typed ThreadRow */
export function normalizeThreadRow(input: Record<string, unknown>): ThreadRow {
  const threadId = String(input.thread_id ?? input.id ?? "");
  return {
    id: String(input.id ?? threadId),
    thread_id: threadId,
    title: String(input.title ?? ""),
    title_source: input.title_source ? String(input.title_source) : undefined,
    risk_score: parseNum(input.risk_score),
    is_pinned: Boolean(input.is_pinned ?? input.pinned),
    source: String(input.source ?? input.session_source ?? ""),
    project_bucket: input.project_bucket ? String(input.project_bucket) : undefined,
    cwd: input.cwd ? String(input.cwd) : undefined,
    timestamp: input.timestamp ? String(input.timestamp) : undefined,
    activity_status: input.activity_status ? String(input.activity_status) : undefined,
    activity_age_min: parseNum(input.activity_age_min),
    risk_level: input.risk_level ? String(input.risk_level) : undefined,
    risk_tags: Array.isArray(input.risk_tags) ? input.risk_tags.map((x) => String(x)) : undefined,
    session_line_count: parseNum(input.session_line_count),
    session_tool_calls: parseNum(input.session_tool_calls),
    session_bytes: parseNum(input.session_bytes),
    session_format_ok:
      input.session_format_ok === undefined || input.session_format_ok === null
        ? null
        : Boolean(input.session_format_ok),
    context_score: parseNum(input.context_score),
    has_local_data: Boolean(input.has_local_data),
    has_session_log: Boolean(input.has_session_log),
  };
}
