import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages, type Messages } from "@/i18n";
import type { ProviderSessionActionResult, ProviderSessionRow } from "@/shared/types";
import { SessionTable } from "@/features/providers/components/SessionTable";

const messages = getMessages("en");

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
    const onRequestHardDeleteConfirm = vi.fn();
    const onJumpToParserProvider = vi.fn();
    const onSourceFilterChange = vi.fn();
    const onSessionSortChange = vi.fn();
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
        onRequestHardDeleteConfirm={onRequestHardDeleteConfirm}
        hardDeleteConfirmOpen={true}
        hardDeleteSkipConfirmChecked={false}
        onToggleHardDeleteSkipConfirmChecked={() => undefined}
        onConfirmHardDelete={() => undefined}
        onCancelHardDeleteConfirm={() => undefined}
        selectedSessionProvider="codex"
        selectedSessionParseFailCount={2}
        onJumpToParserProvider={onJumpToParserProvider}
        sourceFilter="all"
        onSourceFilterChange={onSourceFilterChange}
        sourceFilterOptions={[{ source: "history", count: 1 }]}
        sessionSort="mtime_desc"
        onSessionSortChange={onSessionSortChange}
        staleOnlyActive={false}
        canSelectStaleOnly={true}
        onToggleSelectStaleOnly={() => undefined}
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
        allProviderRowsSelected={false}
        allFilteredProviderRowsSelected={true}
        toggleSelectAllProviderRows={() => undefined}
        onSelectedProviderFileChange={onSelectedProviderFileChange}
        providerSessionsLoading={false}
        onLoadMoreRows={onLoadMoreRows}
        hasMoreRows={false}
        archiveStage={{ label: "Pending", className: "status-preview" }}
        deleteStage={{ label: "Ready", className: "status-active" }}
        sessionFileActionResult={actionResult}
        sessionFileActionCanExecute={true}
        actionLabel={(action) => action}
        csvExportedRows={1}
      />,
    );

    expect(html).toContain("Open Codex Cleanup");
    expect(html).toContain("session-…7890");
    expect(html).toContain("table-select-target is-checked");
    expect(html).toContain("aria-label=\"Select all in tab\"");
    expect(html).toContain("aria-label=\"Select session Open Codex Cleanup\"");
    expect(html).toContain("Delete locally · Preview ready");
    expect(html).toContain("Preview ready. Execute from this card when it looks right.");
    expect(html).toContain("tok-1");
    expect(html).toContain("Execute delete_local");
    expect(html).toContain("Rows exported to CSV: 1");
    expect(html).toContain("Filter");
    expect(html).toContain("Stale only");
    expect(html).toContain("Hard delete");
    expect(html).toContain("Delete selected session files now?");
    expect(html).toContain("This removes the selected session files immediately without creating a backup copy.");
    expect(html).toContain("Do not ask again for hard delete.");
    expect(html).toContain("Hard delete now");
    expect(html).toContain("Sessions");
    expect(html).toContain("1 Filtered / 1 Total");
    expect(html).toContain("Current selection 1");
    expect(html).toContain("Archive dry-run Pending");
    expect(html).toContain("Delete dry-run Ready");
    expect(html).toContain("status-pill status-detected status-pill-button");
    expect(html).toContain("Provider");
    expect(html).toContain("Source");
    expect(html).toContain("Format");
    expect(html).toContain("Modified");
    expect(onRunArchiveDryRun).not.toHaveBeenCalled();
    expect(onRequestHardDeleteConfirm).not.toHaveBeenCalled();
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
        onRequestHardDeleteConfirm={() => undefined}
        hardDeleteConfirmOpen={false}
        hardDeleteSkipConfirmChecked={false}
        onToggleHardDeleteSkipConfirmChecked={() => undefined}
        onConfirmHardDelete={() => undefined}
        onCancelHardDeleteConfirm={() => undefined}
        selectedSessionProvider=""
        selectedSessionParseFailCount={undefined}
        onJumpToParserProvider={() => undefined}
        sourceFilter="all"
        onSourceFilterChange={() => undefined}
        sourceFilterOptions={[]}
        sessionSort="mtime_desc"
        onSessionSortChange={() => undefined}
        staleOnlyActive={false}
        canSelectStaleOnly={false}
        onToggleSelectStaleOnly={() => undefined}
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
        allProviderRowsSelected={false}
        allFilteredProviderRowsSelected={false}
        toggleSelectAllProviderRows={() => undefined}
        onSelectedProviderFileChange={() => undefined}
        providerSessionsLoading={true}
        onLoadMoreRows={() => undefined}
        hasMoreRows={false}
        archiveStage={{ label: "Pending", className: "status-preview" }}
        deleteStage={{ label: "Pending", className: "status-preview" }}
        sessionFileActionResult={null}
        sessionFileActionCanExecute={false}
        actionLabel={(action) => action}
        csvExportedRows={null}
      />,
    );

    expect(html).toContain("No local data sources were detected for this provider.");
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
        onRequestHardDeleteConfirm={() => undefined}
        hardDeleteConfirmOpen={false}
        hardDeleteSkipConfirmChecked={false}
        onToggleHardDeleteSkipConfirmChecked={() => undefined}
        onConfirmHardDelete={() => undefined}
        onCancelHardDeleteConfirm={() => undefined}
        selectedSessionProvider=""
        selectedSessionParseFailCount={undefined}
        onJumpToParserProvider={() => undefined}
        sourceFilter="all"
        onSourceFilterChange={() => undefined}
        sourceFilterOptions={[{ source: "history", count: 1 }]}
        sessionSort="mtime_desc"
        onSessionSortChange={() => undefined}
        staleOnlyActive={false}
        canSelectStaleOnly={false}
        onToggleSelectStaleOnly={() => undefined}
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
        allProviderRowsSelected={false}
        allFilteredProviderRowsSelected={false}
        toggleSelectAllProviderRows={() => undefined}
        onSelectedProviderFileChange={() => undefined}
        providerSessionsLoading={false}
        onLoadMoreRows={() => undefined}
        hasMoreRows={false}
        archiveStage={{ label: "Pending", className: "status-preview" }}
        deleteStage={{ label: "Pending", className: "status-preview" }}
        sessionFileActionResult={null}
        sessionFileActionCanExecute={false}
        actionLabel={(action) => action}
        csvExportedRows={null}
      />,
    );

    expect(html).toContain("No session rows match the current filters.");
    expect(html).not.toContain("Loading sessions...");
  });
});
