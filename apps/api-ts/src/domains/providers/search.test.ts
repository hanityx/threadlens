import { describe, expect, it, vi } from "vitest";
import type {
  ProviderSessionRow,
  TranscriptPayload,
} from "../../lib/providers.js";
import {
  createCachedConversationTranscriptLoader,
  resolveConversationSearchLimits,
  searchConversationRows,
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

describe("searchConversationRows", () => {
  it("suppresses exact duplicate message hits within the same session", async () => {
    const row = makeRow({ display_title: "Unrelated title" });
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
});

describe("resolveConversationSearchLimits", () => {
  it("keeps scan coverage wider than the visible result limit", () => {
    expect(resolveConversationSearchLimits({ limit: 20 })).toEqual({
      resultLimit: 20,
      scanLimit: 240,
    });
    expect(resolveConversationSearchLimits({ limit: 120 })).toEqual({
      resultLimit: 120,
      scanLimit: 960,
    });
  });
});
