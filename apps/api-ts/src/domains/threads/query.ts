import { SCHEMA_VERSION } from "@provider-surface/shared-contracts";
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
  risk_tags?: string[];
};

function getThreadTimestamp(row: ThreadQueryRow): number {
  const raw = row.timestamp || row.last_activity || "";
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
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
    risk_tags: Array.isArray(row.risk_tags) ? row.risk_tags : [],
  };
}

export async function getThreadsTs(query: QueryMap) {
  const offset = Math.max(0, parseQueryNumber(query.offset, 0));
  const limit = Math.max(1, Math.min(240, parseQueryNumber(query.limit, 160)));
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
