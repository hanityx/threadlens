import { isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/catalog";
import type {
  DataSourceInventoryRow,
  ProviderActionSelection,
  ProviderMatrixProvider,
  ProviderSessionActionResult,
  ProviderSessionRow,
  RecoveryBackupExportResponse,
} from "@/shared/types";
import { INITIAL_CHUNK } from "@/shared/types";
import {
  ProvidersPanel,
  resolveSessionPanelHeight,
} from "@/features/providers/components/ProvidersPanel";
import {
  clearDesktopRouteProviderFilePath,
  pruneSelectedProviderFilesForFilteredScope,
  resolveProviderViewSwitch,
  shouldClearFilteredSessionPath,
  shouldShowProviderSessionDetailSlot,
} from "@/features/providers/model/providersPanelScopeModel";

const mockSessionTable = vi.fn();
const mockBackupHub = vi.fn();

vi.mock("./SessionTable", () => ({
  SessionTable: (props: Record<string, unknown>) => {
    mockSessionTable(props);
    return <div data-slot="session-table" />;
  },
}));

vi.mock("./ProviderWorkspaceBar", () => ({
  ProviderWorkspaceBar: () => <div data-slot="workspace-bar" />,
}));

vi.mock("./ProviderAdvancedShell", () => ({
  ProviderAdvancedShell: () => <div data-slot="advanced-shell" />,
}));

vi.mock("./ProviderSideStack", () => ({
  ProviderSideStack: (props: { backupHubSlot?: React.ReactNode }) => (
    <div data-slot="side-stack">{isValidElement(props.backupHubSlot) ? props.backupHubSlot : null}</div>
  ),
}));

vi.mock("./BackupHub", () => ({
  BackupHub: (props: Record<string, unknown>) => {
    mockBackupHub(props);
    return <div data-slot="backup-hub" />;
  },
}));

vi.mock("@/features/providers/parser/ParserHealthTable", () => ({
  ParserHealthTable: () => <div data-slot="parser-health" />,
}));

vi.mock("./AiManagementMatrix", () => ({
  AiManagementMatrix: () => <div data-slot="matrix" />,
}));

vi.mock("./DataSourcesList", () => ({
  DataSourcesList: () => <div data-slot="data-sources" />,
}));

vi.mock("@/features/providers/lib/helpers", async () => {
  const actual = await vi.importActual<typeof import("@/features/providers/lib/helpers")>("@/features/providers/lib/helpers");
  return {
    ...actual,
    readCsvColumnPrefs: () => actual.DEFAULT_CSV_COLUMNS,
    writeCsvColumnPrefs: vi.fn(),
  };
});

const messages = getMessages("en");

const providerSessionRows: ProviderSessionRow[] = [
  {
    provider: "codex",
    source: "sessions",
    session_id: "session-1",
    display_title: "Codex session",
    file_path: "/tmp/session-1.jsonl",
    size_bytes: 128,
    mtime: "2026-03-28T01:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Codex session",
      title_source: "header",
    },
  },
];

const cleanupBackupRow: ProviderSessionRow = {
  ...providerSessionRows[0],
  source: "cleanup_backups",
  session_id: "backup-row",
  display_title: "Backup artifact",
  file_path: "/tmp/cleanup-backup.jsonl",
};

const archivedSessionRow: ProviderSessionRow = {
  ...providerSessionRows[0],
  source: "archived_sessions",
  session_id: "archived-row",
  display_title: "Archived session",
  file_path: "/tmp/archived-session.jsonl",
};

function buildProviderSessionRows(count: number): ProviderSessionRow[] {
  return Array.from({ length: count }, (_, index) => ({
    provider: "codex",
    source: "sessions",
    session_id: `session-${index + 1}`,
    display_title: `Codex session ${index + 1}`,
    file_path: `/tmp/session-${index + 1}.jsonl`,
    size_bytes: 128 + index,
    mtime: `2026-03-${String(Math.max(1, 28 - (index % 20))).padStart(2, "0")}T01:00:00.000Z`,
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: `Codex session ${index + 1}`,
      title_source: "header",
    },
  }));
}

const providers: ProviderMatrixProvider[] = [
  {
    provider: "codex",
    name: "Codex",
    status: "active",
    capability_level: "full",
    capabilities: {
      read_sessions: true,
      analyze_context: true,
      safe_cleanup: true,
      hard_delete: true,
    },
    evidence: {
      session_log_count: 1,
      roots: ["/tmp"],
      notes: "ready",
    },
  },
];

const deletePreviewResult: ProviderSessionActionResult = {
  ok: true,
  provider: "codex",
  action: "delete_local",
  dry_run: true,
  target_count: 1,
  valid_count: 1,
  applied_count: 0,
  confirm_token_expected: "tok-delete",
  confirm_token_accepted: false,
  backup_before_delete: true,
};

const deletePreviewSelection: ProviderActionSelection = {
  provider: "codex",
  action: "delete_local",
  file_paths: ["/tmp/session-1.jsonl"],
  dry_run: true,
  backup_before_delete: true,
};

describe("ProvidersPanel", () => {
  beforeEach(() => {
    mockSessionTable.mockClear();
    mockBackupHub.mockClear();
  });

  it("keeps the session table at a minimum active height when the detail panel collapses", () => {
    expect(resolveSessionPanelHeight({ detailHeight: 220, minHeight: 640 })).toBe(640);
  });

  it("tracks the full side stack height when backup or export sections make the right side taller", () => {
    expect(resolveSessionPanelHeight({ detailHeight: 540, minHeight: 640, stackHeight: 912 })).toBe(912);
  });

  it("preserves the highest active-session baseline when the right panel later collapses", () => {
    expect(resolveSessionPanelHeight({ detailHeight: 372, stackHeight: 428, baselineHeight: 1164, minHeight: 640 })).toBe(1164);
  });

  it("clears the selected session path when switching to a different provider view", () => {
    expect(
      resolveProviderViewSwitch("copilot", "all", "/tmp/copilot.json"),
    ).toEqual({
      providerView: "all",
      selectedSessionPath: "",
    });

    expect(
      resolveProviderViewSwitch("copilot", "copilot", "/tmp/copilot.json"),
    ).toEqual({
      providerView: "copilot",
      selectedSessionPath: "/tmp/copilot.json",
    });
  });

  it("clears a routed session path when active filters exclude it", () => {
    expect(
      shouldClearFilteredSessionPath({
        selectedSessionPath: "/tmp/copilot.json",
        filteredProviderFilePaths: [],
        sessionFilter: "no-match",
        probeFilter: "all",
        sourceFilter: "all",
      }),
    ).toBe(true);

    expect(
      shouldClearFilteredSessionPath({
        selectedSessionPath: "/tmp/copilot.json",
        filteredProviderFilePaths: ["/tmp/copilot.json"],
        sessionFilter: "copilot",
        probeFilter: "all",
        sourceFilter: "all",
      }),
    ).toBe(false);
  });

  it("hides the provider session detail slot when filters produce zero rows and no session remains selected", () => {
    expect(
      shouldShowProviderSessionDetailSlot({
        selectedSessionPath: "",
        filteredProviderFilePaths: [],
        sessionFilter: "no-match",
        probeFilter: "all",
        sourceFilter: "all",
      }),
    ).toBe(false);

    expect(
      shouldShowProviderSessionDetailSlot({
        selectedSessionPath: "/tmp/copilot.json",
        filteredProviderFilePaths: [],
        sessionFilter: "no-match",
        probeFilter: "all",
        sourceFilter: "all",
      }),
    ).toBe(true);

    expect(
      shouldShowProviderSessionDetailSlot({
        selectedSessionPath: "",
        filteredProviderFilePaths: ["/tmp/copilot.json"],
        sessionFilter: "copilot",
        probeFilter: "all",
        sourceFilter: "all",
      }),
    ).toBe(true);
  });

  it("removes stale provider filePath params from the desktop route", () => {
    const previousWindow = globalThis.window;
    const replaceState = vi.fn();
    globalThis.window = {
      location: {
        pathname: "/index.html",
        search: "?view=providers&provider=codex&filePath=%2Ftmp%2Fcodex.jsonl",
        hash: "",
      },
      history: {
        replaceState,
      },
    } as unknown as Window & typeof globalThis;

    expect(clearDesktopRouteProviderFilePath("codex")).toBe(true);
    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "/index.html?view=providers&provider=codex",
    );

    globalThis.window = previousWindow;
  });

  it("prunes hidden bulk selections when active filters narrow the visible scope", () => {
    expect(
      pruneSelectedProviderFilesForFilteredScope({
        selectedProviderFiles: {
          "/tmp/session-1.jsonl": true,
          "/tmp/session-2.jsonl": true,
        },
        filteredProviderFilePaths: ["/tmp/session-1.jsonl"],
        sessionFilter: "session-1",
        probeFilter: "all",
        sourceFilter: "all",
      }),
    ).toEqual({
      "/tmp/session-1.jsonl": true,
    });
  });

  it("does not show a read-only hint when a cleanup-capable provider only lacks bulk selection", () => {
    renderToStaticMarkup(
      <ProvidersPanel
        messages={messages}
        providers={providers}
        providerSummary={{ total: 1, active: 1, detected: 1 }}
        providerMatrixLoading={false}
        providerTabs={[
          { id: "all", name: "All providers", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
          { id: "codex", name: "Codex", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
        ]}
        slowProviderIds={[]}
        slowProviderThresholdMs={1200}
        setSlowProviderThresholdMs={() => undefined}
        providerProbeFilterIntent={null}
        setProviderProbeFilterIntent={() => undefined}
        providerView="codex"
        setProviderView={() => undefined}
        providerDataDepth="balanced"
        setProviderDataDepth={() => undefined}
        providerSessionRows={providerSessionRows}
        allProviderSessionRows={providerSessionRows}
        providerSessionSummary={{ providers: 1, rows: 1, parse_ok: 1, parse_fail: 0 }}
        dataSourceRows={[] as DataSourceInventoryRow[]}
        dataSourcesLoading={false}
        providerSessionsLimit={60}
        providerRowsSampled={false}
        providerSessionsLoading={false}
        selectedProviderFiles={{}}
        setSelectedProviderFiles={() => undefined}
        allProviderRowsSelected={false}
        toggleSelectAllProviderRows={() => undefined}
        selectedProviderLabel="Codex"
        selectedProviderFilePaths={[]}
        providerActionProvider=""
        canRunProviderAction={false}
        busy={false}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={() => undefined}
        runProviderAction={() => undefined}
        runProviderHardDelete={() => Promise.resolve(null)}
        providerActionData={null}
        providerActionSelection={null}
        providerSessionActionPending={false}
        recoveryBackupExportPending={false}
        backupRoot=""
        setBackupRoot={() => undefined}
        exportRoot=""
        setExportRoot={() => undefined}
        latestExportArchivePath=""
        recoveryData={null}
        runRecoveryBackupExport={() => undefined}
        runGroupedProviderBackup={() => Promise.resolve(null)}
        runGroupedProviderBackupExport={() => Promise.resolve(null)}
        recoveryBackupExportData={null as RecoveryBackupExportResponse | null}
        parserReports={[]}
        allParserReports={[]}
        parserLoading={false}
        parserSummary={{ providers: 0, scanned: 0, parse_ok: 0, parse_fail: 0, parse_score: null }}
        selectedSessionPath=""
        setSelectedSessionPath={() => undefined}
        providersRefreshing={false}
        providersLastRefreshAt=""
        providerFetchMetrics={{ data_sources: null, matrix: null, sessions: null, parser: null }}
        refreshProvidersData={() => undefined}
      />,
    );

    expect(mockSessionTable).toHaveBeenCalledTimes(1);
    const props = mockSessionTable.mock.calls[0]?.[0] as unknown as {
      workflow: {
        showReadOnlyHint: boolean;
        canRunProviderAction: boolean;
      };
    };
    expect(props.workflow.canRunProviderAction).toBe(false);
    expect(props.workflow.showReadOnlyHint).toBe(false);
  });

  it("starts without a persisted slow-only filter on mount", () => {
    renderToStaticMarkup(
      <ProvidersPanel
        messages={messages}
        providers={providers}
        providerSummary={{ total: 1, active: 1, detected: 1 }}
        providerMatrixLoading={false}
        providerTabs={[
          { id: "all", name: "All providers", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
          { id: "codex", name: "Codex", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
        ]}
        slowProviderIds={[]}
        slowProviderThresholdMs={1200}
        setSlowProviderThresholdMs={() => undefined}
        providerProbeFilterIntent={null}
        setProviderProbeFilterIntent={() => undefined}
        providerView="all"
        setProviderView={() => undefined}
        providerDataDepth="balanced"
        setProviderDataDepth={() => undefined}
        providerSessionRows={providerSessionRows}
        allProviderSessionRows={providerSessionRows}
        providerSessionSummary={{ providers: 1, rows: 1, parse_ok: 1, parse_fail: 0 }}
        dataSourceRows={[] as DataSourceInventoryRow[]}
        dataSourcesLoading={false}
        providerSessionsLimit={60}
        providerRowsSampled={false}
        providerSessionsLoading={false}
        selectedProviderFiles={{}}
        setSelectedProviderFiles={() => undefined}
        allProviderRowsSelected={false}
        toggleSelectAllProviderRows={() => undefined}
        selectedProviderLabel="Codex"
        selectedProviderFilePaths={[]}
        providerActionProvider=""
        canRunProviderAction={false}
        busy={false}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={() => undefined}
        runProviderAction={() => undefined}
        runProviderHardDelete={() => Promise.resolve(null)}
        providerActionData={null}
        providerActionSelection={null}
        providerSessionActionPending={false}
        recoveryBackupExportPending={false}
        backupRoot=""
        setBackupRoot={() => undefined}
        exportRoot=""
        setExportRoot={() => undefined}
        latestExportArchivePath=""
        recoveryData={null}
        runRecoveryBackupExport={() => undefined}
        runGroupedProviderBackup={() => Promise.resolve(null)}
        runGroupedProviderBackupExport={() => Promise.resolve(null)}
        recoveryBackupExportData={null as RecoveryBackupExportResponse | null}
        parserReports={[]}
        allParserReports={[]}
        parserLoading={false}
        parserSummary={{ providers: 0, scanned: 0, parse_ok: 0, parse_fail: 0, parse_score: null }}
        selectedSessionPath=""
        setSelectedSessionPath={() => undefined}
        providersRefreshing={false}
        providersLastRefreshAt=""
        providerFetchMetrics={{ data_sources: null, matrix: null, sessions: null, parser: null }}
        refreshProvidersData={() => undefined}
      />,
    );

    expect(mockSessionTable).toHaveBeenCalledTimes(1);
    const props = mockSessionTable.mock.calls[0]?.[0] as unknown as {
      data: {
        sortedRows: ProviderSessionRow[];
      };
    };
    expect(props.data.sortedRows).toHaveLength(1);
  });

  it("passes stale selection controls when old session rows are present", () => {
    const staleRows: ProviderSessionRow[] = [
      {
        ...providerSessionRows[0],
        file_path: "/tmp/stale-session.jsonl",
        mtime: "2026-03-10T01:00:00.000Z",
      },
    ];

    renderToStaticMarkup(
      <ProvidersPanel
        messages={messages}
        providers={providers}
        providerSummary={{ total: 1, active: 1, detected: 1 }}
        providerMatrixLoading={false}
        providerTabs={[
          { id: "all", name: "All providers", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
          { id: "codex", name: "Codex", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
        ]}
        slowProviderIds={[]}
        slowProviderThresholdMs={1200}
        setSlowProviderThresholdMs={() => undefined}
        providerProbeFilterIntent={null}
        setProviderProbeFilterIntent={() => undefined}
        providerView="all"
        setProviderView={() => undefined}
        providerDataDepth="balanced"
        setProviderDataDepth={() => undefined}
        providerSessionRows={staleRows}
        allProviderSessionRows={staleRows}
        providerSessionSummary={{ providers: 1, rows: 1, parse_ok: 1, parse_fail: 0 }}
        dataSourceRows={[] as DataSourceInventoryRow[]}
        dataSourcesLoading={false}
        providerSessionsLimit={60}
        providerRowsSampled={false}
        providerSessionsLoading={false}
        selectedProviderFiles={{}}
        setSelectedProviderFiles={() => undefined}
        allProviderRowsSelected={false}
        toggleSelectAllProviderRows={() => undefined}
        selectedProviderLabel="Codex"
        selectedProviderFilePaths={[]}
        providerActionProvider=""
        canRunProviderAction={false}
        busy={false}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={() => undefined}
        runProviderAction={() => undefined}
        runProviderHardDelete={() => Promise.resolve(null)}
        providerActionData={null}
        providerActionSelection={null}
        providerSessionActionPending={false}
        recoveryBackupExportPending={false}
        backupRoot=""
        setBackupRoot={() => undefined}
        exportRoot=""
        setExportRoot={() => undefined}
        latestExportArchivePath=""
        recoveryData={null}
        runRecoveryBackupExport={() => undefined}
        runGroupedProviderBackup={() => Promise.resolve(null)}
        runGroupedProviderBackupExport={() => Promise.resolve(null)}
        recoveryBackupExportData={null as RecoveryBackupExportResponse | null}
        parserReports={[]}
        allParserReports={[]}
        parserLoading={false}
        parserSummary={{ providers: 0, scanned: 0, parse_ok: 0, parse_fail: 0, parse_score: null }}
        selectedSessionPath=""
        setSelectedSessionPath={() => undefined}
        providersRefreshing={false}
        providersLastRefreshAt=""
        providerFetchMetrics={{ data_sources: null, matrix: null, sessions: null, parser: null }}
        refreshProvidersData={() => undefined}
      />,
    );

    expect(mockSessionTable).toHaveBeenCalledTimes(1);
    const props = mockSessionTable.mock.calls[0]?.[0] as unknown as {
      selection: {
        canSelectStaleOnly: boolean;
        staleOnlyActive: boolean;
      };
    };
    expect(props.selection.canSelectStaleOnly).toBe(true);
    expect(props.selection.staleOnlyActive).toBe(false);
  });

  it("hides cleanup_backups rows from the default session table and exposes a backup toggle", () => {
    renderToStaticMarkup(
      <ProvidersPanel
        messages={messages}
        providers={providers}
        providerSummary={{ total: 1, active: 1, detected: 1 }}
        providerMatrixLoading={false}
        providerTabs={[
          { id: "all", name: "All providers", status: "active", scanned: 3, scan_ms: 0, is_slow: false },
          { id: "codex", name: "Codex", status: "active", scanned: 3, scan_ms: 0, is_slow: false },
        ]}
        slowProviderIds={[]}
        slowProviderThresholdMs={1200}
        setSlowProviderThresholdMs={() => undefined}
        providerProbeFilterIntent={null}
        setProviderProbeFilterIntent={() => undefined}
        providerView="codex"
        setProviderView={() => undefined}
        providerDataDepth="balanced"
        setProviderDataDepth={() => undefined}
        providerSessionRows={[providerSessionRows[0], cleanupBackupRow, archivedSessionRow]}
        allProviderSessionRows={[providerSessionRows[0], cleanupBackupRow, archivedSessionRow]}
        providerSessionSummary={{ providers: 1, rows: 3, parse_ok: 3, parse_fail: 0 }}
        dataSourceRows={[] as DataSourceInventoryRow[]}
        dataSourcesLoading={false}
        providerSessionsLimit={60}
        providerRowsSampled={false}
        providerSessionsLoading={false}
        selectedProviderFiles={{}}
        setSelectedProviderFiles={() => undefined}
        allProviderRowsSelected={false}
        toggleSelectAllProviderRows={() => undefined}
        selectedProviderLabel="Codex"
        selectedProviderFilePaths={[]}
        providerActionProvider=""
        canRunProviderAction={false}
        busy={false}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={() => undefined}
        runProviderAction={() => undefined}
        runProviderHardDelete={() => Promise.resolve(null)}
        providerActionData={null}
        providerActionSelection={null}
        providerSessionActionPending={false}
        recoveryBackupExportPending={false}
        backupRoot=""
        setBackupRoot={() => undefined}
        exportRoot=""
        setExportRoot={() => undefined}
        latestExportArchivePath=""
        recoveryData={null}
        runRecoveryBackupExport={() => undefined}
        runGroupedProviderBackup={() => Promise.resolve(null)}
        runGroupedProviderBackupExport={() => Promise.resolve(null)}
        recoveryBackupExportData={null as RecoveryBackupExportResponse | null}
        parserReports={[]}
        allParserReports={[]}
        parserLoading={false}
        parserSummary={{ providers: 0, scanned: 0, parse_ok: 0, parse_fail: 0, parse_score: null }}
        selectedSessionPath=""
        setSelectedSessionPath={() => undefined}
        providersRefreshing={false}
        providersLastRefreshAt=""
        providerFetchMetrics={{ data_sources: null, matrix: null, sessions: null, parser: null }}
        refreshProvidersData={() => undefined}
      />,
    );

    const props = mockSessionTable.mock.calls.at(-1)?.[0] as unknown as {
      data: {
        providerSessionRows: ProviderSessionRow[];
        sortedRows: ProviderSessionRow[];
        renderedRows: ProviderSessionRow[];
      };
      selection: {
        showBackupRows: boolean;
        canShowBackupRows: boolean;
        canShowArchivedRows: boolean;
      };
    };
    expect(props.selection.showBackupRows).toBe(false);
    expect(props.selection.canShowBackupRows).toBe(true);
    expect(props.selection.canShowArchivedRows).toBe(true);
    expect(props.data.providerSessionRows.map((row) => row.source)).toEqual(["sessions"]);
    expect(props.data.sortedRows.map((row) => row.source)).toEqual(["sessions"]);
    expect(props.data.renderedRows.map((row) => row.source)).toEqual(["sessions"]);
  });

  it("disables bulk file actions when only cleanup_backups rows are selected", () => {
    renderToStaticMarkup(
      <ProvidersPanel
        messages={messages}
        providers={providers}
        providerSummary={{ total: 1, active: 1, detected: 1 }}
        providerMatrixLoading={false}
        providerTabs={[
          { id: "all", name: "All providers", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
          { id: "codex", name: "Codex", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
        ]}
        slowProviderIds={[]}
        slowProviderThresholdMs={1200}
        setSlowProviderThresholdMs={() => undefined}
        providerProbeFilterIntent={null}
        setProviderProbeFilterIntent={() => undefined}
        providerView="codex"
        setProviderView={() => undefined}
        providerDataDepth="balanced"
        setProviderDataDepth={() => undefined}
        providerSessionRows={[cleanupBackupRow]}
        allProviderSessionRows={[cleanupBackupRow]}
        providerSessionSummary={{ providers: 1, rows: 1, parse_ok: 1, parse_fail: 0 }}
        dataSourceRows={[] as DataSourceInventoryRow[]}
        dataSourcesLoading={false}
        providerSessionsLimit={60}
        providerRowsSampled={false}
        providerSessionsLoading={false}
        selectedProviderFiles={{ [cleanupBackupRow.file_path]: true }}
        setSelectedProviderFiles={() => undefined}
        allProviderRowsSelected={true}
        toggleSelectAllProviderRows={() => undefined}
        selectedProviderLabel="Codex"
        selectedProviderFilePaths={[cleanupBackupRow.file_path]}
        providerActionProvider="codex"
        canRunProviderAction={true}
        busy={false}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={() => undefined}
        runProviderAction={() => undefined}
        runProviderHardDelete={() => Promise.resolve(null)}
        providerActionData={null}
        providerActionSelection={null}
        providerSessionActionPending={false}
        recoveryBackupExportPending={false}
        backupRoot=""
        setBackupRoot={() => undefined}
        exportRoot=""
        setExportRoot={() => undefined}
        latestExportArchivePath=""
        recoveryData={null}
        runRecoveryBackupExport={() => undefined}
        runGroupedProviderBackup={() => Promise.resolve(null)}
        runGroupedProviderBackupExport={() => Promise.resolve(null)}
        recoveryBackupExportData={null as RecoveryBackupExportResponse | null}
        parserReports={[]}
        allParserReports={[]}
        parserLoading={false}
        parserSummary={{ providers: 0, scanned: 0, parse_ok: 0, parse_fail: 0, parse_score: null }}
        selectedSessionPath=""
        setSelectedSessionPath={() => undefined}
        providersRefreshing={false}
        providersLastRefreshAt=""
        providerFetchMetrics={{ data_sources: null, matrix: null, sessions: null, parser: null }}
        refreshProvidersData={() => undefined}
      />,
    );

    const props = mockSessionTable.mock.calls.at(-1)?.[0] as unknown as {
      workflow: {
        canRunProviderAction: boolean;
      };
    };
    expect(props.workflow.canRunProviderAction).toBe(false);
  });

  it("resets the delete stage to pending when the current selection no longer matches the last preview scope", () => {
    renderToStaticMarkup(
      <ProvidersPanel
        messages={messages}
        providers={providers}
        providerSummary={{ total: 1, active: 1, detected: 1 }}
        providerMatrixLoading={false}
        providerTabs={[
          { id: "all", name: "All providers", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
          { id: "codex", name: "Codex", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
        ]}
        slowProviderIds={[]}
        slowProviderThresholdMs={1200}
        setSlowProviderThresholdMs={() => undefined}
        providerProbeFilterIntent={null}
        setProviderProbeFilterIntent={() => undefined}
        providerView="codex"
        setProviderView={() => undefined}
        providerDataDepth="balanced"
        setProviderDataDepth={() => undefined}
        providerSessionRows={providerSessionRows}
        allProviderSessionRows={providerSessionRows}
        providerSessionSummary={{ providers: 1, rows: 1, parse_ok: 1, parse_fail: 0 }}
        dataSourceRows={[] as DataSourceInventoryRow[]}
        dataSourcesLoading={false}
        providerSessionsLimit={60}
        providerRowsSampled={false}
        providerSessionsLoading={false}
        selectedProviderFiles={{}}
        setSelectedProviderFiles={() => undefined}
        allProviderRowsSelected={false}
        toggleSelectAllProviderRows={() => undefined}
        selectedProviderLabel="Codex"
        selectedProviderFilePaths={[]}
        providerActionProvider="codex"
        canRunProviderAction={false}
        busy={false}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={() => undefined}
        runProviderAction={() => undefined}
        runProviderHardDelete={() => Promise.resolve(null)}
        providerActionData={deletePreviewResult}
        providerActionSelection={deletePreviewSelection}
        providerSessionActionPending={false}
        recoveryBackupExportPending={false}
        backupRoot=""
        setBackupRoot={() => undefined}
        exportRoot=""
        setExportRoot={() => undefined}
        latestExportArchivePath=""
        recoveryData={null}
        runRecoveryBackupExport={() => undefined}
        runGroupedProviderBackup={() => Promise.resolve(null)}
        runGroupedProviderBackupExport={() => Promise.resolve(null)}
        recoveryBackupExportData={null as RecoveryBackupExportResponse | null}
        parserReports={[]}
        allParserReports={[]}
        parserLoading={false}
        parserSummary={{ providers: 0, scanned: 0, parse_ok: 0, parse_fail: 0, parse_score: null }}
        selectedSessionPath=""
        setSelectedSessionPath={() => undefined}
        providersRefreshing={false}
        providersLastRefreshAt=""
        providerFetchMetrics={{ data_sources: null, matrix: null, sessions: null, parser: null }}
        refreshProvidersData={() => undefined}
      />,
    );

    const props = mockSessionTable.mock.calls[0]?.[0] as unknown as {
      workflow: {
        deleteStage: { label: string; className: string };
      };
    };
    expect(props.workflow.deleteStage).toEqual({
      label: "Pending",
      className: "status-preview",
    });
    expect(props).not.toHaveProperty("sessionFileActionResult");
  });

  it("routes hard delete through the no-backup preview lane first", () => {
    const runProviderAction = vi.fn();
    const runProviderHardDelete = vi.fn(() => Promise.resolve(null));
    const setProviderDeleteBackupEnabled = vi.fn();

    renderToStaticMarkup(
      <ProvidersPanel
        messages={messages}
        providers={providers}
        providerSummary={{ total: 1, active: 1, detected: 1 }}
        providerMatrixLoading={false}
        providerTabs={[
          { id: "all", name: "All providers", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
          { id: "codex", name: "Codex", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
        ]}
        slowProviderIds={[]}
        slowProviderThresholdMs={1200}
        setSlowProviderThresholdMs={() => undefined}
        providerProbeFilterIntent={null}
        setProviderProbeFilterIntent={() => undefined}
        providerView="codex"
        setProviderView={() => undefined}
        providerDataDepth="balanced"
        setProviderDataDepth={() => undefined}
        providerSessionRows={providerSessionRows}
        allProviderSessionRows={providerSessionRows}
        providerSessionSummary={{ providers: 1, rows: 1, parse_ok: 1, parse_fail: 0 }}
        dataSourceRows={[] as DataSourceInventoryRow[]}
        dataSourcesLoading={false}
        providerSessionsLimit={60}
        providerRowsSampled={false}
        providerSessionsLoading={false}
        selectedProviderFiles={{ "/tmp/session-1.jsonl": true }}
        setSelectedProviderFiles={() => undefined}
        allProviderRowsSelected={true}
        toggleSelectAllProviderRows={() => undefined}
        selectedProviderLabel="Codex"
        selectedProviderFilePaths={["/tmp/session-1.jsonl"]}
        providerActionProvider="codex"
        canRunProviderAction={true}
        busy={false}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={setProviderDeleteBackupEnabled}
        runProviderAction={runProviderAction}
        runProviderHardDelete={runProviderHardDelete}
        providerActionData={null}
        providerActionSelection={null}
        providerSessionActionPending={false}
        recoveryBackupExportPending={false}
        backupRoot=""
        setBackupRoot={() => undefined}
        exportRoot=""
        setExportRoot={() => undefined}
        latestExportArchivePath=""
        recoveryData={null}
        runRecoveryBackupExport={() => undefined}
        runGroupedProviderBackup={() => Promise.resolve(null)}
        runGroupedProviderBackupExport={() => Promise.resolve(null)}
        recoveryBackupExportData={null as RecoveryBackupExportResponse | null}
        parserReports={[]}
        allParserReports={[]}
        parserLoading={false}
        parserSummary={{ providers: 0, scanned: 0, parse_ok: 0, parse_fail: 0, parse_score: null }}
        selectedSessionPath=""
        setSelectedSessionPath={() => undefined}
        providersRefreshing={false}
        providersLastRefreshAt=""
        providerFetchMetrics={{ data_sources: null, matrix: null, sessions: null, parser: null }}
        refreshProvidersData={() => undefined}
      />,
    );

    const props = mockSessionTable.mock.calls[0]?.[0] as unknown as {
      actions: {
        onRequestHardDeleteConfirm: () => void;
      };
    };
    props.actions.onRequestHardDeleteConfirm();

    expect(setProviderDeleteBackupEnabled).not.toHaveBeenCalled();
    expect(runProviderAction).not.toHaveBeenCalled();
    expect(runProviderHardDelete).not.toHaveBeenCalled();
  });

  it("fans out grouped backup saves by provider in all-provider view", async () => {
    const groupedRows: ProviderSessionRow[] = [
      {
        ...providerSessionRows[0],
        provider: "codex",
        file_path: "/tmp/codex-session-1.jsonl",
        session_id: "codex-session-1",
      },
      {
        ...providerSessionRows[0],
        provider: "claude",
        file_path: "/tmp/claude-session-1.jsonl",
        session_id: "claude-session-1",
        display_title: "Claude session",
      },
    ];
    const runGroupedProviderBackup = vi.fn(() => Promise.resolve(null));
    renderToStaticMarkup(
      <ProvidersPanel
        messages={messages}
        providers={[
          ...providers,
          {
            provider: "claude",
            name: "Claude",
            status: "active",
            capability_level: "full",
            capabilities: {
              read_sessions: true,
              analyze_context: true,
              safe_cleanup: true,
              hard_delete: true,
            },
            evidence: {
              session_log_count: 1,
              roots: ["/tmp"],
              notes: "ready",
            },
          },
        ]}
        providerSummary={{ total: 2, active: 2, detected: 2 }}
        providerMatrixLoading={false}
        providerTabs={[
          { id: "all", name: "All providers", status: "active", scanned: 2, scan_ms: 0, is_slow: false },
          { id: "codex", name: "Codex", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
          { id: "claude", name: "Claude", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
        ]}
        slowProviderIds={[]}
        slowProviderThresholdMs={1200}
        setSlowProviderThresholdMs={() => undefined}
        providerProbeFilterIntent={null}
        setProviderProbeFilterIntent={() => undefined}
        providerView="all"
        setProviderView={() => undefined}
        providerDataDepth="balanced"
        setProviderDataDepth={() => undefined}
        providerSessionRows={groupedRows}
        allProviderSessionRows={groupedRows}
        providerSessionSummary={{ providers: 2, rows: 2, parse_ok: 2, parse_fail: 0 }}
        dataSourceRows={[] as DataSourceInventoryRow[]}
        dataSourcesLoading={false}
        providerSessionsLimit={60}
        providerRowsSampled={false}
        providerSessionsLoading={false}
        selectedProviderFiles={{
          "/tmp/codex-session-1.jsonl": true,
          "/tmp/claude-session-1.jsonl": true,
        }}
        setSelectedProviderFiles={() => undefined}
        allProviderRowsSelected={true}
        toggleSelectAllProviderRows={() => undefined}
        selectedProviderLabel="All Providers"
        selectedProviderFilePaths={["/tmp/codex-session-1.jsonl", "/tmp/claude-session-1.jsonl"]}
        providerActionProvider=""
        canRunProviderAction={false}
        busy={false}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={() => undefined}
        runProviderAction={() => undefined}
        runGroupedProviderBackup={runGroupedProviderBackup}
        runGroupedProviderBackupExport={() => Promise.resolve(null)}
        runProviderHardDelete={() => Promise.resolve(null)}
        providerActionData={null}
        providerActionSelection={null}
        providerSessionActionPending={false}
        recoveryBackupExportPending={false}
        backupRoot="/tmp/backups"
        setBackupRoot={() => undefined}
        exportRoot="/tmp/exports"
        setExportRoot={() => undefined}
        latestExportArchivePath=""
        recoveryData={null}
        runRecoveryBackupExport={() => undefined}
        recoveryBackupExportData={null as RecoveryBackupExportResponse | null}
        parserReports={[]}
        allParserReports={[]}
        parserLoading={false}
        parserSummary={{ providers: 0, scanned: 0, parse_ok: 0, parse_fail: 0, parse_score: null }}
        selectedSessionPath=""
        setSelectedSessionPath={() => undefined}
        providersRefreshing={false}
        providersLastRefreshAt=""
        providerFetchMetrics={{ data_sources: null, matrix: null, sessions: null, parser: null }}
        refreshProvidersData={() => undefined}
      />,
    );

    const backupHubProps = mockBackupHub.mock.calls.at(-1)?.[0] as {
      backupFolderHint: string;
      backupSelectionHint: string;
      onRunBackupSelected: () => void;
    };
    expect(backupHubProps.backupFolderHint).toContain("provider_actions/<provider>");
    expect(backupHubProps.backupSelectionHint).toContain("2 providers");
    backupHubProps.onRunBackupSelected();
    expect(runGroupedProviderBackup).toHaveBeenCalledWith([
      { provider: "codex", file_paths: ["/tmp/codex-session-1.jsonl"] },
      { provider: "claude", file_paths: ["/tmp/claude-session-1.jsonl"] },
    ]);
  });

  it("starts sessions with the same initial row chunk as cleanup", () => {
    const manyRows = buildProviderSessionRows(180);

    renderToStaticMarkup(
      <ProvidersPanel
        messages={messages}
        providers={providers}
        providerSummary={{ total: 1, active: 1, detected: 1 }}
        providerMatrixLoading={false}
        providerTabs={[
          { id: "all", name: "All providers", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
          { id: "codex", name: "Codex", status: "active", scanned: 1, scan_ms: 0, is_slow: false },
        ]}
        slowProviderIds={[]}
        slowProviderThresholdMs={1200}
        setSlowProviderThresholdMs={() => undefined}
        providerProbeFilterIntent={null}
        setProviderProbeFilterIntent={() => undefined}
        providerView="all"
        setProviderView={() => undefined}
        providerDataDepth="balanced"
        setProviderDataDepth={() => undefined}
        providerSessionRows={manyRows}
        allProviderSessionRows={manyRows}
        providerSessionSummary={{ providers: 1, rows: manyRows.length, parse_ok: manyRows.length, parse_fail: 0 }}
        dataSourceRows={[] as DataSourceInventoryRow[]}
        dataSourcesLoading={false}
        providerSessionsLimit={180}
        providerRowsSampled={false}
        providerSessionsLoading={false}
        selectedProviderFiles={{}}
        setSelectedProviderFiles={() => undefined}
        allProviderRowsSelected={false}
        toggleSelectAllProviderRows={() => undefined}
        selectedProviderLabel="All Providers"
        selectedProviderFilePaths={[]}
        providerActionProvider=""
        canRunProviderAction={false}
        busy={false}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={() => undefined}
        runProviderAction={() => undefined}
        runProviderHardDelete={() => Promise.resolve(null)}
        providerActionData={null}
        providerActionSelection={null}
        providerSessionActionPending={false}
        recoveryBackupExportPending={false}
        backupRoot=""
        setBackupRoot={() => undefined}
        exportRoot=""
        setExportRoot={() => undefined}
        latestExportArchivePath=""
        recoveryData={null}
        runRecoveryBackupExport={() => undefined}
        runGroupedProviderBackup={() => Promise.resolve(null)}
        runGroupedProviderBackupExport={() => Promise.resolve(null)}
        recoveryBackupExportData={null as RecoveryBackupExportResponse | null}
        parserReports={[]}
        allParserReports={[]}
        parserLoading={false}
        parserSummary={{ providers: 0, scanned: 0, parse_ok: 0, parse_fail: 0, parse_score: null }}
        selectedSessionPath=""
        setSelectedSessionPath={() => undefined}
        providersRefreshing={false}
        providersLastRefreshAt=""
        providerFetchMetrics={{ data_sources: null, matrix: null, sessions: null, parser: null }}
        refreshProvidersData={() => undefined}
      />,
    );

    const props = mockSessionTable.mock.calls.at(-1)?.[0] as unknown as {
      data: {
        renderedRows: ProviderSessionRow[];
        sortedRows: ProviderSessionRow[];
        hasMoreRows: boolean;
      };
    };
    expect(props.data.renderedRows).toHaveLength(INITIAL_CHUNK);
    expect(props.data.sortedRows).toHaveLength(180);
    expect(props.data.hasMoreRows).toBe(true);
  });
});
