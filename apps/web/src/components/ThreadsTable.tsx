import type { Messages } from "../i18n";
import type { ThreadRow } from "../types";
import { SKELETON_ROWS } from "../types";

export interface ThreadsTableProps {
  messages: Messages;
  visibleRows: ThreadRow[];
  filteredRows: ThreadRow[];
  totalCount: number;
  threadsLoading: boolean;
  threadsError: boolean;

  selected: Record<string, boolean>;
  setSelected: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  selectedThreadId: string;
  setSelectedThreadId: (id: string) => void;
  allFilteredSelected: boolean;
  toggleSelectAllFiltered: (checked: boolean) => void;
  selectedIds: string[];

  busy: boolean;
  threadActionsDisabled: boolean;
  bulkPin: (ids: string[]) => void;
  bulkUnpin: (ids: string[]) => void;
  bulkArchive: (ids: string[]) => void;
  analyzeDelete: (ids: string[]) => void;
  cleanupDryRun: (ids: string[]) => void;
}

export function ThreadsTable(props: ThreadsTableProps) {
  const {
    messages,
    visibleRows,
    filteredRows,
    totalCount,
    threadsLoading,
    threadsError,
    selected,
    setSelected,
    selectedThreadId,
    setSelectedThreadId,
    allFilteredSelected,
    toggleSelectAllFiltered,
    selectedIds,
    busy,
    threadActionsDisabled,
    bulkPin,
    bulkUnpin,
    bulkArchive,
    analyzeDelete,
    cleanupDryRun,
  } = props;
  const disabledReason = threadActionsDisabled
    ? messages.threadsTable.backendDownHint
    : undefined;

  return (
    <section className="panel">
      <header>
        <h2>{messages.threadsTable.title}</h2>
        <span>
          {filteredRows.length} {messages.threadsTable.filtered} / {totalCount} {messages.threadsTable.total}
        </span>
      </header>
      <div className="sticky-action-stack">
        <div className="sub-toolbar sticky-action-bar">
          <label className="check-inline">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
            />
            {messages.threadsTable.selectAllFiltered}
          </label>
          <span className="sub-hint">
            {messages.threadsTable.selected} {selectedIds.length} · {messages.threadsTable.rendered} {visibleRows.length}/
            {filteredRows.length}
          </span>
        </div>
        <div className="sub-toolbar sticky-action-bar action-toolbar">
          <button
            className="btn-base"
            disabled={selectedIds.length === 0 || busy || threadActionsDisabled}
            title={disabledReason}
            onClick={() => bulkPin(selectedIds)}
          >
            {messages.threadsTable.bulkPin}
          </button>
          <button
            className="btn-base"
            disabled={selectedIds.length === 0 || busy || threadActionsDisabled}
            title={disabledReason}
            onClick={() => bulkUnpin(selectedIds)}
          >
            {messages.threadsTable.bulkUnpin}
          </button>
          <button
            className="btn-accent"
            disabled={selectedIds.length === 0 || busy || threadActionsDisabled}
            title={disabledReason}
            onClick={() => bulkArchive(selectedIds)}
          >
            {messages.threadsTable.bulkArchive}
          </button>
          <button
            className="btn-outline"
            disabled={selectedIds.length === 0 || busy || threadActionsDisabled}
            title={disabledReason}
            onClick={() => analyzeDelete(selectedIds)}
          >
            {messages.threadsTable.bulkImpact}
          </button>
          <button
            className="btn-outline"
            disabled={selectedIds.length === 0 || busy || threadActionsDisabled}
            title={disabledReason}
            onClick={() => cleanupDryRun(selectedIds)}
          >
            {messages.threadsTable.bulkCleanupDryRun}
          </button>
        </div>
        {threadActionsDisabled ? <p className="sub-hint">{messages.threadsTable.backendDownHint}</p> : null}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>{messages.threadsTable.colTitle}</th>
              <th>{messages.threadsTable.colRisk}</th>
              <th>{messages.threadsTable.colPinned}</th>
              <th>{messages.threadsTable.colSource}</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const checked = Boolean(selected[row.thread_id]);
              const isHighRisk = Number(row.risk_score ?? 0) >= 70;
              return (
                <tr
                  key={row.thread_id}
                  className={`${isHighRisk ? "risk-row" : ""} ${selectedThreadId === row.thread_id ? "active-row" : ""}`.trim()}
                  onClick={() => {
                    setSelectedThreadId(row.thread_id);
                    setSelected((prev) => ({ ...prev, [row.thread_id]: true }));
                  }}
                >
                  <td>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [row.thread_id]: e.target.checked }))}
                    />
                  </td>
                  <td className="title-col">
                    <div className="title-main">{row.title || row.thread_id}</div>
                    <div className="mono-sub">{row.thread_id}</div>
                  </td>
                  <td>{row.risk_score ?? 0}</td>
                  <td>{row.is_pinned ? messages.common.yes : messages.common.no}</td>
                  <td>{row.source || row.project_bucket || "-"}</td>
                </tr>
              );
            })}
            {threadsLoading
              ? Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
                  <tr key={`threads-skeleton-${idx}`}>
                    <td colSpan={5}>
                      <div className="skeleton-line" />
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
      {threadsError ? <div className="error-box">{messages.errors.threads}</div> : null}
    </section>
  );
}
