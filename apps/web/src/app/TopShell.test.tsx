import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages, type Locale } from "@/i18n";
import { AppContext, type AppContextValue } from "@/app/AppContext";
import { TopShell } from "@/app/components/TopShell";

function renderTopShell(locale: Locale) {
  const ctx = {
    layoutView: "overview",
    changeLayoutView: vi.fn(),
    openProvidersHome: vi.fn(),
    handleSearchIntent: vi.fn(),
    handleProvidersIntent: vi.fn(),
    headerSearchDraft: "",
    setHeaderSearchDraft: vi.fn(),
    handleHeaderSearchSubmit: vi.fn(),
    syncStatusText: locale === "ko" ? "방금 동기화됨" : "Synced just now",
    theme: "dark",
    setTheme: vi.fn(),
    refreshAllData: vi.fn(),
    busy: false,
    refreshingAllData: false,
    locale,
    setLocale: vi.fn(),
    messages: getMessages(locale),
  } as unknown as AppContextValue;

  return renderToStaticMarkup(
    <AppContext.Provider value={ctx}>
      <TopShell />
    </AppContext.Provider>,
  );
}

describe("TopShell", () => {
  it("renders the locale picker with compact language code and locale labels", () => {
    const html = renderTopShell("en");

    expect(html).toContain("EN");
    expect(html).toContain("English");
    expect(html).toContain("한국어");
    expect(html).toContain("Русский");
    expect(html).toContain('role="listbox"');
    expect(html).toContain('role="option"');
    expect(html).toContain('aria-selected="true"');
  });

  it("keeps top-level navigation labels in English even when the locale is Spanish", () => {
    const messages = getMessages("es");
    const html = renderTopShell("es");

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(">Overview<");
    expect(html).toContain(">Search<");
    expect(html).toContain(">Thread<");
    expect(html).toContain(">Sessions<");
    expect(html).toContain(messages.nav.jumpPlaceholder);
    expect(html).toContain(messages.nav.syncNow);
  });

  it("keeps top-level navigation labels in English even when the locale is Russian", () => {
    const messages = getMessages("ru");
    const html = renderTopShell("ru");

    expect(html).toContain(">Overview<");
    expect(html).toContain(">Search<");
    expect(html).toContain(">Thread<");
    expect(html).toContain(">Sessions<");
    expect(html).toContain(messages.nav.jumpPlaceholder);
  });

  it("keeps top-level navigation labels in English even when the locale is Japanese", () => {
    const messages = getMessages("ja");
    const html = renderTopShell("ja");

    expect(html).toContain(">Overview<");
    expect(html).toContain(">Search<");
    expect(html).toContain(">Thread<");
    expect(html).toContain(">Sessions<");
    expect(html).toContain(messages.nav.jumpPlaceholder);
  });

  it("keeps top-level navigation labels in English even when the locale is Simplified Chinese", () => {
    const messages = getMessages("zh-CN");
    const html = renderTopShell("zh-CN");

    expect(html).toContain(">Overview<");
    expect(html).toContain(">Search<");
    expect(html).toContain(">Thread<");
    expect(html).toContain(">Sessions<");
    expect(html).toContain(messages.nav.jumpPlaceholder);
  });
});
