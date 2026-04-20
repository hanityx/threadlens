import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "@/api";
import {
  buildThreadCleanupSelectionKey,
  FORENSICS_RETRY_DELAY_MS,
  formatMutationErrorMessage,
  isTransientBackendError,
  LEGACY_UPDATE_BANNER_DISMISS_STORAGE_KEY,
  normalizeThreadIds,
  persistDismissedUpdateVersion,
  postWithTransientRetry,
  providerActionSelectionKey,
  pruneProviderSelectionForView,
  readDismissedUpdateVersion,
  readStorageValue,
  THREAD_CLEANUP_DEFAULT_OPTIONS,
  UPDATE_BANNER_DISMISS_STORAGE_KEY,
  writeStorageValue,
} from "@/shared/lib/appState";

vi.mock("@/api", () => ({
  apiPost: vi.fn(),
}));

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

const mockApiPost = vi.mocked(apiPost);

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

describe("providerActionSelectionKey", () => {
  it("normalizes file paths and encodes delete backup intent", () => {
    const direct = providerActionSelectionKey(
      "codex",
      "delete_local",
      ["/tmp/b.jsonl", " ", "/tmp/a.jsonl", "/tmp/a.jsonl"],
      { backup_before_delete: false },
    );
    const backupFirst = providerActionSelectionKey(
      "codex",
      "delete_local",
      ["/tmp/a.jsonl", "/tmp/b.jsonl"],
      { backup_before_delete: true },
    );

    expect(direct).toBe("codex|delete_local|direct|/tmp/a.jsonl||/tmp/b.jsonl");
    expect(backupFirst).toBe("codex|delete_local|backup-first|/tmp/a.jsonl||/tmp/b.jsonl");
  });
});

describe("normalizeThreadIds", () => {
  it("deduplicates, trims, and caps ids at 500", () => {
    const manyIds = Array.from({ length: 505 }, (_, index) => `thread-${index}`);
    const normalized = normalizeThreadIds([" thread-1 ", "", "thread-1", ...manyIds]);

    expect(normalized[0]).toBe("thread-1");
    expect(normalized).toHaveLength(500);
    expect(normalized).not.toContain("");
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

describe("storage helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    mockApiPost.mockReset();
  });

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

  it("returns the first matching key from storage", () => {
    const localStorage = createLocalStorageMock();
    localStorage.setItem("beta", "found");
    vi.stubGlobal("window", { localStorage });

    expect(readStorageValue(["alpha", "beta", "gamma"])).toBe("found");
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

  it("falls back to the legacy dismissed update key", () => {
    window.localStorage.setItem(LEGACY_UPDATE_BANNER_DISMISS_STORAGE_KEY, "0.1.0");

    expect(readDismissedUpdateVersion()).toBe("0.1.0");
  });

  it("persists the dismissed update version to localStorage", () => {
    persistDismissedUpdateVersion("0.1.2");

    expect(window.localStorage.getItem(UPDATE_BANNER_DISMISS_STORAGE_KEY)).toBe("0.1.2");
  });

  it("does not persist empty dismissed versions", () => {
    persistDismissedUpdateVersion("");

    expect(window.localStorage.getItem(UPDATE_BANNER_DISMISS_STORAGE_KEY)).toBeNull();
  });
});

describe("backend retry helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    mockApiPost.mockReset();
  });

  it("detects transient backend errors and leaves unrelated messages alone", () => {
    expect(isTransientBackendError("status 503 from runtime-backend-unreachable")).toBe(true);
    expect(isTransientBackendError("cleanup-selection-changed")).toBe(false);
  });

  it("retries transient failures once the backoff delay passes", async () => {
    vi.useFakeTimers();
    mockApiPost
      .mockRejectedValueOnce(new Error("status 503"))
      .mockResolvedValueOnce({ ok: true, data: { recovered: true } });

    const pending = postWithTransientRetry<{ ok: true; data: { recovered: true } }>(
      "/api/analyze-delete",
      { ids: ["thread-1"] },
    );

    await vi.advanceTimersByTimeAsync(FORENSICS_RETRY_DELAY_MS);

    await expect(pending).resolves.toEqual({ ok: true, data: { recovered: true } });
    expect(mockApiPost).toHaveBeenCalledTimes(2);
  });

  it("stops immediately on non-transient errors", async () => {
    mockApiPost.mockRejectedValueOnce(new Error("validation failed"));

    await expect(
      postWithTransientRetry("/api/analyze-delete", { ids: ["thread-1"] }),
    ).rejects.toThrow("validation failed");
    expect(mockApiPost).toHaveBeenCalledTimes(1);
  });
});

describe("formatMutationErrorMessage", () => {
  it("maps runtime instability and thread-id validation errors to friendly copy", () => {
    expect(formatMutationErrorMessage("/api/local-cleanup status 503: fetch failed")).toContain(
      "runtime connection is unstable",
    );
    expect(formatMutationErrorMessage("no-valid-thread-ids")).toContain(
      "No valid thread ID is selected",
    );
  });

  it("maps cleanup token failures and falls back to normalized raw messages", () => {
    expect(formatMutationErrorMessage("confirm_token missing")).toContain("confirm token is invalid");
    expect(formatMutationErrorMessage("cleanup-selection-changed")).toContain(
      "selected threads changed",
    );
    expect(formatMutationErrorMessage("cleanup-preview-required")).toContain(
      "Run cleanup dry-run first",
    );
    expect(formatMutationErrorMessage("/api/local-cleanup status 400: custom failure")).toBe(
      "custom failure",
    );
    expect(formatMutationErrorMessage("   ")).toBe("");
  });
});
