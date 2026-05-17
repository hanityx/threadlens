import type {
  ConversationSearchResult,
  ConversationSearchSessionResult,
  ProviderSessionRow,
} from "../../types.js";
import {
  conversationSearchResultDedupKey,
} from "./session-dedupe.js";
import type {
  SearchIdentity,
  SearchMatchMeta,
} from "./session-metadata-results.js";

export type SearchSessionAccumulator = {
  session: ConversationSearchSessionResult;
  exact_phrase_count: number;
  seen_hits: Set<string>;
};

export function createSessionAccumulator(
  row: ProviderSessionRow,
  identity: SearchIdentity,
): SearchSessionAccumulator {
  return {
    session: {
      provider: row.provider,
      session_id: identity.sessionId,
      ...(identity.threadId ? { thread_id: identity.threadId } : {}),
      title: identity.title,
      ...(row.display_title ? { display_title: row.display_title } : {}),
      file_path: row.file_path,
      source: row.source,
      mtime: row.mtime,
      match_count: 0,
      title_match_count: 0,
      best_match_kind: "message",
      preview_matches: [],
      has_more_hits: false,
    },
    exact_phrase_count: 0,
    seen_hits: new Set<string>(),
  };
}

export function addSessionSearchHit(
  session: SearchSessionAccumulator,
  result: ConversationSearchResult,
  meta: SearchMatchMeta,
  previewLimit: number,
): void {
  const dedupeKey = conversationSearchResultDedupKey(result);
  if (session.seen_hits.has(dedupeKey)) return;
  session.seen_hits.add(dedupeKey);
  session.session.match_count += 1;
  if (result.match_kind === "title") {
    session.session.title_match_count += 1;
    session.session.best_match_kind = "title";
  }
  if (meta.exactPhrase) {
    session.exact_phrase_count += 1;
  }
  if (session.session.preview_matches.length < previewLimit) {
    session.session.preview_matches.push(result);
  }
  session.session.has_more_hits =
    session.session.match_count > session.session.preview_matches.length;
}

export function compareConversationSearchSessions(
  left: SearchSessionAccumulator,
  right: SearchSessionAccumulator,
): number {
  const leftTitle = left.session.title_match_count > 0 ? 1 : 0;
  const rightTitle = right.session.title_match_count > 0 ? 1 : 0;
  if (leftTitle !== rightTitle) return rightTitle - leftTitle;
  if (left.exact_phrase_count !== right.exact_phrase_count) {
    return right.exact_phrase_count - left.exact_phrase_count;
  }
  if (left.session.match_count !== right.session.match_count) {
    return right.session.match_count - left.session.match_count;
  }
  return (
    Date.parse(String(right.session.mtime || "")) -
    Date.parse(String(left.session.mtime || ""))
  );
}
