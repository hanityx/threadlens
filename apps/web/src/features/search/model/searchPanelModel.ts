import { normalizeDisplayValue } from "@/shared/lib/format";
import type { Messages } from "@/i18n";
import type { ConversationSearchHit } from "@/shared/types";

const HOME_PATH_MARKER = `/${"Users"}/`;
const MARKDOWN_FILE_NAME_PATTERN = /\b[\w.-]+\.md\b/i;
const RECENT_KEY = "tl:search:recent";
const MAX_RECENT = 8;

export type RecentSearch = { q: string; ts: number };

export type SearchSessionGroup = {
  key: string;
  openHit: ConversationSearchHit;
  title: string;
  source: string;
  matches: ConversationSearchHit[];
};

export type SearchProviderGroup = {
  id: string;
  name: string;
  matchCount: number;
  sessions: SearchSessionGroup[];
};

export function formatSearchMessage(
  template: string,
  replacements: Record<string, string | number>,
): string {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function loadRecentSearches(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentSearch =>
        typeof item?.q === "string" && typeof item?.ts === "number",
    );
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string): RecentSearch[] {
  const current = loadRecentSearches();
  const updated: RecentSearch[] = [
    { q: query, ts: Date.now() },
    ...current.filter((item) => item.q !== query),
  ].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
  return updated;
}

export function removeRecentSearch(query: string): RecentSearch[] {
  const current = loadRecentSearches();
  const updated = current.filter((item) => item.q !== query);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }
  return updated;
}

export function formatRecentTime(ts: number, searchMessages: Messages["search"]): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return searchMessages.timeJustNow;
  if (mins < 60) return formatSearchMessage(searchMessages.timeMinutesAgo, { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return formatSearchMessage(searchMessages.timeHoursAgo, { count: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return searchMessages.timeYesterday;
  return formatSearchMessage(searchMessages.timeDaysAgo, { count: days });
}

export function getSearchRoleLabel(role: string | null | undefined, messages: Messages): string {
  if (role === "user") return messages.transcript.roleUser;
  if (role === "assistant") return messages.transcript.roleAssistant;
  if (role === "developer") return messages.transcript.roleDeveloper;
  if (role === "system") return messages.transcript.roleSystem;
  if (role === "tool") return messages.transcript.roleTool;
  if (role) return role;
  return messages.search.matchMessage;
}

export function formatSourceLabel(source?: string | null): string {
  if (!source) return "source";
  return source.replace(/\\/g, "/");
}

export function compactProviderName(provider?: string | null): string {
  if (!provider) return "session";
  if (provider === "claude-cli") return "Claude";
  if (provider === "gemini-cli") return "Gemini";
  if (provider === "copilot-chat") return "Copilot";
  if (provider === "codex") return "Codex";
  return provider
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function compactSearchTitle(hit: ConversationSearchHit): string {
  const fallback =
    hit.thread_id
      ? `thread ${hit.thread_id.slice(0, 8)}`
      : hit.session_id
        ? `session ${hit.session_id.slice(0, 8)}`
        : "session result";
  const raw = normalizeDisplayValue(hit.display_title) || normalizeDisplayValue(hit.title);
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  const looksGenerated =
    lower === "none" ||
    lower === "unknown" ||
    lower.startsWith("rollout-") ||
    MARKDOWN_FILE_NAME_PATTERN.test(raw) ||
    raw.includes("<INSTRUCTIONS>") ||
    raw.includes(HOME_PATH_MARKER) ||
    raw.length > 88;
  return looksGenerated ? fallback : raw;
}

export function compactSearchSnippet(hit: ConversationSearchHit): string {
  const raw = String(hit.snippet || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  return raw.length > 200 ? `${raw.slice(0, 197)}…` : raw;
}

export function shouldIgnoreSearchCardKeyboardActivation(options: {
  currentTarget: HTMLElement;
  target: EventTarget | null;
}): boolean {
  const target = options.target;
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return Boolean((target as { closest?: (selector: string) => unknown } | null)?.closest?.("button"));
  }
  const interactiveAncestor = target.closest(
    "button, a, input, select, textarea, summary, [role='button'], [role='link']",
  );
  return Boolean(interactiveAncestor && interactiveAncestor !== options.currentTarget);
}

export function searchHitDedupKey(hit: ConversationSearchHit): string {
  const transcriptKey = hit.session_id || hit.file_path;
  const snippetKey = (hit.snippet || "").trim().toLowerCase();
  const titleKey = (hit.display_title || hit.title || "").trim().toLowerCase();
  return [
    hit.provider,
    transcriptKey,
    hit.match_kind,
    titleKey,
    snippetKey,
  ].join("::");
}

export function isSearchFocusShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">) {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
}

export function buildProviderGroups(options: {
  provider: string;
  providerLabelById: Map<string, string>;
  providerOptions: Array<{ id: string; name: string }>;
  results: ConversationSearchHit[];
}): SearchProviderGroup[] {
  const { provider, providerLabelById, providerOptions, results } = options;
  const groups = new Map<string, ConversationSearchHit[]>();
  for (const hit of results) {
    const list = groups.get(hit.provider) ?? [];
    list.push(hit);
    groups.set(hit.provider, list);
  }

  const orderedProviders =
    provider === "all"
      ? providerOptions.map((item) => item.id).filter((id) => id !== "all")
      : [provider];

  const orderedGroups = orderedProviders
    .map((providerId) => {
      const providerResults = groups.get(providerId) ?? [];
      const sessionMap = new Map<string, SearchSessionGroup>();

      for (const hit of providerResults) {
        const sessionKey = hit.session_id || hit.file_path;
        const existing = sessionMap.get(sessionKey);
        if (existing) {
          existing.matches.push(hit);
          continue;
        }

        sessionMap.set(sessionKey, {
          key: sessionKey,
          openHit: hit,
          title: compactSearchTitle(hit),
          source: normalizeDisplayValue(hit.source) || hit.file_path,
          matches: [hit],
        });
      }

      return {
        id: providerId,
        name: providerLabelById.get(providerId) ?? providerId,
        matchCount: providerResults.length,
        sessions: Array.from(sessionMap.values()),
      };
    })
    .filter((group) => group.sessions.length > 0);

  for (const [providerId, providerResults] of groups.entries()) {
    if (orderedProviders.includes(providerId)) continue;
    const sessionMap = new Map<string, SearchSessionGroup>();
    for (const hit of providerResults) {
      const sessionKey = hit.session_id || hit.file_path;
      const existing = sessionMap.get(sessionKey);
      if (existing) {
        existing.matches.push(hit);
        continue;
      }
      sessionMap.set(sessionKey, {
        key: sessionKey,
        openHit: hit,
        title: compactSearchTitle(hit),
        source: normalizeDisplayValue(hit.source) || hit.file_path,
        matches: [hit],
      });
    }
    orderedGroups.push({
      id: providerId,
      name: providerLabelById.get(providerId) ?? providerId,
      matchCount: providerResults.length,
      sessions: Array.from(sessionMap.values()),
    });
  }

  return orderedGroups;
}
