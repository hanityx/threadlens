import type { ThreadRow } from "../types";

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
