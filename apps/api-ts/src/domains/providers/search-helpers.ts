import type { ProviderId } from "./types.js";

export function normalizeSearchText(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeSearchQuery(value: string): string {
  return normalizeSearchText(value).toLowerCase();
}

export function buildSearchTokens(query: string): string[] {
  return Array.from(
    new Set(
      normalizeSearchQuery(query)
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  );
}

function findSearchMatchIndex(
  text: string,
  normalizedQuery: string,
  tokens: string[],
): number {
  const normalizedText = normalizeSearchQuery(text);
  if (!normalizedText) return -1;
  if (normalizedQuery) {
    const queryIndex = normalizedText.indexOf(normalizedQuery);
    if (queryIndex >= 0) return queryIndex;
  }
  for (const token of tokens) {
    const tokenIndex = normalizedText.indexOf(token);
    if (tokenIndex >= 0) return tokenIndex;
  }
  return -1;
}

export function matchesConversationSearch(
  text: string,
  normalizedQuery: string,
  tokens: string[],
): boolean {
  const normalizedText = normalizeSearchQuery(text);
  if (!normalizedText) return false;
  if (normalizedQuery && normalizedText.includes(normalizedQuery)) return true;
  if (!tokens.length) return false;
  return tokens.every((token) => normalizedText.includes(token));
}

export function buildSearchSnippet(
  text: string,
  normalizedQuery: string,
  tokens: string[],
  maxLen = 180,
): string {
  const clean = normalizeSearchText(text);
  if (!clean) return "";
  if (clean.length <= maxLen) return clean;
  const matchIndex = findSearchMatchIndex(clean, normalizedQuery, tokens);
  if (matchIndex < 0) return `${clean.slice(0, maxLen - 1).trim()}…`;
  const context = Math.max(32, Math.floor(maxLen / 2));
  const start = Math.max(0, matchIndex - context);
  const end = Math.min(clean.length, start + maxLen);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < clean.length ? "…" : "";
  return `${prefix}${clean.slice(start, end).trim()}${suffix}`;
}

export function fallbackDisplayTitle(
  provider: ProviderId,
  sessionId: string,
  source: string,
): string {
  const normalizedId = normalizeSearchText(sessionId) || "unknown";
  if (provider === "chatgpt") {
    if (source === "project-conversations") {
      return `ChatGPT Project · ${normalizedId}`;
    }
    return `ChatGPT Conversation · ${normalizedId}`;
  }
  return normalizedId;
}
