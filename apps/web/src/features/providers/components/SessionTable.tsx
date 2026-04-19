import { useState, type CSSProperties, type Ref } from "react";
import { formatBytesCompact } from "@/shared/lib/format";
import { Button } from "@/shared/ui/components/Button";
import { PanelHeader } from "@/shared/ui/components/PanelHeader";
import { StatusPill, type StatusPillVariant } from "@/shared/ui/components/StatusPill";
import type { Messages } from "@/i18n";
import type { ProviderSessionActionResult, ProviderSessionRow } from "@/shared/types";
import { SKELETON_ROWS } from "@/shared/types";
import { formatDateTime, formatProviderDisplayName, normalizeDisplayValue } from "@/shared/lib/format";
import { compactSessionId, compactSessionTitle, suppressMouseFocus } from "@/features/providers/lib/helpers";
import {
  buildProviderSessionActionSummary,
  type ProviderWorkflowStage,
} from "@/features/providers/model/providerPanelPresentationModel";

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

export interface SessionTableProps {
  messages: Messages;
  providerSessionSummary: { rows: number; parse_ok: number };
  providerSessionRows: ProviderSessionRow[];
  providerSessionsLimit: number;
  providerRowsSampled: boolean;
  showProviderSessionsZeroState: boolean;
  selectedProviderHasPresentSource: boolean;
  onPromoteDepthRefresh: () => void;
  sortedProviderSessionRows: ProviderSessionRow[];
  renderedProviderSessionRows: ProviderSessionRow[];
  canRunProviderAction: boolean;
  busy: boolean;
  onRunArchiveDryRun: () => void;
  onRunArchive: () => void;
  onRunDeleteDryRun: () => void;
  onRunDelete: () => void;
  onRequestHardDeleteConfirm: () => void;
  hardDeleteConfirmOpen: boolean;
  hardDeleteSkipConfirmChecked: boolean;
  onToggleHardDeleteSkipConfirmChecked: (checked: boolean) => void;
  onConfirmHardDelete: () => void;
  onCancelHardDeleteConfirm: () => void;
  selectedSessionProvider: string;
  selectedSessionParseFailCount?: number;
  onJumpToParserProvider: (providerId: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  sourceFilterOptions: Array<{ source: string; count: number }>;
  sessionSort: string;
  onSessionSortChange: (value: string) => void;
  staleOnlyActive: boolean;
  canSelectStaleOnly: boolean;
  onToggleSelectStaleOnly: () => void;
  enabledCsvColumnsCount: number;
  totalCsvColumns: number;
  onExportCsv: () => void;
  onSetCsvColumnsPreset: (preset: "all" | "compact" | "forensics") => void;
  csvColumnItems: Array<{ key: string; label: string; checked: boolean }>;
  onCsvColumnChange: (key: string, checked: boolean) => void;
  showReadOnlyHint: boolean;
  showProviderColumn: boolean;
  selectedSessionPath: string;
  slowProviderSet: ReadonlySet<string>;
  onSelectSessionPath: (path: string) => void;
  onSetParserDetailProvider: (providerId: string) => void;
  selectedProviderFiles: Record<string, boolean>;
  allProviderRowsSelected: boolean;
  allFilteredProviderRowsSelected: boolean;
  toggleSelectAllProviderRows: (checked: boolean) => void;
  onSelectedProviderFileChange: (filePath: string, checked: boolean) => void;
  providerSessionsLoading: boolean;
  onLoadMoreRows: () => void;
  hasMoreRows: boolean;
  archiveStage: ProviderWorkflowStage;
  deleteStage: ProviderWorkflowStage;
  sessionFileActionResult: ProviderSessionActionResult | null;
  sessionFileActionCanExecute: boolean;
  actionLabel: (action: "backup_local" | "archive_local" | "delete_local") => string;
  csvExportedRows: number | null;
  sectionRef?: Ref<HTMLElement>;
  panelStyle?: CSSProperties;
}

export function SessionTable(props: SessionTableProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const {
    messages,
    providerSessionSummary,
    providerSessionRows,
    providerSessionsLimit,
    providerRowsSampled,
    showProviderSessionsZeroState,
    selectedProviderHasPresentSource,
    onPromoteDepthRefresh,
    sortedProviderSessionRows,
    renderedProviderSessionRows,
    canRunProviderAction,
    busy,
    onRunArchiveDryRun,
    onRunArchive,
    onRunDeleteDryRun,
    onRunDelete,
    onRequestHardDeleteConfirm,
    hardDeleteConfirmOpen,
    hardDeleteSkipConfirmChecked,
    onToggleHardDeleteSkipConfirmChecked,
    onConfirmHardDelete,
    onCancelHardDeleteConfirm,
    selectedSessionProvider,
    selectedSessionParseFailCount,
    onJumpToParserProvider,
    sourceFilter,
    onSourceFilterChange,
    sourceFilterOptions,
    sessionSort,
    onSessionSortChange,
    staleOnlyActive,
    canSelectStaleOnly,
    onToggleSelectStaleOnly,
    enabledCsvColumnsCount,
    totalCsvColumns,
    onExportCsv,
    onSetCsvColumnsPreset,
    csvColumnItems,
    onCsvColumnChange,
    showReadOnlyHint,
    showProviderColumn,
    selectedSessionPath,
    slowProviderSet,
    onSelectSessionPath,
    onSetParserDetailProvider,
    selectedProviderFiles,
    allProviderRowsSelected,
    allFilteredProviderRowsSelected,
    toggleSelectAllProviderRows,
    onSelectedProviderFileChange,
    providerSessionsLoading,
    onLoadMoreRows,
    hasMoreRows,
    archiveStage,
    deleteStage,
    sessionFileActionResult,
    sessionFileActionCanExecute,
    actionLabel,
    csvExportedRows,
    sectionRef,
    panelStyle,
  } = props;
  const sessionActionSummary = buildProviderSessionActionSummary(messages, sessionFileActionResult);
  const filteredCount = sortedProviderSessionRows.length;
  const totalCount = providerSessionRows.length;
  const selectedCount = Object.values(selectedProviderFiles).filter(Boolean).length;
  const sessionExecuteLabel =
    sessionFileActionResult ? `${messages.providers.executeActionPrefix} ${actionLabel(sessionFileActionResult.action)}` : "";
  const sessionExecuteVariant = sessionFileActionResult?.action === "delete_local" ? "danger" : "base";
  const handleExecuteSessionAction = () => {
    if (!sessionFileActionResult) return;
    if (sessionFileActionResult.action === "archive_local") {
      onRunArchive();
      return;
    }
    onRunDelete();
  };

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
              {messages.providers.workflowArchiveTitle} {archiveStage.label}
            </StatusPill>
            <StatusPill variant={statusPillVariantFromClassName(deleteStage.className)}>
              {messages.providers.workflowDeleteTitle} {deleteStage.label}
            </StatusPill>
          </div>
        </div>
        <div className="sub-toolbar sessions-action-strip">
        <div className="sessions-action-main">
          <Button variant="outline" disabled={!canRunProviderAction || busy} onClick={onRunArchiveDryRun}>
            {messages.providers.archiveDryRun}
          </Button>
          <Button variant="outline" disabled={!canRunProviderAction || busy} onClick={onRunDeleteDryRun}>
            {messages.providers.deleteDryRun}
          </Button>
          <Button
            variant={staleOnlyActive ? "base" : "outline"}
            disabled={!canSelectStaleOnly}
            onClick={onToggleSelectStaleOnly}
          >
            {messages.providers.selectStaleOnly}
          </Button>
          <Button variant="danger" disabled={!canRunProviderAction || busy} onClick={onRequestHardDeleteConfirm}>
            {messages.providers.delete}
          </Button>
        </div>
        <div className="sessions-action-tools">
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
        <div className="sessions-action-support">
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
          {showReadOnlyHint ? (
            <span className="sub-hint">{messages.providers.readOnlyHint}</span>
          ) : null}
          {csvExportedRows !== null ? (
            <span className="sub-hint">
              {messages.providers.csvExported} {csvExportedRows}
            </span>
          ) : null}
        </div>
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
              <th className="title-col col-session">{messages.providers.colSession}</th>
              <th className="col-source">{messages.threadDetail.fieldSource}</th>
              <th className="col-format">{messages.providers.colFormat}</th>
              <th className="col-modified">{messages.sessionDetail.fieldModified}</th>
              <th className="col-size">{messages.providers.colSize}</th>
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
                <td className="col-modified">{formatDateTime(row.mtime)}</td>
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
      </div>
      {hasMoreRows ? (
        <div className="sub-toolbar">
          <Button variant="outline" onClick={onLoadMoreRows}>
            {messages.providers.loadMoreRows} {renderedProviderSessionRows.length}/{sortedProviderSessionRows.length}
          </Button>
        </div>
      ) : null}
      {sessionFileActionResult ? (
        <section className="provider-result-grid">
          <article className="provider-result-card">
            <span className="overview-note-label">{messages.providers.actionResultTitle}</span>
            <strong>{sessionActionSummary?.headline ?? actionLabel(sessionFileActionResult.action)}</strong>
            <p>{sessionActionSummary?.countSummary}</p>
            <p>{sessionActionSummary?.detail}</p>
            {sessionActionSummary?.token ? <code>{sessionActionSummary.token}</code> : null}
            {sessionActionSummary?.previewReady ? (
              sessionFileActionCanExecute ? (
                <div className="sub-toolbar provider-result-actions">
                  <Button variant={sessionExecuteVariant} disabled={busy} onClick={handleExecuteSessionAction}>
                    {sessionExecuteLabel}
                  </Button>
                </div>
              ) : (
                <p className="sub-hint">{messages.providers.resultSelectionChangedHint}</p>
              )
            ) : null}
          </article>
          {sessionFileActionResult.backup_to ? (
            <article className="provider-result-card">
              <span className="overview-note-label">{messages.providers.backupLocation}</span>
              <strong className="mono-sub">{sessionFileActionResult.backup_to}</strong>
              <p>
                {sessionFileActionResult.backup_manifest_path
                  ? `${messages.providers.backupManifest}: ${sessionFileActionResult.backup_manifest_path}`
                  : messages.providers.backupReadyHint}
              </p>
            </article>
          ) : null}
          {sessionFileActionResult.archived_to ? (
            <article className="provider-result-card">
              <span className="overview-note-label">{messages.providers.archiveLocation}</span>
              <strong className="mono-sub">{sessionFileActionResult.archived_to}</strong>
              <p>{messages.providers.archiveReadyHint}</p>
            </article>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
