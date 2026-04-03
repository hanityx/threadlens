import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildThreadCleanupSelectionKey,
  persistDismissedUpdateVersion,
  pruneProviderSelectionForView,
  readDismissedUpdateVersion,
  THREAD_CLEANUP_DEFAULT_OPTIONS,
  UPDATE_BANNER_DISMISS_STORAGE_KEY,
} from "./appDataUtils";

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

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

describe("dismissed update version persistence", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    const localStorage = createLocalStorageMock();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage },
    });
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
      return;
    }
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  });

  it("reads the dismissed update version from localStorage", () => {
    window.localStorage.setItem(UPDATE_BANNER_DISMISS_STORAGE_KEY, "0.1.1");

    expect(readDismissedUpdateVersion()).toBe("0.1.1");
  });

  it("persists the dismissed update version to localStorage", () => {
    persistDismissedUpdateVersion("0.1.2");

    expect(window.localStorage.getItem(UPDATE_BANNER_DISMISS_STORAGE_KEY)).toBe("0.1.2");
  });
});
