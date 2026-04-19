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

function compactThreadTitle(messages: Messages, row: ThreadRow): string {
  const normalized = normalizeDisplayValue(row.title);
  if (!normalized || normalized === row.thread_id) {
    return `${messages.threadsTable.fallbackTitlePrefix} ${row.thread_id.slice(0, 8)}`;
  }
  return normalized;
}

function compactThreadId(threadId: string): string {
  if (threadId.length <= 18) return threadId;
  return `${threadId.slice(0, 8)}…${threadId.slice(-4)}`;
}

function compactThreadSource(messages: Messages, row: ThreadRow): string {
  const source = normalizeDisplayValue(row.source || row.project_bucket || "-");
  if (!source) return "-";
  const lowered = source.toLowerCase();
  if (lowered === "sessions" || lowered === "session") {
    return messages.threadsTable.sourceSessions;
  }
  if (/^archived[_-]/i.test(lowered) || /archived/i.test(lowered) || lowered === "archive") {
    return messages.threadsTable.sourceArchive;
  }
  if (lowered === "history") {
    return messages.threadsTable.sourceHistory;
  }
  if (["tmp", "temp", "temporary", "workspace_tmp", "workspace-temp"].includes(lowered)) {
    return messages.threadsTable.sourceTemporary;
  }
  return source;
}

export function toggleVisibleSelectionState(
  rows: ThreadRow[],
  selected: Record<string, boolean>,
): Record<string, boolean> {
  const next = { ...selected };
  const allVisibleSelected = rows.length > 0 && rows.every((row) => Boolean(selected[row.thread_id]));
  for (const row of rows) {
    next[row.thread_id] = !allVisibleSelected;
  }
  return next;
}

export function toggleSubsetSelectionState(
  rows: ThreadRow[],
  selected: Record<string, boolean>,
  predicate: (row: ThreadRow) => boolean,
): Record<string, boolean> {
  const subset = rows.filter(predicate);
  const allSubsetSelected = subset.length > 0 && subset.every((row) => Boolean(selected[row.thread_id]));
  const next = { ...selected };
  for (const row of subset) {
    next[row.thread_id] = !allSubsetSelected;
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
                        aria-label={messages.threadsTable.selectThreadAria.replace(
                          "{title}",
                          normalizeDisplayValue(row.title) || row.thread_id,
                        )}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(e) => setSelected((prev) => ({ ...prev, [row.thread_id]: e.target.checked }))}
                      />
                    </label>
                  </td>
                  <td className="title-col">
                    <div className="thread-table-title">
                      <div
                        className="title-main thread-table-title-text"
                        title={normalizeDisplayValue(row.title) || row.thread_id}
                      >
                        {compactThreadTitle(messages, row)}
                      </div>
                    </div>
                    <div className="mono-sub thread-table-id" title={row.thread_id}>
                      {compactThreadId(row.thread_id)}
                    </div>
                  </td>
                  <td className="col-risk">{row.risk_score ?? 0}</td>
                  <td className="col-pinned">{row.is_pinned ? messages.common.yes : messages.common.no}</td>
                  <td className="col-source" title={row.source || row.project_bucket || "-"}>
                    {compactThreadSource(messages, row)}
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
