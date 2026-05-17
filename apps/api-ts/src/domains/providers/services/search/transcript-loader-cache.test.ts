import { describe, expect, it, vi } from "vitest";
import { createCachedConversationTranscriptLoader } from "./index.js";
import { makeRow, makeTranscript } from "./test-fixtures.js";

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
