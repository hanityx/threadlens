import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/catalog";
import {
  SEARCH_PROVIDER_STORAGE_KEY,
  SETUP_COMMITTED_STORAGE_KEY,
} from "@/shared/lib/appState";
import type { ConversationSearchEnvelope } from "@/shared/types";
import {
  SearchPanel,
  isSearchFocusShortcut,
  shouldIgnoreSearchCardKeyboardActivation,
} from "@/features/search/components/SearchPanel";
import { buildSessionHitsFailureState } from "@/features/search/model/searchPanelModel";

const mockUseInfiniteQuery = vi.fn();
const mockApiGet = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: (options: unknown) => mockUseInfiniteQuery(options),
}));

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockApiGet(...args),
}));

const messages = getMessages("en");
const jaMessages = getMessages("ja");

const providerOptions = [
  { id: "codex", name: "Codex" },
  { id: "claude", name: "Claude" },
  { id: "gemini", name: "Gemini" },
  { id: "copilot", name: "Copilot" },
];

function makeSessionEnvelope(overrides?: Partial<NonNullable<ConversationSearchEnvelope["data"]>>): ConversationSearchEnvelope {
  return {
    ok: true,
    schema_version: "2026-02-27",
    error: null,
    data: {
      sessions: [],
      searched_sessions: 0,
      available_sessions: 0,
      total_matching_sessions: 0,
      total_matching_hits: 0,
      has_more: false,
      next_cursor: null,
      ...overrides,
    },
  } as ConversationSearchEnvelope;
}

function makeInfiniteResult(
  envelope: ConversationSearchEnvelope | null = null,
  overrides?: Record<string, unknown>,
) {
  return {
    data: envelope ? { pages: [envelope], pageParams: [null] } : null,
    isLoading: false,
    isFetching: false,
    isFetchingNextPage: false,
    isError: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    ...overrides,
  };
}

describe("SearchPanel", () => {
  beforeEach(() => {
    mockUseInfiniteQuery.mockReset();
    mockApiGet.mockReset();
    mockUseInfiniteQuery.mockReturnValue(makeInfiniteResult());
    vi.unstubAllGlobals();
  });

  it("uses a real empty recent state instead of fake sample searches", () => {
    const html = renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
      />,
    );

    expect(html).toContain(messages.search.recentEmpty);
    expect(html).toContain(messages.search.allProviders);
    expect(html).not.toContain("parser health");
    expect(html).not.toContain("gemini session");
  });

  it("renders localized search guidance without leaking hardcoded English tips", () => {
    const html = renderToStaticMarkup(
      <SearchPanel
        messages={jaMessages}
        providerOptions={providerOptions}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
      />,
    );

    expect(html).toContain(jaMessages.search.title);
    expect(html).toContain(jaMessages.search.stageBody);
    expect(html).toContain(jaMessages.search.providerFilter);
    expect(html).toContain(jaMessages.search.allProviders);
    expect(html).toContain(jaMessages.search.tipsLabel);
    expect(html).toContain(jaMessages.search.shortcutsLabel);
    expect(html).toContain(jaMessages.search.recentSearches);
    expect(html).not.toContain(">tips<");
    expect(html).not.toContain(">shortcuts<");
  });

  it("accepts both lowercase and uppercase K for the focus shortcut", () => {
    expect(isSearchFocusShortcut({ key: "k", metaKey: true, ctrlKey: false })).toBe(true);
    expect(isSearchFocusShortcut({ key: "K", metaKey: true, ctrlKey: false })).toBe(true);
    expect(isSearchFocusShortcut({ key: "K", metaKey: false, ctrlKey: true })).toBe(true);
    expect(isSearchFocusShortcut({ key: "p", metaKey: true, ctrlKey: false })).toBe(false);
  });

  it("renders session-first summaries and lazy match labels for active search", () => {
    const envelope = makeSessionEnvelope({
      sessions: [
        {
          provider: "codex",
          session_id: "019d2f65-1234-5678-90ab-123456784d85",
          thread_id: "thread-1",
          title: "Cleanup flow validation session with a longer title",
          file_path: "/tmp/session.jsonl",
          source: "session.jsonl",
          mtime: "2026-03-28T00:00:00.000Z",
          match_count: 4,
          title_match_count: 0,
          best_match_kind: "message",
          preview_matches: [
            {
              provider: "codex",
              session_id: "019d2f65-1234-5678-90ab-123456784d85",
              thread_id: "thread-1",
              title: "Cleanup flow validation session with a longer title",
              file_path: "/tmp/session.jsonl",
              mtime: "2026-03-28T00:00:00.000Z",
              match_kind: "message",
              snippet: "cleanup preview token execute archive",
              role: "user",
              source: "session.jsonl",
            },
            {
              provider: "codex",
              session_id: "019d2f65-1234-5678-90ab-123456784d85",
              thread_id: "thread-1",
              title: "Cleanup flow validation session with a longer title",
              file_path: "/tmp/session.jsonl",
              mtime: "2026-03-28T00:00:00.000Z",
              match_kind: "message",
              snippet: "second matching line for expansion",
              role: "assistant",
              source: "session.jsonl",
            },
          ],
          has_more_hits: true,
        },
      ],
      searched_sessions: 12,
      available_sessions: 24,
      total_matching_sessions: 5,
      total_matching_hits: 13,
    });

    mockUseInfiniteQuery.mockReturnValue(makeInfiniteResult(envelope));

    const html = renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        sessionOpenProviderIds={["codex", "claude", "gemini", "copilot"]}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
        initialQuery="cleanup"
      />,
    );

    expect(html).toContain("5 rows");
    expect(html).toContain("13 hits");
    expect(html).toContain("019d2f65-1234-5678-90ab-123456784d85");
    expect(html).toContain('class="search-match-toggle-icon"');
    expect(html).not.toContain(messages.search.summaryDedupedLabel);
  });

  it("keeps session-hits retry state intact after a load-more failure", () => {
    expect(
      buildSessionHitsFailureState(
        {
          hits: [
            {
              provider: "codex",
              session_id: "session-1",
              thread_id: "thread-1",
              title: "Token session",
              file_path: "/tmp/session-1.jsonl",
              mtime: "2026-03-28T00:00:00.000Z",
              match_kind: "message",
              snippet: "token",
              role: "user",
              source: "session.jsonl",
            },
          ],
          loading: true,
          hasMore: true,
          nextCursor: "40",
        },
        true,
      ),
    ).toEqual({
      hits: [
        {
          provider: "codex",
          session_id: "session-1",
          thread_id: "thread-1",
          title: "Token session",
          file_path: "/tmp/session-1.jsonl",
          mtime: "2026-03-28T00:00:00.000Z",
          match_kind: "message",
          snippet: "token",
          role: "user",
          source: "session.jsonl",
        },
      ],
      loading: false,
      hasMore: true,
      nextCursor: "40",
    });
  });

  it("keeps the global scanned session count stable across loaded pages", () => {
    const firstPage = makeSessionEnvelope({
      sessions: [
        {
          provider: "codex",
          session_id: "session-1",
          thread_id: "thread-1",
          title: "First token session",
          file_path: "/tmp/session-1.jsonl",
          source: "session.jsonl",
          mtime: "2026-03-28T00:00:00.000Z",
          match_count: 1,
          title_match_count: 0,
          best_match_kind: "message",
          preview_matches: [],
          has_more_hits: false,
        },
      ],
      searched_sessions: 12,
      available_sessions: 24,
      total_matching_sessions: 5,
      total_matching_hits: 13,
      has_more: true,
      next_cursor: "40",
    });
    const secondPage = makeSessionEnvelope({
      sessions: [
        {
          provider: "claude",
          session_id: "session-2",
          thread_id: "thread-2",
          title: "Second token session",
          file_path: "/tmp/session-2.jsonl",
          source: "session.jsonl",
          mtime: "2026-03-28T00:01:00.000Z",
          match_count: 1,
          title_match_count: 0,
          best_match_kind: "message",
          preview_matches: [],
          has_more_hits: false,
        },
      ],
      searched_sessions: 12,
      available_sessions: 24,
      total_matching_sessions: 5,
      total_matching_hits: 13,
      has_more: false,
      next_cursor: null,
    });

    mockUseInfiniteQuery.mockReturnValue({
      ...makeInfiniteResult(firstPage),
      data: { pages: [firstPage, secondPage], pageParams: [null, "40"] },
      hasNextPage: false,
    });

    const html = renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        sessionOpenProviderIds={["codex", "claude", "gemini", "copilot"]}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
        initialQuery="token"
      />,
    );

    expect(html).toContain("12/24");
  });

  it("renders full session ids and full normalized sources for search result cards", () => {
    const fullSessionId = "019d2f65-1234-5678-90ab-123456784d85";
    const fullSource = "C:\\workspace\\threadlens\\sessions\\codex\\very-long-source-name.jsonl";
    const envelope = makeSessionEnvelope({
      sessions: [
        {
          provider: "codex",
          session_id: fullSessionId,
          thread_id: "thread-1",
          title: "Cleanup flow validation session with a longer title",
          file_path: "/tmp/session.jsonl",
          source: fullSource,
          mtime: "2026-03-28T00:00:00.000Z",
          match_count: 1,
          title_match_count: 0,
          best_match_kind: "message",
          preview_matches: [
            {
              provider: "codex",
              session_id: fullSessionId,
              thread_id: "thread-1",
              title: "Cleanup flow validation session with a longer title",
              file_path: "/tmp/session.jsonl",
              mtime: "2026-03-28T00:00:00.000Z",
              match_kind: "message",
              snippet: "cleanup preview token execute archive",
              role: "user",
              source: fullSource,
            },
          ],
          has_more_hits: false,
        },
      ],
      searched_sessions: 12,
      available_sessions: 24,
      total_matching_sessions: 1,
      total_matching_hits: 1,
    });

    mockUseInfiniteQuery.mockReturnValue(makeInfiniteResult(envelope));

    const html = renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        sessionOpenProviderIds={["codex", "claude", "gemini", "copilot"]}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
        initialQuery="cleanup"
      />,
    );

    expect(html).toContain(fullSessionId);
    expect(html).toContain("C:/workspace/threadlens/sessions/codex/very-long-source-name.jsonl");
  });

  it("marks the total hit summary as approximate when more result pages remain", () => {
    const envelope = makeSessionEnvelope({
      sessions: [
        {
          provider: "codex",
          session_id: "019d2f65-1234-5678-90ab-123456784d85",
          thread_id: "thread-1",
          title: "Long matching session title",
          file_path: "/tmp/session.jsonl",
          source: "session.jsonl",
          mtime: "2026-03-28T00:00:00.000Z",
          match_count: 3,
          title_match_count: 0,
          best_match_kind: "message",
          preview_matches: [],
          has_more_hits: false,
        },
      ],
      searched_sessions: 12,
      available_sessions: 24,
      total_matching_sessions: 80,
      total_matching_hits: undefined,
      has_more: true,
      next_cursor: "40",
    });

    mockUseInfiniteQuery.mockReturnValue(
      makeInfiniteResult(envelope, {
        hasNextPage: true,
      }),
    );

    const html = renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        sessionOpenProviderIds={["codex"]}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
        initialQuery="token"
      />,
    );

    expect(html).toContain("3+ hits");
  });

  it("hides the loading status pill when sessions are already visible during a refetch", () => {
    const envelope = makeSessionEnvelope({
      sessions: [
        {
          provider: "codex",
          session_id: "019d2f65-1234-5678-90ab-123456784d85",
          thread_id: "thread-1",
          title: "Cleanup flow validation session",
          file_path: "/tmp/session.jsonl",
          source: "session.jsonl",
          mtime: "2026-03-28T00:00:00.000Z",
          match_count: 1,
          title_match_count: 0,
          best_match_kind: "message",
          preview_matches: [
            {
              provider: "codex",
              session_id: "019d2f65-1234-5678-90ab-123456784d85",
              thread_id: "thread-1",
              title: "Cleanup flow validation session",
              file_path: "/tmp/session.jsonl",
              mtime: "2026-03-28T00:00:00.000Z",
              match_kind: "message",
              snippet: "cleanup preview token execute archive",
              role: "user",
              source: "session.jsonl",
            },
          ],
          has_more_hits: false,
        },
      ],
      searched_sessions: 12,
      available_sessions: 24,
      total_matching_sessions: 1,
      total_matching_hits: 1,
    });

    mockUseInfiniteQuery.mockReturnValue(
      makeInfiniteResult(envelope, {
        isFetching: true,
      }),
    );

    const html = renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        sessionOpenProviderIds={["codex", "claude", "gemini", "copilot"]}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
        initialQuery="cleanup"
      />,
    );

    expect(html).toContain("1 rows");
    expect(html).not.toContain(messages.search.loading);
  });

  it("sends explicit searchable providers when all is selected", async () => {
    mockApiGet.mockResolvedValue(null);

    renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
        initialQuery="cleanup"
      />,
    );

    const options = mockUseInfiniteQuery.mock.calls.at(-1)?.[0] as {
      queryFn: (ctx: { pageParam: string | null; signal: AbortSignal }) => Promise<unknown>;
    };
    await options.queryFn({ pageParam: null, signal: new AbortController().signal });

    expect(mockApiGet).toHaveBeenCalledWith(
      `/api/conversation-search?q=cleanup&page_size=40&preview_hits_per_session=3&provider=${encodeURIComponent("codex,claude,gemini,copilot")}`,
      { signal: expect.any(AbortSignal) },
    );
  });

  it("prefers the dedicated search key over the committed setup payload", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem(key: string) {
          if (key === SEARCH_PROVIDER_STORAGE_KEY) {
            return "codex";
          }
          if (key === SETUP_COMMITTED_STORAGE_KEY) {
            return JSON.stringify({
              selectedProviderIds: ["claude"],
              preferredProviderId: "claude",
              providerView: "claude",
              searchProvider: "claude",
            });
          }
          return null;
        },
        setItem() {
          // noop
        },
      },
      addEventListener() {},
      removeEventListener() {},
      setTimeout,
      clearTimeout,
    });

    mockApiGet.mockResolvedValue(null);

    renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
        initialQuery="cleanup"
      />,
    );

    const options = mockUseInfiniteQuery.mock.calls.at(-1)?.[0] as {
      queryFn: (ctx: { pageParam: string | null; signal: AbortSignal }) => Promise<unknown>;
    };
    await options.queryFn({ pageParam: null, signal: new AbortController().signal });

    expect(mockApiGet).toHaveBeenCalledWith(
      `/api/conversation-search?q=cleanup&page_size=40&preview_hits_per_session=3&provider=${encodeURIComponent("codex")}`,
      { signal: expect.any(AbortSignal) },
    );
  });

  it("keeps a dedicated search key sticky when setup payload is absent", async () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem(key: string) {
          if (key === SEARCH_PROVIDER_STORAGE_KEY) {
            return "codex";
          }
          return null;
        },
        setItem() {
          // noop
        },
      },
      addEventListener() {},
      removeEventListener() {},
      setTimeout,
      clearTimeout,
    });

    mockApiGet.mockResolvedValue(null);

    renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
        initialQuery="cleanup"
      />,
    );

    const options = mockUseInfiniteQuery.mock.calls.at(-1)?.[0] as {
      queryFn: (ctx: { pageParam: string | null; signal: AbortSignal }) => Promise<unknown>;
    };
    await options.queryFn({ pageParam: null, signal: new AbortController().signal });

    expect(mockApiGet).toHaveBeenCalledWith(
      `/api/conversation-search?q=cleanup&page_size=40&preview_hits_per_session=3&provider=${encodeURIComponent("codex")}`,
      { signal: expect.any(AbortSignal) },
    );
  });

  it("keeps copilot session cards openable", () => {
    const envelope = makeSessionEnvelope({
      sessions: [
        {
          provider: "copilot",
          session_id: "92e244fc-bde5-4b82-8caa-9c49bc552350",
          title: "92e244fc-bde5-4b82-8caa-9c49bc552350",
          file_path: "/tmp/copilot/92e244fc.json",
          source: "copilot.json",
          mtime: "2026-03-29T00:00:00.000Z",
          match_count: 1,
          title_match_count: 1,
          best_match_kind: "title",
          preview_matches: [
            {
              provider: "copilot",
              session_id: "92e244fc-bde5-4b82-8caa-9c49bc552350",
              title: "92e244fc-bde5-4b82-8caa-9c49bc552350",
              file_path: "/tmp/copilot/92e244fc.json",
              mtime: "2026-03-29T00:00:00.000Z",
              match_kind: "title",
              snippet: "92e244fc-bde5-4b82-8caa-9c49bc552350",
              role: null,
              source: "copilot.json",
            },
          ],
          has_more_hits: false,
        },
      ],
      searched_sessions: 3,
      available_sessions: 3,
      total_matching_sessions: 1,
      total_matching_hits: 1,
    });

    mockUseInfiniteQuery.mockReturnValue(makeInfiniteResult(envelope));

    const html = renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        sessionOpenProviderIds={["codex", "claude", "gemini", "copilot"]}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
        initialQuery="92e244fc"
      />,
    );

    expect(html).toContain('class="search-result-title-button"');
    expect(html).not.toContain("is-disabled");
    expect(html).not.toContain('aria-disabled="true"');
  });

  it("ignores card keyboard activation when the event starts from a nested button", () => {
    const article = {};
    const nestedButton = {
      closest: (selector: string) => (selector.includes("button") ? {} : null),
    };

    expect(
      shouldIgnoreSearchCardKeyboardActivation({
        currentTarget: article as HTMLElement,
        target: nestedButton as unknown as EventTarget,
      }),
    ).toBe(true);
  });
});
