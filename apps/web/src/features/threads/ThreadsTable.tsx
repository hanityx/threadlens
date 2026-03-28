import type { Messages } from "../../i18n";
import { Button } from "../../design-system/Button";
import { PanelHeader } from "../../design-system/PanelHeader";
import type { ThreadRow } from "../../types";
import { SKELETON_ROWS } from "../../types";
import { normalizeDisplayValue } from "../../lib/helpers";

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
  selectedImpactCount: number;
  dryRunReady: boolean;

  busy: boolean;
  threadActionsDisabled: boolean;
  bulkPin: (ids: string[]) => void;
  bulkUnpin: (ids: string[]) => void;
  bulkArchive: (ids: string[]) => void;
  analyzeDelete: (ids: string[]) => void;
  cleanupDryRun: (ids: string[]) => void;
}

function compactThreadTitle(row: ThreadRow): string {
  const normalized = normalizeDisplayValue(row.title);
  if (!normalized || normalized === row.thread_id) {
    return `thread ${row.thread_id.slice(0, 8)}`;
  }
  return normalized;
}

function compactThreadId(threadId: string): string {
  if (threadId.length <= 18) return threadId;
  return `${threadId.slice(0, 8)}…${threadId.slice(-4)}`;
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
    selectedImpactCount,
    dryRunReady,
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
  const selectedRow =
    (selectedThreadId
      ? visibleRows.find((row) => row.thread_id === selectedThreadId) ??
        filteredRows.find((row) => row.thread_id === selectedThreadId)
      : null) ?? null;
  const selectVisibleRows = (mode: "all" | "high-risk" | "pinned") => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of visibleRows) {
        if (mode === "all") {
          next[row.thread_id] = true;
          continue;
        }
        if (mode === "high-risk") {
          next[row.thread_id] = Number(row.risk_score ?? 0) >= 70;
          continue;
        }
        next[row.thread_id] = Boolean(row.is_pinned);
      }
      return next;
    });
  };
  const clearVisibleSelection = () => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of visibleRows) {
        next[row.thread_id] = false;
      }
      return next;
    });
  };

  return (
    <section className="panel threads-table-panel">
      <PanelHeader
        title={messages.threadsTable.title}
        subtitle={
          <>
            {filteredRows.length} {messages.threadsTable.filtered} / {totalCount} {messages.threadsTable.total}
          </>
        }
      />
      <div className="sticky-action-stack">
        <div className="sub-toolbar sticky-action-bar cleanup-status-strip">
          <div className="cleanup-status-inline">
            <span className={`status-pill ${selectedIds.length > 0 ? "status-active" : "status-preview"}`}>
              {messages.threadsTable.workflowSelectedTitle} {selectedIds.length}
            </span>
            <span className={`status-pill ${selectedImpactCount > 0 ? "status-active" : "status-preview"}`}>
              {messages.threadsTable.workflowImpactTitle}{" "}
              {selectedImpactCount > 0 ? selectedImpactCount : messages.forensics.stagePending}
            </span>
            <span className={`status-pill ${dryRunReady ? "status-active" : "status-preview"}`}>
              {messages.threadsTable.workflowDryRunTitle}{" "}
              {dryRunReady ? messages.forensics.stageReady : messages.forensics.stagePending}
            </span>
          </div>
          <div className="thread-toolbar-group thread-toolbar-group-inline cleanup-inline-tools">
            <div className="thread-toolbar-inline">
              <Button variant="outline" onClick={() => selectVisibleRows("all")}>
                {messages.threadsTable.quickSelectAllVisible}
              </Button>
              <Button variant="outline" onClick={() => selectVisibleRows("high-risk")}>
                {messages.threadsTable.quickSelectHighRisk}
              </Button>
              <Button variant="outline" onClick={() => selectVisibleRows("pinned")}>
                {messages.threadsTable.quickSelectPinned}
              </Button>
              <Button variant="outline" onClick={clearVisibleSelection}>
                {messages.threadsTable.quickClearVisible}
              </Button>
            </div>
            <span className="sub-hint">
              {selectedRow ? selectedRow.title || selectedRow.thread_id : messages.forensics.stagePending}
              {" · "}
              {messages.threadsTable.rendered} {visibleRows.length}/
              {filteredRows.length}
            </span>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
              />
              {messages.threadsTable.selectAllFiltered}
            </label>
          </div>
        </div>
        <div className="sub-toolbar sticky-action-bar action-toolbar">
          <div className="thread-toolbar-group">
            <div className="thread-toolbar-inline">
              <Button
                variant="base"
                disabled={selectedIds.length === 0 || busy || threadActionsDisabled}
                title={disabledReason}
                onClick={() => bulkPin(selectedIds)}
              >
                {messages.threadsTable.bulkPin}
              </Button>
              <Button
                variant="base"
                disabled={selectedIds.length === 0 || busy || threadActionsDisabled}
                title={disabledReason}
                onClick={() => bulkUnpin(selectedIds)}
              >
                {messages.threadsTable.bulkUnpin}
              </Button>
              <Button
                variant="accent"
                disabled={selectedIds.length === 0 || busy || threadActionsDisabled}
                title={disabledReason}
                onClick={() => bulkArchive(selectedIds)}
              >
                {messages.threadsTable.bulkArchive}
              </Button>
              <Button
                variant="outline"
                disabled={selectedIds.length === 0 || busy || threadActionsDisabled}
                title={disabledReason}
                onClick={() => analyzeDelete(selectedIds)}
              >
                {messages.threadsTable.bulkImpact}
              </Button>
              <Button
                variant="outline"
                disabled={selectedIds.length === 0 || busy || threadActionsDisabled}
                title={disabledReason}
                onClick={() => cleanupDryRun(selectedIds)}
              >
                {messages.threadsTable.bulkCleanupDryRun}
              </Button>
            </div>
          </div>
          <div className="thread-toolbar-group">
            {threadActionsDisabled ? (
              <span className="sub-hint">{messages.threadsTable.backendDownHint}</span>
            ) : (
              <span className="sub-hint">{messages.threadsTable.resultHint}</span>
            )}
          </div>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="table-select-column"></th>
              <th className="title-col">{messages.threadsTable.colTitle}</th>
              <th className="col-risk">{messages.threadsTable.colRisk}</th>
              <th className="col-pinned">{messages.threadsTable.colPinned}</th>
              <th className="col-source">{messages.threadsTable.colSource}</th>
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
                  }}
                >
                  <td className="table-select-cell">
                    <label
                      className={`table-select-target ${checked ? "is-checked" : ""}`.trim()}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <input
                        className="table-select-checkbox"
                        type="checkbox"
                        checked={checked}
                        aria-label={`Select thread ${normalizeDisplayValue(row.title) || row.thread_id}`}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [row.thread_id]: e.target.checked }))}
                      />
                    </label>
                  </td>
                  <td className="title-col">
                    <div
                      className="title-main thread-table-title"
                      title={normalizeDisplayValue(row.title) || row.thread_id}
                    >
                      {compactThreadTitle(row)}
                      {selectedThreadId === row.thread_id ? (
                        <span className="status-pill status-active" style={{ marginLeft: 8 }}>
                          {messages.threadsTable.currentSelection}
                        </span>
                      ) : null}
                    </div>
                    <div className="mono-sub thread-table-id" title={row.thread_id}>
                      {compactThreadId(row.thread_id)}
                    </div>
                  </td>
                  <td className="col-risk">{row.risk_score ?? 0}</td>
                  <td className="col-pinned">{row.is_pinned ? messages.common.yes : messages.common.no}</td>
                  <td className="col-source">{row.source || row.project_bucket || "-"}</td>
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
