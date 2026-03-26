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
    slowOnlyDormant: "Slow dormant",
    exportCsv: "Export CSV",
    csvPresetAll: "All columns",
    csvPresetCompact: "Compact columns",
    csvPresetForensics: "Forensics columns",
    csvSelectedColumns: "Columns",
    readOnlyHint: "Read only",
    colProvider: "Provider",
    colSession: "Session",
    colFormat: "Format",
    colProbe: "Probe",
    colSize: "Size",
    sessionsLoading: "No session rows",
    loadMoreRows: "Load more",
    actionResultTitle: "Action result",
    resultPreview: "Preview",
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
    const onSessionFilterChange = vi.fn();
    const onProbeFilterChange = vi.fn();
    const onToggleSelectAllFiltered = vi.fn();
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
        providerLabel="Codex"
        showProviderSessionsZeroState={false}
        selectedProviderHasPresentSource={true}
        onPromoteDepthRefresh={onPromoteDepthRefresh}
        sessionFilter=""
        onSessionFilterChange={onSessionFilterChange}
        probeFilter="all"
        onProbeFilterChange={onProbeFilterChange}
        sortedProviderSessionRows={rows}
        renderedProviderSessionRows={rows}
        allFilteredProviderRowsSelected={false}
        allProviderRowsSelected={false}
        onToggleSelectAllFiltered={onToggleSelectAllFiltered}
        selectedProviderFilePathsCount={1}
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
        actionLabel={(action) => action}
        csvExportedRows={1}
      />,
    );

    expect(html).toContain("Sessions");
    expect(html).toContain("Search sessions");
    expect(html).toContain("Open Codex Cleanup");
    expect(html).toContain("session-…7890");
    expect(html).toContain("delete_local · Preview");
    expect(html).toContain("tok-1");
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
        providerLabel="Codex"
        showProviderSessionsZeroState={true}
        selectedProviderHasPresentSource={false}
        onPromoteDepthRefresh={() => undefined}
        sessionFilter=""
        onSessionFilterChange={() => undefined}
        probeFilter="all"
        onProbeFilterChange={() => undefined}
        sortedProviderSessionRows={[]}
        renderedProviderSessionRows={[]}
        allFilteredProviderRowsSelected={false}
        allProviderRowsSelected={false}
        onToggleSelectAllFiltered={() => undefined}
        selectedProviderFilePathsCount={0}
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
        actionLabel={(action) => action}
        csvExportedRows={null}
      />,
    );

    expect(html).toContain("No sources");
    expect(html).toContain("skeleton-line");
  });
});
