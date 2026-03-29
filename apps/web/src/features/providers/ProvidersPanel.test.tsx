import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "../../i18n";
import type {
  DataSourceInventoryRow,
  ProviderActionSelection,
  ProviderMatrixProvider,
  ProviderSessionActionResult,
  ProviderSessionRow,
  RecoveryBackupExportResponse,
} from "../../types";
import { INITIAL_CHUNK } from "../../types";
import { ProvidersPanel, resolveSessionPanelHeight } from "./ProvidersPanel";

const mockSessionTable = vi.fn();

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
  ProviderSideStack: () => <div data-slot="side-stack" />,
}));

vi.mock("./BackupHub", () => ({
  BackupHub: () => <div data-slot="backup-hub" />,
}));

vi.mock("./ParserHealthTable", () => ({
  ParserHealthTable: () => <div data-slot="parser-health" />,
}));

vi.mock("./AiManagementMatrix", () => ({
  AiManagementMatrix: () => <div data-slot="matrix" />,
}));

vi.mock("./DataSourcesList", () => ({
  DataSourcesList: () => <div data-slot="data-sources" />,
}));

vi.mock("./helpers", async () => {
  const actual = await vi.importActual<typeof import("./helpers")>("./helpers");
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

    expect(mockSessionTable).toHaveBeenCalledTimes(1);
    const props = mockSessionTable.mock.calls[0]?.[0] as unknown as {
      showReadOnlyHint: boolean;
      canRunProviderAction: boolean;
    };
    expect(props.canRunProviderAction).toBe(false);
    expect(props.showReadOnlyHint).toBe(false);
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

    expect(mockSessionTable).toHaveBeenCalledTimes(1);
    const props = mockSessionTable.mock.calls[0]?.[0] as unknown as {
      sortedProviderSessionRows: ProviderSessionRow[];
    };
    expect(props.sortedProviderSessionRows).toHaveLength(1);
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

    expect(mockSessionTable).toHaveBeenCalledTimes(1);
    const props = mockSessionTable.mock.calls[0]?.[0] as unknown as {
      canSelectStaleOnly: boolean;
      staleOnlyActive: boolean;
    };
    expect(props.canSelectStaleOnly).toBe(true);
    expect(props.staleOnlyActive).toBe(false);
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

    const props = mockSessionTable.mock.calls[0]?.[0] as unknown as {
      deleteStage: { label: string; className: string };
    };
    expect(props.deleteStage).toEqual({
      label: "Pending",
      className: "status-preview",
    });
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

    const props = mockSessionTable.mock.calls[0]?.[0] as unknown as {
      onRequestHardDeleteConfirm: () => void;
    };
    props.onRequestHardDeleteConfirm();

    expect(setProviderDeleteBackupEnabled).not.toHaveBeenCalled();
    expect(runProviderAction).not.toHaveBeenCalled();
    expect(runProviderHardDelete).not.toHaveBeenCalled();
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

    const props = mockSessionTable.mock.calls.at(-1)?.[0] as unknown as {
      renderedProviderSessionRows: ProviderSessionRow[];
      sortedProviderSessionRows: ProviderSessionRow[];
      hasMoreRows: boolean;
    };
    expect(props.renderedProviderSessionRows).toHaveLength(INITIAL_CHUNK);
    expect(props.sortedProviderSessionRows).toHaveLength(180);
    expect(props.hasMoreRows).toBe(true);
  });
});
