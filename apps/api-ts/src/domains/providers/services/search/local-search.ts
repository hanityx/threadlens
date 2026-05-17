import type {
  ConversationSearchPayload,
  ProviderId,
} from "../../types.js";
import {
  normalizeSearchText,
} from "../../search-helpers.js";
import { nowIsoUtc } from "../../../../lib/utils.js";
import {
  throwIfAborted,
} from "./abort.js";
import {
  conversationSearchResponseCache,
  conversationSearchResponseCacheKey,
} from "./cache.js";
import {
  CONVERSATION_SEARCH_RESPONSE_CACHE_TTL_MS,
  DEFAULT_CONVERSATION_SEARCH_LIMIT,
  MAX_CONVERSATION_SEARCH_LIMIT,
} from "./constants.js";
import {
  buildConversationSearchProviderBudgets,
  resolveConversationSearchLimits,
} from "./limits.js";
import {
  materializeProviderSessionMetadataScan,
} from "./session-manifest.js";
import {
  resolveOpenableThreadIds,
} from "./openable-threads.js";
import {
  defaultConversationSearchProviders,
  getProviderSessionManifest,
  getProviderSessionScan,
} from "./provider-session-scan.js";
import {
  isMetadataOnlyConversationQuery,
} from "./session-results.js";
import {
  searchConversationSessions,
} from "./session-search.js";

export async function searchLocalConversationsTs(
  q: string,
  options?: {
    providers?: ProviderId[];
    limit?: number;
    pageSize?: number;
    cursor?: string;
    forceRefresh?: boolean;
    transcriptLimit?: number;
    previewHitsPerSession?: number;
    sessionLimitPerProvider?: number;
    signal?: AbortSignal;
  },
): Promise<ConversationSearchPayload> {
  const trimmedQuery = normalizeSearchText(q);
  const metadataOnlyQuery = isMetadataOnlyConversationQuery(trimmedQuery);
  const providers =
    options?.providers?.length ? Array.from(new Set(options.providers)) : defaultConversationSearchProviders();
  const safePageSize = Math.max(
    1,
    Math.min(
      MAX_CONVERSATION_SEARCH_LIMIT,
      Number(options?.pageSize) || Number(options?.limit) || DEFAULT_CONVERSATION_SEARCH_LIMIT,
    ),
  );
  const forceRefresh = Boolean(options?.forceRefresh);
  const cacheKey = conversationSearchResponseCacheKey({
    q: trimmedQuery,
    providers,
    pageSize: safePageSize,
    cursor: options?.cursor,
    transcriptLimit: options?.transcriptLimit,
    previewHitsPerSession: options?.previewHitsPerSession,
    sessionLimitPerProvider: options?.sessionLimitPerProvider,
  });
  if (!forceRefresh) {
    const cached = conversationSearchResponseCache.get(cacheKey);
    if (cached && cached.expires_at > Date.now()) {
      return cached.payload;
    }
  }
  const explicitPerProviderLimit = Math.max(
    0,
    Math.floor(Number(options?.sessionLimitPerProvider) || 0),
  );
  const providerBudgets =
    explicitPerProviderLimit > 0
      ? providers.map((provider) => ({
          provider,
          limit: explicitPerProviderLimit,
        }))
      : buildConversationSearchProviderBudgets(
          providers,
          resolveConversationSearchLimits({ limit: safePageSize }).scanLimit,
        );
  const scans = await Promise.all(
    providerBudgets.map(async ({ provider, limit }) => {
      throwIfAborted(options?.signal);
      if (!metadataOnlyQuery) {
        return getProviderSessionScan(provider, limit, {
          forceRefresh,
          signal: options?.signal,
        });
      }
      const manifest = await getProviderSessionManifest(
        provider,
        forceRefresh,
        options?.signal,
      );
      return materializeProviderSessionMetadataScan(manifest, limit);
    }),
  );
  const rows = scans.flatMap((scan) => scan.rows);
  const openableThreadIds = await resolveOpenableThreadIds(forceRefresh);
  const result = await searchConversationSessions(rows, trimmedQuery, {
    pageSize: safePageSize,
    cursor: options?.cursor,
    transcriptLimit: options?.transcriptLimit,
    openableThreadIds,
    previewHitsPerSession: options?.previewHitsPerSession,
    signal: options?.signal,
  });

  const payload = {
    generated_at: nowIsoUtc(),
    q: trimmedQuery,
    providers,
    limit: safePageSize,
    page_size: safePageSize,
    searched_sessions: result.searched_sessions,
    available_sessions: result.available_sessions,
    truncated: scans.some((scan) => scan.truncated) || result.truncated,
    total_matching_sessions: result.total_matching_sessions,
    total_matching_hits: result.total_matching_hits,
    has_more: result.has_more,
    next_cursor: result.next_cursor,
    preview_hits_per_session: Math.max(
      1,
      Math.min(20, Number(options?.previewHitsPerSession) || 3),
    ),
    sessions: result.sessions,
    results: result.results,
  };
  if (!forceRefresh) {
    conversationSearchResponseCache.set(cacheKey, {
      expires_at: Date.now() + CONVERSATION_SEARCH_RESPONSE_CACHE_TTL_MS,
      payload,
    });
  }
  return payload;
}
