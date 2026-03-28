import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "../../i18n";
import type {
  DataSourceInventoryRow,
  ProviderMatrixProvider,
  ProviderSessionRow,
  RecoveryBackupExportResponse,
} from "../../types";
import { ProvidersPanel } from "./ProvidersPanel";

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

describe("ProvidersPanel", () => {
  beforeEach(() => {
    mockSessionTable.mockClear();
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
        canRunProviderAction={false}
        busy={false}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={() => undefined}
        runProviderAction={() => undefined}
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
        canRunProviderAction={false}
        busy={false}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={() => undefined}
        runProviderAction={() => undefined}
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
      slowOnly: boolean;
      sortedProviderSessionRows: ProviderSessionRow[];
    };
    expect(props.slowOnly).toBe(false);
    expect(props.sortedProviderSessionRows).toHaveLength(1);
  });
});
