import { describe, expect, it, vi } from "vitest";
import { searchConversationRows } from "./index.js";
import { makeRow, makeTranscript } from "./test-fixtures.js";

describe("searchConversationRows", () => {
  it("returns metadata matches without loading transcripts when the limit is satisfied", async () => {
    const row = makeRow({
      display_title: "Unrelated title",
      session_id: "rollout-2026-03-25T10-00-00-019d-metadata-scope",
      file_path: "/tmp/metadata-scope.jsonl",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "needle only in transcript",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );

    const result = await searchConversationRows([row], "metadata", {
      limit: 1,
      transcriptLoader,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      match_kind: "title",
      session_id: "metadata-scope",
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
