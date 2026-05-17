import { describe, expect, it, vi } from "vitest";
import { searchConversationSessionHits, selectConversationSessionHitsRow } from "./index.js";
import { makeRow, makeTranscript } from "./test-fixtures.js";

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

  it("uses raw file hits as a prefilter for session detail expansion", async () => {
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
          text: "token transcript one",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
        {
          idx: 1,
          role: "assistant",
          text: "token transcript two",
          ts: "2026-03-25T10:00:01.000Z",
          source_type: "response_item.message",
        },
        {
          idx: 2,
          role: "assistant",
          text: "token transcript three",
          ts: "2026-03-25T10:00:02.000Z",
          source_type: "response_item.message",
        },
        {
          idx: 3,
          role: "assistant",
          text: "token transcript four",
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
      "token transcript one",
      "token transcript two",
    ]);
    expect(page1.has_more).toBe(true);
    expect(page2.hits.map((hit) => hit.snippet)).toEqual([
      "token transcript three",
      "token transcript four",
    ]);
    expect(page2.has_more).toBe(false);
    expect(transcriptLoader).toHaveBeenCalledTimes(1);
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

    expect(page1.hits).toHaveLength(40);
    expect(page1.has_more).toBe(true);
    expect(page2.hits.length).toBeGreaterThan(0);
    expect(page2.hits[0]?.snippet).toContain("token transcript hit");
    expect(transcriptLoader).toHaveBeenCalledTimes(1);
  });
});
