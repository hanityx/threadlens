import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "../../i18n";
import type { ConversationSearchEnvelope } from "../../types";
import { SearchPanel } from "./SearchPanel";

const mockUseQuery = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mockUseQuery(options),
}));

const messages = getMessages("en");

const providerOptions = [
  { id: "all", name: "All core AI" },
  { id: "codex", name: "Codex" },
];

describe("SearchPanel", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
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
    expect(html).not.toContain("parser health");
    expect(html).not.toContain("gemini session");
  });

  it("collapses guidance and removes duplicate open-session actions when a query is active", () => {
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

    expect(html).not.toContain(messages.search.recentSearches);
    expect(html).not.toContain(messages.search.openSession);
    expect(html).toContain(messages.search.openThread);
    expect(html).toContain("019d2f65");
    expect(html).toContain("matches");
  });
});
