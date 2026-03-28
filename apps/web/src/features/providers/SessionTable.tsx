import type { Ref } from "react";
import { Button } from "../../design-system/Button";
import type { Messages } from "../../i18n";
import type { ProviderSessionActionResult, ProviderSessionRow } from "../../types";
import { SKELETON_ROWS } from "../../types";
import { formatDateTime, formatInteger, normalizeDisplayValue } from "../../lib/helpers";
import { compactSessionId, compactSessionTitle, suppressMouseFocus } from "./helpers";
import { buildProviderSessionActionSummary } from "./providerPanelPresentationModel";

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
  selectedSessionProvider: string;
  selectedSessionParseFailCount?: number;
  onJumpToParserProvider: (providerId: string) => void;
  sourceFilter: string;
  onSourceFilterChange: (value: string) => void;
  sourceFilterOptions: Array<{ source: string; count: number }>;
  sessionSort: string;
  onSessionSortChange: (value: string) => void;
  slowOnly: boolean;
  canApplySlowOnly: boolean;
  onSlowOnlyChange: (checked: boolean) => void;
  onSetProviderViewAll: () => void;
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
  onSelectedProviderFileChange: (filePath: string, checked: boolean) => void;
  providerSessionsLoading: boolean;
  onLoadMoreRows: () => void;
  hasMoreRows: boolean;
  sessionFileActionResult: ProviderSessionActionResult | null;
  sessionFileActionCanExecute: boolean;
  actionLabel: (action: "backup_local" | "archive_local" | "delete_local") => string;
  csvExportedRows: number | null;
  sectionRef?: Ref<HTMLElement>;
}

export function SessionTable(props: SessionTableProps) {
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
    selectedSessionProvider,
    selectedSessionParseFailCount,
    onJumpToParserProvider,
    sourceFilter,
    onSourceFilterChange,
    sourceFilterOptions,
    sessionSort,
    onSessionSortChange,
    slowOnly,
    canApplySlowOnly,
    onSlowOnlyChange,
    onSetProviderViewAll,
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
    onSelectedProviderFileChange,
    providerSessionsLoading,
    onLoadMoreRows,
    hasMoreRows,
    sessionFileActionResult,
    sessionFileActionCanExecute,
    actionLabel,
    csvExportedRows,
    sectionRef,
  } = props;
  const sessionActionSummary = buildProviderSessionActionSummary(messages, sessionFileActionResult);
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
    <section className="panel provider-session-stage" ref={sectionRef}>
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
      <div className="sub-toolbar sessions-action-strip">
        <div className="sessions-action-main">
          <Button variant="outline" disabled={!canRunProviderAction || busy} onClick={onRunArchiveDryRun}>
            {messages.providers.archiveDryRun}
          </Button>
          <Button variant="outline" disabled={!canRunProviderAction || busy} onClick={onRunDeleteDryRun}>
            {messages.providers.deleteDryRun}
          </Button>
        </div>
        <div className="sessions-action-tools">
          {selectedSessionProvider ? (
            <button
              type="button"
              className={`status-pill status-pill-button ${Number(selectedSessionParseFailCount ?? 0) > 0 ? "status-detected" : "status-active"}`}
              onClick={() => onJumpToParserProvider(selectedSessionProvider)}
            >
              {messages.providers.parserLinkedBadge} {selectedSessionProvider} · {messages.providers.parserLinkedFails}{" "}
              {selectedSessionParseFailCount ?? messages.common.unknown}
              <span className="status-pill-action">{messages.providers.parserLinkedOpen}</span>
            </button>
          ) : null}
          <details className="inline-tools-disclosure">
            <summary>Filters / export</summary>
            <div className="sub-toolbar inline-tools-disclosure-body">
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
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={slowOnly}
                  disabled={!canApplySlowOnly}
                  onChange={(e) => onSlowOnlyChange(e.target.checked)}
                />
                {messages.providers.slowOnlyFilter}
              </label>
              {!canApplySlowOnly && slowOnly ? (
                <>
                  <span className="sub-hint">{messages.providers.slowOnlyDormant}</span>
                  <Button variant="outline" onClick={onSetProviderViewAll}>
                    {messages.common.allAi}
                  </Button>
                </>
              ) : null}
              <Button
                variant="outline"
                disabled={sortedProviderSessionRows.length === 0 || enabledCsvColumnsCount === 0}
                onClick={onExportCsv}
              >
                {messages.providers.exportCsv}
              </Button>
            </div>
            <div className="sub-toolbar inline-tools-disclosure-body">
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
          </details>
        </div>
      {showReadOnlyHint ? (
        <span className="sub-hint">{messages.providers.readOnlyHint}</span>
      ) : null}
      </div>
      <div className="provider-table-wrap">
        <table className="provider-session-table">
          <thead>
            <tr>
              <th className="table-select-column"></th>
              {showProviderColumn ? <th className="col-provider">{messages.providers.colProvider}</th> : null}
              <th>{messages.providers.colSession}</th>
              <th className="col-source">{messages.threadDetail.fieldSource}</th>
              <th className="col-format">{messages.providers.colFormat}</th>
              <th className="col-probe">{messages.providers.colProbe}</th>
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
                      aria-label={`Select session ${selectionLabel}`}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onSelectedProviderFileChange(row.file_path, e.target.checked)}
                    />
                  </label>
                </td>
                {showProviderColumn ? <td className="col-provider">{row.provider}</td> : null}
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
                <td className="col-probe">{row.probe.ok ? messages.common.ok : messages.common.fail}</td>
                <td className="col-modified">{formatDateTime(row.mtime)}</td>
                <td className="col-size">{formatInteger(row.size_bytes)}</td>
              </tr>
            )})}
            {providerSessionsLoading
              ? Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
                  <tr key={`provider-session-skeleton-${idx}`}>
                    <td colSpan={showProviderColumn ? 8 : 7}>
                      <div className="skeleton-line" />
                    </td>
                  </tr>
                ))
              : null}
            {sortedProviderSessionRows.length === 0 && !providerSessionsLoading ? (
              <tr>
                <td colSpan={showProviderColumn ? 8 : 7} className="sub-hint">
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
      {csvExportedRows !== null ? (
        <div className="sub-toolbar">
          <span className="sub-hint">
            {messages.providers.csvExported} {csvExportedRows}
          </span>
        </div>
      ) : null}
    </section>
  );
}
