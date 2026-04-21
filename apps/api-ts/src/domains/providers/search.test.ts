import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { SEARCHABLE_PROVIDER_IDS } from "@threadlens/shared-contracts";
import { describe, expect, it, vi } from "vitest";
import type {
  ProviderSessionRow,
  TranscriptPayload,
} from "../../lib/providers.js";
import {
  buildConversationSearchProviderBudgets,
  createCachedConversationTranscriptLoader,
  defaultConversationSearchProviders,
  isMetadataOnlyConversationQuery,
  resolveConversationSearchLimits,
  searchConversationSessionHits,
  searchConversationSessions,
  searchConversationRows,
  selectConversationSessionHitsRow,
} from "./search.js";

function makeRow(overrides: Partial<ProviderSessionRow> = {}): ProviderSessionRow {
  return {
    provider: "codex",
    source: "sessions",
    session_id: "rollout-2026-03-25T10-00-00-019d-search-test",
    display_title: "Search fixture",
    file_path: "/tmp/search-fixture.jsonl",
    size_bytes: 128,
    mtime: "2026-03-25T10:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Search fixture",
      title_source: "fixture",
    },
    ...overrides,
  };
}

function makeTranscript(
  row: ProviderSessionRow,
  messages: TranscriptPayload["messages"],
): TranscriptPayload {
  return {
    provider: row.provider,
    thread_id: "019d-search-test-thread",
    file_path: row.file_path,
    scanned_lines: messages.length,
    message_count: messages.length,
    truncated: false,
    messages,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitForCondition(
  predicate: () => boolean,
  label: string,
  attempts = 100,
) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`timed out waiting for ${label}`);
}

describe("searchConversationRows", () => {
  it("returns metadata matches without loading transcripts when the limit is satisfied", async () => {
    const row = makeRow({
      display_title: "Unrelated title",
      session_id: "rollout-2026-03-25T10-00-00-019d-chatgpt-scope",
      file_path: "/tmp/chatgpt-scope.jsonl",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "chatgpt only in transcript",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );

    const result = await searchConversationRows([row], "chatgpt", {
      limit: 1,
      transcriptLoader,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      match_kind: "title",
      session_id: "chatgpt-scope",
    });
    expect(transcriptLoader).not.toHaveBeenCalled();
  });

  it("stops before loading later transcripts once metadata hits fill the result limit", async () => {
    const metadataRow = makeRow({
      display_title: "Unrelated title",
      session_id: "rollout-2026-03-25T10-00-00-019d-obsidian-review",
      file_path: "/tmp/obsidian-review.jsonl",
      mtime: "2026-03-25T10:05:00.000Z",
    });
    const transcriptRow = makeRow({
      display_title: "Another unrelated title",
      session_id: "rollout-2026-03-25T10-00-00-019d-transcript-only",
      file_path: "/tmp/transcript-only.jsonl",
      mtime: "2026-03-25T10:00:00.000Z",
    });
    const transcriptLoader = vi.fn(async (_provider, filePath) =>
      makeTranscript(
        filePath === metadataRow.file_path ? metadataRow : transcriptRow,
        [
          {
            idx: 0,
            role: "assistant",
            text: "obsidian transcript fallback",
            ts: "2026-03-25T10:00:00.000Z",
            source_type: "response_item.message",
          },
        ],
      ),
    );

    const result = await searchConversationRows(
      [metadataRow, transcriptRow],
      "obsidian",
      {
        limit: 1,
        transcriptLoader,
      },
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      match_kind: "title",
      session_id: "obsidian-review",
    });
    expect(transcriptLoader).not.toHaveBeenCalled();
  });

  it("suppresses exact duplicate message hits within the same session", async () => {
    const row = makeRow({
      display_title: "Unrelated title",
      file_path: "/tmp/search-dedup-case.jsonl",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "user",
          text: "agent duplicate result",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
        {
          idx: 1,
          role: "user",
          text: "agent duplicate result",
          ts: "2026-03-25T10:00:01.000Z",
          source_type: "event_msg.user_message",
        },
      ]),
    );

    const result = await searchConversationRows([row], "agent", {
      limit: 40,
      transcriptLoader,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      match_kind: "message",
      role: "user",
    });
  });

  it("falls back to transcript scanning when metadata matches are insufficient", async () => {
    const row = makeRow({
      display_title: "Unrelated title",
      file_path: "/tmp/search-transcript-case.jsonl",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "search fallback hit",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );

    const result = await searchConversationRows([row], "fallback", {
      limit: 5,
      transcriptLoader,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      match_kind: "message",
      role: "assistant",
    });
    expect(transcriptLoader).toHaveBeenCalledTimes(1);
  });

  it("skips transcript scanning entirely for metadata-only queries", async () => {
    const row = makeRow({
      display_title: "Unrelated title",
      session_id: "rollout-2026-03-25T10-00-00-019d-rollout-query",
      file_path: "/tmp/rollout-2026-03-25T10-00-00-019d-rollout-query.jsonl",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "rollout token only in transcript",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );

    const result = await searchConversationRows([row], "rollout-2026-03-25", {
      limit: 10,
      transcriptLoader,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      match_kind: "title",
      session_id: "rollout-2026-03-25T10-00-00-019d-rollout-query",
    });
    expect(transcriptLoader).not.toHaveBeenCalled();
  });

  it("omits cleanup thread ids that are not openable in the current thread read model", async () => {
    const row = makeRow({
      session_id: "rollout-2026-03-29T01-53-21-019d355d-51c3-7753-b2f2-8db585337e41",
      file_path:
        "/tmp/rollout-2026-03-29T01-53-21-019d355d-51c3-7753-b2f2-8db585337e41.jsonl",
      display_title: "ThreadLens handoff",
    });

    const result = await searchConversationRows([row], "handoff", {
      limit: 10,
      openableThreadIds: new Set(),
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      provider: "codex",
      session_id: "rollout-2026-03-29T01-53-21-019d355d-51c3-7753-b2f2-8db585337e41",
      match_kind: "title",
    });
    expect(result.results[0].thread_id).toBeUndefined();
  });

  it("keeps cleanup thread ids when they are openable in the current thread read model", async () => {
    const threadId = "019d355d-51c3-7753-b2f2-8db585337e41";
    const row = makeRow({
      session_id: `rollout-2026-03-29T01-53-21-${threadId}`,
      file_path: `/tmp/rollout-2026-03-29T01-53-21-${threadId}.jsonl`,
      display_title: "ThreadLens handoff",
    });

    const result = await searchConversationRows([row], "handoff", {
      limit: 10,
      openableThreadIds: new Set([threadId]),
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      provider: "codex",
      thread_id: threadId,
      match_kind: "title",
    });
  });
});

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

    const result = await searchConversationSessions([row], "token", {
      pageSize: 10,
      previewHitsPerSession: 3,
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

    const page1 = await searchConversationSessions(
      [newerWeakRow, middleWeakRow, olderStrongRow],
      "token",
      {
        pageSize: 1,
        previewHitsPerSession: 1,
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
        rawFileSearchLoader,
      },
    );

    expect(page1.sessions[0]?.session_id).toBe("search-older-strong");
    expect(page1.total_matching_sessions).toBe(3);
    expect(page2.sessions[0]?.session_id).not.toBe("search-older-strong");
  });

  it("uses raw file previews for session pages without loading full transcripts", async () => {
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
          text: "token hidden in transcript parser",
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
      match_count: 4,
      has_more_hits: true,
    });
    expect(result.sessions[0]?.preview_matches.map((match) => match.snippet)).toEqual([
      "Raw preview token session",
      "token preview one",
      "token preview two",
    ]);
    expect(transcriptLoader).not.toHaveBeenCalled();
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

describe("searchConversationSessionHits", () => {
  it("prefers the explicit file path when duplicate logical session ids exist", () => {
    const liveRow = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-duplicate-hits",
      file_path: "/tmp/search-hits-live.jsonl",
      source: "sessions",
      mtime: "2026-03-25T10:00:00.000Z",
    });
    const backupRow = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-duplicate-hits",
      file_path: "/tmp/search-hits-backup.jsonl",
      source: "cleanup_backups",
      mtime: "2026-03-25T10:05:00.000Z",
    });

    const targetRow = selectConversationSessionHitsRow([backupRow, liveRow], {
      sessionId: liveRow.session_id,
      filePath: liveRow.file_path,
    });

    expect(targetRow?.file_path).toBe(liveRow.file_path);
    expect(targetRow?.source).toBe("sessions");
  });

  it("returns paginated hits for a single matching session", async () => {
    const row = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-session-hits",
      display_title: "token session detail",
      file_path: "/tmp/search-session-hits.jsonl",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "token first hit",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
        {
          idx: 1,
          role: "assistant",
          text: "token second hit",
          ts: "2026-03-25T10:00:01.000Z",
          source_type: "response_item.message",
        },
        {
          idx: 2,
          role: "assistant",
          text: "token third hit",
          ts: "2026-03-25T10:00:02.000Z",
          source_type: "response_item.message",
        },
      ]),
    );

    const page1 = await searchConversationSessionHits(row, "token", {
      pageSize: 2,
      transcriptLoader,
    });
    const page2 = await searchConversationSessionHits(row, "token", {
      pageSize: 2,
      cursor: page1.next_cursor ?? undefined,
      transcriptLoader,
    });

    expect(page1.total_hits).toBe(4);
    expect(page1.hits).toHaveLength(2);
    expect(page1.has_more).toBe(true);
    expect(page2.hits).toHaveLength(2);
    expect(page2.has_more).toBe(false);
  });

  it("uses the raw file search path for session detail expansion before transcript fallback", async () => {
    const row = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-session-hits-raw",
      display_title: "Unrelated title",
      file_path: "/tmp/search-session-hits-raw.jsonl",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "token transcript fallback one",
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
              "token preview four",
            ],
            match_count: 4,
            has_more_hits: false,
            exact_phrase_count: 4,
          },
        ],
      ]),
    );

    const page1 = await searchConversationSessionHits(row, "token", {
      pageSize: 2,
      transcriptLoader,
      rawFileSearchLoader,
    });
    const page2 = await searchConversationSessionHits(row, "token", {
      pageSize: 2,
      cursor: page1.next_cursor ?? undefined,
      transcriptLoader,
      rawFileSearchLoader,
    });

    expect(page1.total_hits).toBe(4);
    expect(page1.hits.map((hit) => hit.snippet)).toEqual([
      "token preview one",
      "token preview two",
    ]);
    expect(page1.has_more).toBe(true);
    expect(page2.hits.map((hit) => hit.snippet)).toEqual([
      "token preview three",
      "token preview four",
    ]);
    expect(page2.has_more).toBe(false);
    expect(transcriptLoader).not.toHaveBeenCalled();
    expect(rawFileSearchLoader).toHaveBeenCalledTimes(2);
  });

  it("falls back to transcript hits when a later cursor exceeds the raw snippet window", async () => {
    const row = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-session-hits-fallback",
      display_title: "Token overflow session",
      file_path: "/tmp/search-session-hits-fallback.jsonl",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(
        row,
        Array.from({ length: 45 }, (_, index) => ({
          idx: index,
          role: "assistant" as const,
          text: `token transcript hit ${index + 1}`,
          ts: `2026-03-25T10:00:${String(index).padStart(2, "0")}.000Z`,
          source_type: "response_item.message" as const,
        })),
      ),
    );
    const rawFileSearchLoader = vi.fn(async () =>
      new Map([
        [
          row.file_path,
          {
            snippets: Array.from({ length: 20 }, (_, index) => `token preview ${index + 1}`),
            match_count: 120,
            has_more_hits: true,
            exact_phrase_count: 20,
          },
        ],
      ]),
    );

    const page1 = await searchConversationSessionHits(row, "token", {
      pageSize: 40,
      transcriptLoader,
      rawFileSearchLoader,
    });
    const page2 = await searchConversationSessionHits(row, "token", {
      pageSize: 40,
      cursor: page1.next_cursor ?? undefined,
      transcriptLoader,
      rawFileSearchLoader,
    });

    expect(page1.hits).toHaveLength(21);
    expect(page1.has_more).toBe(true);
    expect(page2.hits.length).toBeGreaterThan(0);
    expect(page2.hits[0]?.snippet).toContain("token transcript hit");
    expect(transcriptLoader).toHaveBeenCalledTimes(1);
  });
});

describe("createCachedConversationTranscriptLoader", () => {
  it("reuses transcripts while file mtime is unchanged", async () => {
    const row = makeRow({
      file_path: "/tmp/search-cache-fixture.jsonl",
      mtime: "2026-03-25T10:10:00.000Z",
    });
    const baseLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "agent cache check",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );
    const cachedLoader = createCachedConversationTranscriptLoader(baseLoader);

    await cachedLoader(row);
    await cachedLoader(row);
    await cachedLoader({ ...row, mtime: "2026-03-25T10:00:05.000Z" });

    expect(baseLoader).toHaveBeenCalledTimes(2);
  });

  it("retries after a transient transcript load failure when mtime is unchanged", async () => {
    const row = makeRow({
      file_path: "/tmp/search-cache-transient-error.jsonl",
      mtime: "2026-03-25T10:10:00.000Z",
    });
    let shouldFail = true;
    const baseLoader = vi.fn(async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("transient transcript failure");
      }
      return makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "recovered transcript",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]);
    });
    const cachedLoader = createCachedConversationTranscriptLoader(baseLoader);

    const first = await cachedLoader(row);
    const second = await cachedLoader(row);

    expect(first).toBeNull();
    expect(second?.messages[0]?.text).toBe("recovered transcript");
    expect(baseLoader).toHaveBeenCalledTimes(2);
  });
});

describe("resolveConversationSearchLimits", () => {
  it("keeps scan coverage wider than the visible result limit", () => {
    expect(resolveConversationSearchLimits({ limit: 20 })).toEqual({
      resultLimit: 20,
      scanLimit: 160,
    });
    expect(resolveConversationSearchLimits({ limit: 120 })).toEqual({
      resultLimit: 120,
      scanLimit: 480,
    });
  });
});

describe("buildConversationSearchProviderBudgets", () => {
  it("splits the shared scan budget across providers", () => {
    const budgets = buildConversationSearchProviderBudgets(
      ["codex", "chatgpt", "claude", "gemini", "copilot"],
      160,
    );

    expect(budgets.map((entry) => entry.provider)).toEqual([
      "codex",
      "chatgpt",
      "claude",
      "gemini",
      "copilot",
    ]);
    expect(budgets.reduce((sum, entry) => sum + entry.limit, 0)).toBe(160);
    expect(
      Object.fromEntries(budgets.map((entry) => [entry.provider, entry.limit])),
    ).toEqual({
      codex: 42,
      chatgpt: 19,
      claude: 42,
      gemini: 31,
      copilot: 26,
    });
  });

  it("gives a single provider the full scan budget", () => {
    expect(buildConversationSearchProviderBudgets(["chatgpt"], 160)).toEqual([
      { provider: "chatgpt", limit: 160 },
    ]);
  });
});

describe("selectConversationSessionHitsRow", () => {
  it("does not trust file_path when it points at a different logical session", () => {
    const requestedSessionId = "rollout-2026-03-25T10-00-00-019d-target";
    const requestedRow = makeRow({
      session_id: requestedSessionId,
      file_path: "/tmp/search-target.jsonl",
    });
    const mismatchedRow = makeRow({
      session_id: "rollout-2026-03-25T10-00-00-019d-other",
      file_path: "/tmp/search-other.jsonl",
    });

    const selected = selectConversationSessionHitsRow(
      [mismatchedRow, requestedRow],
      {
        sessionId: requestedSessionId,
        filePath: mismatchedRow.file_path,
      },
    );

    expect(selected).toEqual(requestedRow);
  });
});

describe("isMetadataOnlyConversationQuery", () => {
  it("detects file/session/path oriented queries", () => {
    expect(isMetadataOnlyConversationQuery("rollout-2026-03-25")).toBe(true);
    expect(isMetadataOnlyConversationQuery("agent-session.jsonl")).toBe(true);
    expect(isMetadataOnlyConversationQuery("/workspace/.codex/sessions")).toBe(true);
    expect(isMetadataOnlyConversationQuery("69ab83eb-72a0-8320-8853-72ca88526762")).toBe(true);
  });

  it("keeps normal phrase searches transcript-eligible", () => {
    expect(isMetadataOnlyConversationQuery("open the transcript")).toBe(false);
    expect(isMetadataOnlyConversationQuery("cleanup preview token")).toBe(false);
  });
});

describe("defaultConversationSearchProviders", () => {
  it("tracks the shared searchable provider contract", () => {
    expect(defaultConversationSearchProviders()).toEqual([
      ...SEARCHABLE_PROVIDER_IDS,
    ]);
  });
});

describe("provider manifest cache behavior", () => {
  it("reuses the provider manifest after the scan cache TTL until invalidated", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T10:00:00.000Z"));
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);

    const walkFilesByExt = vi.fn(async () => ["/virtual/claude/session-a.jsonl"]);
    const statMock = vi.fn(async () => ({
      size: 128,
      mtimeMs: Date.parse("2026-03-25T10:00:00.000Z"),
    }));
    const probeSessionFile = vi.fn(async () => ({
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "",
      title_source: null,
    }));

    vi.doMock("../../lib/utils.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../lib/utils.js")>();
      return {
        ...actual,
        walkFilesByExt,
      };
    });
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        stat: statMock,
      };
    });
    vi.doMock("./path-safety.js", () => ({
      providerScanRootSpecs: async () => [
        {
          root: "/virtual/claude",
          source: "projects",
          exts: [".jsonl"],
        },
      ],
      providerName: () => "Claude",
      codexTranscriptSearchRoots: async () => [],
    }));
    vi.doMock("./title-detection.js", () => ({
      getCodexThreadTitleMap: vi.fn(async () => new Map()),
      invalidateCodexThreadTitleMapCache: vi.fn(),
      extractCodexThreadIdFromSessionName: vi.fn(() => ""),
    }));
    vi.doMock("./probe.js", () => ({
      inferSessionId: vi.fn((filePath: string) =>
        filePath.split("/").at(-1)?.replace(/\.jsonl$/i, "") ?? filePath,
      ),
      isCopilotGlobalSessionLikeFile: vi.fn(() => false),
      isWorkspaceChatSessionPath: vi.fn(() => false),
      probeSessionFile,
    }));
    vi.doMock("./matrix.js", () => ({
      providerStatus: vi.fn(() => "ready"),
    }));

    try {
      const mod = await import("./search.js");

      await mod.getProviderSessionScan("claude", 1);
      expect(walkFilesByExt).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(61_000);

      await mod.getProviderSessionScan("claude", 1);
      expect(walkFilesByExt).toHaveBeenCalledTimes(1);
      expect(probeSessionFile).toHaveBeenCalledTimes(2);

      mod.invalidateProviderSearchCaches("claude");
      await mod.getProviderSessionScan("claude", 1);
      expect(walkFilesByExt).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.doUnmock("../../lib/utils.js");
      vi.doUnmock("node:fs/promises");
      vi.doUnmock("./path-safety.js");
      vi.doUnmock("./title-detection.js");
      vi.doUnmock("./probe.js");
      vi.doUnmock("./matrix.js");
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it("reuses a persisted provider manifest across module reloads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T10:00:00.000Z"));
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);

    const installMocks = (walkFilesByExt: ReturnType<typeof vi.fn>) => {
      const statMock = vi.fn(async () => ({
        size: 128,
        mtimeMs: Date.parse("2026-03-25T10:00:00.000Z"),
      }));
      const probeSessionFile = vi.fn(async () => ({
        ok: true,
        format: "jsonl",
        error: null,
        detected_title: "",
        title_source: null,
      }));
      vi.doMock("../../lib/utils.js", async (importOriginal) => {
        const actual = await importOriginal<typeof import("../../lib/utils.js")>();
        return {
          ...actual,
          walkFilesByExt,
        };
      });
      vi.doMock("node:fs/promises", async (importOriginal) => {
        const actual = await importOriginal<typeof import("node:fs/promises")>();
        return {
          ...actual,
          stat: statMock,
        };
      });
      vi.doMock("./path-safety.js", () => ({
        providerScanRootSpecs: async () => [
          { root: "/virtual/claude", source: "projects", exts: [".jsonl"] },
        ],
        providerName: () => "Claude",
        codexTranscriptSearchRoots: async () => [],
      }));
      vi.doMock("./title-detection.js", () => ({
        getCodexThreadTitleMap: vi.fn(async () => new Map()),
        invalidateCodexThreadTitleMapCache: vi.fn(),
        extractCodexThreadIdFromSessionName: vi.fn(() => ""),
      }));
      vi.doMock("./probe.js", () => ({
        inferSessionId: vi.fn((filePath: string) =>
          filePath.split("/").at(-1)?.replace(/\.jsonl$/i, "") ?? filePath,
        ),
        isCopilotGlobalSessionLikeFile: vi.fn(() => false),
        isWorkspaceChatSessionPath: vi.fn(() => false),
        probeSessionFile,
      }));
      vi.doMock("./matrix.js", () => ({
        providerStatus: vi.fn(() => "ready"),
      }));
    };

    try {
      const firstWalk = vi.fn(async () => ["/virtual/claude/session-a.jsonl"]);
      installMocks(firstWalk);
      const firstMod = await import("./search.js");
      await firstMod.getProviderSessionScan("claude", 1);
      expect(firstWalk).toHaveBeenCalledTimes(1);

      vi.resetModules();

      const secondWalk = vi.fn(async () => ["/virtual/claude/session-b.jsonl"]);
      installMocks(secondWalk);
      const secondMod = await import("./search.js");
      await secondMod.getProviderSessionScan("claude", 1);
      expect(secondWalk).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.doUnmock("../../lib/utils.js");
      vi.doUnmock("node:fs/promises");
      vi.doUnmock("./path-safety.js");
      vi.doUnmock("./title-detection.js");
      vi.doUnmock("./probe.js");
      vi.doUnmock("./matrix.js");
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it("does not let a stale inflight rebuild overwrite a newer manifest after invalidation", async () => {
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);

    const firstWalk = deferred<string[]>();
    const walkFilesByExt = vi
      .fn()
      .mockImplementationOnce(async () => firstWalk.promise)
      .mockImplementationOnce(async () => ["/virtual/claude/session-b.jsonl"]);
    const statMock = vi.fn(async (filePath: string) => ({
      size: 128,
      mtimeMs: filePath.includes("session-b")
        ? Date.parse("2026-03-25T10:05:00.000Z")
        : Date.parse("2026-03-25T10:00:00.000Z"),
    }));
    const probeSessionFile = vi.fn(async (filePath: string) => ({
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: path.basename(filePath, ".jsonl"),
      title_source: "fixture",
    }));

    vi.doMock("../../lib/utils.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../lib/utils.js")>();
      return {
        ...actual,
        walkFilesByExt,
      };
    });
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        stat: statMock,
      };
    });
    vi.doMock("./path-safety.js", () => ({
      providerScanRootSpecs: async () => [
        { root: "/virtual/claude", source: "projects", exts: [".jsonl"] },
      ],
      providerName: () => "Claude",
      codexTranscriptSearchRoots: async () => [],
    }));
    vi.doMock("./title-detection.js", () => ({
      getCodexThreadTitleMap: vi.fn(async () => new Map()),
      invalidateCodexThreadTitleMapCache: vi.fn(),
      extractCodexThreadIdFromSessionName: vi.fn(() => ""),
    }));
    vi.doMock("./probe.js", () => ({
      inferSessionId: vi.fn((filePath: string) =>
        filePath.split("/").at(-1)?.replace(/\.jsonl$/i, "") ?? filePath,
      ),
      isCopilotGlobalSessionLikeFile: vi.fn(() => false),
      isWorkspaceChatSessionPath: vi.fn(() => false),
      probeSessionFile,
    }));
    vi.doMock("./matrix.js", () => ({
      providerStatus: vi.fn(() => "ready"),
    }));

    try {
      const mod = await import("./search.js");
      const stalePromise = mod.getProviderSessionScan("claude", 1);
      await waitForCondition(
        () => walkFilesByExt.mock.calls.length === 1,
        "the stale manifest rebuild to start",
      );

      mod.invalidateProviderSearchCaches("claude");
      const freshPromise = mod.getProviderSessionScan("claude", 1);
      const freshScan = await freshPromise;

      expect(freshScan.rows[0]?.file_path).toContain("session-b.jsonl");

      firstWalk.resolve(["/virtual/claude/session-a.jsonl"]);
      const staleScan = await stalePromise;
      expect(staleScan.rows[0]?.file_path).toContain("session-a.jsonl");

      const cachedScan = await mod.getProviderSessionScan("claude", 1);
      expect(cachedScan.rows[0]?.file_path).toContain("session-b.jsonl");
      expect(walkFilesByExt).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.doUnmock("../../lib/utils.js");
      vi.doUnmock("node:fs/promises");
      vi.doUnmock("./path-safety.js");
      vi.doUnmock("./title-detection.js");
      vi.doUnmock("./probe.js");
      vi.doUnmock("./matrix.js");
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

});

describe("searchLocalConversationsTs metadata-only fast path", () => {
  it("avoids probing session files for metadata-only queries", async () => {
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);

    const walkFilesByExt = vi.fn(async () => [
      "/virtual/claude/rollout-2026-03-25T10-00-00-019d-meta-only.jsonl",
    ]);
    const statMock = vi.fn(async (target: string) => {
      if (target === "/virtual/claude") {
        return {
          size: 0,
          mtimeMs: Date.parse("2026-03-25T10:00:00.000Z"),
        };
      }
      return {
        size: 128,
        mtimeMs: Date.parse("2026-03-25T10:00:00.000Z"),
      };
    });
    const probeSessionFile = vi.fn(async () => ({
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Should not load",
      title_source: "fixture",
    }));

    vi.doMock("../../lib/utils.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../lib/utils.js")>();
      return {
        ...actual,
        walkFilesByExt,
      };
    });
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        stat: statMock,
      };
    });
    vi.doMock("./path-safety.js", () => ({
      providerScanRootSpecs: async () => [
        {
          root: "/virtual/claude",
          source: "projects",
          exts: [".jsonl"],
        },
      ],
      providerName: () => "Claude",
      codexTranscriptSearchRoots: async () => [],
    }));
    vi.doMock("./title-detection.js", () => ({
      getCodexThreadTitleMap: vi.fn(async () => new Map()),
      invalidateCodexThreadTitleMapCache: vi.fn(),
      extractCodexThreadIdFromSessionName: vi.fn(() => ""),
    }));
    vi.doMock("./probe.js", () => ({
      inferSessionId: vi.fn((filePath: string) =>
        filePath.split("/").at(-1)?.replace(/\.jsonl$/i, "") ?? filePath,
      ),
      isCopilotGlobalSessionLikeFile: vi.fn(() => false),
      isWorkspaceChatSessionPath: vi.fn(() => false),
      probeSessionFile,
    }));
    vi.doMock("./matrix.js", () => ({
      providerStatus: vi.fn(() => "ready"),
    }));
    vi.doMock("../threads/query.js", () => ({
      getThreadsTs: vi.fn(async () => ({ rows: [] })),
    }));

    try {
      const mod = await import("./search.js");
      const result = await mod.searchLocalConversationsTs(
        "rollout-2026-03-25",
        {
          providers: ["claude"],
          pageSize: 10,
          sessionLimitPerProvider: 1,
        },
      );

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]?.session_id).toContain("rollout-2026-03-25");
      expect(probeSessionFile).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.doUnmock("../../lib/utils.js");
      vi.doUnmock("node:fs/promises");
      vi.doUnmock("./path-safety.js");
      vi.doUnmock("./title-detection.js");
      vi.doUnmock("./probe.js");
      vi.doUnmock("./matrix.js");
      vi.doUnmock("../threads/query.js");
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});

describe("abort propagation", () => {
  it("propagates abort signals into conversation search loaders", async () => {
    const controller = new AbortController();
    controller.abort();
    const rawFileSearchLoader = vi.fn(async (_rows, _q, options) => {
      if (options?.signal?.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      return new Map();
    });

    await expect(
      searchConversationSessions([makeRow()], "token", {
        signal: controller.signal,
        rawFileSearchLoader,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(rawFileSearchLoader).toHaveBeenCalled();
  });

  it("aborts before rebuilding provider scans when the signal is already cancelled", async () => {
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);
    const walkFilesByExt = vi.fn(async () => ["/virtual/claude/session-a.jsonl"]);
    const statMock = vi.fn(async () => ({
      size: 128,
      mtimeMs: Date.parse("2026-03-25T10:00:00.000Z"),
    }));

    vi.doMock("../../lib/utils.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../lib/utils.js")>();
      return {
        ...actual,
        walkFilesByExt,
      };
    });
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        stat: statMock,
      };
    });
    vi.doMock("./path-safety.js", () => ({
      providerScanRootSpecs: async () => [
        {
          root: "/virtual/claude",
          source: "projects",
          exts: [".jsonl"],
        },
      ],
      providerName: () => "Claude",
      codexTranscriptSearchRoots: async () => [],
    }));
    vi.doMock("./title-detection.js", () => ({
      getCodexThreadTitleMap: vi.fn(async () => new Map()),
      invalidateCodexThreadTitleMapCache: vi.fn(),
      extractCodexThreadIdFromSessionName: vi.fn(() => ""),
    }));
    vi.doMock("./probe.js", () => ({
      inferSessionId: vi.fn((filePath: string) =>
        filePath.split("/").at(-1)?.replace(/\.jsonl$/i, "") ?? filePath,
      ),
      isCopilotGlobalSessionLikeFile: vi.fn(() => false),
      isWorkspaceChatSessionPath: vi.fn(() => false),
      probeSessionFile: vi.fn(async () => ({
        ok: true,
        format: "jsonl",
        error: null,
        detected_title: "",
        title_source: null,
      })),
    }));
    vi.doMock("./matrix.js", () => ({
      providerStatus: vi.fn(() => "ready"),
    }));

    const controller = new AbortController();
    controller.abort();

    try {
      const mod = await import("./search.js");
      await expect(
        mod.getProviderSessionScan("claude", 1, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(walkFilesByExt).not.toHaveBeenCalled();
      expect(statMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.doUnmock("../../lib/utils.js");
      vi.doUnmock("node:fs/promises");
      vi.doUnmock("./path-safety.js");
      vi.doUnmock("./title-detection.js");
      vi.doUnmock("./probe.js");
      vi.doUnmock("./matrix.js");
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it("lets callers abort while waiting on a shared manifest inflight promise", async () => {
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);
    const firstWalk = deferred<string[]>();
    const walkFilesByExt = vi
      .fn()
      .mockImplementationOnce(async () => firstWalk.promise);
    const statMock = vi.fn(async () => ({
      size: 128,
      mtimeMs: Date.parse("2026-03-25T10:00:00.000Z"),
    }));

    vi.doMock("../../lib/utils.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../lib/utils.js")>();
      return {
        ...actual,
        walkFilesByExt,
      };
    });
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        stat: statMock,
      };
    });
    vi.doMock("./path-safety.js", () => ({
      providerScanRootSpecs: async () => [
        {
          root: "/virtual/claude",
          source: "projects",
          exts: [".jsonl"],
        },
      ],
      providerName: () => "Claude",
      codexTranscriptSearchRoots: async () => [],
    }));
    vi.doMock("./title-detection.js", () => ({
      getCodexThreadTitleMap: vi.fn(async () => new Map()),
      invalidateCodexThreadTitleMapCache: vi.fn(),
      extractCodexThreadIdFromSessionName: vi.fn(() => ""),
    }));
    vi.doMock("./probe.js", () => ({
      inferSessionId: vi.fn((filePath: string) =>
        filePath.split("/").at(-1)?.replace(/\.jsonl$/i, "") ?? filePath,
      ),
      isCopilotGlobalSessionLikeFile: vi.fn(() => false),
      isWorkspaceChatSessionPath: vi.fn(() => false),
      probeSessionFile: vi.fn(async () => ({
        ok: true,
        format: "jsonl",
        error: null,
        detected_title: "",
        title_source: null,
      })),
    }));
    vi.doMock("./matrix.js", () => ({
      providerStatus: vi.fn(() => "ready"),
    }));

    try {
      const mod = await import("./search.js");
      const firstRequest = mod.getProviderSessionScan("claude", 1);
      await waitForCondition(
        () => walkFilesByExt.mock.calls.length === 1,
        "the shared manifest rebuild to start",
      );

      const controller = new AbortController();
      const secondRequest = mod.getProviderSessionScan("claude", 2, {
        signal: controller.signal,
      });
      controller.abort();

      await expect(secondRequest).rejects.toMatchObject({ name: "AbortError" });
      firstWalk.resolve(["/virtual/claude/session-a.jsonl"]);
      const firstScan = await firstRequest;
      expect(firstScan.rows[0]?.file_path).toContain("session-a.jsonl");
      expect(walkFilesByExt).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.doUnmock("../../lib/utils.js");
      vi.doUnmock("node:fs/promises");
      vi.doUnmock("./path-safety.js");
      vi.doUnmock("./title-detection.js");
      vi.doUnmock("./probe.js");
      vi.doUnmock("./matrix.js");
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});

describe("searchConversationSessionHitsTs", () => {
  it("returns null when a manifest candidate points to a deleted session file", async () => {
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);
    const walkFilesByExt = vi.fn(async () => ["/virtual/claude/session-a.jsonl"]);
    const statMock = vi.fn(async () => ({
      size: 128,
      mtimeMs: Date.parse("2026-03-25T10:00:00.000Z"),
    }));

    vi.doMock("../../lib/utils.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../lib/utils.js")>();
      return {
        ...actual,
        walkFilesByExt,
      };
    });
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        stat: statMock,
      };
    });
    vi.doMock("./path-safety.js", () => ({
      providerScanRootSpecs: async () => [
        {
          root: "/virtual/claude",
          source: "projects",
          exts: [".jsonl"],
        },
      ],
      providerName: () => "Claude",
      codexTranscriptSearchRoots: async () => [],
    }));
    vi.doMock("./title-detection.js", () => ({
      getCodexThreadTitleMap: vi.fn(async () => new Map()),
      invalidateCodexThreadTitleMapCache: vi.fn(),
      extractCodexThreadIdFromSessionName: vi.fn(() => ""),
    }));
    vi.doMock("./probe.js", () => ({
      inferSessionId: vi.fn((filePath: string) =>
        filePath.split("/").at(-1)?.replace(/\.jsonl$/i, "") ?? filePath,
      ),
      isCopilotGlobalSessionLikeFile: vi.fn(() => false),
      isWorkspaceChatSessionPath: vi.fn(() => false),
      probeSessionFile: vi.fn(async () => ({
        ok: false,
        format: null,
        error: "missing",
        detected_title: "",
        title_source: null,
      })),
    }));
    vi.doMock("./matrix.js", () => ({
      providerStatus: vi.fn(() => "ready"),
    }));

    try {
      const mod = await import("./search.js");
      const result = await mod.searchConversationSessionHitsTs("token", {
        provider: "claude",
        sessionId: "session-a",
        filePath: "/virtual/claude/session-a.jsonl",
      });

      expect(result).toBeNull();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.doUnmock("../../lib/utils.js");
      vi.doUnmock("node:fs/promises");
      vi.doUnmock("./path-safety.js");
      vi.doUnmock("./title-detection.js");
      vi.doUnmock("./probe.js");
      vi.doUnmock("./matrix.js");
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});
