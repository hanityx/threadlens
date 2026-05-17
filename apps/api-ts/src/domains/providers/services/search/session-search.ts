import type {
  ConversationSearchResult,
  ConversationSearchSessionResult,
  ProviderSessionRow,
} from "../../types.js";
import {
  throwIfAborted,
} from "./abort.js";
import {
  mapWithConcurrency,
} from "./concurrency.js";
import {
  CONVERSATION_SEARCH_SCAN_CONCURRENCY,
  DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
} from "./constants.js";
import {
  type RawConversationFileSearchLoader,
} from "./raw-files.js";
import { loadConversationRawFileMatches } from "./session-raw-search.js";
import {
  compareConversationSearchSessions,
  decodeConversationSearchCursor,
  encodeConversationSearchCursor,
  isMetadataOnlyConversationQuery,
  type SearchSessionAccumulator,
} from "./session-results.js";
import {
  prepareConversationSearchRows,
} from "./session-row-order.js";
import {
  collectConversationSessionMatches,
  createCachedConversationTranscriptLoader,
} from "./transcript-matches.js";
import type {
  ConversationTranscriptLoader,
} from "./types.js";

export {
  searchConversationSessionHits,
} from "./session-hit-search.js";

export async function searchConversationSessions(
  rows: ProviderSessionRow[],
  q: string,
  options?: {
    pageSize?: number;
    cursor?: string;
    transcriptLoader?: ConversationTranscriptLoader;
    transcriptLimit?: number;
    openableThreadIds?: Set<string>;
    previewHitsPerSession?: number;
    rawFileSearchLoader?: RawConversationFileSearchLoader;
    signal?: AbortSignal;
  },
): Promise<{
  searched_sessions: number;
  available_sessions: number;
  truncated: boolean;
  total_matching_sessions: number | null;
  total_matching_hits: number | null;
  has_more: boolean;
  next_cursor: string | null;
  sessions: ConversationSearchSessionResult[];
  results: ConversationSearchResult[];
}> {
  const pageSize = Math.max(1, Math.min(200, Number(options?.pageSize) || 40));
  const offset = decodeConversationSearchCursor(options?.cursor);
  const metadataOnlyQuery = isMetadataOnlyConversationQuery(q);
  const transcriptLimit = Math.max(
    100,
    Math.min(
      DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
      Number(options?.transcriptLimit) || DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
    ),
  );
  const cachedTranscriptLoader =
    options?.transcriptLoader
      ? createCachedConversationTranscriptLoader(options.transcriptLoader)
      : undefined;
  const sortedRows = prepareConversationSearchRows(rows);

  const sessionMatches: SearchSessionAccumulator[] = [];
  let scannedRows = 0;
  const { rawFileMatches, rawFileSearchComplete } =
    await loadConversationRawFileMatches(sortedRows, q, {
      metadataOnlyQuery,
      transcriptLoader: options?.transcriptLoader,
      previewHitsPerSession: options?.previewHitsPerSession,
      rawFileSearchLoader: options?.rawFileSearchLoader,
      signal: options?.signal,
    });

  for (
    let index = 0;
    index < sortedRows.length;
    index += CONVERSATION_SEARCH_SCAN_CONCURRENCY
  ) {
    throwIfAborted(options?.signal);
    const batchRows = sortedRows.slice(
      index,
      index + CONVERSATION_SEARCH_SCAN_CONCURRENCY,
    );
    const batchMatches = await mapWithConcurrency(
      batchRows,
      CONVERSATION_SEARCH_SCAN_CONCURRENCY,
      async (row) =>
        collectConversationSessionMatches(row, q, {
          transcriptLoader: cachedTranscriptLoader,
          transcriptLimit,
          openableThreadIds: options?.openableThreadIds,
          previewHitsPerSession: options?.previewHitsPerSession,
          rawFileMatch: rawFileMatches.get(row.file_path) ?? null,
          rawFileSearchComplete,
          signal: options?.signal,
        }),
    );

    for (let batchOffset = 0; batchOffset < batchMatches.length; batchOffset += 1) {
      scannedRows = index + batchOffset + 1;
      const session = batchMatches[batchOffset];
      if (!session) continue;
      sessionMatches.push(session);
    }
  }

  const orderedMatches = sessionMatches.sort(compareConversationSearchSessions);
  const totalMatchingSessions = orderedMatches.length;
  const hasMore = offset + pageSize < totalMatchingSessions;
  const pageSessions = orderedMatches
    .slice(offset, offset + pageSize)
    .sort(compareConversationSearchSessions)
    .map((item) => item.session);
  const nextCursor = hasMore
    ? encodeConversationSearchCursor(offset + pageSize)
    : null;
  const totalMatchingHits = null;

  return {
    searched_sessions: scannedRows,
    available_sessions: sortedRows.length,
    truncated: scannedRows < sortedRows.length,
    total_matching_sessions: totalMatchingSessions,
    total_matching_hits: totalMatchingHits,
    has_more: hasMore,
    next_cursor: nextCursor,
    sessions: pageSessions,
    results: pageSessions.flatMap((session) => session.preview_matches),
  };
}
