import type {
  ProviderSessionRow,
} from "../../types.js";
import {
  isExactPhraseSearchMatch,
} from "../../search-helpers.js";
import type {
  RawConversationFileMatch,
} from "./raw-files.js";
import {
  addSessionSearchHit,
  buildBaseSearchResult,
  type SearchIdentity,
  type SearchSessionAccumulator,
} from "./session-results.js";

export function applyRawConversationFileMatch(
  accumulator: SearchSessionAccumulator,
  row: ProviderSessionRow,
  identity: SearchIdentity,
  rawFileMatch: RawConversationFileMatch,
  normalizedQuery: string,
  previewHitsPerSession: number,
): void {
  for (const snippet of rawFileMatch.snippets) {
    addSessionSearchHit(
      accumulator,
      {
        ...buildBaseSearchResult(row, identity),
        ...(row.display_title ? { display_title: row.display_title } : {}),
        source: row.source,
        match_kind: "message",
        snippet,
      },
      {
        exactPhrase: isExactPhraseSearchMatch(snippet, normalizedQuery),
      },
      previewHitsPerSession,
    );
  }
  accumulator.session.match_count = Math.max(
    accumulator.session.match_count,
    rawFileMatch.match_count,
  );
  accumulator.session.has_more_hits =
    rawFileMatch.has_more_hits ||
    accumulator.session.match_count > accumulator.session.preview_matches.length;
  accumulator.exact_phrase_count = Math.max(
    accumulator.exact_phrase_count,
    rawFileMatch.exact_phrase_count,
  );
}
