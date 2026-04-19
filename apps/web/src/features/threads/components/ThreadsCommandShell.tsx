import type { Dispatch, Ref, SetStateAction } from "react";
import type { Messages } from "@/i18n";

type ThreadsCommandShellProps = {
  messages: Messages;
  threadSearchInputRef: Ref<HTMLInputElement>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  filterMode: "all" | "high-risk" | "pinned";
  setFilterMode: Dispatch<SetStateAction<"all" | "high-risk" | "pinned">>;
  filteredCount: number;
  highRiskVisibleCount: number;
  pinnedCount: number;
  selectedCount: number;
  dryRunReady: boolean;
};

export function ThreadsCommandShell({
  messages,
  threadSearchInputRef,
  query,
  setQuery,
  filterMode,
  setFilterMode,
  filteredCount,
  highRiskVisibleCount,
  pinnedCount,
  selectedCount,
  dryRunReady,
}: ThreadsCommandShellProps) {
  return (
    <section className="page-section-header cleanup-command-shell">
      <div className="cleanup-command-body">
        <div className="thread-workflow-copy">
          <div className="thread-workflow-copy-eyebrow">
            <span className="overview-note-label">{messages.threadsTable.heroEyebrow}</span>
          </div>
          <strong>{messages.threadsTable.heroTitle}</strong>
          <p>{messages.threadsTable.heroBody}</p>
        </div>
        <div className="thread-status-grid">
          <article className="thread-status-card">
            <span>{messages.threadsTable.heroStatThreads}</span>
            <strong>{filteredCount}</strong>
          </article>
          {highRiskVisibleCount > 0 ? (
            <article className="thread-status-card is-warn">
              <span>{messages.threadsTable.heroStatHighSignal}</span>
              <strong>{highRiskVisibleCount}</strong>
            </article>
          ) : null}
          {pinnedCount > 0 ? (
            <article className="thread-status-card">
              <span>{messages.threadsTable.heroStatPinned}</span>
              <strong>{pinnedCount}</strong>
            </article>
          ) : null}
          {selectedCount > 0 ? (
            <article className="thread-status-card is-accent">
              <span>{messages.threadsTable.heroStatSelected}</span>
              <strong>{selectedCount}</strong>
            </article>
          ) : null}
          <article className={`thread-status-card ${dryRunReady ? "is-ready" : ""}`.trim()}>
            <span>{messages.threadsTable.heroStatDryRun}</span>
            <strong>{dryRunReady ? "ready" : "—"}</strong>
          </article>
        </div>
        <section className="toolbar cleanup-toolbar">
          <div className="toolbar-search-shell is-input">
            <span className="toolbar-search-prompt" aria-hidden="true">
              &gt;
            </span>
            <input
              ref={threadSearchInputRef}
              placeholder={messages.toolbar.searchThreads}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  (event.currentTarget as HTMLInputElement).blur();
                }
              }}
              className="search-input toolbar-search-input"
            />
          </div>
          <div className="toolbar-search-shell is-select">
            <select
              className="filter-select toolbar-search-select"
              value={filterMode}
              onChange={(event) => setFilterMode(event.target.value as "all" | "high-risk" | "pinned")}
            >
              <option value="all">{messages.toolbar.all}</option>
              <option value="high-risk">{messages.toolbar.highRisk}</option>
              <option value="pinned">{messages.toolbar.pinned}</option>
            </select>
            <span className="toolbar-search-chevron" aria-hidden="true">
              ▾
            </span>
          </div>
        </section>
      </div>
    </section>
  );
}
