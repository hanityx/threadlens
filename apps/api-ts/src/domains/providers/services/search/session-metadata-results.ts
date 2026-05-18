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
  canResume: boolean;
  title: string;
};

export type SearchMatchMeta = {
  exactPhrase: boolean;
};

export function buildCodexResumeCommand(
  row: ProviderSessionRow,
  identity: SearchIdentity,
): string | null {
  if (row.provider !== "codex") return null;
  if (row.source !== "sessions") return null;
  if (!identity.canResume) return null;
  if (!identity.threadId) return null;
  return `codex resume ${identity.threadId}`;
}

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
  const canResume =
    row.provider === "codex" &&
    row.source === "sessions" &&
    Boolean(threadIdCandidate && openableThreadIds?.has(threadIdCandidate));

  return {
    sessionId: rawSessionId,
    threadId: threadId || null,
    canResume,
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
  const resumeCommand = buildCodexResumeCommand(row, identity);
  return {
    provider: row.provider,
    session_id: identity.sessionId,
    title: identity.title,
    file_path: row.file_path,
    mtime: row.mtime,
    ...(identity.threadId ? { thread_id: identity.threadId } : {}),
    ...(resumeCommand ? { resume_command: resumeCommand } : {}),
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
