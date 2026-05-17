import { describe, expect, it } from "vitest";
import { selectConversationSessionHitsRow } from "./index.js";
import { makeRow } from "./test-fixtures.js";

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
