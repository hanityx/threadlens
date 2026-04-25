import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { getMessages } from "@/i18n/catalog";
import { SearchCommandShell } from "@/features/search/components/SearchCommandShell";

const messages = getMessages("en");

describe("SearchCommandShell", () => {
  it("renders recent search apply and remove controls as separate buttons", () => {
    const html = renderToStaticMarkup(
      <SearchCommandShell
        messages={messages}
        provider="all"
        providerOptions={[{ id: "codex", name: "Codex" }]}
        providerLabel="All AI"
        searchEnabled={false}
        inputRef={createRef<HTMLInputElement>()}
        query=""
        setQuery={vi.fn()}
        recentLayout="inline"
        visibleRecentSearches={[{ q: "아니", ts: 1 }]}
        onSelectProvider={vi.fn()}
        onRemoveRecent={vi.fn()}
      />,
    );

    expect(html).toContain('class="search-recent-item"');
    expect(html).toContain('class="search-recent-main"');
    expect(html).toContain('class="search-recent-remove"');
    expect(html).not.toContain('class="search-recent-main"><button');
  });
});
