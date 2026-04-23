import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addRecentSearch,
  buildProviderGroups,
  clearDismissedActiveRecentSearch,
  compactSearchTitle,
  loadDismissedActiveRecentSearch,
  removeRecentSearch,
  shouldSkipHydratedInitialRecentPersistence,
  syncDismissedActiveRecentSearch,
} from "@/features/search/model/searchPanelModel";
import type { ConversationSearchHit, ConversationSearchSession } from "@/shared/types";

function makeSession(overrides?: Partial<ConversationSearchSession>): ConversationSearchSession {
  return {
    provider: "codex",
    session_id: "session-1",
    title: "Session title",
    file_path: "/tmp/session-1.jsonl",
    source: "sessions",
    mtime: "2026-03-28T00:00:00.000Z",
    match_count: 1,
    title_match_count: 0,
    best_match_kind: "message",
    preview_matches: [],
    has_more_hits: false,
    ...overrides,
  };
}

describe("recent search dismissal", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  it("keeps a removed active query dismissed across reload-style re-add attempts", () => {
    addRecentSearch("zzzz-no-match-search-0423");
    removeRecentSearch("zzzz-no-match-search-0423");

    expect(loadDismissedActiveRecentSearch()).toBe("zzzz-no-match-search-0423");
    expect(addRecentSearch("zzzz-no-match-search-0423")).toEqual([]);
  });

  it("clears the active dismissal once the query changes away", () => {
    removeRecentSearch("zzzz-no-match-search-0423");
    syncDismissedActiveRecentSearch("different-query");
    expect(loadDismissedActiveRecentSearch()).toBe("");
    clearDismissedActiveRecentSearch();
    expect(loadDismissedActiveRecentSearch()).toBe("");
  });
});

describe("buildProviderGroups", () => {
  it("uses provider-qualified keys when different providers share a session id", () => {
    const groups = buildProviderGroups({
      provider: "all",
      providerLabelById: new Map([
        ["codex", "Codex"],
        ["claude", "Claude"],
      ]),
      providerOptions: [
        { id: "all", name: "All local AI" },
        { id: "codex", name: "Codex" },
        { id: "claude", name: "Claude" },
      ],
      sessions: [
        makeSession({
          provider: "codex",
          session_id: "same-session",
          file_path: "/tmp/codex-session.jsonl",
        }),
        makeSession({
          provider: "claude",
          session_id: "same-session",
          file_path: "/tmp/claude-session.jsonl",
        }),
      ],
    });

    const keys = groups.flatMap((group) => group.sessions.map((session) => session.key));
    expect(new Set(keys).size).toBe(2);
    expect(keys).toContain("codex::same-session");
    expect(keys).toContain("claude::same-session");
  });
});

describe("compactSearchTitle", () => {
  it("keeps full rollout-style identifiers instead of shortening them", () => {
    const hit: ConversationSearchHit = {
      provider: "codex",
      session_id: "rollout-2026-04-16T23-47-06-019d96c2-9123-7481-9127-224fad716008",
      title: "rollout-2026-04-16T23-47-06-019d96c2-9123-7481-9127-224fad716008",
      display_title: "",
      file_path:
        "/Users/example/.codex-cli/sessions/2026/04/16/rollout-2026-04-16T23-47-06-019d96c2-9123-7481-9127-224fad716008.jsonl",
      mtime: "2026-04-16T23:47:06.000Z",
      match_kind: "title",
      snippet: "rollout-2026-04-16T23-47-06-019d96c2-9123-7481-9127-224fad716008",
      role: null,
      source: "sessions",
    };

    expect(compactSearchTitle(hit)).toBe(hit.session_id);
  });
});

describe("shouldSkipHydratedInitialRecentPersistence", () => {
  it("skips re-saving the current query when the page rehydrates with the same initial search", () => {
    expect(
      shouldSkipHydratedInitialRecentPersistence({
        initialQuery: "zzzz-no-match-search-0423",
        debouncedQuery: "zzzz-no-match-search-0423",
        hydratedInitialPending: true,
      }),
    ).toBe(true);
  });

  it("does not skip once the user changes the query away from the hydrated initial value", () => {
    expect(
      shouldSkipHydratedInitialRecentPersistence({
        initialQuery: "zzzz-no-match-search-0423",
        debouncedQuery: "different-search",
        hydratedInitialPending: true,
      }),
    ).toBe(false);
  });
});
