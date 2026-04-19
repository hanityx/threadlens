import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LOCALE_STORAGE_KEY,
  PROVIDER_VIEW_STORAGE_KEY,
  SETUP_PREFERRED_PROVIDER_STORAGE_KEY,
  SEARCH_PROVIDER_STORAGE_KEY,
} from "@/shared/lib/appState";
import { LocaleProvider } from "@/i18n";
import {
  persistSetupPreferredSelection,
  resolveSetupPreferredSelection,
  SetupWizard,
} from "@/features/overview/components/SetupWizard";
import { getMessages } from "@/i18n";

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

  it("renders a locale picker in setup so the language setting is discoverable", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <SetupWizard
          providers={[
            {
              provider: "codex",
              name: "Codex",
              status: "active",
              capabilities: {
                read_sessions: true,
                analyze_context: true,
                safe_cleanup: true,
                hard_delete: true,
              },
              evidence: {
                roots: ["/tmp/codex"],
                session_log_count: 12,
              },
            },
          ] as never}
          dataSourceRows={[]}
          providerSessionRows={[]}
          parserReports={[]}
          providersRefreshing={false}
          providersLastRefreshAt=""
          onRefresh={() => undefined}
          onOpenProviders={() => undefined}
          onOpenSearch={() => undefined}
          onClose={() => undefined}
        />
      </LocaleProvider>,
    );

    expect(html).toContain("Setup");
    expect(html).toContain("Language");
    expect(html).toContain("EN");
    expect(html).toContain("English");
    expect(html).toContain("Русский");
  });

  it("keeps the Setup screen name in English even in Spanish locale", () => {
    const messages = getMessages("es");
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "es");

    const html = renderToStaticMarkup(
      <LocaleProvider>
        <SetupWizard
          providers={[
            {
              provider: "codex",
              name: "Codex",
              status: "active",
              capabilities: {
                read_sessions: true,
                analyze_context: true,
                safe_cleanup: true,
                hard_delete: true,
              },
              evidence: {
                roots: ["/tmp/codex"],
                session_log_count: 12,
              },
            },
          ] as never}
          dataSourceRows={[]}
          providerSessionRows={[]}
          parserReports={[]}
          providersRefreshing={false}
          providersLastRefreshAt=""
          onRefresh={() => undefined}
          onOpenProviders={() => undefined}
          onOpenSearch={() => undefined}
          onClose={() => undefined}
        />
      </LocaleProvider>,
    );

    expect(html).toContain("Setup");
    expect(html).toContain(messages.setup.chooseDefaultTitle);
  });

  it("keeps locale persistence in the same localStorage surface", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "es");

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
  });
});
