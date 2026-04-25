import type { CSSProperties } from "react";
import type { Messages } from "@/i18n";
import { Button } from "@/shared/ui/components/Button";
import { PanelHeader } from "@/shared/ui/components/PanelHeader";
import type { ThreadRow, ThreadSort } from "@/shared/types";
import { SKELETON_ROWS } from "@/shared/types";
import { formatDateTime, formatWorkspaceLabel, normalizeDisplayValue } from "@/shared/lib/format";
import {
  buildThreadRowKey,
  isArchivedThreadSource,
  resolveNextThreadSort,
  resolveThreadSortDirection,
  type ThreadSortColumn,
  resolveVisibleThreadSelectionCount,
} from "@/features/threads/model/threadsTableModel";

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
  threadSort?: ThreadSort;
  onThreadSortChange?: (sort: ThreadSort) => void;
  showBackupRows?: boolean;
  canShowBackupRows?: boolean;
  onToggleShowBackupRows?: () => void;
  showArchivedRows?: boolean;
  canShowArchivedRows?: boolean;
  onToggleShowArchivedRows?: () => void;
  hasMoreRows?: boolean;
  onLoadMoreRows?: () => void;
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
  if (isArchivedThreadSource(lowered)) {
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

function formatActivityLabel(messages: Messages, row: ThreadRow): string {
  const minutes = Number(row.activity_age_min ?? NaN);
  if (Number.isFinite(minutes) && minutes >= 0) {
    if (minutes < 1) {
      return messages.threadsTable.activityNow;
    }
    if (minutes < 60) {
      return messages.threadsTable.activityMinutesAgo.replace("{count}", String(Math.floor(minutes)));
    }
    if (minutes < 1440) {
      return messages.threadsTable.activityHoursAgo.replace("{count}", String(Math.floor(minutes / 60)));
    }
    return messages.threadsTable.activityDaysAgo.replace("{count}", String(Math.floor(minutes / 1440)));
  }
  return formatDateTime(row.timestamp);
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
    threadSort = "updated_desc",
    onThreadSortChange,
    showBackupRows = false,
    canShowBackupRows = false,
    onToggleShowBackupRows,
    showArchivedRows = false,
    canShowArchivedRows = false,
    onToggleShowArchivedRows,
    hasMoreRows = false,
    onLoadMoreRows,
    panelStyle,
  } = props;
  const renderSortableHeader = (
    column: ThreadSortColumn,
    label: string,
    className: string,
  ) => {
    const ariaSort = resolveThreadSortDirection(threadSort, column);
    const sortIndicator =
      ariaSort === "descending" ? (
        <span className="col-sort-indicator">▼</span>
      ) : ariaSort === "ascending" ? (
        <span className="col-sort-indicator">▲</span>
      ) : null;
    return (
      <th className={`${className} is-sortable${ariaSort !== "none" ? " is-sort-active" : ""}`} aria-sort={ariaSort}>
        <button
          type="button"
          className="table-sort-button"
          onClick={() => onThreadSortChange?.(resolveNextThreadSort(threadSort, column))}
        >
          {label}{sortIndicator}
        </button>
      </th>
    );
  };
  const visibleSelectionCount = resolveVisibleThreadSelectionCount(
    visibleRows,
    selectedIds,
    selectedThreadId,
  );
  const backupRowsSelected = showBackupRows && selectedIds.length > 0;
  const archiveActionLabel = showArchivedRows
    ? messages.threadsTable.bulkUnarchive
    : messages.threadsTable.bulkArchive;
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
            <span className={`status-pill ${visibleSelectionCount > 0 ? "status-active" : "status-preview"}`}>
              {messages.threadsTable.workflowSelectedTitle} {visibleSelectionCount}
            </span>
          </div>
        </div>
        <div className="sub-toolbar sticky-action-bar action-toolbar">
          <div className="thread-toolbar-group thread-toolbar-group-inline">
            <div className="thread-toolbar-inline thread-toolbar-main">
              <Button
                variant="outline"
                disabled={selectedIds.length === 0 || busy || threadActionsDisabled || backupRowsSelected}
                title={disabledReason}
                onClick={() => bulkArchive(selectedIds)}
              >
                {archiveActionLabel}
              </Button>
              <Button
                variant="outline"
                disabled={selectedIds.length === 0 || busy || threadActionsDisabled || backupRowsSelected}
                title={disabledReason}
                onClick={() => analyzeDelete(selectedIds)}
              >
                {messages.threadsTable.bulkImpact}
              </Button>
              <Button
                variant="outline"
                disabled={selectedIds.length === 0 || busy || threadActionsDisabled || backupRowsSelected}
                title={disabledReason}
                onClick={() => cleanupDryRun(selectedIds)}
              >
                {messages.threadsTable.bulkCleanupDryRun}
              </Button>
              <Button
                variant="danger"
                disabled={selectedIds.length === 0 || busy || threadActionsDisabled || (!backupRowsSelected && !dryRunReady)}
                title={backupRowsSelected || dryRunReady ? disabledReason : messages.forensics.cleanupTokenHint}
                onClick={onRequestHardDeleteConfirm}
              >
                {messages.threadsTable.bulkCleanupExecute}
              </Button>
            </div>
            {canShowBackupRows || canShowArchivedRows ? (
              <div className="sessions-action-tools thread-toolbar-tools">
                {canShowBackupRows ? (
                  <Button
                    variant="outline"
                    className={`sessions-action-tool-btn${showBackupRows ? " is-active" : ""}`}
                    onClick={() => onToggleShowBackupRows?.()}
                  >
                    {messages.threadsTable.showBackupRows}
                  </Button>
                ) : null}
                {canShowArchivedRows ? (
                  <Button
                    variant="outline"
                    className={`sessions-action-tool-btn${showArchivedRows ? " is-active" : ""}`}
                    onClick={() => onToggleShowArchivedRows?.()}
                  >
                    {messages.threadsTable.showArchivedRows}
                  </Button>
                ) : null}
              </div>
            ) : null}
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
            <col className="col-activity" />
            <col className="col-workspace" />
            <col className="col-pinned" />
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
              {renderSortableHeader("risk", messages.threadsTable.colRisk, "col-risk")}
              {renderSortableHeader("activity", messages.threadsTable.colActivity, "col-activity")}
              {renderSortableHeader("cwd", messages.threadsTable.colWorkspace, "col-workspace")}
              {renderSortableHeader("pinned", messages.threadsTable.colPinned, "col-pinned")}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => {
              const checked = Boolean(selected[row.thread_id]);
              const isHighRisk = Number(row.risk_score ?? 0) >= 70;
              const workspaceLabel = formatWorkspaceLabel(row.cwd);
              return (
                <tr
                  key={buildThreadRowKey(row, index)}
                  className={`${isHighRisk ? "risk-row" : ""} ${selectedThreadId === row.thread_id ? "active-row" : ""}`.trim()}
                  onClick={() => setSelectedThreadId(row.thread_id)}
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
                        onChange={(e) => {
                          setSelected((prev) => ({ ...prev, [row.thread_id]: e.target.checked }));
                          if (e.target.checked) setSelectedThreadId(row.thread_id);
                        }}
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
                      {compactThreadId(row.thread_id)} · {compactThreadSource(messages, row)}
                    </div>
                  </td>
                  <td className="col-risk">
                    <div>{row.risk_score ?? 0}</div>
                  </td>
                  <td className="col-activity" title={formatDateTime(row.timestamp)}>
                    {formatActivityLabel(messages, row)}
                  </td>
                  <td className="col-workspace" title={row.cwd || ""}>
                    {workspaceLabel || "-"}
                  </td>
                  <td className="col-pinned" title={row.is_pinned ? messages.common.yes : messages.common.no}>
                    {row.is_pinned ? (
                      <span className="thread-pin-state is-pinned" aria-label={messages.common.yes}>
                        ✓
                      </span>
                    ) : (
                      <span className="thread-pin-state" aria-label={messages.common.no}>
                        -
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {threadsLoading
              ? Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
                  <tr key={`threads-skeleton-${idx}`}>
                    <td colSpan={6}>
                      <div className="skeleton-line" />
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
        {hasMoreRows ? (
          <div className="sub-toolbar table-load-more-bar">
            <Button variant="outline" onClick={onLoadMoreRows}>
              {messages.threadsTable.loadMoreRows} {visibleRows.length}/{totalCount}
            </Button>
          </div>
        ) : null}
      </div>
      {threadsError ? <div className="error-box">{messages.errors.threads}</div> : null}
    </section>
  );
}
