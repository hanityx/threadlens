import type { ThreadRow } from "../types.js";

export function matchesCleanupFilter(row: ThreadRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [
    row.title,
    row.thread_id,
    row.cwd,
    row.source,
    row.risk_level,
    ...(row.risk_tags ?? []),
  ].some((value) => typeof value === "string" && value.toLowerCase().includes(needle));
}

export function filterCleanupRows(rows: ThreadRow[], query: string): ThreadRow[] {
  if (!query.trim()) return rows;
  return rows.filter((row) => matchesCleanupFilter(row, query));
}
