import { beforeEach, describe, expect, it } from "vitest";
import {
  PROVIDER_VIEW_STORAGE_KEY,
  SETUP_PREFERRED_PROVIDER_STORAGE_KEY,
  SEARCH_PROVIDER_STORAGE_KEY,
} from "../../hooks/appDataUtils";
import {
  persistSetupPreferredSelection,
  resolveSetupPreferredSelection,
} from "./SetupWizard";

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

describe("SetupWizard setup preference handoff", () => {
  beforeEach(() => {
    const localStorage = createLocalStorageMock();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage },
    });
  });

  it("uses the selected visible provider for both sessions and search defaults", () => {
    expect(
      resolveSetupPreferredSelection({
        selectedProviderIds: ["codex"],
        visibleProviderIds: ["codex", "claude", "gemini"],
      }),
    ).toEqual({
      preferredProviderId: "codex",
      providerView: "codex",
      searchProvider: "codex",
    });
  });

  it("falls back to all sessions when the chosen provider is not a visible session tab", () => {
    expect(
      resolveSetupPreferredSelection({
        selectedProviderIds: ["copilot"],
        visibleProviderIds: ["codex", "claude", "gemini"],
      }),
    ).toEqual({
      preferredProviderId: "copilot",
      providerView: "all",
      searchProvider: "copilot",
    });
  });

  it("persists the computed provider and search defaults to localStorage", () => {
    persistSetupPreferredSelection({
      preferredProviderId: "codex",
      providerView: "codex",
      searchProvider: "codex",
    });

    expect(window.localStorage.getItem(PROVIDER_VIEW_STORAGE_KEY)).toBe("codex");
    expect(window.localStorage.getItem(SEARCH_PROVIDER_STORAGE_KEY)).toBe("codex");
    expect(window.localStorage.getItem(SETUP_PREFERRED_PROVIDER_STORAGE_KEY)).toBe("codex");
  });
});
