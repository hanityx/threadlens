import type {
  ProviderSessionRow,
  TranscriptMessage,
} from "../../types.js";
import {
  buildSearchSnippet,
  isExactPhraseSearchMatch,
  matchesConversationSearch,
} from "../../search-helpers.js";
import {
  throwIfAborted,
} from "./abort.js";
import {
  addSessionSearchHit,
  buildBaseSearchResult,
  type SearchIdentity,
  type SearchSessionAccumulator,
} from "./session-results.js";
import {
  isPolicyInjectionMessage,
} from "./transcript-policy.js";

export function applyTranscriptMessageMatches(
  accumulator: SearchSessionAccumulator,
  row: ProviderSessionRow,
  identity: SearchIdentity,
  messages: readonly TranscriptMessage[],
  options: {
    normalizedQuery: string;
    tokens: string[];
    previewHitsPerSession: number;
    exhaustiveHits: boolean;
    signal?: AbortSignal;
  },
): void {
  for (let i = 0; i < messages.length; i += 1) {
    throwIfAborted(options.signal);
    const message = messages[i];
    if (message.role === "system" || message.role === "tool") continue;
    if (isPolicyInjectionMessage(message.text)) continue;
    if (!matchesConversationSearch(message.text, options.normalizedQuery, options.tokens)) {
      continue;
    }
    addSessionSearchHit(
      accumulator,
      {
        ...buildBaseSearchResult(row, identity),
        ...(row.display_title ? { display_title: row.display_title } : {}),
        source: row.source,
        match_kind: "message",
        snippet: buildSearchSnippet(message.text, options.normalizedQuery, options.tokens),
        role: message.role,
      },
      {
        exactPhrase: isExactPhraseSearchMatch(message.text, options.normalizedQuery),
      },
      options.previewHitsPerSession,
    );
    if (
      !options.exhaustiveHits &&
      accumulator.session.match_count >= options.previewHitsPerSession + 1
    ) {
      break;
    }
  }
}
