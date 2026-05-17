import path from "node:path";

import type {
  ConversationSearchResult,
  ProviderSessionRow,
} from "../../types.js";
import {
  buildSearchSnippet,
  fallbackDisplayTitle,
  isExactPhraseSearchMatch,
  matchesConversationSearch,
  normalizeSearchText,
} from "../../search-helpers.js";
import {
  providerName,
} from "../../path-safety.js";
import {
  extractCodexThreadIdFromSessionName,
} from "../../title-detection.js";
import {
  inferSessionId,
} from "../../probe.js";

export type SearchIdentity = {
  sessionId: string;
  threadId: string | null;
  title: string;
};

export type SearchMatchMeta = {
  exactPhrase: boolean;
};

export function buildSearchIdentity(
  row: ProviderSessionRow,
  openableThreadIds?: Set<string>,
): SearchIdentity {
  const rawSessionId = inferSessionId(row.file_path) || row.session_id;
  const threadIdCandidate =
    row.provider === "codex"
      ? extractCodexThreadIdFromSessionName(rawSessionId) ||
        extractCodexThreadIdFromSessionName(row.session_id) ||
        row.session_id ||
        ""
      : "";
  const threadId =
    threadIdCandidate && openableThreadIds
      ? openableThreadIds.has(threadIdCandidate)
        ? threadIdCandidate
        : ""
      : threadIdCandidate;

  return {
    sessionId: rawSessionId,
    threadId: threadId || null,
    title:
      row.display_title ||
      row.probe.detected_title ||
      fallbackDisplayTitle(row.provider, row.session_id, row.source),
  };
}

export function buildBaseSearchResult(
  row: ProviderSessionRow,
  identity: SearchIdentity,
) {
  return {
    provider: row.provider,
    session_id: identity.sessionId,
    title: identity.title,
    file_path: row.file_path,
    mtime: row.mtime,
    ...(identity.threadId ? { thread_id: identity.threadId } : {}),
  };
}

export function buildMetadataSearchResult(
  row: ProviderSessionRow,
  identity: SearchIdentity,
  normalizedQuery: string,
  tokens: string[],
): { result: ConversationSearchResult; meta: SearchMatchMeta } | null {
  const metadataCandidates = [
    identity.title,
    identity.sessionId,
    row.source,
    path.basename(row.file_path),
    providerName(row.provider),
    row.file_path,
  ]
    .map((value) => normalizeSearchText(value))
    .filter(Boolean);

  for (const candidate of metadataCandidates) {
    if (!matchesConversationSearch(candidate, normalizedQuery, tokens)) continue;
    return {
      result: {
        ...buildBaseSearchResult(row, identity),
        ...(row.display_title ? { display_title: row.display_title } : {}),
        source: row.source,
        match_kind: "title",
        snippet: buildSearchSnippet(candidate, normalizedQuery, tokens, 140),
      },
      meta: {
        exactPhrase: isExactPhraseSearchMatch(candidate, normalizedQuery),
      },
    };
  }

  return null;
}
