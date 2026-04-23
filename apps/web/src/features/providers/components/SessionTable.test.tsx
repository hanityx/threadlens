import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/catalog";
import type { ProviderSessionRow } from "@/shared/types";
import { SessionTable, type SessionTableProps } from "@/features/providers/components/SessionTable";
import {
  resolveProviderSessionRowClickChecked,
  resolveVisibleSelectionCount,
} from "@/features/providers/model/sessionTableModel";

const messages = getMessages("en");
const noop = () => undefined;

function renderedButton(html: string, label: string): string {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.match(new RegExp(`<button[^>]*>${escapedLabel}</button>`))?.[0] ?? "";
}

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

function buildSessionTableProps(
  overrides: {
    messages?: SessionTableProps["messages"];
    data?: Partial<SessionTableProps["data"]>;
    selection?: Partial<SessionTableProps["selection"]>;
    filters?: Partial<SessionTableProps["filters"]>;
    actions?: Partial<SessionTableProps["actions"]>;
    workflow?: Partial<SessionTableProps["workflow"]>;
    display?: Partial<SessionTableProps["display"]>;
    sectionRef?: SessionTableProps["sectionRef"];
    panelStyle?: SessionTableProps["panelStyle"];
  } = {},
): SessionTableProps {
  return {
    messages: overrides.messages ?? messages,
    data: {
      providerSessionSummary: { rows: 1, parse_ok: 1 },
      providerSessionRows: rows,
      providerSessionsLimit: 50,
      providerRowsSampled: false,
      showProviderSessionsZeroState: false,
      selectedProviderHasPresentSource: true,
      sortedRows: rows,
      renderedRows: rows,
      providerSessionsLoading: false,
      hasMoreRows: false,
      csvExportedRows: null,
      selectedSessionProvider: "",
      selectedSessionParseFailCount: undefined,
      slowProviderSet: new Set<string>(),
      ...overrides.data,
    },
    selection: {
      selectedSessionPath: "",
      selectedProviderFiles: {},
      allProviderRowsSelected: false,
      allFilteredProviderRowsSelected: false,
      staleOnlyActive: false,
      canSelectStaleOnly: false,
      showBackupRows: false,
      canShowBackupRows: false,
      showArchivedRows: false,
      canShowArchivedRows: false,
      ...overrides.selection,
    },
    filters: {
      sourceFilter: "all",
      sourceFilterOptions: [{ source: "history", count: 1 }],
      sessionSort: "mtime_desc",
      enabledCsvColumnsCount: 0,
      totalCsvColumns: 10,
      csvColumnItems: [],
      ...overrides.filters,
    },
    actions: {
      onPromoteDepthRefresh: noop,
      onRunArchiveDryRun: noop,
      onRunArchiveExecute: noop,
      onRunDeleteDryRun: noop,
      onRequestHardDeleteConfirm: noop,
      onToggleHardDeleteSkipConfirmChecked: noop,
      onConfirmHardDelete: noop,
      onCancelHardDeleteConfirm: noop,
      onJumpToParserProvider: noop,
      onSourceFilterChange: noop,
      onSessionSortChange: noop,
      onToggleSelectStaleOnly: noop,
      onToggleShowBackupRows: noop,
      onToggleShowArchivedRows: noop,
      onRunBackupSelected: noop,
      onExportCsv: noop,
      onSetCsvColumnsPreset: noop,
      onCsvColumnChange: noop,
      onProviderDeleteBackupEnabledChange: noop,
      onSelectSessionPath: noop,
      onSetParserDetailProvider: noop,
      toggleSelectAllProviderRows: noop,
      onSelectedProviderFileChange: noop,
      onLoadMoreRows: noop,
      ...overrides.actions,
    },
    workflow: {
      canRunProviderAction: false,
      busy: false,
      hardDeleteConfirmOpen: false,
      hardDeleteSkipConfirmChecked: false,
      canRunProviderBackup: false,
      actionSelectionHint: "",
      providerDeleteBackupEnabled: false,
      showReadOnlyHint: false,
      archiveStage: { label: "Pending", className: "status-preview" },
      archiveCanExecute: false,
      deleteStage: { label: "Pending", className: "status-preview" },
      ...overrides.workflow,
    },
    display: {
      showProviderColumn: true,
      ...overrides.display,
    },
    sectionRef: overrides.sectionRef,
    panelStyle: overrides.panelStyle,
  };
}

describe("SessionTable", () => {
  it("counts only checked provider rows as the visible selection", () => {
    expect(
      resolveVisibleSelectionCount({
        sortedProviderSessionRows: rows,
        selectedProviderFiles: {},
        selectedSessionPath: "/tmp/session.jsonl",
      }),
    ).toBe(0);

    expect(
      resolveVisibleSelectionCount({
        sortedProviderSessionRows: rows,
        selectedProviderFiles: {},
        selectedSessionPath: "/tmp/missing.jsonl",
      }),
    ).toBe(0);
  });

  it("toggles provider session selection when a row is clicked", () => {
    expect(resolveProviderSessionRowClickChecked(false)).toBe(true);
    expect(resolveProviderSessionRowClickChecked(true)).toBe(false);
  });

  it("renders toolbar and rows without duplicating action results below the table", () => {
    const onRunArchiveDryRun = vi.fn();
    const onRunArchiveExecute = vi.fn();
    const onRunDeleteDryRun = vi.fn();
    const onRunBackupSelected = vi.fn();
    const onProviderDeleteBackupEnabledChange = vi.fn();
    const onRequestHardDeleteConfirm = vi.fn();
    const onJumpToParserProvider = vi.fn();
    const onSourceFilterChange = vi.fn();
    const onSessionSortChange = vi.fn();
    const onExportCsv = vi.fn();
    const onSetCsvColumnsPreset = vi.fn();
    const onCsvColumnChange = vi.fn();
    const onToggleShowBackupRows = vi.fn();
    const onSelectSessionPath = vi.fn();
    const onSelectedProviderFileChange = vi.fn();
    const onLoadMoreRows = vi.fn();
    const onPromoteDepthRefresh = vi.fn();
    const onSetParserDetailProvider = vi.fn();

    const html = renderToStaticMarkup(
      <SessionTable
        {...buildSessionTableProps({
          data: {
            selectedSessionProvider: "codex",
            selectedSessionParseFailCount: 2,
            slowProviderSet: new Set<string>(["codex"]),
            csvExportedRows: 1,
          },
          selection: {
            selectedSessionPath: "/tmp/session.jsonl",
            selectedProviderFiles: { "/tmp/session.jsonl": true },
            allFilteredProviderRowsSelected: true,
            canSelectStaleOnly: true,
            canShowBackupRows: true,
          },
          filters: {
            enabledCsvColumnsCount: 3,
            csvColumnItems: [{ key: "provider", label: "Provider", checked: true }],
          },
          actions: {
            onPromoteDepthRefresh,
            onRunArchiveDryRun,
            onRunArchiveExecute,
            onRunDeleteDryRun,
            onRequestHardDeleteConfirm,
            onJumpToParserProvider,
            onSourceFilterChange,
            onSessionSortChange,
            onExportCsv,
            onSetCsvColumnsPreset,
            onCsvColumnChange,
            onToggleShowBackupRows,
            onSelectSessionPath,
            onSelectedProviderFileChange,
            onLoadMoreRows,
            onSetParserDetailProvider,
          },
          workflow: {
            canRunProviderAction: true,
            hardDeleteConfirmOpen: true,
            canRunProviderBackup: true,
            providerDeleteBackupEnabled: true,
            archiveStage: { label: "Pending", className: "status-preview" },
            deleteStage: { label: "Ready", className: "status-active" },
          },
        })}
      />,
    );

    expect(html).toContain("Open Codex Cleanup");
    expect(html).toContain("session-…7890");
    expect(html).toContain("table-select-target is-checked");
    expect(html).toContain("aria-label=\"Select all in tab\"");
    expect(html).toContain("aria-label=\"Select session Open Codex Cleanup\"");
    expect(html).not.toContain("Delete locally · Preview ready");
    expect(html).not.toContain("Review the affected source files, then execute when you are ready.");
    expect(html).not.toContain("tok-1");
    expect(html).not.toContain("Execute delete_local");
    expect(html).toContain("Rows exported to CSV: 1");
    expect(html).toContain("Filter");
    expect(html).toContain("Select stale");
    expect(html).toContain("Backups");
    expect(html).not.toContain("Back up locally");
    expect(html).toContain("Hard delete");
    expect(html).toContain("sessions-action-secondary");
    expect(html).toContain("Backup before delete");
    expect(html).not.toContain("Keep a backup copy before delete.");
    expect(html).toContain("Delete selected session files now?");
    expect(html).toContain("This removes the selected session files immediately without creating a backup copy.");
    expect(html).toContain("Do not ask again for hard delete.");
    expect(html).toContain("Hard delete now");
    expect(html).toContain("Sessions");
    expect(html).toContain("1 Filtered / 1 Total");
    expect(html).toContain("Current selection 1");
    expect(html).toContain("Archive selected Pending");
    expect(html).toContain("Deletion prep Ready");
    expect(html).toContain("status-pill status-detected status-pill-button");
    expect(html.indexOf("Back up before delete")).toBeLessThan(
      html.indexOf("status-pill status-detected status-pill-button"),
    );
    expect(html).toContain("Provider");
    expect(html).toContain("Source");
    expect(html).toContain("Format");
    expect(html).toContain("Modified");
    expect(html.indexOf("Select stale")).toBeLessThan(html.indexOf("aria-controls=\"provider-filters-panel\">Filter"));
    expect(html.indexOf("Backups")).toBeLessThan(html.indexOf("aria-controls=\"provider-filters-panel\">Filter"));
    expect(onRunArchiveDryRun).not.toHaveBeenCalled();
    expect(onRunArchiveExecute).not.toHaveBeenCalled();
    expect(onRunBackupSelected).not.toHaveBeenCalled();
    expect(onRequestHardDeleteConfirm).not.toHaveBeenCalled();
    expect(onToggleShowBackupRows).not.toHaveBeenCalled();
  });

  it("renders empty and loading states", () => {
    const html = renderToStaticMarkup(
      <SessionTable
        {...buildSessionTableProps({
          data: {
            providerSessionSummary: { rows: 0, parse_ok: 0 },
            providerSessionRows: [],
            showProviderSessionsZeroState: true,
            selectedProviderHasPresentSource: false,
            sortedRows: [],
            renderedRows: [],
            providerSessionsLoading: true,
          },
          selection: {
            canShowBackupRows: false,
          },
          workflow: {
            showReadOnlyHint: true,
          },
          display: {
            showProviderColumn: false,
          },
        })}
      />,
    );

    expect(html).toContain("No local data sources were detected for this provider.");
    expect(html).toContain("skeleton-line");
    expect(html).not.toContain("Backups");
  });

  it("renders a filtered empty state instead of a loading message", () => {
    const html = renderToStaticMarkup(
      <SessionTable
        {...buildSessionTableProps({
          data: {
            sortedRows: [],
            renderedRows: [],
          },
          selection: {
            canShowBackupRows: true,
          },
        })}
      />,
    );

    expect(html).toContain("No session rows match the current filters.");
    expect(html).not.toContain("Loading sessions...");
  });

  it("renders load-more controls inside a dedicated footer bar when more rows are available", () => {
    const manyRows = Array.from({ length: 120 }, (_, index) => ({
      ...rows[0],
      session_id: `session-${index}`,
      file_path: `/tmp/session-${index}.jsonl`,
    }));
    const html = renderToStaticMarkup(
      <SessionTable
        {...buildSessionTableProps({
          data: {
            providerSessionSummary: { rows: 120, parse_ok: 120 },
            providerSessionRows: manyRows,
            providerRowsSampled: true,
            sortedRows: manyRows,
            renderedRows: manyRows.slice(0, 80),
            hasMoreRows: true,
          },
          filters: {
            sourceFilterOptions: [{ source: "history", count: 120 }],
          },
        })}
      />,
    );

    expect(html).toContain('class="sub-toolbar table-load-more-bar"');
    expect(html).toContain("Load more rows 80/120");
  });

  it("renders hard delete confirmation copy in Korean", () => {
    const koMessages = getMessages("ko");
    const html = renderToStaticMarkup(
      <SessionTable
        {...buildSessionTableProps({
          messages: koMessages,
          data: {
            selectedSessionProvider: "codex",
            selectedSessionParseFailCount: 2,
            slowProviderSet: new Set<string>(["codex"]),
            csvExportedRows: 1,
          },
          selection: {
            selectedSessionPath: "/tmp/session.jsonl",
            selectedProviderFiles: { "/tmp/session.jsonl": true },
            allFilteredProviderRowsSelected: true,
            canSelectStaleOnly: true,
          },
          filters: {
            enabledCsvColumnsCount: 3,
            csvColumnItems: [{ key: "provider", label: "Provider", checked: true }],
          },
          workflow: {
            canRunProviderAction: true,
            hardDeleteConfirmOpen: true,
            canRunProviderBackup: true,
            providerDeleteBackupEnabled: true,
            archiveStage: { label: "대기", className: "status-preview" },
            deleteStage: { label: "준비", className: "status-active" },
          },
        })}
      />,
    );

    expect(html).toContain("강제 삭제");
    expect(html).toContain("선택 항목 보관");
    expect(html).toContain("삭제 준비");
    expect(html).toContain("선택한 세션 파일을 지금 강제 삭제할까요?");
    expect(html).toContain("앞으로 강제 삭제 확인을 다시 묻지 않기");
    expect(html).toContain("지금 강제 삭제");
    expect(html).not.toContain("Do not ask again for hard delete.");
  });

  it("keeps hard delete enabled for selected backup rows while disabling prep actions", () => {
    const html = renderToStaticMarkup(
      <SessionTable
        {...buildSessionTableProps({
          selection: {
            selectedProviderFiles: { "/tmp/session.jsonl": true },
            showBackupRows: true,
            canShowBackupRows: true,
          },
          workflow: {
            canRunProviderAction: true,
          },
        })}
      />,
    );

    expect(renderedButton(html, "Archive selected")).toContain("disabled");
    expect(renderedButton(html, "Prepare deletion")).toContain("disabled");
    expect(renderedButton(html, "Hard delete")).not.toContain("disabled");
  });

  it("switches archive prep copy to unarchive in archived view", () => {
    const html = renderToStaticMarkup(
      <SessionTable
        {...buildSessionTableProps({
          selection: {
            selectedProviderFiles: { "/tmp/session.jsonl": true },
            showArchivedRows: true,
            canShowArchivedRows: true,
          },
          workflow: {
            canRunProviderAction: true,
            archiveStage: { label: "Pending", className: "status-preview" },
          },
        })}
      />,
    );

    expect(html).toContain("Unarchive selected");
    expect(html).toContain("Unarchive selected Pending");
    expect(html).not.toContain("Archive Pending");
    expect(renderedButton(html, "Unarchive selected")).not.toContain("disabled");
    expect(renderedButton(html, "Prepare deletion")).toContain("disabled");
  });

  it("switches the archive prep button to execute when the current selection is ready", () => {
    const html = renderToStaticMarkup(
      <SessionTable
        {...buildSessionTableProps({
          selection: {
            selectedProviderFiles: { "/tmp/session.jsonl": true },
          },
          workflow: {
            canRunProviderAction: true,
            archiveCanExecute: true,
            archiveStage: { label: "Ready", className: "status-active" },
          },
        })}
      />,
    );

    expect(renderedButton(html, "Archive")).not.toContain("disabled");
  });

  it("uses compact numeric modified dates in the session table", () => {
    const html = renderToStaticMarkup(<SessionTable {...buildSessionTableProps()} />);

    expect(html).toContain("2026.03.24");
    expect(html).not.toContain("Mar 24, 2026");
  });
});
