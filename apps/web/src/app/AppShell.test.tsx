import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/app/AppShell";
import { getMessages } from "@/i18n/catalog";

vi.mock("@/app/components/DetailShell", () => ({
  DetailShell: () => null,
}));

vi.mock("@/app/components/RuntimeFeedbackStack", () => ({
  RuntimeFeedbackStack: () => null,
}));

vi.mock("@/app/components/TopShell", () => ({
  TopShell: () => null,
}));

vi.mock("@/app/components/UpdateBanner", () => ({
  UpdateBanner: () => null,
}));

vi.mock("@/app/components/TabSurfaceSkeleton", () => ({
  TabSurfaceSkeleton: () => (
    <section className="tab-surface-skeleton">
      <div className="tab-surface-skeleton__hero" />
      <div className="tab-surface-skeleton__grid" />
    </section>
  ),
}));

vi.mock("@/features/overview/components/OverviewWorkbench", () => ({
  OverviewWorkbench: () => {
    throw new Promise(() => undefined);
  },
}));

describe("AppShell tab fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dedicated tab surface skeleton for tab transitions", () => {
    const messages = getMessages("en");
    const html = renderToStaticMarkup(
      <AppShell
        messages={messages}
        layoutView="overview"
        showSearch={false}
        showProviders={false}
        showThreadsTable={false}
        topShellProps={{
          layoutView: "overview",
          changeLayoutView: () => undefined,
          openProvidersHome: () => undefined,
          handleSearchIntent: () => undefined,
          handleProvidersIntent: () => undefined,
          headerSearchDraft: "",
          setHeaderSearchDraft: () => undefined,
          handleHeaderSearchSubmit: () => undefined,
          syncStatusText: "",
          theme: "dark",
          setTheme: () => undefined,
          refreshAllData: async () => undefined,
          busy: false,
          refreshingAllData: false,
          locale: "en",
          setLocale: () => undefined,
          messages,
        }}
        runtimeFeedbackProps={{
          messages,
          hasGlobalErrorStack: false,
          runtime: {},
          smokeStatus: {},
          recovery: {},
          providerMatrix: {},
          providerSessions: {},
          providerParserHealth: {},
          showGlobalAnalyzeDeleteError: false,
          analyzeDeleteErrorMessage: "",
          showGlobalCleanupDryRunError: false,
          cleanupDryRunErrorMessage: "",
          providerSessionActionError: null,
          providerSessionActionErrorMessage: "",
          bulkActionError: null,
          bulkActionErrorMessage: "",
          showRuntimeBackendDegraded: false,
          busy: false,
        }}
        showRuntimeBackendDegraded={false}
        runtimeBackend={undefined}
        showUpdateBanner={false}
        updateCheckData={null}
        onDismissUpdate={() => undefined}
      />,
    );

    expect(html).toContain("tab-surface-skeleton");
    expect(html).toContain("tab-surface-skeleton__hero");
    expect(html).toContain("tab-surface-skeleton__grid");
  });
});
