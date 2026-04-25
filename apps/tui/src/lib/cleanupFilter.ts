import type { ThreadRow } from "../types.js";

function cleanupRowPriority(row: ThreadRow): number {
  const source = String(row.source ?? "").toLowerCase();
  if (source === "sessions") return 0;
  if (source === "local_archive") return 1;
  if (source === "cleanup_backups") return 3;
  if (source.includes("backup")) return 4;
  return 2;
}

export function preferCleanupRowCandidate(left: ThreadRow, right: ThreadRow): ThreadRow {
  const leftPriority = cleanupRowPriority(left);
  const rightPriority = cleanupRowPriority(right);
  if (leftPriority !== rightPriority) {
    return leftPriority < rightPriority ? left : right;
  }
  if (left.is_pinned !== right.is_pinned) {
    return left.is_pinned ? left : right;
  }
  if (left.risk_score !== right.risk_score) {
    return left.risk_score >= right.risk_score ? left : right;
  }
  return left;
}

export function canonicalizeCleanupRows(rows: ThreadRow[]): ThreadRow[] {
  const preferredByThreadId = new Map<string, ThreadRow>();
  const orderedThreadIds: string[] = [];

  for (const row of rows) {
    const existing = preferredByThreadId.get(row.thread_id);
    if (!existing) {
      preferredByThreadId.set(row.thread_id, row);
      orderedThreadIds.push(row.thread_id);
      continue;
    }
    preferredByThreadId.set(row.thread_id, preferCleanupRowCandidate(existing, row));
  }

  return orderedThreadIds
    .map((threadId) => preferredByThreadId.get(threadId))
    .filter((row): row is ThreadRow => Boolean(row));
}

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
