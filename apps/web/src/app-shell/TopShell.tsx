import type { LayoutView } from "../types";

type TopShellProps = {
  layoutView: LayoutView;
  onChangeLayoutView: (view: LayoutView) => void;
  onSearchIntent: () => void;
  onProvidersIntent: () => void;
  headerSearchDraft: string;
  onHeaderSearchDraftChange: (value: string) => void;
  onHeaderSearchSubmit: () => void;
  syncStatusText: string;
  theme: string;
  onToggleTheme: () => void;
  onRefresh: () => void;
  refreshDisabled: boolean;
  refreshingAllData: boolean;
  labels: {
    overview: string;
    search: string;
    threads: string;
    providers: string;
    light: string;
    dark: string;
    switchToLight: string;
    switchToDark: string;
    syncHint: string;
  };
};

export function TopShell(props: TopShellProps) {
  const {
    layoutView,
    onChangeLayoutView,
    onSearchIntent,
    onProvidersIntent,
    headerSearchDraft,
    onHeaderSearchDraftChange,
    onHeaderSearchSubmit,
    syncStatusText,
    theme,
    onToggleTheme,
    onRefresh,
    refreshDisabled,
    refreshingAllData,
    labels,
  } = props;

  return (
    <section className="top-actions">
      <div className="top-actions-main">
        <div className="top-actions-copy">
          <strong>ThreadLens</strong>
        </div>
        <nav className="top-surface-nav" aria-label="surface tabs">
          <button
            type="button"
            className={`top-surface-btn ${layoutView === "overview" ? "is-active" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChangeLayoutView("overview")}
          >
            {labels.overview}
          </button>
          <button
            type="button"
            className={`top-surface-btn ${layoutView === "search" ? "is-active" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChangeLayoutView("search")}
            onMouseEnter={onSearchIntent}
            onFocus={onSearchIntent}
          >
            {labels.search}
          </button>
          <button
            type="button"
            className={`top-surface-btn ${layoutView === "threads" ? "is-active" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChangeLayoutView("threads")}
          >
            {labels.threads}
          </button>
          <button
            type="button"
            className={`top-surface-btn ${layoutView === "providers" ? "is-active" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChangeLayoutView("providers")}
            onMouseEnter={onProvidersIntent}
            onFocus={onProvidersIntent}
          >
            {labels.providers}
          </button>
        </nav>
      </div>
      <div className="top-actions-tools">
        <form
          className="top-search-shell"
          onSubmit={(event) => {
            event.preventDefault();
            onHeaderSearchSubmit();
          }}
        >
          <span className="top-search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            className="top-search-input"
            placeholder="Jump to sessions, threads, keywords..."
            value={headerSearchDraft}
            onChange={(event) => onHeaderSearchDraftChange(event.target.value)}
          />
        </form>
        <div className="top-controls">
          <span className="top-sync-status" aria-live="polite">
            {syncStatusText}
          </span>
          <button
            type="button"
            className="btn-outline"
            onClick={onToggleTheme}
            title={theme === "dark" ? labels.switchToLight : labels.switchToDark}
          >
            {theme === "dark" ? labels.light : labels.dark}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={onRefresh}
            disabled={refreshDisabled}
            title={labels.syncHint}
          >
            {refreshingAllData ? "Syncing" : "Sync"}
          </button>
        </div>
      </div>
    </section>
  );
}
