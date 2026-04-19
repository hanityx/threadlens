import { describe, expect, it, vi } from "vitest";

import { createAppContextValue } from "@/app/createAppContextValue";

describe("createAppContextValue", () => {
  it("combines app data, shell state, behavior, and local state into one context object", () => {
    const handleProvidersIntent = vi.fn();
    const handleSearchIntent = vi.fn();
    const handleDiagnosticsIntent = vi.fn();
    const handleHeaderSearchSubmit = vi.fn();
    const appData = {
      layoutView: "overview",
      providerView: "all",
      setProviderView: vi.fn(),
    };
    const shellModel = {
      showProviders: true,
      syncStatusText: "synced",
    };
    const shellBehavior = {
      handleProvidersIntent,
      handleSearchIntent,
      handleDiagnosticsIntent,
      handleHeaderSearchSubmit,
    };
    const localState = {
      messages: { nav: { providers: "Sessions" } },
      locale: "en",
      setLocale: vi.fn(),
      providersDiagnosticsOpen: false,
      setProvidersDiagnosticsOpen: vi.fn(),
      setupGuideOpen: false,
      setSetupGuideOpen: vi.fn(),
      headerSearchDraft: "",
      setHeaderSearchDraft: vi.fn(),
      headerSearchSeed: "",
      setHeaderSearchSeed: vi.fn(),
      searchThreadContext: null,
      setSearchThreadContext: vi.fn(),
      providerProbeFilterIntent: null,
      setProviderProbeFilterIntent: vi.fn(),
      acknowledgedForensicsErrorKeys: { analyze: "", cleanup: "" },
      setAcknowledgedForensicsErrorKeys: vi.fn(),
      changeLayoutView: vi.fn(),
      changeProviderView: vi.fn(),
      openProvidersHome: vi.fn(),
      showRuntimeBackendDegraded: false,
      emptySessionScopeLabel: "All",
      analyzeErrorKey: "",
      cleanupErrorKey: "",
      runtimeBackend: undefined,
      threadSearchInputRef: { current: null },
      detailLayoutRef: { current: null },
    };

    const ctx = createAppContextValue({
      appData: appData as never,
      shellModel: shellModel as never,
      shellBehavior: shellBehavior as never,
      localState: localState as never,
    });

    expect(ctx.layoutView).toBe("overview");
    expect(ctx.showProviders).toBe(true);
    expect(ctx.syncStatusText).toBe("synced");
    expect(ctx.locale).toBe("en");
    expect(ctx.emptySessionScopeLabel).toBe("All");
    expect(ctx.handleProvidersIntent).toBe(handleProvidersIntent);
  });
});
