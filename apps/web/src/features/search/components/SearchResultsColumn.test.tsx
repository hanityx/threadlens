import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/catalog";
import type { SearchProviderGroup } from "@/features/search/model/searchPanelModel";
import { SearchResultsColumn } from "@/features/search/components/SearchResultsColumn";

const messages = getMessages("en");

function makeProviderGroup(overrides?: Partial<SearchProviderGroup>): SearchProviderGroup {
  return {
    id: "codex",
    name: "Codex",
    matchCount: 4,
    hasApproximateHits: true,
    sessions: [
      {
        key: "session-1",
        result: {
          provider: "codex",
          session_id: "019d2f65-1234-5678-90ab-123456784d85",
          thread_id: "thread-1",
          title: "Cleanup flow validation session",
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
              title: "Cleanup flow validation session",
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
              title: "Cleanup flow validation session",
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
        openHit: {
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
        title: "Cleanup flow validation session",
        source: "/tmp/session.jsonl",
        hasMoreHits: true,
        matches: [
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
          {
            provider: "codex",
            session_id: "019d2f65-1234-5678-90ab-123456784d85",
            thread_id: "thread-1",
            title: "Cleanup flow validation session",
            file_path: "/tmp/session.jsonl",
            mtime: "2026-03-28T00:00:00.000Z",
            match_kind: "message",
            snippet: "second matching line for expansion",
            role: "assistant",
            source: "session.jsonl",
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("SearchResultsColumn", () => {
  it("renders session-first summary counts and lazy match labels", () => {
    const html = renderToStaticMarkup(
      <SearchResultsColumn
        messages={messages}
        searchEnabled
        summarySessionCount={3}
        summaryHitCount={9}
        loadedSessionCount={1}
        searchedSessions={3}
        availableSessions={12}
        statusText={null}
        showLiveLoading={false}
        showLoadingSkeleton={false}
      providerGroups={[makeProviderGroup()]}
        providerLabelById={new Map([["codex", "Codex"]])}
        expandedSessions={new Set()}
        activeSessionKey={null}
        sessionOpenProviderIds={["codex"]}
        sessionHitsBySession={{}}
        hasNextPage
        isFetchingNextPage={false}
        loadMoreRef={{ current: null }}
        onLoadMoreResults={vi.fn()}
        onLoadSessionHits={vi.fn()}
        setActiveSessionKey={vi.fn()}
        setExpandedSessions={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenThread={vi.fn()}
      />,
    );

    expect(html).toContain("3 rows");
    expect(html).toContain("9 hits");
    expect(html).toContain(">+2 more<");
    expect(html).toContain(">+2 more<");
  });

  it("shows only the loading state before the first search result arrives", () => {
    const html = renderToStaticMarkup(
      <SearchResultsColumn
        messages={messages}
        searchEnabled
        summarySessionCount={0}
        summaryHitCount={0}
        loadedSessionCount={0}
        searchedSessions={0}
        availableSessions={0}
        statusText={messages.search.loading}
        showLiveLoading
        showLoadingSkeleton
        providerGroups={[]}
        providerLabelById={new Map()}
        expandedSessions={new Set()}
        activeSessionKey={null}
        sessionOpenProviderIds={["codex"]}
        sessionHitsBySession={{}}
        hasNextPage={false}
        isFetchingNextPage={false}
        loadMoreRef={{ current: null }}
        onLoadMoreResults={vi.fn()}
        onLoadSessionHits={vi.fn()}
        setActiveSessionKey={vi.fn()}
        setExpandedSessions={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenThread={vi.fn()}
      />,
    );

    expect(html).toContain(messages.search.loading);
    expect(html).not.toContain("0 rows");
    expect(html).not.toContain("0/0");
    expect(html).not.toContain("0 hits");
  });

  it("renders the session title as an open button and keeps cleanup action separate", () => {
    const html = renderToStaticMarkup(
      <SearchResultsColumn
        messages={messages}
        searchEnabled
        summarySessionCount={1}
        summaryHitCount={4}
        loadedSessionCount={1}
        searchedSessions={1}
        availableSessions={1}
        statusText={null}
        showLiveLoading={false}
        showLoadingSkeleton={false}
        providerGroups={[makeProviderGroup()]}
        providerLabelById={new Map([["codex", "Codex"]])}
        expandedSessions={new Set()}
        activeSessionKey={null}
        sessionOpenProviderIds={["codex"]}
        sessionHitsBySession={{}}
        setActiveSessionKey={vi.fn()}
        setExpandedSessions={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenThread={vi.fn()}
      />,
    );

    expect(html).toContain('class="search-result-title-button"');
    expect(html).toContain(messages.search.openThread);
    expect(html).not.toContain(messages.search.openSession);
  });

  it("hides the secondary session id row when the title already equals the full session id", () => {
    const fullSessionId = "92e244fc-bde5-4b82-8caa-9c49bc552350";
    const html = renderToStaticMarkup(
      <SearchResultsColumn
        messages={messages}
        searchEnabled
        summarySessionCount={1}
        summaryHitCount={1}
        loadedSessionCount={1}
        searchedSessions={1}
        availableSessions={1}
        statusText={null}
        showLiveLoading={false}
        showLoadingSkeleton={false}
        providerGroups={[
          makeProviderGroup({
            sessions: [
              {
                ...makeProviderGroup().sessions[0],
                result: {
                  ...makeProviderGroup().sessions[0].result,
                  session_id: fullSessionId,
                  title: fullSessionId,
                  preview_matches: [
                    {
                      ...makeProviderGroup().sessions[0].matches[0],
                      session_id: fullSessionId,
                      title: fullSessionId,
                    },
                  ],
                  has_more_hits: false,
                  match_count: 1,
                },
                openHit: {
                  ...makeProviderGroup().sessions[0].openHit,
                  session_id: fullSessionId,
                  title: fullSessionId,
                },
                title: fullSessionId,
                matches: [
                  {
                    ...makeProviderGroup().sessions[0].matches[0],
                    session_id: fullSessionId,
                    title: fullSessionId,
                  },
                ],
              },
            ],
          }),
        ]}
        providerLabelById={new Map([["codex", "Codex"]])}
        expandedSessions={new Set()}
        activeSessionKey={null}
        sessionOpenProviderIds={["codex"]}
        sessionHitsBySession={{}}
        setActiveSessionKey={vi.fn()}
        setExpandedSessions={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenThread={vi.fn()}
      />,
    );

    expect(html).toContain(fullSessionId);
    expect(html).not.toContain('class="search-result-session-id-row"');
  });

  it("renders the first-row icon toggle and keeps load-more below the match list", () => {
    const html = renderToStaticMarkup(
      <SearchResultsColumn
        messages={messages}
        searchEnabled
        summarySessionCount={1}
        summaryHitCount={4}
        loadedSessionCount={1}
        searchedSessions={1}
        availableSessions={1}
        statusText={null}
        showLiveLoading={false}
        showLoadingSkeleton={false}
        providerGroups={[makeProviderGroup()]}
        providerLabelById={new Map([["codex", "Codex"]])}
        expandedSessions={new Set()}
        activeSessionKey={null}
        sessionOpenProviderIds={["codex"]}
        sessionHitsBySession={{}}
        setActiveSessionKey={vi.fn()}
        setExpandedSessions={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenThread={vi.fn()}
      />,
    );

    expect(html).toContain('class="search-match-head"');
    expect(html).toContain('class="search-match-role search-match-role-toggle"');
    expect(html).toContain('class="search-match-toggle-icon"');
    expect(html).toContain('class="search-match-footer"');
    expect(html).not.toContain('class="search-match-more"');
  });

  it("keeps the toggle in the first row and makes the expanded match list scrollable", () => {
    const html = renderToStaticMarkup(
      <SearchResultsColumn
        messages={messages}
        searchEnabled
        summarySessionCount={1}
        summaryHitCount={6}
        loadedSessionCount={1}
        searchedSessions={1}
        availableSessions={1}
        statusText={null}
        showLiveLoading={false}
        showLoadingSkeleton={false}
        providerGroups={[makeProviderGroup()]}
        providerLabelById={new Map([["codex", "Codex"]])}
        expandedSessions={new Set(["session-1"])}
        activeSessionKey={null}
        sessionOpenProviderIds={["codex"]}
        sessionHitsBySession={{
          "session-1": {
            hits: [
              ...makeProviderGroup().sessions[0].matches,
              {
                ...makeProviderGroup().sessions[0].matches[0],
                snippet: "extra match from source",
              },
            ],
            loading: false,
            hasMore: false,
          },
        }}
        setActiveSessionKey={vi.fn()}
        setExpandedSessions={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenThread={vi.fn()}
      />,
    );

    expect(html).toContain('class="search-match-toggle-icon"');
    expect(html).toContain(`aria-label="${messages.search.collapseMatches}"`);
    expect(html).toContain('class="search-match-list is-expanded is-scrollable"');
    expect(html).toContain('class="search-match-more is-disabled"');
  });

  it("does not expose the outer result card as a button role when nested actions exist", () => {
    const html = renderToStaticMarkup(
      <SearchResultsColumn
        messages={messages}
        searchEnabled
        summarySessionCount={1}
        summaryHitCount={4}
        loadedSessionCount={1}
        searchedSessions={1}
        availableSessions={1}
        statusText={null}
        showLiveLoading={false}
        showLoadingSkeleton={false}
        providerGroups={[makeProviderGroup()]}
        providerLabelById={new Map([["codex", "Codex"]])}
        expandedSessions={new Set()}
        activeSessionKey={null}
        sessionOpenProviderIds={["codex"]}
        sessionHitsBySession={{}}
        setActiveSessionKey={vi.fn()}
        setExpandedSessions={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenThread={vi.fn()}
      />,
    );

    expect(html).not.toContain('role="button"');
    expect(html).toContain('class="search-result-title-button"');
  });

  it("hides the source load-more footer once an expanded session has no remaining source hits", () => {
    const html = renderToStaticMarkup(
      <SearchResultsColumn
        messages={messages}
        searchEnabled
        summarySessionCount={1}
        summaryHitCount={6}
        loadedSessionCount={1}
        searchedSessions={1}
        availableSessions={1}
        statusText={null}
        showLiveLoading={false}
        showLoadingSkeleton={false}
        providerGroups={[makeProviderGroup({
          sessions: [
            {
              ...makeProviderGroup().sessions[0],
              result: {
                ...makeProviderGroup().sessions[0].result,
                has_more_hits: false,
              },
            },
          ],
        })]}
        providerLabelById={new Map([["codex", "Codex"]])}
        expandedSessions={new Set(["session-1"])}
        activeSessionKey={"session-1"}
        sessionOpenProviderIds={["codex"]}
        sessionHitsBySession={{
          "session-1": {
            hits: makeProviderGroup().sessions[0].matches,
            loading: false,
            hasMore: false,
          },
        }}
        setActiveSessionKey={vi.fn()}
        setExpandedSessions={vi.fn()}
        onLoadSessionHits={vi.fn()}
        onOpenSession={vi.fn()}
        onOpenThread={vi.fn()}
      />,
    );

    expect(html).not.toContain('class="search-match-footer"');
    expect(html).not.toContain(">Load more from source<");
  });
});
