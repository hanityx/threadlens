import type { ThreadRow } from "../types";

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

export function formatInteger(value: number | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return new Intl.NumberFormat("en-US").format(Math.round(num));
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
    risk_level: input.risk_level ? String(input.risk_level) : undefined,
    risk_tags: Array.isArray(input.risk_tags) ? input.risk_tags.map((x) => String(x)) : undefined,
  };
}
