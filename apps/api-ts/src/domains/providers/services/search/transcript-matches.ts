import { buildSessionTranscript } from "../../transcript.js";
import type {
  ProviderId,
  ProviderSessionRow,
} from "../../types.js";
import {
  buildSearchTokens,
  normalizeSearchQuery,
  normalizeSearchText,
} from "../../search-helpers.js";
import {
  throwIfAborted,
} from "./abort.js";
import {
  DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
} from "./constants.js";
import {
  isRawConversationFileSearchEligible,
  RAW_CONVERSATION_FILE_MAX_MATCHES,
  type RawConversationFileMatch,
} from "./raw-files.js";
import {
  addSessionSearchHit,
  buildMetadataSearchResult,
  buildSearchIdentity,
  createSessionAccumulator,
  isMetadataOnlyConversationQuery,
  type SearchSessionAccumulator,
} from "./session-results.js";
import {
  createCachedConversationTranscriptLoader,
} from "./transcript-loader-cache.js";
import { applyTranscriptMessageMatches } from "./transcript-message-matches.js";
import {
  applyRawConversationFileMatch,
} from "./transcript-raw-matches.js";
import type {
  CachedConversationTranscriptLoader,
} from "./types.js";

export { createCachedConversationTranscriptLoader } from "./transcript-loader-cache.js";
export { isPolicyInjectionMessage } from "./transcript-policy.js";

function isStructuredTranscriptFilePath(filePath: string): boolean {
  return /\.(jsonl|json)$/i.test(filePath);
}

export async function collectConversationSessionMatches(
  row: ProviderSessionRow,
  q: string,
  options?: {
    transcriptLoader?: CachedConversationTranscriptLoader;
    transcriptLimit?: number;
    openableThreadIds?: Set<string>;
    previewHitsPerSession?: number;
    exhaustiveHits?: boolean;
    rawFileMatch?: RawConversationFileMatch | null;
    rawFileSearchComplete?: boolean;
    signal?: AbortSignal;
  },
): Promise<SearchSessionAccumulator | null> {
  throwIfAborted(options?.signal);
  const trimmedQuery = normalizeSearchText(q);
  const normalizedQuery = normalizeSearchQuery(trimmedQuery);
  const tokens = buildSearchTokens(trimmedQuery);
  const transcriptLimit = Math.max(
    100,
    Math.min(
      DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
      Number(options?.transcriptLimit) || DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
    ),
  );
  const metadataOnlyQuery = isMetadataOnlyConversationQuery(trimmedQuery);
  const transcriptLoader =
    options?.transcriptLoader ??
    createCachedConversationTranscriptLoader((provider: ProviderId, filePath: string) =>
      buildSessionTranscript(provider, filePath, transcriptLimit),
    );
  const identity = buildSearchIdentity(row, options?.openableThreadIds);
  const exhaustiveHits = Boolean(options?.exhaustiveHits);
  const previewHitsPerSession = Math.max(
    1,
    Math.min(
      exhaustiveHits ? RAW_CONVERSATION_FILE_MAX_MATCHES : 20,
      Number(options?.previewHitsPerSession) || 3,
    ),
  );
  const accumulator = createSessionAccumulator(row, identity);
  const metadataResult = buildMetadataSearchResult(
    row,
    identity,
    normalizedQuery,
    tokens,
  );

  if (metadataResult) {
    addSessionSearchHit(
      accumulator,
      metadataResult.result,
      metadataResult.meta,
      previewHitsPerSession,
    );
  }

  if (options?.rawFileMatch) {
    throwIfAborted(options?.signal);
    const transcript = await transcriptLoader(row);
    if (transcript?.messages?.length) {
      applyTranscriptMessageMatches(accumulator, row, identity, transcript.messages, {
        normalizedQuery,
        tokens,
        previewHitsPerSession,
        exhaustiveHits,
        signal: options?.signal,
      });
    } else if (!isStructuredTranscriptFilePath(row.file_path)) {
      applyRawConversationFileMatch(
        accumulator,
        row,
        identity,
        options.rawFileMatch,
        normalizedQuery,
        previewHitsPerSession,
      );
    }
    return accumulator.session.match_count > 0 ? accumulator : null;
  }

  if (options?.rawFileSearchComplete && isRawConversationFileSearchEligible(row.file_path)) {
    return accumulator.session.match_count > 0 ? accumulator : null;
  }

  if (!metadataOnlyQuery) {
    throwIfAborted(options?.signal);
    const transcript = await transcriptLoader(row);
    if (transcript?.messages?.length) {
      applyTranscriptMessageMatches(accumulator, row, identity, transcript.messages, {
        normalizedQuery,
        tokens,
        previewHitsPerSession,
        exhaustiveHits,
        signal: options?.signal,
      });
    }
  }

  if (accumulator.session.match_count === 0) return null;
  accumulator.session.has_more_hits =
    accumulator.session.match_count > accumulator.session.preview_matches.length;
  return accumulator;
}
