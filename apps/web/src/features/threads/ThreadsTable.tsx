import type { CSSProperties } from "react";
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
  dryRunReadyIds: string[];

  busy: boolean;
  threadActionsDisabled: boolean;
  bulkArchive: (ids: string[]) => void;
  analyzeDelete: (ids: string[]) => void;
  cleanupDryRun: (ids: string[]) => void;
  cleanupExecute: (ids: string[]) => void;
  onRequestHardDeleteConfirm: () => void;
  hardDeleteConfirmOpen: boolean;
  hardDeleteSkipConfirmChecked: boolean;
  onToggleHardDeleteSkipConfirmChecked: (checked: boolean) => void;
  onConfirmHardDelete: () => void;
  onCancelHardDeleteConfirm: () => void;
  panelStyle?: CSSProperties;
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

function compactThreadSource(row: ThreadRow): string {
  const source = normalizeDisplayValue(row.source || row.project_bucket || "-");
  if (!source) return "-";
  if (/^archived[_-]/i.test(source) || /archived/i.test(source)) {
    return "archive";
  }
  return source;
}

export function toggleVisibleSelectionState(
  visibleRows: ThreadRow[],
  selected: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...selected };
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => Boolean(selected[row.thread_id]));

  for (const row of visibleRows) {
    next[row.thread_id] = !allVisibleSelected;
  }

  return next;
}

export function toggleSubsetSelectionState(
  visibleRows: ThreadRow[],
  selected: Record<string, boolean>,
  predicate: (row: ThreadRow) => boolean,
): Record<string, boolean> {
  const matchingIds = visibleRows.filter(predicate).map((row) => row.thread_id);
  if (matchingIds.length === 0) return selected;

  const next = { ...selected };
  const onlyMatchingSelected = visibleRows.every(
    (row) => Boolean(selected[row.thread_id]) === predicate(row),
  );

  for (const row of visibleRows) {
    next[row.thread_id] = onlyMatchingSelected ? false : predicate(row);
  }

  return next;
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
    bulkArchive,
    analyzeDelete,
    cleanupDryRun,
    cleanupExecute,
    onRequestHardDeleteConfirm,
    hardDeleteConfirmOpen,
    hardDeleteSkipConfirmChecked,
    onToggleHardDeleteSkipConfirmChecked,
    onConfirmHardDelete,
    onCancelHardDeleteConfirm,
    panelStyle,
  } = props;
  const disabledReason = threadActionsDisabled
    ? messages.threadsTable.backendDownHint
    : undefined;
  const selectedRow =
    (selectedThreadId
      ? visibleRows.find((row) => row.thread_id === selectedThreadId) ??
        filteredRows.find((row) => row.thread_id === selectedThreadId)
      : null) ?? null;
  const dryRunReadyVisibleIds = visibleRows
    .filter((row) => props.dryRunReadyIds.includes(row.thread_id))
    .map((row) => row.thread_id);
  const selectVisibleRows = (mode: "all" | "high-risk" | "pinned" | "dry-run-ready" | "stale") => {
    setSelected((prev) => {
      if (mode === "all") {
        return toggleVisibleSelectionState(visibleRows, prev);
      }
      if (mode === "dry-run-ready") {
        return toggleSubsetSelectionState(
          visibleRows,
          prev,
          (row) => props.dryRunReadyIds.includes(row.thread_id),
        );
      }
      if (mode === "high-risk") {
        return toggleSubsetSelectionState(
          visibleRows,
          prev,
          (row) => Number(row.risk_score ?? 0) >= 70,
        );
      }
      if (mode === "stale") {
        return toggleSubsetSelectionState(
          visibleRows,
          prev,
          (row) => row.activity_status === "stale",
        );
      }
      return toggleSubsetSelectionState(
        visibleRows,
        prev,
        (row) => Boolean(row.is_pinned),
      );
    });
  };

  return (
    <section className="panel threads-table-panel" style={panelStyle}>
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
              <Button
                variant="outline"
                disabled={dryRunReadyVisibleIds.length === 0}
                title={dryRunReadyVisibleIds.length === 0 ? messages.threadsTable.quickSelectDryRunReadyEmpty : undefined}
                onClick={() => selectVisibleRows("dry-run-ready")}
              >
                {messages.threadsTable.quickSelectDryRunReady}
              </Button>
              <Button variant="outline" onClick={() => selectVisibleRows("stale")}>
                {messages.threadsTable.quickSelectStale}
              </Button>
            </div>
            <span className="sub-hint">
              {selectedRow ? selectedRow.title || selectedRow.thread_id : messages.forensics.stagePending}
              {" · "}
              {messages.threadsTable.rendered} {visibleRows.length}/
              {filteredRows.length}
            </span>
          </div>
        </div>
        <div className="sub-toolbar sticky-action-bar action-toolbar">
          <div className="thread-toolbar-group">
            <div className="thread-toolbar-inline">
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
              <Button
                variant="danger"
                disabled={selectedIds.length === 0 || busy || threadActionsDisabled || !dryRunReady}
                title={dryRunReady ? disabledReason : messages.forensics.cleanupTokenHint}
                onClick={onRequestHardDeleteConfirm}
              >
                {messages.threadsTable.bulkCleanupExecute}
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
        {hardDeleteConfirmOpen ? (
          <div className="provider-hard-delete-confirm" role="dialog" aria-modal="true">
            <div className="provider-hard-delete-confirm-card">
              <strong>{messages.threadsTable.hardDeleteConfirmTitle}</strong>
              <p>{messages.threadsTable.hardDeleteConfirmBody}</p>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={hardDeleteSkipConfirmChecked}
                  onChange={(event) => onToggleHardDeleteSkipConfirmChecked(event.target.checked)}
                />
                {messages.threadsTable.hardDeleteConfirmSkipFuture}
              </label>
              <div className="provider-hard-delete-confirm-actions">
                <Button variant="outline" onClick={onCancelHardDeleteConfirm}>
                  {messages.threadsTable.hardDeleteConfirmCancel}
                </Button>
                <Button variant="danger" onClick={onConfirmHardDelete}>
                  {messages.threadsTable.hardDeleteConfirmExecute}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="table-wrap">
        <table>
          <colgroup>
            <col className="col-select" />
            <col className="col-title" />
            <col className="col-risk" />
            <col className="col-pinned" />
            <col className="col-source" />
          </colgroup>
          <thead>
            <tr>
              <th className="table-select-column">
                <label className={`table-select-target ${allFilteredSelected ? "is-checked" : ""}`.trim()}>
                  <input
                    className="table-select-checkbox"
                    type="checkbox"
                    checked={allFilteredSelected}
                    aria-label={messages.threadsTable.selectAllFiltered}
                    onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
                  />
                </label>
              </th>
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
                  <td className="col-source" title={row.source || row.project_bucket || "-"}>
                    {compactThreadSource(row)}
                  </td>
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
