import type { ReactNode, Ref } from "react";
import type { Messages } from "../i18n";
import { ThreadsTable, type ThreadsTableProps } from "../components/ThreadsTable";

type ThreadsWorkbenchProps = {
  messages: Messages;
  threadSearchInputRef: Ref<HTMLInputElement>;
  query: string;
  onQueryChange: (value: string) => void;
  filterMode: "all" | "high-risk" | "pinned";
  onFilterModeChange: (value: "all" | "high-risk" | "pinned") => void;
  threadsFetchMs: number | null;
  threadsFastBooting: boolean;
  visibleCount: number;
  filteredCount: number;
  selectedCount: number;
  dryRunReady: boolean;
  selectedImpactCount: number;
  showForensics: boolean;
  threadsTableProps: ThreadsTableProps;
  forensicsSlot: ReactNode;
};

export function ThreadsWorkbench(props: ThreadsWorkbenchProps) {
  const {
    messages,
    threadSearchInputRef,
    query,
    onQueryChange,
    filterMode,
    onFilterModeChange,
    threadsFetchMs,
    threadsFastBooting,
    visibleCount,
    filteredCount,
    selectedCount,
    dryRunReady,
    selectedImpactCount,
    showForensics,
    threadsTableProps,
    forensicsSlot,
  } = props;

  return (
    <>
      <section className="panel cleanup-command-shell">
        <header>
          <h2>Review</h2>
          <span>impact / dry-run</span>
        </header>
        <div className="cleanup-command-body">
          <div className="thread-workflow-copy">
            <span className="overview-note-label">review workbench</span>
            <strong>pick threads and review</strong>
            <p>impact / dry-run / rail</p>
          </div>
          <div className="thread-status-grid">
            <article className="thread-status-card">
              <span>visible</span>
              <strong>{visibleCount}/{filteredCount}</strong>
              <p>rows</p>
            </article>
            <article className={`thread-status-card ${selectedCount > 0 ? "is-accent" : ""}`.trim()}>
              <span>selected</span>
              <strong>{selectedCount}</strong>
              <p>review rail</p>
            </article>
            <article className={`thread-status-card ${dryRunReady ? "is-ready" : ""}`.trim()}>
              <span>dry-run</span>
              <strong>{dryRunReady ? "ready" : "pending"}</strong>
              <p>{selectedImpactCount > 0 ? `${selectedImpactCount} impact` : "impact first"}</p>
            </article>
          </div>
          <section className="toolbar cleanup-toolbar">
            <input
              ref={threadSearchInputRef}
              placeholder={messages.toolbar.searchThreads}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  (event.currentTarget as HTMLInputElement).blur();
                }
              }}
              className="search-input"
            />
            <select
              className="filter-select"
              value={filterMode}
              onChange={(event) => onFilterModeChange(event.target.value as "all" | "high-risk" | "pinned")}
            >
              <option value="all">{messages.toolbar.all}</option>
              <option value="high-risk">{messages.toolbar.highRisk}</option>
              <option value="pinned">{messages.toolbar.pinned}</option>
            </select>
            <span className="sub-hint">
              fetch {threadsFetchMs !== null ? `${threadsFetchMs}ms` : "-"}
            </span>
            {threadsFastBooting ? (
              <span className="sub-hint">fast boot</span>
            ) : null}
            <span className="sub-hint">review rail</span>
          </section>
        </div>
      </section>

      <section className={`${showForensics ? "ops-layout" : "ops-layout single"}`.trim()}>
        <ThreadsTable {...threadsTableProps} />
        {showForensics ? forensicsSlot : null}
      </section>
    </>
  );
}
