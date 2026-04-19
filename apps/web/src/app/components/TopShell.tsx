import type { FocusEventHandler, MouseEventHandler } from "react";
import { useAppContext } from "@/app/AppContext";
import { Button } from "@/shared/ui/components/Button";
import { SegmentedNav, type SegmentedNavItem } from "@/shared/ui/components/SegmentedNav";
import { LocalePicker } from "@/app/components/LocalePicker";

export function TopShell() {
  const {
    layoutView,
    changeLayoutView,
    openProvidersHome,
    handleSearchIntent,
    handleProvidersIntent,
    headerSearchDraft,
    setHeaderSearchDraft,
    handleHeaderSearchSubmit,
    syncStatusText,
    theme,
    setTheme,
    refreshAllData,
    busy,
    refreshingAllData,
    locale,
    setLocale,
    messages,
  } = useAppContext();

  const navItems: SegmentedNavItem[] = [
    {
      id: "overview",
      label: messages.nav.overview,
      onMouseDown: ((event) => event.preventDefault()) as MouseEventHandler<HTMLButtonElement>,
    },
    {
      id: "search",
      label: messages.nav.search,
      onMouseDown: ((event) => event.preventDefault()) as MouseEventHandler<HTMLButtonElement>,
      onMouseEnter: handleSearchIntent as MouseEventHandler<HTMLButtonElement>,
      onFocus: handleSearchIntent as FocusEventHandler<HTMLButtonElement>,
    },
    {
      id: "threads",
      label: messages.nav.threads,
      onMouseDown: ((event) => event.preventDefault()) as MouseEventHandler<HTMLButtonElement>,
    },
    {
      id: "providers",
      label: messages.nav.providers,
      onMouseDown: ((event) => event.preventDefault()) as MouseEventHandler<HTMLButtonElement>,
      onMouseEnter: handleProvidersIntent as MouseEventHandler<HTMLButtonElement>,
      onFocus: handleProvidersIntent as FocusEventHandler<HTMLButtonElement>,
    },
  ];

  const handleSelectNav = (id: string) => {
    if (id === "overview" || id === "search" || id === "threads") {
      changeLayoutView(id);
      return;
    }
    openProvidersHome();
  };

  return (
    <section className="top-actions">
      <div className="top-actions-main">
        <SegmentedNav
          items={navItems}
          activeId={layoutView}
          onSelect={handleSelectNav}
          ariaLabel={messages.nav.surfaceTabs}
        />
      </div>
      <div className="top-actions-tools">
        <form
          className="top-search-shell"
          onSubmit={(event) => {
            event.preventDefault();
            handleHeaderSearchSubmit();
          }}
        >
          <span className="top-search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            className="top-search-input"
            placeholder={messages.nav.jumpPlaceholder}
            value={headerSearchDraft}
            onChange={(event) => setHeaderSearchDraft(event.target.value)}
          />
        </form>
        <div className="top-controls">
          <span className="top-sync-status" aria-live="polite">
            {syncStatusText}
          </span>
          <Button
            variant="outline"
            onClick={() => setTheme(prev => prev === "dark" ? "light" : "dark")}
            title={
              theme === "dark" ? messages.nav.switchToLight : messages.nav.switchToDark
            }
          >
            {theme === "dark" ? messages.nav.light : messages.nav.dark}
          </Button>
          <Button
            variant="outline"
            onClick={() => void refreshAllData()}
            disabled={busy || refreshingAllData}
            title={messages.nav.syncHint}
          >
            {refreshingAllData ? messages.nav.syncing : messages.nav.syncNow}
          </Button>
          <LocalePicker
            id="top-shell-locale"
            locale={locale}
            setLocale={setLocale}
            label={messages.nav.locale}
            compact
          />
        </div>
      </div>
    </section>
  );
}
