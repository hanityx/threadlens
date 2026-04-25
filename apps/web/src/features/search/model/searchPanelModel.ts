import { normalizeDisplayValue } from "@/shared/lib/format";
import type { Messages } from "@/i18n";
import type { ConversationSearchHit, ConversationSearchSession } from "@/shared/types";

const HOME_PATH_MARKER = `/${"Users"}/`;
const RECENT_KEY = "tl:search:recent";
const DISMISSED_ACTIVE_RECENT_KEY = "tl:search:recent:dismissed-active";
const MAX_RECENT = 8;

export type RecentSearch = { q: string; ts: number };

export type SearchSessionGroup = {
  key: string;
  result: ConversationSearchSession;
  openHit: ConversationSearchHit;
  title: string;
  source: string;
  matches: ConversationSearchHit[];
  hasMoreHits: boolean;
};

export type SearchProviderGroup = {
  id: string;
  name: string;
  matchCount: number;
  hasApproximateHits: boolean;
  sessions: SearchSessionGroup[];
};

export type LoadedSessionHitsState = {
  hits: SearchSessionGroup["matches"];
  loading: boolean;
  hasMore: boolean;
  nextCursor: string | null;
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

export function buildSessionHitsFailureState(
  previous: LoadedSessionHitsState | undefined,
  fallbackHasMore: boolean,
): LoadedSessionHitsState {
  return {
    hits: previous?.hits ?? [],
    loading: false,
    hasMore: previous?.hasMore ?? fallbackHasMore,
    nextCursor: previous?.nextCursor ?? null,
  };
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
  const dismissedActive = loadDismissedActiveRecentSearch();
  if (dismissedActive && dismissedActive === query) {
    return current;
  }
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
    localStorage.setItem(DISMISSED_ACTIVE_RECENT_KEY, query);
  } catch {
    // ignore storage errors
  }
  return updated;
}

export function loadDismissedActiveRecentSearch(): string {
  try {
    const raw = localStorage.getItem(DISMISSED_ACTIVE_RECENT_KEY);
    return typeof raw === "string" ? raw.trim() : "";
  } catch {
    return "";
  }
}

export function clearDismissedActiveRecentSearch(): void {
  try {
    localStorage.removeItem(DISMISSED_ACTIVE_RECENT_KEY);
  } catch {
    // ignore storage errors
  }
}

export function syncDismissedActiveRecentSearch(activeQuery: string): void {
  const dismissed = loadDismissedActiveRecentSearch();
  if (!dismissed) return;
  if (dismissed === activeQuery.trim()) return;
  clearDismissedActiveRecentSearch();
}

export function shouldSkipHydratedInitialRecentPersistence(options: {
  initialQuery: string;
  debouncedQuery: string;
  hydratedInitialPending: boolean;
}): boolean {
  const initialQuery = options.initialQuery.trim();
  if (!options.hydratedInitialPending) return false;
  if (!initialQuery) return false;
  return options.debouncedQuery === initialQuery;
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
    normalizeDisplayValue(hit.session_id) ||
    normalizeDisplayValue(hit.thread_id) ||
    "session result";
  const raw = normalizeDisplayValue(hit.display_title) || normalizeDisplayValue(hit.title);
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  const looksBroken =
    lower === "none" ||
    lower === "unknown" ||
    raw.includes("<INSTRUCTIONS>") ||
    raw.includes(HOME_PATH_MARKER);
  return looksBroken ? fallback : raw;
}

export function compactSearchSessionTitle(session: ConversationSearchSession): string {
  return compactSearchTitle(searchSessionOpenHit(session));
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

export function isSearchFocusShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey">) {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
}

export function searchSessionOpenHit(session: ConversationSearchSession): ConversationSearchHit {
  const previewMatch = session.preview_matches[0];
  if (previewMatch) {
    return {
      ...previewMatch,
      display_title: previewMatch.display_title || session.display_title,
      title: previewMatch.title || session.title,
      source: previewMatch.source || session.source,
    };
  }
  return {
    provider: session.provider,
    session_id: session.session_id,
    thread_id: session.thread_id,
    title: session.title,
    display_title: session.display_title,
    file_path: session.file_path,
    source: session.source,
    mtime: session.mtime,
    match_kind: session.best_match_kind,
    snippet: session.title,
    role: null,
  };
}

export function buildSearchSessionKey(session: Pick<ConversationSearchSession, "provider" | "session_id" | "file_path">): string {
  return `${session.provider}::${session.session_id || session.file_path}`;
}

export function buildProviderGroups(options: {
  provider: string;
  providerLabelById: Map<string, string>;
  providerOptions: Array<{ id: string; name: string }>;
  sessions: ConversationSearchSession[];
}): SearchProviderGroup[] {
  const { provider, providerLabelById, providerOptions, sessions } = options;
  const groups = new Map<string, ConversationSearchSession[]>();
  for (const session of sessions) {
    const list = groups.get(session.provider) ?? [];
    list.push(session);
    groups.set(session.provider, list);
  }

  const orderedProviders =
    provider === "all"
      ? providerOptions.map((item) => item.id).filter((id) => id !== "all")
      : [provider];

  const orderedGroups = orderedProviders
    .map((providerId) => {
      const providerSessions = groups.get(providerId) ?? [];
      const groupedSessions = providerSessions.map((session) => {
        const openHit = searchSessionOpenHit(session);
        return {
          key: buildSearchSessionKey(session),
          result: session,
          openHit,
          title: compactSearchSessionTitle(session),
          source: normalizeDisplayValue(session.source) || session.file_path,
          matches: session.preview_matches,
          hasMoreHits: session.has_more_hits,
        };
      });

      return {
        id: providerId,
        name: providerLabelById.get(providerId) ?? providerId,
        matchCount: providerSessions.reduce((sum, session) => sum + session.match_count, 0),
        hasApproximateHits: providerSessions.some((session) => session.has_more_hits),
        sessions: groupedSessions,
      };
    })
    .filter((group) => group.sessions.length > 0);

  for (const [providerId, providerSessions] of groups.entries()) {
    if (orderedProviders.includes(providerId)) continue;
    orderedGroups.push({
      id: providerId,
      name: providerLabelById.get(providerId) ?? providerId,
      matchCount: providerSessions.reduce((sum, session) => sum + session.match_count, 0),
      sessions: providerSessions.map((session) => {
        const openHit = searchSessionOpenHit(session);
        return {
          key: buildSearchSessionKey(session),
          result: session,
          openHit,
          title: compactSearchSessionTitle(session),
          source: normalizeDisplayValue(session.source) || session.file_path,
          matches: session.preview_matches,
          hasMoreHits: session.has_more_hits,
        };
      }),
      hasApproximateHits: providerSessions.some((session) => session.has_more_hits),
    });
  }

  return orderedGroups;
}
