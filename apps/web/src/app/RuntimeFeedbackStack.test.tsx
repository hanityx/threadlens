import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "../i18n";
import { AppContext, type AppContextValue } from "./AppContext";
import { RuntimeFeedbackStack } from "./RuntimeFeedbackStack";

function renderRuntimeFeedback(locale: "en" | "ko" | "ru" = "en") {
  const messages = getMessages(locale);
  const ctx = {
    messages,
    hasGlobalErrorStack: true,
    runtime: { isError: true },
    smokeStatus: { isError: false },
    recovery: { isError: false },
    providerMatrix: { isError: false },
    providerSessions: { isError: false },
    providerParserHealth: { isError: false },
    showGlobalAnalyzeDeleteError: false,
    analyzeDeleteErrorMessage: "",
    showGlobalCleanupDryRunError: false,
    cleanupDryRunErrorMessage: "",
    providerSessionActionError: false,
    providerSessionActionErrorMessage: "",
    bulkActionError: false,
    bulkActionErrorMessage: "",
    showRuntimeBackendDegraded: false,
    busy: false,
    layoutView: "overview",
    changeLayoutView: vi.fn(),
    openProvidersHome: vi.fn(),
    handleSearchIntent: vi.fn(),
    handleProvidersIntent: vi.fn(),
    headerSearchDraft: "",
    setHeaderSearchDraft: vi.fn(),
    handleHeaderSearchSubmit: vi.fn(),
    syncStatusText: "",
    theme: "dark",
    setTheme: vi.fn(),
    refreshAllData: vi.fn(),
    refreshingAllData: false,
    locale,
    setLocale: vi.fn(),
  } as unknown as AppContextValue;

  return renderToStaticMarkup(
    <AppContext.Provider value={ctx}>
      <RuntimeFeedbackStack />
    </AppContext.Provider>,
  );
}

describe("RuntimeFeedbackStack", () => {
  it("renders localized runtime stack headings in Korean", () => {
    const html = renderRuntimeFeedback("ko");

    expect(html).toContain("runtime 문제");
    expect(html).toContain("일부 runtime 작업을 사용할 수 없습니다.");
    expect(html).toContain("runtime 상태를 불러오지 못했습니다");
  });
});
