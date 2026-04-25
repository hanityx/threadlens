import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/i18n";
import { getMessages } from "@/i18n/catalog";
import { TopShell, type TopShellProps } from "@/app/components/TopShell";

function renderTopShell(locale: Locale) {
  const props = {
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
  } as unknown as TopShellProps;

  return renderToStaticMarkup(<TopShell {...props} />);
}

describe("TopShell", () => {
  it("renders a compact locale picker without keeping closed options in tab order", () => {
    const html = renderTopShell("en");

    expect(html).toContain("EN");
    expect(html).toContain("English");
    expect(html).toContain('class="locale-picker is-compact"');
    expect(html).toContain('aria-label="Language: English"');
    expect(html).not.toContain("한국어");
    expect(html).not.toContain("Русский");
    expect(html).not.toContain('role="listbox"');
    expect(html).not.toContain('role="option"');
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
