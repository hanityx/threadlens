import { describe, expect, it, vi } from "vitest";
import type { ProviderSessionRow } from "@/shared/types";
import {
  buildProvidersWorkspaceState,
  pickLargestSessionCandidates,
  shouldShowProvidersWorkspaceSessionDetail,
} from "@/features/providers/model/providersWorkspaceModel";
import { buildProvidersWorkspaceProps } from "@/features/providers/model/providersWorkspaceProps";
import { getMessages } from "@/i18n/catalog";

function buildSessionRow(
  title: string,
  sizeBytes: number,
  filePath: string,
  provider = "claude",
): ProviderSessionRow {
  return {
    provider,
    source: "sessions",
    session_id: `${title}-id`,
    display_title: title,
    file_path: filePath,
    size_bytes: sizeBytes,
    mtime: "2026-03-29T02:35:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: title,
      title_source: "header",
    },
  };
}

describe("ProvidersWorkspace", () => {
  it("prefers the two largest visible sessions for the empty-state next cards", () => {
    const sessionRows = [
      buildSessionRow("Small session", 2_048, "/tmp/small.jsonl"),
      buildSessionRow("Second largest", 8_192_000, "/tmp/second.jsonl", "claude"),
      buildSessionRow("Largest session", 12_582_912, "/tmp/large.jsonl", "codex"),
    ];

    const candidates = pickLargestSessionCandidates(sessionRows, 2);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.display_title).toBe("Largest session");
    expect(candidates[0]?.file_path).toBe("/tmp/large.jsonl");
    expect(candidates[0]?.provider).toBe("codex");
    expect(candidates[1]?.display_title).toBe("Second largest");
  });

  it("builds session detail state from selected rows and action selection", () => {
    const selectedSession = buildSessionRow("Focused session", 4_096, "/tmp/focused.jsonl", "codex");
    const state = buildProvidersWorkspaceState({
      messages: getMessages("en"),
      providerSessionRows: [selectedSession],
      selectedProviderFiles: {
        "/tmp/focused.jsonl": true,
      },
      emptySessionNextTitle: "",
      emptySessionNextPath: "",
      selectedSession,
      providerActionData: {
        ok: true,
        provider: "codex",
        action: "archive_local",
        dry_run: false,
        target_count: 1,
        valid_count: 1,
        applied_count: 1,
        confirm_token_expected: "",
        confirm_token_accepted: true,
      },
      providerActionSelection: {
        provider: "codex",
        action: "archive_local",
        file_paths: ["/tmp/focused.jsonl"],
        dry_run: false,
      },
    });

    expect(state.selectedSessionCount).toBe(1);
    expect(state.sessionDetailKey).toBe("/tmp/focused.jsonl");
    expect(state.selectedSessionActionResult?.provider).toBe("codex");
    expect(state.emptyNextSessions[0]?.title).toContain("Focused session");
  });

  it("hides the providers session detail slot when there is no selected session and no visible rows", () => {
    expect(
      shouldShowProvidersWorkspaceSessionDetail({
        selectedSession: null,
        visibleSessionRowsCount: 0,
      }),
    ).toBe(false);

    expect(
      shouldShowProvidersWorkspaceSessionDetail({
        selectedSession: buildSessionRow("Focused session", 4_096, "/tmp/focused.jsonl", "codex"),
        visibleSessionRowsCount: 0,
      }),
    ).toBe(true);

    expect(
      shouldShowProvidersWorkspaceSessionDetail({
        selectedSession: null,
        visibleSessionRowsCount: 3,
      }),
    ).toBe(true);
  });

  it("extracts ProvidersWorkspace relay props without changing derived session detail state", () => {
    const messages = getMessages("en");
    const selectedSession = buildSessionRow("Focused session", 4_096, "/tmp/focused.jsonl", "codex");
    const setSessionTranscriptLimit = vi.fn();
    const setProviderView = vi.fn();
    const setSlowProviderThresholdMs = vi.fn();
    const setProviderDataDepth = vi.fn();
    const setSelectedProviderFiles = vi.fn();
    const toggleSelectAllProviderRows = vi.fn();
    const setProviderDeleteBackupEnabled = vi.fn();
    const setBackupRoot = vi.fn();
    const setExportRoot = vi.fn();
    const runProviderAction = vi.fn();
    const runGroupedProviderBackup = vi.fn();
    const runProviderHardDelete = vi.fn(async () => null);
    const runRecoveryBackupExport = vi.fn();
    const setSelectedSessionPath = vi.fn();
    const refreshProvidersData = vi.fn();
    const setProviderProbeFilterIntent = vi.fn();
    const runSingleProviderAction = vi.fn();
    const runSingleProviderHardDelete = vi.fn(async () => null);

    const workspaceProps = buildProvidersWorkspaceProps({
      messages,
      providers: [],
      providerSummary: { total: 1, active: 1, detected: 1 },
      providerMatrixLoading: false,
      providerTabs: [],
      slowProviderIds: [],
      slowProviderThresholdMs: 1200,
      setSlowProviderThresholdMs,
      providerView: "codex",
      setProviderView,
      providerDataDepth: "balanced",
      setProviderDataDepth,
      providerSessionRows: [selectedSession],
      allProviderSessionRows: [selectedSession],
      allProviderSessionProviders: [{ provider: "codex", total_bytes: 4096 }],
      providerSessionSummary: { providers: 1, rows: 1, parse_ok: 1, parse_fail: 0 },
      dataSourceRows: [],
      dataSourcesLoading: false,
      providerSessionsLimit: 60,
      providerRowsSampled: false,
      providerSessionsLoading: false,
      selectedProviderFiles: { "/tmp/focused.jsonl": true },
      setSelectedProviderFiles,
      allProviderRowsSelected: true,
      toggleSelectAllProviderRows,
      selectedProviderLabel: "Codex",
      selectedProviderFilePaths: ["/tmp/focused.jsonl"],
      providerActionProvider: "codex",
      canRunProviderAction: true,
      busy: false,
      providerSessionActionPending: false,
      recoveryBackupExportPending: false,
      providerDeleteBackupEnabled: true,
      setProviderDeleteBackupEnabled,
      backupRoot: "/tmp/backups",
      setBackupRoot,
      exportRoot: "/tmp/exports",
      setExportRoot,
      latestExportArchivePath: "/tmp/export.zip",
      runProviderAction,
      runGroupedProviderBackup,
      runGroupedProviderBackupExport: vi.fn(),
      runProviderHardDelete,
      providerActionData: null,
      providerActionSelection: null,
      runRecoveryBackupExport,
      recoveryBackupExportData: null,
      recoveryData: null,
      parserReports: [],
      allParserReports: [],
      parserLoading: false,
      parserSummary: { providers: 1, scanned: 1, parse_ok: 1, parse_fail: 0, parse_score: 100 },
      selectedSessionPath: "/tmp/focused.jsonl",
      setSelectedSessionPath,
      providersRefreshing: false,
      providersLastRefreshAt: "",
      providerFetchMetrics: { data_sources: null, matrix: null, sessions: null, parser: null },
      refreshProvidersData,
      providerProbeFilterIntent: null,
      setProviderProbeFilterIntent,
      selectedSession,
      selectedSessionCount: 1,
      selectedSessionActionResult: null,
      emptySessionScopeLabel: "Codex",
      emptyNextSessions: [{ title: "Focused session", path: "/tmp/focused.jsonl" }],
      sessionTranscriptData: null,
      sessionTranscriptLoading: false,
      sessionTranscriptLimit: 200,
      setSessionTranscriptLimit,
      canRunSelectedSessionAction: true,
      runSingleProviderAction,
      runSingleProviderHardDelete,
      executionGraphData: null,
      executionGraphLoading: false,
      visibleProviderIds: ["codex"],
      sessionDetailKey: "/tmp/focused.jsonl",
    });

    expect(workspaceProps.panelProps.selectedProviderLabel).toBe("Codex");
    expect(workspaceProps.panelProps.providerView).toBe("codex");
    expect(workspaceProps.sessionDetailProps.selectedCount).toBe(1);
    expect(workspaceProps.sessionDetailProps.onOpenSessionPath).toBe(setSelectedSessionPath);
    expect(workspaceProps.routingPanelProps.providerView).toBe("codex");
    expect(workspaceProps.showSessionDetailSlot).toBe(true);
    expect(workspaceProps.sessionDetailKey).toBe("/tmp/focused.jsonl");
  });
});
