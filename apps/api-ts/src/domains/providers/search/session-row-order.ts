import path from "node:path";
import type {
  ProviderSessionRow,
} from "../types.js";
import {
  dedupeConversationSearchRows,
} from "./session-results.js";

function compareProviderSessionRowsByMtime(
  a: ProviderSessionRow,
  b: ProviderSessionRow,
): number {
  return Date.parse(String(b.mtime || "")) - Date.parse(String(a.mtime || ""));
}

export function prepareConversationSearchRows(
  rows: ProviderSessionRow[],
): ProviderSessionRow[] {
  const seenPaths = new Set<string>();
  return dedupeConversationSearchRows(
    [...rows]
      .sort(compareProviderSessionRowsByMtime)
      .filter((row) => {
        const key = `${row.provider}:${path.resolve(row.file_path)}`;
        if (seenPaths.has(key)) return false;
        seenPaths.add(key);
        return true;
      }),
  ).sort(compareProviderSessionRowsByMtime);
}
