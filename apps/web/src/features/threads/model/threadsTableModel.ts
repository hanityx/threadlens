import type { ThreadRow, ThreadSort } from "@/shared/types";

export type ThreadSortColumn = "risk" | "activity" | "cwd" | "pinned";

const firstSortByColumn: Record<ThreadSortColumn, ThreadSort> = {
  risk: "risk_desc",
  activity: "activity_asc",
  cwd: "cwd_desc",
  pinned: "pinned_desc",
};

const secondSortByColumn: Record<ThreadSortColumn, ThreadSort> = {
  risk: "risk_asc",
  activity: "activity_desc",
  cwd: "cwd_asc",
  pinned: "pinned_asc",
};

export function resolveNextThreadSort(
  current: ThreadSort | string = "updated_desc",
  column: ThreadSortColumn = "risk",
): ThreadSort {
  const first = firstSortByColumn[column];
  return current === first ? secondSortByColumn[column] : first;
}

export function resolveThreadSortDirection(
  current: ThreadSort | string,
  column: ThreadSortColumn,
): "ascending" | "descending" | "none" {
  if (current === `${column}_asc`) return "ascending";
  if (current === `${column}_desc`) return "descending";
  return "none";
}

export function isArchivedThreadSource(source?: string | null): boolean {
  const lowered = String(source ?? "").trim().toLowerCase();
  return /^archived[_-]/i.test(lowered) || lowered.includes("archived") || lowered === "archive";
}

export function buildThreadRowKey(row: ThreadRow, index: number): string {
  return [
    row.thread_id,
    row.source || "source",
    row.project_bucket || "bucket",
    row.title_source || "title",
    row.timestamp || "time",
    index,
  ].join("::");
}

export function toggleVisibleSelectionState(
  rows: ThreadRow[],
  selected: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...selected };
  const allVisibleSelected = rows.length > 0 && rows.every((row) => Boolean(selected[row.thread_id]));
  for (const row of rows) {
    next[row.thread_id] = !allVisibleSelected;
  }
  return next;
}

export function toggleThreadRowSelectionState(
  selected: Record<string, boolean>,
  threadId: string,
): Record<string, boolean> {
  return {
    ...selected,
    [threadId]: !selected[threadId],
  };
}

export function toggleSubsetSelectionState(
  rows: ThreadRow[],
  selected: Record<string, boolean>,
  predicate: (row: ThreadRow) => boolean,
): Record<string, boolean> {
  const subset = rows.filter(predicate);
  const allSubsetSelected = subset.length > 0 && subset.every((row) => Boolean(selected[row.thread_id]));
  const next = { ...selected };
  for (const row of subset) {
    next[row.thread_id] = !allSubsetSelected;
  }
  return next;
}

export function resolveVisibleThreadSelectionCount(
  visibleRows: ThreadRow[],
  selectedIds: string[],
  selectedThreadId: string,
): number {
  if (selectedIds.length > 0) return selectedIds.length;
  if (!selectedThreadId) return 0;
  return visibleRows.some((row) => row.thread_id === selectedThreadId) ? 1 : 0;
}
