import {
  normalizeSearchQuery,
  normalizeSearchText,
} from "../search-helpers.js";

export type {
  SearchIdentity,
  SearchMatchMeta,
} from "./session-metadata-results.js";
export type {
  SearchSessionAccumulator,
} from "./session-accumulator.js";

export {
  dedupeConversationSearchResults,
  dedupeConversationSearchRows,
} from "./session-dedupe.js";
export {
  buildBaseSearchResult,
  buildMetadataSearchResult,
  buildSearchIdentity,
} from "./session-metadata-results.js";
export {
  addSessionSearchHit,
  compareConversationSearchSessions,
  createSessionAccumulator,
} from "./session-accumulator.js";

export function decodeConversationSearchCursor(cursor?: string): number {
  const offset = Math.max(0, Math.floor(Number(cursor) || 0));
  return Number.isFinite(offset) ? offset : 0;
}

export function encodeConversationSearchCursor(offset: number): string {
  return String(Math.max(0, Math.floor(offset)));
}

export function isMetadataOnlyConversationQuery(query: string): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return false;
  if (/[\\/]/.test(normalized)) return true;
  if (/\.(jsonl|json|data|md|txt)\b/i.test(normalized)) return true;
  if (/^rollout-\d{4}-\d{2}-\d{2}/i.test(normalized)) return true;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4,}(?:-[0-9a-f]{4,}){2,}$/i.test(normalized)
  ) {
    return true;
  }
  return false;
}
