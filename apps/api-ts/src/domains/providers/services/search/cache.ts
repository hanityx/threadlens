import path from "node:path";

import type { ProviderId, ProviderSessionRow, ProviderSessionScan } from "../../types.js";
import { SEARCH_TRANSCRIPT_CACHE_MAX_ENTRIES } from "./constants.js";
import type {
  ConversationSearchResponseCacheEntry,
  ProviderManifestCacheEntry,
  ProviderSessionManifest,
  ProviderScanCacheEntry,
  TranscriptSearchCacheEntry,
} from "./types.js";

export const providerScanCache = new Map<string, ProviderScanCacheEntry>();
export const providerScanInflight = new Map<string, Promise<ProviderSessionScan>>();
export const providerManifestCache = new Map<ProviderId, ProviderManifestCacheEntry>();
export const providerManifestInflight = new Map<
  ProviderId,
  Promise<ProviderSessionManifest>
>();
export const invalidatedProviderManifests = new Set<ProviderId>();
export const conversationSearchResponseCache = new Map<
  string,
  ConversationSearchResponseCacheEntry
>();
export const transcriptSearchCache = new Map<string, TranscriptSearchCacheEntry>();

const providerSearchGeneration = new Map<ProviderId, number>();

export function getProviderSearchGeneration(provider: ProviderId): number {
  return providerSearchGeneration.get(provider) ?? 0;
}

export function bumpProviderSearchGeneration(provider: ProviderId): number {
  const next = getProviderSearchGeneration(provider) + 1;
  providerSearchGeneration.set(provider, next);
  return next;
}

export function providerScanCacheKey(
  provider: ProviderId,
  limit: number,
): string {
  return `${provider}:${limit}`;
}

export function transcriptSearchCacheKey(row: ProviderSessionRow): string {
  return `${row.provider}:${path.resolve(row.file_path)}`;
}

export function conversationSearchResponseCacheKey(options: {
  q: string;
  providers: ProviderId[];
  pageSize: number;
  cursor?: string;
  transcriptLimit?: number;
  previewHitsPerSession?: number;
  sessionLimitPerProvider?: number;
}): string {
  return [
    options.q,
    [...options.providers].sort().join(","),
    options.pageSize,
    options.cursor || "",
    options.transcriptLimit || "",
    options.previewHitsPerSession || "",
    options.sessionLimitPerProvider || "",
  ].join("::");
}

export function trimTranscriptSearchCache() {
  while (transcriptSearchCache.size > SEARCH_TRANSCRIPT_CACHE_MAX_ENTRIES) {
    const oldestKey = transcriptSearchCache.keys().next().value;
    if (!oldestKey) return;
    transcriptSearchCache.delete(oldestKey);
  }
}
