import { describe, expect, it, vi } from "vitest";
import { searchConversationSessions } from "./index.js";
import { makeRow, makeTranscript } from "./test-fixtures.js";

describe("searchConversationSessions", () => {
  it("collapses duplicate logical sessions across backup copies", async () => {
    const liveRow = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-duplicate",
      display_title: "Duplicate token session",
      file_path: "/tmp/search-duplicate-live.jsonl",
      source: "sessions",
      mtime: "2026-03-25T10:10:00.000Z",
    });
    const backupRow = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-duplicate",
      display_title: "Duplicate token session",
      file_path: "/tmp/search-duplicate-backup.jsonl",
      source: "cleanup_backups",
      mtime: "2026-03-25T10:11:00.000Z",
    });

    const result = await searchConversationSessions([liveRow, backupRow], "token", {
      pageSize: 10,
      previewHitsPerSession: 2,
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      session_id: "search-duplicate-live",
      source: "sessions",
    });
  });

  it("keeps distinct matching sessions even when one session has many hits", async () => {
    const dominantRow = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-dominant",
      display_title: "Dominant token session",
      file_path: "/tmp/search-dominant.jsonl",
      mtime: "2026-03-25T10:10:00.000Z",
    });
    const secondaryRow = makeRow({
      session_id: "rollout-2026-03-25T09-00-00-019d-secondary",
      display_title: "Secondary token session",
      file_path: "/tmp/search-secondary.jsonl",
      mtime: "2026-03-25T09:00:00.000Z",
    });
    const transcriptLoader = vi.fn(async (_provider, filePath) => {
      if (filePath === dominantRow.file_path) {
        return makeTranscript(dominantRow, [
          {
            idx: 0,
            role: "assistant",
            text: "token dominant match one",
            ts: "2026-03-25T10:00:00.000Z",
            source_type: "response_item.message",
          },
          {
            idx: 1,
            role: "assistant",
            text: "token dominant match two",
            ts: "2026-03-25T10:00:01.000Z",
            source_type: "response_item.message",
          },
          {
            idx: 2,
            role: "assistant",
            text: "token dominant match three",
            ts: "2026-03-25T10:00:02.000Z",
            source_type: "response_item.message",
          },
        ]);
      }
      return makeTranscript(secondaryRow, [
        {
          idx: 0,
          role: "user",
          text: "token secondary match",
          ts: "2026-03-25T09:00:00.000Z",
          source_type: "response_item.message",
        },
      ]);
    });

    const result = await searchConversationSessions(
      [dominantRow, secondaryRow],
      "token",
      {
        pageSize: 10,
        previewHitsPerSession: 2,
        transcriptLoader,
      },
    );

    expect(result.total_matching_sessions).toBe(2);
    expect(result.total_matching_hits).toBeNull();
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions[0]).toMatchObject({
      session_id: "search-dominant",
      match_count: 3,
      has_more_hits: true,
    });
    expect(result.sessions[0]?.preview_matches).toHaveLength(2);
    expect(result.sessions[1]).toMatchObject({
      session_id: "search-secondary",
      match_count: 2,
      has_more_hits: false,
    });
    expect(result.results).toHaveLength(4);
  });

  it("keeps the full session id as the fallback title when no detected title exists", async () => {
    const sessionId = "rollout-2026-04-16T23-47-06-019d96c2-9123-7481-9127-224fad716008";
    const row = makeRow({
      session_id: sessionId,
      display_title: "",
      file_path: `/tmp/${sessionId}.jsonl`,
      probe: {
        ok: true,
        format: "jsonl",
        error: null,
        detected_title: "",
        title_source: null,
      },
    });
    const rawFileSearchLoader = vi.fn(async () =>
      new Map([
        [
          row.file_path,
          {
            snippets: ["token preview one"],
            match_count: 1,
            has_more_hits: false,
            exact_phrase_count: 1,
          },
        ],
      ]),
    );
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "token from parsed transcript",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );

    const result = await searchConversationSessions([row], "token", {
      pageSize: 10,
      previewHitsPerSession: 3,
      transcriptLoader,
      rawFileSearchLoader,
    });

    expect(result.sessions[0]?.title).toBe(sessionId);
  });

  it("paginates session results with a stable next cursor", async () => {
    const rows = [
      makeRow({
        session_id: "rollout-2026-03-25T10-00-00-019d-alpha",
        display_title: "alpha token",
        file_path: "/tmp/search-alpha.jsonl",
        mtime: "2026-03-25T10:00:00.000Z",
      }),
      makeRow({
        session_id: "rollout-2026-03-25T09-00-00-019d-bravo",
        display_title: "bravo token",
        file_path: "/tmp/search-bravo.jsonl",
        mtime: "2026-03-25T09:00:00.000Z",
      }),
      makeRow({
        session_id: "rollout-2026-03-25T08-00-00-019d-charlie",
        display_title: "charlie token",
        file_path: "/tmp/search-charlie.jsonl",
        mtime: "2026-03-25T08:00:00.000Z",
      }),
    ];

    const page1 = await searchConversationSessions(rows, "token", {
      pageSize: 2,
      previewHitsPerSession: 1,
    });
    const page2 = await searchConversationSessions(rows, "token", {
      pageSize: 2,
      cursor: page1.next_cursor ?? undefined,
      previewHitsPerSession: 1,
    });

    expect(page1.sessions).toHaveLength(2);
    expect(page1.has_more).toBe(true);
    expect(page1.truncated).toBe(false);
    expect(page1.next_cursor).toBe("2");
    expect(page1.total_matching_sessions).toBe(3);
    expect(page1.total_matching_hits).toBeNull();
    expect(page2.sessions).toHaveLength(1);
    expect(page2.has_more).toBe(false);
    expect(page2.truncated).toBe(false);
    expect(page2.next_cursor).toBeNull();
    expect(page2.total_matching_sessions).toBe(3);
    expect(page2.total_matching_hits).toBeNull();
  });

  it("orders pages by global session quality before applying the cursor", async () => {
    const newerWeakRow = makeRow({
      session_id: "rollout-2026-03-25T11-00-00-019d-newer-weak",
      display_title: "recent chat",
      file_path: "/tmp/search-newer-weak.jsonl",
      mtime: "2026-03-25T11:00:00.000Z",
    });
    const middleWeakRow = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-middle-weak",
      display_title: "middle chat",
      file_path: "/tmp/search-middle-weak.jsonl",
      mtime: "2026-03-25T10:00:00.000Z",
    });
    const olderStrongRow = makeRow({
      session_id: "rollout-2026-03-25T09-00-00-019d-older-strong",
      display_title: "token in title",
      file_path: "/tmp/search-older-strong.jsonl",
      mtime: "2026-03-25T09:00:00.000Z",
    });
    const rawFileSearchLoader = vi.fn(async () =>
      new Map([
        [
          newerWeakRow.file_path,
          {
            snippets: ["token weak recent"],
            match_count: 1,
            has_more_hits: false,
            exact_phrase_count: 0,
          },
        ],
        [
          middleWeakRow.file_path,
          {
            snippets: ["token weak middle"],
            match_count: 1,
            has_more_hits: false,
            exact_phrase_count: 0,
          },
        ],
      ]),
    );
    const transcriptLoader = vi.fn(async (_provider, filePath) => {
      const row =
        [newerWeakRow, middleWeakRow, olderStrongRow].find((item) => item.file_path === filePath) ??
        newerWeakRow;
      return makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: `token transcript hit for ${row.session_id}`,
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]);
    });

    const page1 = await searchConversationSessions(
      [newerWeakRow, middleWeakRow, olderStrongRow],
      "token",
      {
        pageSize: 1,
        previewHitsPerSession: 1,
        transcriptLoader,
        rawFileSearchLoader,
      },
    );
    const page2 = await searchConversationSessions(
      [newerWeakRow, middleWeakRow, olderStrongRow],
      "token",
      {
        pageSize: 1,
        cursor: page1.next_cursor ?? undefined,
        previewHitsPerSession: 1,
        transcriptLoader,
        rawFileSearchLoader,
      },
    );

    expect(page1.sessions[0]?.session_id).toBe("search-older-strong");
    expect(page1.total_matching_sessions).toBe(3);
    expect(page2.sessions[0]?.session_id).not.toBe("search-older-strong");
  });

  it("uses raw file hits as a prefilter but builds previews from parsed transcripts", async () => {
    const row = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-raw-preview",
      display_title: "Raw preview token session",
      file_path: "/tmp/search-raw-preview.jsonl",
      mtime: "2026-03-25T10:00:00.000Z",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "token from parsed transcript",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );
    const rawFileSearchLoader = vi.fn(async () =>
      new Map([
        [
          row.file_path,
          {
            snippets: [
              "token preview one",
              "token preview two",
              "token preview three",
            ],
            match_count: 4,
            has_more_hits: true,
            exact_phrase_count: 2,
          },
        ],
      ]),
    );

    const result = await searchConversationSessions([row], "token", {
      pageSize: 10,
      previewHitsPerSession: 3,
      transcriptLoader,
      rawFileSearchLoader,
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      session_id: "search-raw-preview",
      match_count: 2,
      has_more_hits: false,
    });
    expect(result.sessions[0]?.preview_matches.map((match) => match.snippet)).toEqual([
      "Raw preview token session",
      "token from parsed transcript",
    ]);
    expect(transcriptLoader).toHaveBeenCalledTimes(1);
    expect(rawFileSearchLoader).toHaveBeenCalledTimes(1);
  });

  it("does not expose raw matches from system or policy transcript messages", async () => {
    const row = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-policy-only",
      display_title: "Policy only session",
      file_path: "/tmp/search-policy-only.jsonl",
      mtime: "2026-03-25T10:00:00.000Z",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "system",
          text: "token from system instructions",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
        {
          idx: 1,
          role: "assistant",
          text: "# AGENTS.md instructions for token handling",
          ts: "2026-03-25T10:00:01.000Z",
          source_type: "response_item.message",
        },
      ]),
    );
    const rawFileSearchLoader = vi.fn(async () =>
      new Map([
        [
          row.file_path,
          {
            snippets: ["token raw system preview"],
            match_count: 1,
            has_more_hits: false,
            exact_phrase_count: 0,
          },
        ],
      ]),
    );

    const result = await searchConversationSessions([row], "token", {
      pageSize: 10,
      previewHitsPerSession: 3,
      transcriptLoader,
      rawFileSearchLoader,
    });

    expect(result.sessions).toHaveLength(0);
    expect(transcriptLoader).toHaveBeenCalledTimes(1);
    expect(rawFileSearchLoader).toHaveBeenCalledTimes(1);
  });

  it("skips transcript parsing for raw-search-eligible rows when ripgrep found no match", async () => {
    const row = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-no-match",
      display_title: "No raw match session",
      file_path: "/tmp/search-no-match.jsonl",
      mtime: "2026-03-25T10:00:00.000Z",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "token would only appear if transcript parsing ran",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );
    const rawFileSearchLoader = vi.fn(async () => new Map());

    const result = await searchConversationSessions([row], "token", {
      pageSize: 10,
      previewHitsPerSession: 3,
      transcriptLoader,
      rawFileSearchLoader,
    });

    expect(result.sessions).toHaveLength(0);
    expect(transcriptLoader).not.toHaveBeenCalled();
    expect(rawFileSearchLoader).toHaveBeenCalledTimes(1);
  });

  it("falls back to transcript parsing when raw file search fails unexpectedly", async () => {
    const row = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-raw-failure",
      display_title: "Raw loader failure session",
      file_path: "/tmp/search-raw-failure.jsonl",
      mtime: "2026-03-25T10:00:00.000Z",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "token fallback transcript hit",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );
    const rawFileSearchLoader = vi.fn(async () => {
      throw new Error("rg blew up");
    });

    const result = await searchConversationSessions([row], "token", {
      pageSize: 10,
      previewHitsPerSession: 3,
      transcriptLoader,
      rawFileSearchLoader,
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.session_id).toBe("search-raw-failure");
    expect(transcriptLoader).toHaveBeenCalledTimes(1);
    expect(rawFileSearchLoader).toHaveBeenCalledTimes(1);
  });
});
