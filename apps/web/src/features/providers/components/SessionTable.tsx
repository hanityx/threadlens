import { useState, type CSSProperties, type Ref } from "react";
import { formatBytesCompact } from "@/shared/lib/format";
import { Button } from "@/shared/ui/components/Button";
import { PanelHeader } from "@/shared/ui/components/PanelHeader";
import { StatusPill, type StatusPillVariant } from "@/shared/ui/components/StatusPill";
import type { Messages } from "@/i18n";
import type { ProviderSessionRow } from "@/shared/types";
import { SKELETON_ROWS } from "@/shared/types";
import { formatDateYmd, formatProviderDisplayName } from "@/shared/lib/format";
import { compactSessionId, compactSessionTitle, suppressMouseFocus } from "@/features/providers/lib/helpers";
import { type ProviderWorkflowStage } from "@/features/providers/model/providerPanelPresentationModel";
import {
  resolveProviderSessionRowClickChecked,
  resolveVisibleSelectionCount,
} from "@/features/providers/model/sessionTableModel";
import "./sessionTable.css";

function formatProviderMessage(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function statusPillVariantFromClassName(className: string): StatusPillVariant {
  if (className === "status-active") return "active";
  if (className === "status-detected") return "detected";
  if (className === "status-missing") return "missing";
  return "preview";
}

function formatWorkflowStageLabel(messages: Messages, title: string, stage: ProviderWorkflowStage): string {
  const isKorean = messages.providers.workflowDeleteTitle === "삭제 준비";
  if (isKorean && (stage.label === messages.forensics.stagePending || stage.label === "Pending")) {
    return title;
  }
  if (isKorean && (stage.label === messages.forensics.stageReady || stage.label === "Ready")) {
    return `${title} 완료`;
  }
  return `${title} ${stage.label}`;
}

export interface SessionTableProps {
  messages: Messages;
  data: {
    providerSessionSummary: { rows: number; parse_ok: number };
    providerSessionRows: ProviderSessionRow[];
    providerSessionsLimit: number;
    providerRowsSampled: boolean;
    showProviderSessionsZeroState: boolean;
    selectedProviderHasPresentSource: boolean;
    sortedRows: ProviderSessionRow[];
    renderedRows: ProviderSessionRow[];
    providerSessionsLoading: boolean;
    hasMoreRows: boolean;
    csvExportedRows: number | null;
    selectedSessionProvider: string;
    selectedSessionParseFailCount?: number;
    slowProviderSet: ReadonlySet<string>;
  };
  selection: {
    selectedSessionPath: string;
    selectedProviderFiles: Record<string, boolean>;
    allProviderRowsSelected: boolean;
    allFilteredProviderRowsSelected: boolean;
    staleOnlyActive: boolean;
    canSelectStaleOnly: boolean;
    showBackupRows: boolean;
    canShowBackupRows: boolean;
    showArchivedRows: boolean;
    canShowArchivedRows: boolean;
  };
  filters: {
    sourceFilter: string;
    sourceFilterOptions: Array<{ source: string; count: number }>;
    sessionSort: string;
    enabledCsvColumnsCount: number;
    totalCsvColumns: number;
    csvColumnItems: Array<{ key: string; label: string; checked: boolean }>;
  };
  actions: {
    onPromoteDepthRefresh: () => void;
    onRunArchiveDryRun: () => void;
    onRunArchiveExecute: () => void;
    onRunDeleteDryRun: () => void;
    onRequestHardDeleteConfirm: () => void;
    onToggleHardDeleteSkipConfirmChecked: (checked: boolean) => void;
    onConfirmHardDelete: () => void;
    onCancelHardDeleteConfirm: () => void;
    onJumpToParserProvider: (providerId: string) => void;
    onSourceFilterChange: (value: string) => void;
    onSessionSortChange: (value: string) => void;
    onToggleSelectStaleOnly: () => void;
    onToggleShowBackupRows?: () => void;
    onToggleShowArchivedRows?: () => void;
    onRunBackupSelected: () => void;
    onExportCsv: () => void;
    onSetCsvColumnsPreset: (preset: "all" | "compact" | "forensics") => void;
    onCsvColumnChange: (key: string, checked: boolean) => void;
    onProviderDeleteBackupEnabledChange?: (checked: boolean) => void;
    onSelectSessionPath: (path: string) => void;
    onSetParserDetailProvider: (providerId: string) => void;
    toggleSelectAllProviderRows: (checked: boolean) => void;
    onSelectedProviderFileChange: (filePath: string, checked: boolean) => void;
    onLoadMoreRows: () => void;
  };
  workflow: {
    canRunProviderAction: boolean;
    busy: boolean;
    hardDeleteConfirmOpen: boolean;
    hardDeleteSkipConfirmChecked: boolean;
    canRunProviderBackup: boolean;
    actionSelectionHint: string;
    providerDeleteBackupEnabled: boolean;
    showReadOnlyHint: boolean;
    archiveStage: ProviderWorkflowStage;
    archiveCanExecute: boolean;
    deleteStage: ProviderWorkflowStage;
  };
  display: {
    showProviderColumn: boolean;
  };
  sectionRef?: Ref<HTMLElement>;
  panelStyle?: CSSProperties;
}

export function SessionTable(props: SessionTableProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { messages, sectionRef, panelStyle } = props;
  const {
    providerSessionSummary,
    providerSessionRows,
    providerSessionsLimit,
    providerRowsSampled,
    showProviderSessionsZeroState,
    selectedProviderHasPresentSource,
    sortedRows: sortedProviderSessionRows,
    renderedRows: renderedProviderSessionRows,
    providerSessionsLoading,
    hasMoreRows,
    csvExportedRows,
    selectedSessionProvider,
    selectedSessionParseFailCount,
    slowProviderSet,
  } = props.data;
  const {
    selectedSessionPath,
    selectedProviderFiles,
    allProviderRowsSelected,
    allFilteredProviderRowsSelected,
    staleOnlyActive,
    canSelectStaleOnly,
    showBackupRows,
    canShowBackupRows,
    showArchivedRows,
    canShowArchivedRows,
  } = props.selection;
  const {
    sourceFilter,
    sourceFilterOptions,
    sessionSort,
    enabledCsvColumnsCount,
    totalCsvColumns,
    csvColumnItems,
  } = props.filters;
  const {
    onPromoteDepthRefresh,
    onRunArchiveDryRun,
    onRunArchiveExecute,
    onRunDeleteDryRun,
    onRequestHardDeleteConfirm,
    onToggleHardDeleteSkipConfirmChecked,
    onConfirmHardDelete,
    onCancelHardDeleteConfirm,
    onJumpToParserProvider,
    onSourceFilterChange,
    onSessionSortChange,
    onToggleSelectStaleOnly,
    onToggleShowBackupRows,
    onToggleShowArchivedRows,
    onExportCsv,
    onSetCsvColumnsPreset,
    onCsvColumnChange,
    onProviderDeleteBackupEnabledChange,
    onSelectSessionPath,
    onSetParserDetailProvider,
    toggleSelectAllProviderRows,
    onSelectedProviderFileChange,
    onLoadMoreRows,
  } = props.actions;
  const {
    canRunProviderAction,
    busy,
    hardDeleteConfirmOpen,
    hardDeleteSkipConfirmChecked,
    actionSelectionHint,
    providerDeleteBackupEnabled,
    showReadOnlyHint,
    archiveStage,
    archiveCanExecute,
    deleteStage,
  } = props.workflow;
  const { showProviderColumn } = props.display;
  const filteredCount = sortedProviderSessionRows.length;
  const archiveActionLabel = showArchivedRows
    ? archiveCanExecute
      ? messages.providers.unarchive
      : messages.providers.unarchiveDryRun
    : archiveCanExecute
      ? messages.providers.archive
      : messages.providers.archiveDryRun;
  const archiveWorkflowTitle = showArchivedRows
    ? messages.providers.unarchiveDryRun
    : messages.providers.workflowArchiveTitle;
  const canRunArchiveAction = canRunProviderAction && !showBackupRows;
  const canRunDeletePrepAction = canRunProviderAction && !showBackupRows && !showArchivedRows;

  const sortKeyFromCol = (col: "title" | "mtime" | "size") => {
    const [key, dir] = sessionSort.split("_");
    if (key === col) return dir === "asc" ? `${col}_desc` : `${col}_asc`;
    return `${col}_asc`;
  };
  const activeSortKey = sessionSort.split("_")[0];
  const activeSortDir = sessionSort.split("_")[1];
  const sortIndicator = (col: string) =>
    activeSortKey === col ? (
      <span className="col-sort-indicator">{activeSortDir === "asc" ? "▲" : "▼"}</span>
    ) : null;
  const totalCount = providerSessionRows.length;
  const selectedCount = resolveVisibleSelectionCount({
    sortedProviderSessionRows,
    selectedProviderFiles,
    selectedSessionPath,
  });
  return (
    <section className="panel provider-session-stage threads-table-panel" ref={sectionRef} style={panelStyle}>
      <PanelHeader
        title={messages.providers.sessionsTitle}
        subtitle={`${filteredCount} ${messages.threadsTable.filtered} / ${totalCount} ${messages.threadsTable.total}`}
      />
      {showProviderSessionsZeroState ? (
        <div className="info-box compact">
          <span className="sub-hint">
            {selectedProviderHasPresentSource
              ? messages.providers.sessionsEmptyDetectedNoLogs
              : messages.providers.sessionsEmptyNoSources}
            {` · ${messages.providers.sessionsEmptyActionHint}`}
          </span>
          <Button variant="outline" onClick={onPromoteDepthRefresh}>
            {messages.providers.depthDeep} + {messages.providers.refreshNow}
          </Button>
        </div>
      ) : null}
      <div className="sticky-action-stack">
        <div className="sub-toolbar cleanup-status-strip session-status-strip">
          <div className="cleanup-status-inline">
            <StatusPill variant={selectedCount > 0 ? "active" : "preview"}>
              {messages.providers.workflowSelectedTitle} {selectedCount}
            </StatusPill>
            <StatusPill variant={statusPillVariantFromClassName(archiveStage.className)}>
              {formatWorkflowStageLabel(messages, archiveWorkflowTitle, archiveStage)}
            </StatusPill>
            <StatusPill variant={statusPillVariantFromClassName(deleteStage.className)}>
              {formatWorkflowStageLabel(messages, messages.providers.workflowDeleteTitle, deleteStage)}
            </StatusPill>
          </div>
        </div>
        <div className="sub-toolbar sessions-action-strip">
        <div className="sessions-action-main">
          <Button
            variant="outline"
            disabled={!canRunArchiveAction || busy}
            onClick={archiveCanExecute ? onRunArchiveExecute : onRunArchiveDryRun}
          >
            {archiveActionLabel}
          </Button>
          <Button variant="outline" disabled={!canRunDeletePrepAction || busy} onClick={onRunDeleteDryRun}>
            {messages.providers.deleteDryRun}
          </Button>
          <Button variant="danger" disabled={!canRunProviderAction || busy} onClick={onRequestHardDeleteConfirm}>
            {messages.providers.delete}
          </Button>
        </div>
        <div className="sessions-action-tools">
          <Button
            variant="outline"
            className={`sessions-action-tool-btn${staleOnlyActive ? " is-active" : ""}`}
            disabled={!canSelectStaleOnly}
            onClick={onToggleSelectStaleOnly}
          >
            {messages.providers.selectStaleOnly}
          </Button>
          {canShowBackupRows ? (
            <Button
              variant="outline"
              className={`sessions-action-tool-btn${showBackupRows ? " is-active" : ""}`}
              onClick={() => onToggleShowBackupRows?.()}
            >
              {messages.providers.showBackupRows}
            </Button>
          ) : null}
          {canShowArchivedRows ? (
            <Button
              variant="outline"
              className={`sessions-action-tool-btn${showArchivedRows ? " is-active" : ""}`}
              onClick={() => onToggleShowArchivedRows?.()}
            >
              {messages.providers.showArchivedRows}
            </Button>
          ) : null}
          <Button
            variant="outline"
            className={`sessions-action-tool-btn${filtersOpen ? " is-active" : ""}`}
            aria-expanded={filtersOpen}
            aria-controls="provider-filters-panel"
            onClick={() => setFiltersOpen((prev) => !prev)}
          >
            {messages.providers.filters}
          </Button>
          <Button
            variant="outline"
            className="sessions-action-tool-btn"
            disabled={sortedProviderSessionRows.length === 0 || enabledCsvColumnsCount === 0}
            onClick={onExportCsv}
          >
            {messages.providers.exportCsv}
          </Button>
        </div>
        {filtersOpen ? (
          <div id="provider-filters-panel" className="sessions-action-inline-panel">
            <div className="sub-toolbar inline-tools-disclosure-body sessions-filter-row">
              <div className="sessions-filter-controls">
                <select
                  className="filter-select"
                  aria-label={messages.providers.sourceFilterLabel}
                  value={sourceFilter}
                  onChange={(e) => onSourceFilterChange(e.target.value)}
                >
                  <option value="all">{messages.providers.sourceAll}</option>
                  {sourceFilterOptions.map((item) => (
                    <option key={`source-filter-${item.source}`} value={item.source}>
                      {item.source} ({item.count})
                    </option>
                  ))}
                </select>
                <select
                  className="filter-select"
                  aria-label={messages.providers.sortLabel}
                  value={sessionSort}
                  onChange={(e) => onSessionSortChange(e.target.value)}
                >
                  <option value="mtime_desc">{messages.providers.sortNewest}</option>
                  <option value="mtime_asc">{messages.providers.sortOldest}</option>
                  <option value="size_desc">{messages.providers.sortSizeDesc}</option>
                  <option value="size_asc">{messages.providers.sortSizeAsc}</option>
                  <option value="title_asc">{messages.providers.sortTitleAsc}</option>
                  <option value="title_desc">{messages.providers.sortTitleDesc}</option>
                </select>
              </div>
              <div className="sessions-filter-presets">
                <Button variant="outline" onClick={() => onSetCsvColumnsPreset("all")}>
                  {messages.providers.csvPresetAll}
                </Button>
                <Button variant="outline" onClick={() => onSetCsvColumnsPreset("compact")}>
                  {messages.providers.csvPresetCompact}
                </Button>
                <Button variant="outline" onClick={() => onSetCsvColumnsPreset("forensics")}>
                  {messages.providers.csvPresetForensics}
                </Button>
              </div>
            </div>
            <div className="sub-toolbar inline-tools-disclosure-body">
              <span className="overview-note-label">{messages.providers.csvColumns}</span>
              {csvColumnItems.map((item) => (
                <label key={`csv-col-${item.key}`} className="check-inline">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => onCsvColumnChange(item.key, e.target.checked)}
                  />
                  {item.label}
                </label>
              ))}
              <span className="sub-hint">
                {messages.providers.csvSelectedColumns} {enabledCsvColumnsCount}/{totalCsvColumns}
              </span>
            </div>
          </div>
        ) : null}
        {actionSelectionHint || showReadOnlyHint || csvExportedRows !== null ? (
          <div className="sessions-action-support">
            {actionSelectionHint ? (
              <span className="sub-hint">{actionSelectionHint}</span>
            ) : null}
            {showReadOnlyHint ? (
              <span className="sub-hint">{messages.providers.readOnlyHint}</span>
            ) : null}
            {csvExportedRows !== null ? (
              <span className="sub-hint">
                {messages.providers.csvExported} {csvExportedRows}
              </span>
            ) : null}
          </div>
        ) : null}
        {typeof onProviderDeleteBackupEnabledChange === "function" ? (
          <div className="sessions-action-secondary">
            <label className="check-inline sessions-delete-backup-toggle">
              <input
                type="checkbox"
                checked={providerDeleteBackupEnabled}
                onChange={(event) => onProviderDeleteBackupEnabledChange(event.target.checked)}
              />
              {messages.providers.deleteWithBackup}
            </label>
            {selectedSessionProvider ? (
              <StatusPill
                variant={Number(selectedSessionParseFailCount ?? 0) > 0 ? "detected" : "active"}
                interactive
                onClick={() => onJumpToParserProvider(selectedSessionProvider)}
                action={messages.providers.parserLinkedOpen}
              >
                {messages.providers.parserLinkedBadge} {selectedSessionProvider} · {messages.providers.parserLinkedFails}{" "}
                {selectedSessionParseFailCount ?? messages.common.unknown}
              </StatusPill>
            ) : null}
          </div>
        ) : null}
        {hardDeleteConfirmOpen ? (
          <div className="provider-hard-delete-confirm" role="dialog" aria-modal="true">
            <div className="provider-hard-delete-confirm-card">
              <span className="overview-note-label">{messages.providers.delete}</span>
              <strong>{messages.providers.hardDeleteConfirmTitle}</strong>
              <p>{messages.providers.hardDeleteConfirmBody}</p>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={hardDeleteSkipConfirmChecked}
                  onChange={(event) => onToggleHardDeleteSkipConfirmChecked(event.target.checked)}
                />
                {messages.providers.hardDeleteConfirmSkipFuture}
              </label>
              <div className="chat-toolbar detail-action-bar detail-action-bar-danger provider-hard-delete-confirm-actions">
                <Button variant="outline" onClick={onCancelHardDeleteConfirm}>
                  {messages.providers.hardDeleteConfirmCancel}
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={onConfirmHardDelete}
                >
                  {messages.providers.hardDeleteConfirmExecute}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      </div>
      <div className="provider-table-wrap">
        <table className="provider-session-table">
          <thead>
            <tr>
              <th className="table-select-column">
                <label className="table-select-target" aria-label={messages.providers.selectAllInTab}>
                  <input
                    className="table-select-checkbox"
                    type="checkbox"
                    checked={allFilteredProviderRowsSelected || allProviderRowsSelected}
                    onChange={(e) => toggleSelectAllProviderRows(e.target.checked)}
                  />
                </label>
              </th>
              {showProviderColumn ? <th className="col-provider">{messages.providers.colProvider}</th> : null}
              <th
                className={`title-col col-session is-sortable${activeSortKey === "title" ? " is-sort-active" : ""}`}
                onClick={() => onSessionSortChange(sortKeyFromCol("title"))}
              >
                {messages.providers.colSession}{sortIndicator("title")}
              </th>
              <th className="col-source">{messages.threadDetail.fieldSource}</th>
              <th className="col-format">{messages.providers.colFormat}</th>
              <th
                className={`col-modified is-sortable${activeSortKey === "mtime" ? " is-sort-active" : ""}`}
                onClick={() => onSessionSortChange(sortKeyFromCol("mtime"))}
              >
                {messages.sessionDetail.fieldModified}{sortIndicator("mtime")}
              </th>
              <th
                className={`col-size is-sortable${activeSortKey === "size" ? " is-sort-active" : ""}`}
                onClick={() => onSessionSortChange(sortKeyFromCol("size"))}
              >
                {messages.providers.colSize}{sortIndicator("size")}
              </th>
            </tr>
          </thead>
          <tbody>
            {renderedProviderSessionRows.map((row) => {
              const isChecked = Boolean(selectedProviderFiles[row.file_path]);
              const sessionDisplayTitle = compactSessionTitle(
                row.display_title || row.probe.detected_title,
                row.session_id,
              );
              const selectionLabel = compactSessionTitle(
                row.display_title || row.probe.detected_title,
                row.session_id,
              );
              return (
              <tr
                key={`${row.provider}-${row.session_id}-${row.file_path}`}
                data-file-key={encodeURIComponent(row.file_path)}
                className={[
                  selectedSessionPath === row.file_path ? "active-row" : "",
                  slowProviderSet.has(row.provider) ? "provider-slow-row" : "",
                ].filter(Boolean).join(" ") || undefined}
                onClick={() => {
                  onSelectSessionPath(row.file_path);
                  onSetParserDetailProvider(row.provider);
                  onSelectedProviderFileChange(
                    row.file_path,
                    resolveProviderSessionRowClickChecked(isChecked),
                  );
                }}
              >
                <td className="table-select-cell">
                  <label
                    className={`table-select-target ${isChecked ? "is-checked" : ""}`.trim()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      className="table-select-checkbox"
                      type="checkbox"
                      checked={isChecked}
                      aria-label={formatProviderMessage(messages.providers.selectSessionAria, {
                        title: selectionLabel,
                      })}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onSelectedProviderFileChange(row.file_path, e.target.checked)}
                    />
                  </label>
                </td>
                {showProviderColumn ? <td className="col-provider">{formatProviderDisplayName(row.provider)}</td> : null}
                <td className="title-col">
                  <button
                    type="button"
                    className="table-link-button"
                    onMouseDown={suppressMouseFocus}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectSessionPath(row.file_path);
                      onSetParserDetailProvider(row.provider);
                      onSelectedProviderFileChange(
                        row.file_path,
                        resolveProviderSessionRowClickChecked(isChecked),
                      );
                    }}
                  >
                    <div
                      className="title-main provider-session-title"
                      title={row.display_title || row.probe.detected_title || row.session_id}
                    >
                      {sessionDisplayTitle}
                    </div>
                    <div className="mono-sub provider-session-id" title={row.session_id}>
                      {compactSessionId(row.session_id)}
                    </div>
                  </button>
                </td>
                <td className="col-source">{row.source}</td>
                <td className="col-format">{row.probe.format}</td>
                <td className="col-modified">{formatDateYmd(row.mtime)}</td>
                <td className="col-size">{formatBytesCompact(row.size_bytes)}</td>
              </tr>
            )})}
            {providerSessionsLoading
              ? Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
                  <tr key={`provider-session-skeleton-${idx}`}>
                    <td colSpan={showProviderColumn ? 7 : 6}>
                      <div className="skeleton-line" />
                    </td>
                  </tr>
                ))
              : null}
            {sortedProviderSessionRows.length === 0 && !providerSessionsLoading ? (
              <tr>
                <td colSpan={showProviderColumn ? 7 : 6} className="sub-hint">
                  {providerSessionRows.length === 0
                    ? messages.providers.sessionsEmpty
                    : messages.providers.sessionsEmptyFiltered}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {hasMoreRows ? (
          <div className="sub-toolbar table-load-more-bar">
            <Button variant="outline" onClick={onLoadMoreRows}>
              {messages.providers.loadMoreRows} {renderedProviderSessionRows.length}/{sortedProviderSessionRows.length}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
