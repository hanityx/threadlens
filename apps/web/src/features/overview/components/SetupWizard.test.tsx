import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LOCALE_STORAGE_KEY,
  SETUP_COMMITTED_STORAGE_KEY,
  PROVIDER_VIEW_STORAGE_KEY,
  readPersistedSearchProviderPreference,
  SETUP_SELECTION_STORAGE_KEY,
  SETUP_PREFERRED_PROVIDER_STORAGE_KEY,
  SEARCH_PROVIDER_STORAGE_KEY,
} from "@/shared/lib/appState";
import { LocaleProvider } from "@/i18n";
import {
  SetupWizard,
} from "@/features/overview/components/SetupWizard";
import {
  persistSetupPreferredSelection,
  persistSetupSelectionIds,
  resolveSavedSetupSummary,
  resolveSetupPreferredSelection,
  setSetupDefaultProvider,
  toggleSetupSelection,
} from "@/features/overview/model/setupWizardModel";
import { getMessages } from "@/i18n/catalog";

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

  it("returns all scopes when setup is saved with no selected provider", () => {
    expect(
      resolveSetupPreferredSelection({
        selectedProviderIds: [],
        visibleProviderIds: ["codex", "claude", "gemini"],
      }),
    ).toEqual({
      preferredProviderId: "all",
      providerView: "all",
      searchProvider: "all",
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

  it("overwrites a stale dedicated search provider when setup saves a new start point", () => {
    window.localStorage.setItem(SEARCH_PROVIDER_STORAGE_KEY, "codex");

    persistSetupPreferredSelection({
      preferredProviderId: "claude",
      providerView: "claude",
      searchProvider: "claude",
    });

    expect(window.localStorage.getItem(SEARCH_PROVIDER_STORAGE_KEY)).toBe("claude");
    expect(readPersistedSearchProviderPreference()).toBe("claude");
  });

  it("persists the committed overview selection only when asked", () => {
    persistSetupSelectionIds(["claude", "codex"]);
    expect(window.localStorage.getItem(SETUP_SELECTION_STORAGE_KEY)).toBe(JSON.stringify(["claude", "codex"]));

    persistSetupSelectionIds([]);
    expect(window.localStorage.getItem(SETUP_SELECTION_STORAGE_KEY)).toBe(JSON.stringify([]));
  });

  it("adds watched providers without changing the existing default order", () => {
    expect(toggleSetupSelection([], "codex")).toEqual(["codex"]);
    expect(toggleSetupSelection(["codex"], "claude")).toEqual(["codex", "claude"]);
    expect(toggleSetupSelection(["codex", "claude"], "codex")).toEqual(["claude"]);
  });

  it("moves a selected provider to the default slot when requested", () => {
    expect(setSetupDefaultProvider(["codex", "claude"], "claude")).toEqual(["claude", "codex"]);
    expect(setSetupDefaultProvider(["claude"], "claude")).toEqual(["claude"]);
    expect(setSetupDefaultProvider([], "gemini")).toEqual(["gemini"]);
  });

  it("renders the most recently selected provider as default in the setup cards", () => {
    window.localStorage.setItem(SETUP_COMMITTED_STORAGE_KEY, JSON.stringify({
      selectedProviderIds: ["claude", "codex"],
      preferredProviderId: "claude",
      providerView: "claude",
      searchProvider: "claude",
    }));

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
            {
              provider: "claude",
              name: "Claude",
              status: "active",
              capabilities: {
                read_sessions: true,
                analyze_context: true,
                safe_cleanup: true,
                hard_delete: true,
              },
              evidence: {
                roots: ["/tmp/claude"],
                session_log_count: 12,
              },
            },
          ] as never}
          dataSourceRows={[]}
          providerSessionProviders={[
            { provider: "codex", total_bytes: 12 * 1024 * 1024 * 1024 },
            { provider: "claude", total_bytes: 270 * 1024 * 1024 },
          ]}
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

    expect(html).toContain("Claude");
    expect(html).toContain("Codex");
    expect(html).toContain("Codex</h3><div class=\"setup-wizard-choice-actions\"><span class=\"status-pill status-preview\">Overview</span>");
    expect(html).toContain("Claude</h3><div class=\"setup-wizard-choice-actions\"><span class=\"status-pill status-active\">Start here</span>");
    expect(html).toContain(">Open first</button>");
    expect(html).toContain("</button><div class=\"setup-wizard-choice-footer\"><button type=\"button\" class=\"setup-wizard-choice-default\">Open first</button></div>");
    expect(html).toContain("Start here only sets which provider opens first in Sessions and Search.");
  });

  it("ignores stale legacy setup selection when no saved preferred provider exists", () => {
    window.localStorage.setItem(SETUP_SELECTION_STORAGE_KEY, JSON.stringify(["claude"]));

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
            {
              provider: "claude",
              name: "Claude",
              status: "active",
              capabilities: {
                read_sessions: true,
                analyze_context: true,
                safe_cleanup: true,
                hard_delete: true,
              },
              evidence: {
                roots: ["/tmp/claude"],
                session_log_count: 12,
              },
            },
          ] as never}
          dataSourceRows={[]}
          providerSessionProviders={[]}
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

    expect(html).not.toContain("status-pill status-active\">Start here");
    expect(html).not.toContain("status-pill status-preview\">Overview");
  });

  it("keeps the saved summary pinned to the committed setup until save is pressed again", () => {
    const summary = resolveSavedSetupSummary({
      completedAt: "2026-04-21T12:00:00.000Z",
      savedSetupState: {
        selectedProviderIds: ["claude", "codex"],
        preferredProviderId: "claude",
        providerView: "claude",
        searchProvider: "claude",
      },
      providerCards: [
        {
          providerId: "codex",
          name: "Codex",
          status: "active",
          sourceCount: 1,
          sessionCount: 12,
          totalBytes: 12 * 1024 * 1024 * 1024,
          parseScore: 100,
          canRead: true,
          canAnalyze: true,
          canSafeCleanup: true,
          rootCount: 1,
        },
        {
          providerId: "claude",
          name: "Claude",
          status: "active",
          sourceCount: 1,
          sessionCount: 12,
          totalBytes: 270 * 1024 * 1024,
          parseScore: 100,
          canRead: true,
          canAnalyze: true,
          canSafeCleanup: true,
          rootCount: 1,
        },
      ],
      allProvidersLabel: "ALL LOCAL AI",
      noDefaultSelectedLabel: "No default selected",
    });

    expect(summary).toEqual({
      focusLabel: "Claude",
      watchingLabel: "Codex",
      providerViewLabel: "Claude",
      searchLabel: "Claude",
      primaryProviderBytes: 270 * 1024 * 1024,
    });
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
          providerSessionProviders={[]}
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
    expect(html).toContain("English");
    expect(html).toContain('id="setup-locale"');
    expect(html).not.toContain("Русский");
    expect(html).not.toContain('role="listbox"');
  });

  it("keeps the Setup screen name in English even in Spanish locale", () => {
    const messages = getMessages("es");
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "es");

    const html = renderToStaticMarkup(
      <LocaleProvider initialLocale="es" initialMessages={messages}>
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
          providerSessionProviders={[]}
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
    expect(html).toContain(messages.setup.preferredAiTitle);
  });

  it("keeps locale persistence in the same localStorage surface", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "es");

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
  });

  it("prefers the larger session footprint when source inventory undercounts a provider", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <SetupWizard
          providers={[
            {
              provider: "gemini",
              name: "Gemini",
              status: "active",
              capabilities: {
                read_sessions: true,
                analyze_context: true,
                safe_cleanup: true,
                hard_delete: false,
              },
              evidence: {
                roots: ["/tmp/gemini"],
                session_log_count: 2,
              },
            },
          ] as never}
          dataSourceRows={[
            {
              source_key: "gemini_root",
              path: "/tmp/gemini",
              present: true,
              file_count: 1,
              dir_count: 1,
              total_bytes: 21 * 1024,
              latest_mtime: "",
            },
          ]}
          providerSessionProviders={[
            {
              provider: "gemini",
              total_bytes: 9 * 1024 * 1024,
            },
          ]}
          providerSessionRows={[
            {
              provider: "gemini",
              source: "antigravity_conversations",
              session_id: "gemini-1",
              display_title: "Gemini 1",
              file_path: "/tmp/gemini-1.pb",
              size_bytes: 4 * 1024 * 1024,
              mtime: "",
              probe: {
                ok: true,
                format: "unknown",
                error: null,
                detected_title: "Gemini 1",
                title_source: "binary-cache-id",
              },
            },
          ] as never}
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

    expect(html).toContain("9.0 MB");
    expect(html).not.toContain("21 KB");
  });

  it("keeps provider footprint visible before any provider is selected", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <SetupWizard
          providers={[
            {
              provider: "claude",
              name: "Claude",
              status: "active",
              capabilities: {
                read_sessions: true,
                analyze_context: true,
                safe_cleanup: true,
                hard_delete: false,
              },
              evidence: {
                roots: ["/tmp/claude"],
                session_log_count: 2,
              },
            },
            {
              provider: "gemini",
              name: "Gemini",
              status: "active",
              capabilities: {
                read_sessions: true,
                analyze_context: true,
                safe_cleanup: true,
                hard_delete: false,
              },
              evidence: {
                roots: ["/tmp/gemini"],
                session_log_count: 2,
              },
            },
          ] as never}
          dataSourceRows={[]}
          providerSessionProviders={[
            { provider: "claude", total_bytes: 300 * 1024 * 1024 },
            { provider: "gemini", total_bytes: 100 * 1024 * 1024 },
          ]}
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

    expect(html).toContain("300 MB");
    expect(html).toContain("100 MB");
    expect(html).not.toContain(">0 B<");
  });

  it("keeps Save as default enabled so all can be restored after clearing every provider", () => {
    window.localStorage.setItem(SETUP_SELECTION_STORAGE_KEY, JSON.stringify([]));

    const html = renderToStaticMarkup(
      <LocaleProvider>
        <SetupWizard
          providers={[
            {
              provider: "claude",
              name: "Claude",
              status: "active",
              capabilities: {
                read_sessions: true,
                analyze_context: true,
                safe_cleanup: true,
                hard_delete: false,
              },
              evidence: {
                roots: ["/tmp/claude"],
                session_log_count: 2,
              },
            },
          ] as never}
          dataSourceRows={[]}
          providerSessionProviders={[]}
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

    expect(html).toContain(">Save as default</button>");
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Save as default<\/button>/);
  });
});
