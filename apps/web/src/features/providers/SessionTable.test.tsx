import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Messages } from "../../i18n";
import type { ProviderSessionActionResult, ProviderSessionRow } from "../../types";
import { SessionTable } from "./SessionTable";

const messages = {
  common: {
    ok: "OK",
    fail: "FAIL",
    allAi: "All AI",
    unknown: "Unknown",
  },
  providers: {
    sessionsTitle: "Sessions",
    rows: "Rows",
    parseOk: "Parse ok",
    queryLimit: "Limit",
    sampledHint: "Sampled",
    sessionsEmptyDetectedNoLogs: "Detected but no logs",
    sessionsEmptyNoSources: "No sources",
    sessionsEmptyActionHint: "Refresh with deep scan",
    depthDeep: "Deep",
    refreshNow: "Refresh",
    sessionSearchPlaceholder: "Search sessions",
    probeFilterLabel: "Probe filter",
    probeAll: "All",
    probeOk: "OK",
    probeFail: "Fail",
    selectAllInTab: "Select all",
    archiveDryRun: "Archive dry-run",
    archive: "Archive",
    deleteDryRun: "Delete dry-run",
    delete: "Delete",
    parserLinkedBadge: "Parser",
    parserLinkedFails: "Fails",
    parserLinkedOpen: "Open",
    sourceFilterLabel: "Source filter",
    sourceAll: "All sources",
    sortLabel: "Sort",
    sortNewest: "Newest",
    sortOldest: "Oldest",
    sortSizeDesc: "Largest",
    sortSizeAsc: "Smallest",
    sortTitleAsc: "Title asc",
    sortTitleDesc: "Title desc",
    slowOnlyFilter: "Slow only",
    slowOnlyActive: "Slow only active",
    slowOnlyDormant: "Slow dormant",
    exportCsv: "Export CSV",
    csvPresetAll: "All columns",
    csvPresetCompact: "Compact columns",
    csvPresetForensics: "Forensics columns",
    csvSelectedColumns: "Columns",
    readOnlyHint: "Read only",
    actionBackupLocal: "Back up locally",
    actionArchiveLocal: "Archive locally",
    actionDeleteLocal: "Delete locally",
    colProvider: "Provider",
    colSession: "Session",
    colFormat: "Format",
    colProbe: "Probe",
    colSize: "Size",
    sessionsLoading: "Loading provider sessions...",
    sessionsEmpty: "No provider sessions found.",
    sessionsEmptyFiltered: "No session rows match the current filters.",
    loadMoreRows: "Load more",
    actionResultTitle: "Action result",
    resultPreview: "Preview",
    resultPreviewReady: "Preview ready",
    resultApplied: "Applied",
    resultPreviewOnlyHint: "Dry-run only. Nothing changed yet.",
    resultExecuteFromCardHint: "Preview ready. Execute from this card when it looks right.",
    resultSelectionChangedHint: "Selection changed. Run the preview again before execute.",
    resultArchiveAppliedHint: "Archive copied the source files into the local archive path.",
    resultDeleteBackedUpHint: "Delete created a backup copy before removing the source files.",
    resultDeleteDirectHint: "Delete ran directly on the source files without a backup copy.",
    resultBackupAppliedHint: "Backup copy is ready for restore.",
    executeActionPrefix: "Execute",
    valid: "Valid",
    applied: "Applied",
    backedUp: "Backed up",
    backupLocation: "Backup location",
    backupManifest: "Manifest",
    backupReadyHint: "Backup ready",
    archiveLocation: "Archive location",
    archiveReadyHint: "Archive ready",
    csvExported: "CSV exported",
  },
  threadDetail: {
    fieldSource: "Source",
  },
  sessionDetail: {
    fieldModified: "Modified",
  },
} as unknown as Messages;

const rows: ProviderSessionRow[] = [
  {
    provider: "codex",
    source: "history",
    session_id: "session-12345678901234567890",
    display_title: "Open Codex Cleanup",
    file_path: "/tmp/session.jsonl",
    size_bytes: 128,
    mtime: "2026-03-24T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Open Codex Cleanup",
      title_source: "header",
    },
  },
];

const actionResult: ProviderSessionActionResult = {
  ok: true,
  provider: "codex",
  action: "delete_local",
  dry_run: true,
  target_count: 1,
  valid_count: 1,
  applied_count: 0,
  confirm_token_expected: "tok-1",
  confirm_token_accepted: false,
  backed_up_count: 1,
  backup_to: "/tmp/backups/latest",
  backup_manifest_path: "/tmp/backups/latest/manifest.json",
};

describe("SessionTable", () => {
  it("renders toolbar, rows, and action result summary", () => {
    const onRunArchiveDryRun = vi.fn();
    const onRunArchive = vi.fn();
    const onRunDeleteDryRun = vi.fn();
    const onRunDelete = vi.fn();
    const onJumpToParserProvider = vi.fn();
    const onSourceFilterChange = vi.fn();
    const onSessionSortChange = vi.fn();
    const onSlowOnlyChange = vi.fn();
    const onSetProviderViewAll = vi.fn();
    const onExportCsv = vi.fn();
    const onSetCsvColumnsPreset = vi.fn();
    const onCsvColumnChange = vi.fn();
    const onSelectSessionPath = vi.fn();
    const onSelectedProviderFileChange = vi.fn();
    const onLoadMoreRows = vi.fn();
    const onPromoteDepthRefresh = vi.fn();
    const onSetParserDetailProvider = vi.fn();

    const html = renderToStaticMarkup(
      <SessionTable
        messages={messages}
        providerSessionSummary={{ rows: 1, parse_ok: 1 }}
        providerSessionRows={rows}
        providerSessionsLimit={50}
        providerRowsSampled={false}
        showProviderSessionsZeroState={false}
        selectedProviderHasPresentSource={true}
        onPromoteDepthRefresh={onPromoteDepthRefresh}
        sortedProviderSessionRows={rows}
        renderedProviderSessionRows={rows}
        canRunProviderAction={true}
        busy={false}
        onRunArchiveDryRun={onRunArchiveDryRun}
        onRunArchive={onRunArchive}
        onRunDeleteDryRun={onRunDeleteDryRun}
        onRunDelete={onRunDelete}
        selectedSessionProvider="codex"
        selectedSessionParseFailCount={2}
        onJumpToParserProvider={onJumpToParserProvider}
        sourceFilter="all"
        onSourceFilterChange={onSourceFilterChange}
        sourceFilterOptions={[{ source: "history", count: 1 }]}
        sessionSort="mtime_desc"
        onSessionSortChange={onSessionSortChange}
        slowOnly={false}
        canApplySlowOnly={true}
        onSlowOnlyChange={onSlowOnlyChange}
        onSetProviderViewAll={onSetProviderViewAll}
        enabledCsvColumnsCount={3}
        totalCsvColumns={10}
        onExportCsv={onExportCsv}
        onSetCsvColumnsPreset={onSetCsvColumnsPreset}
        csvColumnItems={[{ key: "provider", label: "Provider", checked: true }]}
        onCsvColumnChange={onCsvColumnChange}
        showReadOnlyHint={false}
        showProviderColumn={true}
        selectedSessionPath="/tmp/session.jsonl"
        slowProviderSet={new Set<string>(["codex"])}
        onSelectSessionPath={onSelectSessionPath}
        onSetParserDetailProvider={onSetParserDetailProvider}
        selectedProviderFiles={{ "/tmp/session.jsonl": true }}
        onSelectedProviderFileChange={onSelectedProviderFileChange}
        providerSessionsLoading={false}
        onLoadMoreRows={onLoadMoreRows}
        hasMoreRows={false}
        sessionFileActionResult={actionResult}
        sessionFileActionCanExecute={true}
        actionLabel={(action) => action}
        csvExportedRows={1}
      />,
    );

    expect(html).toContain("Open Codex Cleanup");
    expect(html).toContain("session-…7890");
    expect(html).toContain("table-select-target is-checked");
    expect(html).toContain("aria-label=\"Select session Open Codex Cleanup\"");
    expect(html).toContain("Delete locally · Preview ready");
    expect(html).toContain("Preview ready. Execute from this card when it looks right.");
    expect(html).toContain("tok-1");
    expect(html).toContain("Execute delete_local");
    expect(html).toContain("CSV exported 1");
    expect(onRunArchiveDryRun).not.toHaveBeenCalled();
  });

  it("renders empty and loading states", () => {
    const html = renderToStaticMarkup(
      <SessionTable
        messages={messages}
        providerSessionSummary={{ rows: 0, parse_ok: 0 }}
        providerSessionRows={[]}
        providerSessionsLimit={50}
        providerRowsSampled={false}
        showProviderSessionsZeroState={true}
        selectedProviderHasPresentSource={false}
        onPromoteDepthRefresh={() => undefined}
        sortedProviderSessionRows={[]}
        renderedProviderSessionRows={[]}
        canRunProviderAction={false}
        busy={false}
        onRunArchiveDryRun={() => undefined}
        onRunArchive={() => undefined}
        onRunDeleteDryRun={() => undefined}
        onRunDelete={() => undefined}
        selectedSessionProvider=""
        selectedSessionParseFailCount={undefined}
        onJumpToParserProvider={() => undefined}
        sourceFilter="all"
        onSourceFilterChange={() => undefined}
        sourceFilterOptions={[]}
        sessionSort="mtime_desc"
        onSessionSortChange={() => undefined}
        slowOnly={false}
        canApplySlowOnly={false}
        onSlowOnlyChange={() => undefined}
        onSetProviderViewAll={() => undefined}
        enabledCsvColumnsCount={0}
        totalCsvColumns={10}
        onExportCsv={() => undefined}
        onSetCsvColumnsPreset={() => undefined}
        csvColumnItems={[]}
        onCsvColumnChange={() => undefined}
        showReadOnlyHint={true}
        showProviderColumn={false}
        selectedSessionPath=""
        slowProviderSet={new Set<string>()}
        onSelectSessionPath={() => undefined}
        onSetParserDetailProvider={() => undefined}
        selectedProviderFiles={{}}
        onSelectedProviderFileChange={() => undefined}
        providerSessionsLoading={true}
        onLoadMoreRows={() => undefined}
        hasMoreRows={false}
        sessionFileActionResult={null}
        sessionFileActionCanExecute={false}
        actionLabel={(action) => action}
        csvExportedRows={null}
      />,
    );

    expect(html).toContain("No sources");
    expect(html).toContain("skeleton-line");
  });

  it("renders a filtered empty state instead of a loading message", () => {
    const html = renderToStaticMarkup(
      <SessionTable
        messages={messages}
        providerSessionSummary={{ rows: 1, parse_ok: 1 }}
        providerSessionRows={rows}
        providerSessionsLimit={50}
        providerRowsSampled={false}
        showProviderSessionsZeroState={false}
        selectedProviderHasPresentSource={true}
        onPromoteDepthRefresh={() => undefined}
        sortedProviderSessionRows={[]}
        renderedProviderSessionRows={[]}
        canRunProviderAction={false}
        busy={false}
        onRunArchiveDryRun={() => undefined}
        onRunArchive={() => undefined}
        onRunDeleteDryRun={() => undefined}
        onRunDelete={() => undefined}
        selectedSessionProvider=""
        selectedSessionParseFailCount={undefined}
        onJumpToParserProvider={() => undefined}
        sourceFilter="all"
        onSourceFilterChange={() => undefined}
        sourceFilterOptions={[{ source: "history", count: 1 }]}
        sessionSort="mtime_desc"
        onSessionSortChange={() => undefined}
        slowOnly={true}
        canApplySlowOnly={true}
        onSlowOnlyChange={() => undefined}
        onSetProviderViewAll={() => undefined}
        enabledCsvColumnsCount={0}
        totalCsvColumns={10}
        onExportCsv={() => undefined}
        onSetCsvColumnsPreset={() => undefined}
        csvColumnItems={[]}
        onCsvColumnChange={() => undefined}
        showReadOnlyHint={false}
        showProviderColumn={true}
        selectedSessionPath=""
        slowProviderSet={new Set<string>(["codex"])}
        onSelectSessionPath={() => undefined}
        onSetParserDetailProvider={() => undefined}
        selectedProviderFiles={{}}
        onSelectedProviderFileChange={() => undefined}
        providerSessionsLoading={false}
        onLoadMoreRows={() => undefined}
        hasMoreRows={false}
        sessionFileActionResult={null}
        sessionFileActionCanExecute={false}
        actionLabel={(action) => action}
        csvExportedRows={null}
      />,
    );

    expect(html).toContain("No session rows match the current filters.");
    expect(html).not.toContain("Loading provider sessions...");
  });
});
