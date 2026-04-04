import { useAppContext } from "./AppContext";
import { Button } from "../design-system/Button";
import { LocalePicker } from "./LocalePicker";

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

  return (
    <section className="top-actions">
      <div className="top-actions-main">
        <nav className="top-surface-nav" aria-label={messages.nav.surfaceTabs}>
          <button
            type="button"
            className={`top-surface-btn ${layoutView === "overview" ? "is-active" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => changeLayoutView("overview")}
          >
            {messages.nav.overview}
          </button>
          <button
            type="button"
            className={`top-surface-btn ${layoutView === "search" ? "is-active" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => changeLayoutView("search")}
            onMouseEnter={handleSearchIntent}
            onFocus={handleSearchIntent}
          >
            {messages.nav.search}
          </button>
          <button
            type="button"
            className={`top-surface-btn ${layoutView === "threads" ? "is-active" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => changeLayoutView("threads")}
          >
            {messages.nav.threads}
          </button>
          <button
            type="button"
            className={`top-surface-btn ${layoutView === "providers" ? "is-active" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={openProvidersHome}
            onMouseEnter={handleProvidersIntent}
            onFocus={handleProvidersIntent}
          >
            {messages.nav.providers}
          </button>
        </nav>
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
