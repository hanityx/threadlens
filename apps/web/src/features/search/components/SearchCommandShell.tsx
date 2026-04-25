import type { Dispatch, Ref, SetStateAction } from "react";
import type { Messages } from "@/i18n";
import type { RecentSearch } from "@/features/search/model/searchPanelModel";
import { formatRecentTime, formatSearchMessage } from "@/features/search/model/searchPanelModel";

type SearchProviderOption = { id: string; name: string };

type SearchCommandShellProps = {
  messages: Messages;
  provider: string;
  providerOptions: SearchProviderOption[];
  providerLabel: string;
  searchEnabled: boolean;
  inputRef: Ref<HTMLInputElement>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  recentLayout: "empty" | "inline" | "strip";
  visibleRecentSearches: RecentSearch[];
  onSelectProvider: (providerId: string) => void;
  onRemoveRecent: (query: string) => void;
};

export function SearchCommandShell({
  messages,
  provider,
  providerOptions,
  providerLabel,
  searchEnabled,
  inputRef,
  query,
  setQuery,
  recentLayout,
  visibleRecentSearches,
  onSelectProvider,
  onRemoveRecent,
}: SearchCommandShellProps) {
  return (
    <div className="search-command-shell">
      <div className="search-command-body">
        <div className="search-command-left">
          <div className="search-command-bar">
            <span className="search-command-prompt" aria-hidden="true">&gt;</span>
            <input
              ref={inputRef}
              type="search"
              className="search-input search-input-stage"
              aria-label={messages.search.inputAriaLabel}
              placeholder={messages.search.inputPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="search-command-meta-group">
            <div className="search-scope-label">{messages.search.providerFilter}</div>
            <div className="search-scope-chips" aria-label={messages.search.providerFilter}>
              <button
                type="button"
                className={`status-pill-button search-pill ${provider === "all" ? "status-active" : "status-preview"}`.trim()}
                onClick={() => onSelectProvider("all")}
              >
                {messages.search.allProviders}
              </button>
              {providerOptions
                .filter((item) => item.id !== "all")
                .map((item) => (
                  <button
                    key={`search-chip-${item.id}`}
                    type="button"
                    className={`status-pill-button search-pill ${provider === item.id ? "status-active" : "status-preview"}`.trim()}
                    onClick={() => onSelectProvider(item.id)}
                  >
                    {item.name}
                  </button>
                ))}
            </div>
          </div>
        </div>
        <div className="search-command-tips">
          <div className="search-tips-col">
            <div className="search-scope-label">{messages.search.tipsLabel}</div>
            <div className="search-tips-list">
              <div className="search-tip-row">
                <span className="search-tip-key">{messages.search.tipKeywordsLabel}</span>
                <span className="search-tip-desc">{messages.search.tipKeywordsBody}</span>
              </div>
              <div className="search-tip-row">
                <span className="search-tip-key">{messages.search.tipFilenameLabel}</span>
                <span className="search-tip-desc">{messages.search.tipFilenameBody}</span>
              </div>
              <div className="search-tip-row">
                <span className="search-tip-key">{messages.search.tipScopeLabel}</span>
                <span className="search-tip-desc">{messages.search.tipScopeBody}</span>
              </div>
            </div>
          </div>
          <div className="search-tips-col">
            <div className="search-scope-label">{messages.search.shortcutsLabel}</div>
            <div className="search-tips-shortcuts">
              <div className="search-tip-row">
                <kbd className="search-tip-kbd">⌘K</kbd>
                <span className="search-tip-desc">{messages.search.shortcutFocus}</span>
              </div>
              <div className="search-tip-row">
                <kbd className="search-tip-kbd">Esc</kbd>
                <span className="search-tip-desc">{messages.search.shortcutClear}</span>
              </div>
            </div>
          </div>
          {recentLayout !== "strip" ? (
            <div
              className={`search-tips-recent-inline${recentLayout === "empty" ? " is-empty" : ""}`.trim()}
            >
              <div className="search-scope-label">{messages.search.recentSearches}</div>
              {recentLayout === "empty" ? (
                <p className="search-recent-empty search-recent-empty-inline">
                  {messages.search.recentEmpty}
                </p>
              ) : (
                <div
                  className={`search-recent-list search-recent-list-inline${visibleRecentSearches.length === 2 ? " is-pair" : ""}`.trim()}
                >
                  {visibleRecentSearches.map((item) => (
                    <div key={item.ts} className="search-recent-item">
                      <button
                        type="button"
                        className="search-recent-main"
                        onClick={() => setQuery(item.q)}
                      >
                        <span className="search-recent-icon" aria-hidden="true">↺</span>
                        <span className="search-recent-query">{item.q}</span>
                        <span className="search-recent-time">{formatRecentTime(item.ts, messages.search)}</span>
                      </button>
                      <button
                        type="button"
                        className="search-recent-remove"
                        aria-label={formatSearchMessage(messages.search.removeRecentAria, {
                          query: item.q,
                        })}
                        onClick={() => onRemoveRecent(item.q)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
      {recentLayout === "strip" ? (
        <div className="search-command-recent-strip">
          <div className="search-scope-label">{messages.search.recentSearches}</div>
          <div className="search-recent-list">
            {visibleRecentSearches.map((item) => (
              <div key={item.ts} className="search-recent-item">
                <button
                  type="button"
                  className="search-recent-main"
                  onClick={() => setQuery(item.q)}
                >
                  <span className="search-recent-icon" aria-hidden="true">↺</span>
                  <span className="search-recent-query">{item.q}</span>
                  <span className="search-recent-time">{formatRecentTime(item.ts, messages.search)}</span>
                </button>
                <button
                  type="button"
                  className="search-recent-remove"
                  aria-label={formatSearchMessage(messages.search.removeRecentAria, {
                    query: item.q,
                  })}
                  onClick={() => onRemoveRecent(item.q)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
