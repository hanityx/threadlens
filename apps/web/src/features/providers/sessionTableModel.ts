import type { ProviderSessionRow } from "../../types";

export type ProviderSessionSort =
  | "mtime_desc"
  | "mtime_asc"
  | "size_desc"
  | "size_asc"
  | "title_asc"
  | "title_desc";

export type ProviderProbeFilter = "all" | "ok" | "fail";
export type ProviderSourceFilter = "all" | (string & {});

export function buildSourceFilterOptions(rows: ProviderSessionRow[]): Array<{ source: string; count: number }> {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const source = String(row.source || "").trim() || "unknown";
    counts.set(source, (counts.get(source) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, count]) => ({ source, count }));
}

export function buildProviderSessionComputedIndex(rows: ProviderSessionRow[]) {
  const searchText = new Map<string, string>();
  const mtimeTs = new Map<string, number>();
  const sortTitle = new Map<string, string>();
  rows.forEach((row) => {
    const normalizedTitle = row.display_title || row.probe?.detected_title || row.session_id;
    const ts = Date.parse(row.mtime);
    const text = [normalizedTitle, row.probe?.detected_title, row.session_id, row.file_path, row.provider]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    searchText.set(row.file_path, text);
    mtimeTs.set(row.file_path, Number.isNaN(ts) ? 0 : ts);
    sortTitle.set(row.file_path, normalizedTitle);
  });
  return { searchText, mtimeTs, sortTitle };
}

export function filterProviderSessionRows(
  rows: ProviderSessionRow[],
  index: ReturnType<typeof buildProviderSessionComputedIndex>,
  options: {
    query: string;
    sourceFilter: ProviderSourceFilter;
    probeFilter: ProviderProbeFilter;
    effectiveSlowOnly: boolean;
    slowProviderSet: Set<string>;
  },
) {
  const q = options.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (options.sourceFilter !== "all" && row.source !== options.sourceFilter) return false;
    if (options.probeFilter === "ok" && !row.probe.ok) return false;
    if (options.probeFilter === "fail" && row.probe.ok) return false;
    if (options.effectiveSlowOnly && !options.slowProviderSet.has(row.provider)) return false;

    if (!q) return true;
    const text = index.searchText.get(row.file_path) ?? "";
    return text.includes(q);
  });
}

function transcriptPriority(row: ProviderSessionRow): number {
  if (row.probe.format === "jsonl") return 4;
  if (row.file_path.endsWith(".metadata.json")) return 1;
  if (row.probe.format === "json") {
    if (row.source.includes("workspace_chats") || row.source === "tmp" || row.source === "projects") {
      return 3;
    }
    return 2;
  }
  if (row.probe.format === "unknown") return 0;
  return 1;
}

export function sortProviderSessionRows(
  rows: ProviderSessionRow[],
  index: ReturnType<typeof buildProviderSessionComputedIndex>,
  titleCollator: Intl.Collator,
  sessionSort: ProviderSessionSort,
) {
  const nextRows = [...rows];
  nextRows.sort((a, b) => {
    const aPriority = transcriptPriority(a);
    const bPriority = transcriptPriority(b);
    if (aPriority !== bPriority) return bPriority - aPriority;
    const aPath = a.file_path;
    const bPath = b.file_path;
    const aTs = index.mtimeTs.get(aPath) ?? 0;
    const bTs = index.mtimeTs.get(bPath) ?? 0;
    const aTitle = index.sortTitle.get(aPath) ?? a.session_id;
    const bTitle = index.sortTitle.get(bPath) ?? b.session_id;
    switch (sessionSort) {
      case "mtime_asc":
        return aTs - bTs;
      case "size_desc":
        return b.size_bytes - a.size_bytes;
      case "size_asc":
        return a.size_bytes - b.size_bytes;
      case "title_asc":
        return titleCollator.compare(aTitle, bTitle);
      case "title_desc":
        return titleCollator.compare(bTitle, aTitle);
      case "mtime_desc":
      default:
        return bTs - aTs;
    }
  });
  return nextRows;
}
