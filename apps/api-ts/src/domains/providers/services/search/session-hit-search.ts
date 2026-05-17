import type {
  ConversationSearchSessionHitsPayload,
  ProviderSessionRow,
} from "../../types.js";
import {
  normalizeSearchText,
} from "../../search-helpers.js";
import { nowIsoUtc } from "../../../../lib/utils.js";
import {
  throwIfAborted,
} from "./abort.js";
import {
  DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
} from "./constants.js";
import {
  RAW_CONVERSATION_FILE_MAX_MATCHES,
  type RawConversationFileMatch,
  type RawConversationFileSearchLoader,
  searchConversationFilesWithRipgrep,
} from "./raw-files.js";
import {
  decodeConversationSearchCursor,
  encodeConversationSearchCursor,
} from "./session-results.js";
import {
  collectConversationSessionMatches,
  createCachedConversationTranscriptLoader,
} from "./transcript-matches.js";
import type {
  ConversationTranscriptLoader,
} from "./types.js";

export async function searchConversationSessionHits(
  row: ProviderSessionRow,
  q: string,
  options?: {
    pageSize?: number;
    cursor?: string;
    transcriptLoader?: ConversationTranscriptLoader;
    transcriptLimit?: number;
    openableThreadIds?: Set<string>;
    rawFileSearchLoader?: RawConversationFileSearchLoader;
    signal?: AbortSignal;
  },
): Promise<ConversationSearchSessionHitsPayload> {
  throwIfAborted(options?.signal);
  const pageSize = Math.max(1, Math.min(200, Number(options?.pageSize) || 40));
  const offset = decodeConversationSearchCursor(options?.cursor);
  const requestedHitWindow = Math.max(
    pageSize,
    Math.min(RAW_CONVERSATION_FILE_MAX_MATCHES, offset + pageSize + 1),
  );
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
  let rawFileMatch: RawConversationFileMatch | null = null;
  let rawFileSearchComplete = false;
  const shouldUseRawFileSearch =
    Boolean(options?.rawFileSearchLoader) || !options?.transcriptLoader;
  if (shouldUseRawFileSearch) {
    try {
      rawFileMatch =
        (
          await (options?.rawFileSearchLoader ?? searchConversationFilesWithRipgrep)([row], q, {
            previewHitsPerSession: requestedHitWindow,
            maxHitsPerSession: requestedHitWindow,
            signal: options?.signal,
          })
        ).get(row.file_path) ?? null;
      rawFileSearchComplete = true;
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      rawFileMatch = null;
      rawFileSearchComplete = false;
    }
  }
  const canSatisfyCursorFromRawFile =
    !rawFileMatch ||
    offset < rawFileMatch.snippets.length ||
    !rawFileMatch.has_more_hits;
  const session = await collectConversationSessionMatches(row, q, {
    transcriptLoader: cachedTranscriptLoader,
    transcriptLimit,
    openableThreadIds: options?.openableThreadIds,
    previewHitsPerSession: requestedHitWindow,
    exhaustiveHits: true,
    rawFileMatch: canSatisfyCursorFromRawFile ? rawFileMatch : null,
    rawFileSearchComplete: canSatisfyCursorFromRawFile ? rawFileSearchComplete : false,
    signal: options?.signal,
  });

  const hits = session?.session.preview_matches ?? [];
  const totalHits = Math.max(hits.length, session?.session.match_count ?? 0);
  const hasMore = offset + pageSize < totalHits;
  const nextCursor = hasMore
    ? encodeConversationSearchCursor(offset + pageSize)
    : null;

  return {
    generated_at: nowIsoUtc(),
    q: normalizeSearchText(q),
    provider: row.provider,
    session_id: row.session_id,
    file_path: row.file_path,
    page_size: pageSize,
    total_hits: totalHits,
    has_more: hasMore,
    next_cursor: nextCursor,
    hits: hits.slice(offset, offset + pageSize),
  };
}
