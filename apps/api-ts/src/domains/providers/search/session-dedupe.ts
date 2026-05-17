import path from "node:path";

import type {
  ConversationSearchResult,
  ProviderSessionRow,
} from "../types.js";
import {
  normalizeSearchText,
} from "../search-helpers.js";
import {
  inferSessionId,
} from "../probe.js";
import {
  providerSessionSourcePriority,
} from "./session-manifest.js";

function searchLogicalSessionKey(row: ProviderSessionRow): string {
  const inferred = row.session_id || inferSessionId(row.file_path) || path.resolve(row.file_path);
  return `${row.provider}:${inferred}`;
}

export function dedupeConversationSearchRows(
  rows: ProviderSessionRow[],
): ProviderSessionRow[] {
  const uniqueRows = new Map<string, ProviderSessionRow>();
  for (const row of rows) {
    const key = searchLogicalSessionKey(row);
    const existing = uniqueRows.get(key);
    if (!existing) {
      uniqueRows.set(key, row);
      continue;
    }
    const existingPriority = providerSessionSourcePriority(existing.source);
    const nextPriority = providerSessionSourcePriority(row.source);
    if (nextPriority > existingPriority) {
      uniqueRows.set(key, row);
      continue;
    }
    if (
      nextPriority === existingPriority &&
      Date.parse(String(row.mtime || "")) > Date.parse(String(existing.mtime || ""))
    ) {
      uniqueRows.set(key, row);
    }
  }
  return [...uniqueRows.values()];
}

export function conversationSearchResultDedupKey(result: ConversationSearchResult): string {
  return [
    result.provider,
    result.session_id,
    result.file_path,
    result.match_kind,
    result.role || "",
    normalizeSearchText(result.snippet).toLowerCase(),
  ].join("::");
}

export function dedupeConversationSearchResults(
  results: ConversationSearchResult[],
): ConversationSearchResult[] {
  const deduped: ConversationSearchResult[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    const key = conversationSearchResultDedupKey(result);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}
