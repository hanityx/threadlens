import { describe, expect, it } from "vitest";
import {
  buildThreadCleanupSelectionKey,
  pruneProviderSelectionForView,
  THREAD_CLEANUP_DEFAULT_OPTIONS,
} from "./appDataUtils";

describe("buildThreadCleanupSelectionKey", () => {
  it("normalizes ids and keeps cleanup options in the key", () => {
    const first = buildThreadCleanupSelectionKey(
      ["thread-b", "thread-a", "thread-a", " "],
      THREAD_CLEANUP_DEFAULT_OPTIONS,
    );
    const second = buildThreadCleanupSelectionKey(
      ["thread-a", "thread-b"],
      {
        delete_cache: true,
        delete_session_logs: true,
        clean_state_refs: true,
      },
    );
    const differentOptions = buildThreadCleanupSelectionKey(
      ["thread-a", "thread-b"],
      {
        delete_cache: false,
        delete_session_logs: true,
        clean_state_refs: true,
      },
    );

    expect(first).toBe(second);
    expect(first).not.toBe(differentOptions);
    expect(first).toContain("thread-a||thread-b");
  });
});

describe("pruneProviderSelectionForView", () => {
  it("keeps all selections in all-provider view", () => {
    const selected = {
      "/tmp/codex-session.jsonl": true,
      "/tmp/claude-session.jsonl": true,
    };

    expect(
      pruneProviderSelectionForView(selected, "all", ["/tmp/codex-session.jsonl"]),
    ).toEqual(selected);
  });

  it("drops hidden provider selections in provider-scoped view", () => {
    expect(
      pruneProviderSelectionForView(
        {
          "/tmp/codex-session.jsonl": true,
          "/tmp/claude-session.jsonl": true,
        },
        "codex",
        ["/tmp/codex-session.jsonl"],
      ),
    ).toEqual({
      "/tmp/codex-session.jsonl": true,
    });
  });
});
