import { SCHEMA_VERSION } from "@threadlens/shared-contracts";
import { parseQueryNumber, parseQueryString, type QueryMap } from "../../lib/utils.js";
import { getOverviewTs } from "./overview.js";

type ThreadQueryRow = {
  id?: string;
  thread_id: string;
  title: string;
  title_source?: string;
  risk_score: number;
  risk_level?: string;
  is_pinned?: boolean;
  pinned?: boolean;
  source?: string;
  session_source?: string;
  timestamp?: string;
  last_activity?: string;
  activity_status?: string;
  activity_age_min?: number | null;
  risk_tags?: string[];
  session_line_count?: number;
  session_tool_calls?: number;
  session_bytes?: number | null;
  session_format_ok?: boolean | null;
  context_score?: number;
  has_local_data?: boolean;
  has_session_log?: boolean;
  cwd?: string;
  local_cache_paths?: string[];
};

function getThreadTimestamp(row: ThreadQueryRow): number {
  const raw = row.timestamp || row.last_activity || "";
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
}

function getThreadActivityAge(row: ThreadQueryRow): number {
  const age = Number(row.activity_age_min ?? NaN);
  if (Number.isFinite(age) && age >= 0) return age;
  const timestamp = getThreadTimestamp(row);
  return timestamp > 0 ? Number.MAX_SAFE_INTEGER - timestamp : Number.MAX_SAFE_INTEGER;
}

function compareThreadCwd(left: ThreadQueryRow, right: ThreadQueryRow, direction: "asc" | "desc"): number {
  const leftCwd = String(left.cwd || "").trim();
  const rightCwd = String(right.cwd || "").trim();
  const leftHasCwd = leftCwd.length > 0;
  const rightHasCwd = rightCwd.length > 0;
  if (leftHasCwd !== rightHasCwd) {
    return direction === "desc" ? Number(rightHasCwd) - Number(leftHasCwd) : Number(leftHasCwd) - Number(rightHasCwd);
  }
  const textDiff = leftCwd.localeCompare(rightCwd);
  return direction === "desc" ? -textDiff : textDiff;
}

function normalizeThreadRow(row: ThreadQueryRow) {
  return {
    id: row.id ?? row.thread_id,
    thread_id: row.thread_id,
    title: row.title,
    title_source: row.title_source ?? "ts-overview",
    risk_score: Number(row.risk_score || 0),
    risk_level: row.risk_level ?? "low",
    is_pinned: Boolean(row.is_pinned ?? row.pinned),
    source: row.source ?? row.session_source ?? "codex_sessions",
    timestamp: row.timestamp ?? row.last_activity ?? "",
    activity_status: row.activity_status ?? "unknown",
    activity_age_min: row.activity_age_min ?? null,
    risk_tags: Array.isArray(row.risk_tags) ? row.risk_tags : [],
    session_line_count: Number(row.session_line_count ?? 0),
    session_tool_calls: Number(row.session_tool_calls ?? 0),
    session_bytes: Number(row.session_bytes ?? 0),
    session_format_ok:
      row.session_format_ok === undefined || row.session_format_ok === null
        ? null
        : Boolean(row.session_format_ok),
    context_score: Number(row.context_score ?? 0),
    has_local_data: Boolean(row.has_local_data),
    has_session_log: Boolean(row.has_session_log),
    cwd: row.cwd ?? "",
    local_cache_paths: Array.isArray(row.local_cache_paths) ? row.local_cache_paths : [],
  };
}

export async function getThreadsTs(query: QueryMap) {
  const offset = Math.max(0, parseQueryNumber(query.offset, 0));
  const limit = Math.max(1, Math.min(2000, parseQueryNumber(query.limit, 80)));
  const q = parseQueryString(query.q).trim().toLowerCase();
  const sort = parseQueryString(query.sort).trim().toLowerCase() || "updated_desc";
  const forceRefresh = parseQueryString(query.refresh) === "1";

  const overview = await getOverviewTs({
    includeThreads: true,
    forceRefresh,
  });

  const allRows = Array.isArray((overview as Record<string, unknown>).threads)
    ? ((overview as Record<string, unknown>).threads as ThreadQueryRow[])
    : [];

  let rows = allRows.map(normalizeThreadRow);

  if (q) {
    rows = rows.filter((row) => {
      const haystack = [
        row.title,
        row.thread_id,
        row.source,
        ...(row.risk_tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  rows.sort((a, b) => {
    if (sort === "updated_asc") {
      return getThreadTimestamp(a) - getThreadTimestamp(b);
    }
    if (sort === "risk_desc") {
      return Number(b.risk_score || 0) - Number(a.risk_score || 0);
    }
    if (sort === "risk_asc") {
      return Number(a.risk_score || 0) - Number(b.risk_score || 0);
    }
    if (sort === "activity_desc") {
      return getThreadActivityAge(b) - getThreadActivityAge(a);
    }
    if (sort === "activity_asc") {
      return getThreadActivityAge(a) - getThreadActivityAge(b);
    }
    if (sort === "cwd_desc") {
      return compareThreadCwd(a, b, "desc") || getThreadTimestamp(b) - getThreadTimestamp(a);
    }
    if (sort === "cwd_asc") {
      return compareThreadCwd(a, b, "asc") || getThreadTimestamp(b) - getThreadTimestamp(a);
    }
    if (sort === "pinned_desc") {
      return Number(b.is_pinned) - Number(a.is_pinned) || getThreadTimestamp(b) - getThreadTimestamp(a);
    }
    if (sort === "pinned_asc") {
      return Number(a.is_pinned) - Number(b.is_pinned) || getThreadTimestamp(b) - getThreadTimestamp(a);
    }
    if (sort === "title_asc") {
      return String(a.title || "").localeCompare(String(b.title || ""));
    }
    return getThreadTimestamp(b) - getThreadTimestamp(a);
  });

  return {
    rows: rows.slice(offset, offset + limit),
    total: rows.length,
    schema_version: SCHEMA_VERSION,
    source: "ts-overview-read-model",
  };
}
