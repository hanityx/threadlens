import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "../../i18n";
import type { ConversationSearchEnvelope } from "../../types";
import { SearchPanel, isSearchFocusShortcut, shouldIgnoreSearchCardKeyboardActivation } from "./SearchPanel";

const mockUseQuery = vi.fn();
const mockApiGet = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

vi.mock("../../api", () => ({
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

describe("SearchPanel", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockApiGet.mockReset();
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      isFetching: false,
      isError: false,
    });
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

    expect(html).toContain("Search");
    expect(html).toContain(jaMessages.search.stageBody);
    expect(html).toContain(jaMessages.search.providerFilter);
    expect(html).toContain(jaMessages.search.allProviders);
    expect(html).toContain(jaMessages.search.tipsLabel);
    expect(html).toContain(jaMessages.search.shortcutsLabel);
    expect(html).toContain(jaMessages.search.recentSearches);
    expect(html).toContain(jaMessages.search.recentEmpty);
    expect(html).not.toContain(">tips<");
    expect(html).not.toContain(">shortcuts<");
    expect(html).not.toContain(">idle<");
  });

  it("accepts both lowercase and uppercase K for the focus shortcut", () => {
    expect(isSearchFocusShortcut({ key: "k", metaKey: true, ctrlKey: false })).toBe(true);
    expect(isSearchFocusShortcut({ key: "K", metaKey: true, ctrlKey: false })).toBe(true);
    expect(isSearchFocusShortcut({ key: "K", metaKey: false, ctrlKey: true })).toBe(true);
    expect(isSearchFocusShortcut({ key: "p", metaKey: true, ctrlKey: false })).toBe(false);
  });

  it("keeps guidance visible and removes duplicate open-session actions when a query is active", () => {
    const envelope = {
      ok: true,
      schema_version: "2026-02-27",
      error: null,
      data: {
        results: [
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
        ],
        searched_sessions: 12,
        available_sessions: 24,
      },
    } as ConversationSearchEnvelope;

    mockUseQuery.mockReturnValue({
      data: envelope,
      isLoading: false,
      isFetching: false,
      isError: false,
    });

    const html = renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
        initialQuery="cleanup"
      />,
    );

    expect(html).toContain(messages.search.recentSearches);
    expect(html).toContain("shortcuts");
    expect(html).toContain("tips");
    expect(html).not.toContain(messages.search.openSession);
    expect(html).toContain(messages.search.openThread);
    expect(html).toContain("019d2f65");
    expect(html).toContain("matches");
  });

  it("renders localized result summaries and actions for active search", () => {
    const envelope = {
      ok: true,
      schema_version: "2026-02-27",
      error: null,
      data: {
        results: [
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
        ],
        searched_sessions: 12,
        available_sessions: 24,
      },
    } as ConversationSearchEnvelope;

    mockUseQuery.mockReturnValue({
      data: envelope,
      isLoading: false,
      isFetching: false,
      isError: false,
    });

    const html = renderToStaticMarkup(
      <SearchPanel
        messages={jaMessages}
        providerOptions={providerOptions}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
        initialQuery="cleanup"
      />,
    );

    expect(html).toContain(jaMessages.search.summaryMatchesLabel);
    expect(html).toContain(jaMessages.search.summaryScannedLabel);
    expect(html).toContain(jaMessages.search.providerHits);
    expect(html).toContain(jaMessages.search.summaryMessagesLabel);
    expect(html).toContain(jaMessages.search.openThread);
    expect(html).toContain(jaMessages.transcript.roleUser);
  });

  it("hides the loading status pill when results are already visible during a refetch", () => {
    const envelope = {
      ok: true,
      schema_version: "2026-02-27",
      error: null,
      data: {
        results: [
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
        ],
        searched_sessions: 12,
        available_sessions: 24,
      },
    } as ConversationSearchEnvelope;

    mockUseQuery.mockReturnValue({
      data: envelope,
      isLoading: false,
      isFetching: true,
      isError: false,
    });

    const html = renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
        initialQuery="cleanup"
      />,
    );

    expect(html).toContain("matches");
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

    const options = mockUseQuery.mock.calls.at(-1)?.[0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };
    await options.queryFn({ signal: new AbortController().signal });

    expect(mockApiGet).toHaveBeenCalledWith(
      `/api/conversation-search?q=cleanup&limit=120&provider=${encodeURIComponent("codex,claude,gemini,copilot")}`,
      { signal: expect.any(AbortSignal) },
    );
  });

  it("does not render a ChatGPT search scope once raw hits are no longer openable", () => {
    const html = renderToStaticMarkup(
      <SearchPanel
        messages={messages}
        providerOptions={providerOptions}
        onOpenSession={() => undefined}
        onOpenThread={() => undefined}
      />,
    );

    expect(html).toContain("Codex");
    expect(html).not.toContain("ChatGPT");
  });

  it("keeps copilot session cards openable", () => {
    const envelope = {
      ok: true,
      schema_version: "2026-02-27",
      error: null,
      data: {
        results: [
          {
            provider: "copilot",
            session_id: "92e244fc-bde5-4b82-8caa-9c49bc552350",
            title: "92e244fc…2350",
            file_path: "/tmp/copilot/92e244fc.json",
            mtime: "2026-03-29T00:00:00.000Z",
            match_kind: "title",
            snippet: "92e244fc…2350",
            role: null,
            source: "copilot.json",
          },
        ],
        searched_sessions: 3,
        available_sessions: 3,
      },
    } as ConversationSearchEnvelope;

    mockUseQuery.mockReturnValue({
      data: envelope,
      isLoading: false,
      isFetching: false,
      isError: false,
    });

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

    expect(html).toContain('tabindex="0"');
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
