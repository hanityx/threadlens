import path from "node:path";
import { buildSessionTranscript } from "../transcript.js";
import type {
  ConversationSearchResult,
  ProviderId,
  ProviderSessionRow,
} from "../types.js";
import {
  buildSearchSnippet,
  buildSearchTokens,
  matchesConversationSearch,
  normalizeSearchQuery,
  normalizeSearchText,
} from "../search-helpers.js";
import {
  DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
  SEARCH_TRANSCRIPT_CONCURRENCY,
} from "./constants.js";
import { mapWithConcurrency } from "./concurrency.js";
import { resolveConversationSearchLimits } from "./limits.js";
import {
  buildBaseSearchResult,
  buildMetadataSearchResult,
  buildSearchIdentity,
  dedupeConversationSearchResults,
  isMetadataOnlyConversationQuery,
  type SearchIdentity,
} from "./session-results.js";
import {
  createCachedConversationTranscriptLoader,
  isPolicyInjectionMessage,
} from "./transcript-matches.js";
import type { ConversationTranscriptLoader } from "./types.js";

export async function searchConversationRows(
  rows: ProviderSessionRow[],
  q: string,
  options?: {
    limit?: number;
    transcriptLoader?: ConversationTranscriptLoader;
    transcriptLimit?: number;
    openableThreadIds?: Set<string>;
  },
): Promise<{
  searched_sessions: number;
  available_sessions: number;
  truncated: boolean;
  results: ConversationSearchResult[];
}> {
  const trimmedQuery = normalizeSearchText(q);
  const normalizedQuery = normalizeSearchQuery(trimmedQuery);
  const tokens = buildSearchTokens(trimmedQuery);
  const { resultLimit: safeLimit } = resolveConversationSearchLimits({
    limit: options?.limit,
  });
  const transcriptLimit = Math.max(
    100,
    Math.min(
      DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
      Number(options?.transcriptLimit) ||
        DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
    ),
  );
  const transcriptLoader =
    options?.transcriptLoader ??
    ((provider: ProviderId, filePath: string) =>
      buildSessionTranscript(provider, filePath, transcriptLimit));
  const metadataOnlyQuery = isMetadataOnlyConversationQuery(trimmedQuery);
  const cachedTranscriptLoader =
    createCachedConversationTranscriptLoader(transcriptLoader);
  const seenPaths = new Set<string>();
  const sortedRows = [...rows]
    .sort(
      (a, b) =>
        Date.parse(String(b.mtime || "")) - Date.parse(String(a.mtime || "")),
    )
    .filter((row) => {
      const key = `${row.provider}:${path.resolve(row.file_path)}`;
      if (seenPaths.has(key)) return false;
      seenPaths.add(key);
      return true;
    });
  const metadataResults: ConversationSearchResult[] = [];
  const transcriptRows: Array<{
    row: ProviderSessionRow;
    identity: SearchIdentity;
  }> = [];

  for (const row of sortedRows) {
    const identity = buildSearchIdentity(row, options?.openableThreadIds);
    const metadataResult = buildMetadataSearchResult(
      row,
      identity,
      normalizedQuery,
      tokens,
    );
    if (metadataResult) {
      metadataResults.push(metadataResult.result);
      continue;
    }
    transcriptRows.push({ row, identity });
  }

  let results = dedupeConversationSearchResults(metadataResults);
  const metadataSatisfiesLimit = results.length >= safeLimit;
  const metadataOnlyTruncated =
    results.length > safeLimit ||
    (metadataSatisfiesLimit && transcriptRows.length > 0);

  if (!metadataSatisfiesLimit && !metadataOnlyQuery) {
    let transcriptStoppedEarly = false;
    for (
      let offset = 0;
      offset < transcriptRows.length && results.length < safeLimit;
      offset += SEARCH_TRANSCRIPT_CONCURRENCY
    ) {
      const chunk = transcriptRows.slice(
        offset,
        offset + SEARCH_TRANSCRIPT_CONCURRENCY,
      );
      const chunkResults = await mapWithConcurrency(
        chunk,
        SEARCH_TRANSCRIPT_CONCURRENCY,
        async ({ row, identity }) => {
          const rowResults: ConversationSearchResult[] = [];
          const baseResult = buildBaseSearchResult(row, identity);
          const transcript = await cachedTranscriptLoader(row);
          if (!transcript?.messages?.length) return rowResults;

          for (let i = 0; i < transcript.messages.length; i += 1) {
            const message = transcript.messages[i];
            if (message.role === "system" || message.role === "tool") continue;
            if (isPolicyInjectionMessage(message.text)) continue;
            if (
              !matchesConversationSearch(message.text, normalizedQuery, tokens)
            ) {
              continue;
            }
            rowResults.push({
              ...baseResult,
              match_kind: "message",
              snippet: buildSearchSnippet(message.text, normalizedQuery, tokens),
              role: message.role,
            });
          }

          return rowResults;
        },
      );

      results = dedupeConversationSearchResults([
        ...results,
        ...chunkResults.flat(),
      ]);
      if (
        results.length >= safeLimit &&
        offset + chunk.length < transcriptRows.length
      ) {
        transcriptStoppedEarly = true;
      }

      if (results.length >= safeLimit) {
        return {
          searched_sessions: sortedRows.length,
          available_sessions: sortedRows.length,
          truncated: results.length > safeLimit || transcriptStoppedEarly,
          results: results.slice(0, safeLimit),
        };
      }
    }
  }

  return {
    searched_sessions: sortedRows.length,
    available_sessions: sortedRows.length,
    truncated: metadataOnlyTruncated || results.length > safeLimit,
    results: results.slice(0, safeLimit),
  };
}
