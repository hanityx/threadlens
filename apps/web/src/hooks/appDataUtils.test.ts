import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildThreadCleanupSelectionKey,
  persistDismissedUpdateVersion,
  pruneProviderSelectionForView,
  readDismissedUpdateVersion,
  readStorageValue,
  THREAD_CLEANUP_DEFAULT_OPTIONS,
  UPDATE_BANNER_DISMISS_STORAGE_KEY,
  writeStorageValue,
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("storage helpers", () => {
  it("returns null when localStorage reads throw", () => {
    const getItem = vi.fn(() => {
      throw new Error("blocked");
    });
    vi.stubGlobal("window", {
      localStorage: { getItem },
    });

    expect(readStorageValue(["alpha", "beta"])).toBeNull();
    expect(getItem).toHaveBeenCalledTimes(1);
  });

  it("swallows localStorage write failures", () => {
    const setItem = vi.fn(() => {
      throw new Error("blocked");
    });
    vi.stubGlobal("window", {
      localStorage: { setItem },
    });

    expect(() => writeStorageValue("alpha", "beta")).not.toThrow();
    expect(setItem).toHaveBeenCalledWith("alpha", "beta");
  });

  it("reads the dismissed update version from localStorage", () => {
    const getItem = vi.fn((key: string) =>
      key === UPDATE_BANNER_DISMISS_STORAGE_KEY ? "0.1.1" : null,
    );
    vi.stubGlobal("window", {
      localStorage: { getItem },
    });

    expect(readDismissedUpdateVersion()).toBe("0.1.1");
  });

  it("persists the dismissed update version to localStorage", () => {
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      localStorage: { setItem },
    });

    persistDismissedUpdateVersion("0.1.2");

    expect(setItem).toHaveBeenCalledWith(UPDATE_BANNER_DISMISS_STORAGE_KEY, "0.1.2");
  });
});
