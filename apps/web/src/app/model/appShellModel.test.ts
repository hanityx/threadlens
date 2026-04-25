import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  ProviderMatrixProvider,
  ProviderParserHealthReport,
  ProviderSessionRow,
  ProviderView,
} from "@/shared/types";
import { getMessages } from "@/i18n/catalog";
import {
  buildSearchProviderOptions,
  buildRecentThreadSummary,
  buildRecentThreadTitle,
  useAppShellModel,
  buildVisibleProviderSessionSummary,
  buildVisibleParserSummary,
  buildVisibleProviderIds,
  buildVisibleProviders,
  buildVisibleProviderSummary,
  buildVisibleProviderTabs,
} from "@/app/model/appShellModel";

const providerTabs: Array<{
  id: ProviderView;
  name: string;
  status: "active" | "detected" | "missing";
}> = [
  { id: "all", name: "All", status: "active" },
  { id: "gemini", name: "Gemini", status: "detected" },
  { id: "claude", name: "Claude", status: "active" },
  { id: "copilot", name: "Copilot", status: "missing" },
  { id: "chatgpt", name: "ChatGPT", status: "active" },
  { id: "zeta", name: "Zeta", status: "detected" },
];

const providers: ProviderMatrixProvider[] = [
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
  },
  {
    provider: "gemini",
    name: "Gemini",
    status: "detected",
    capability_level: "read-only",
    capabilities: {
      read_sessions: true,
      analyze_context: true,
      safe_cleanup: false,
      hard_delete: false,
    },
  },
];

const parserReports: ProviderParserHealthReport[] = [
  {
    provider: "claude",
    name: "Claude",
    status: "active",
    scanned: 10,
    parse_ok: 8,
    parse_fail: 2,
    parse_score: 80,
    truncated: false,
  },
  {
    provider: "gemini",
    name: "Gemini",
    status: "detected",
    scanned: 5,
    parse_ok: 4,
    parse_fail: 1,
    parse_score: 80,
    truncated: false,
  },
];

const providerSessionRows: ProviderSessionRow[] = [
  {
    provider: "claude",
    source: "sessions",
    session_id: "claude-1",
    display_title: "Claude Session",
    file_path: "/tmp/claude-1.jsonl",
    size_bytes: 10,
    mtime: "2026-03-24T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Claude Session",
      title_source: "title",
    },
  },
  {
    provider: "gemini",
    source: "sessions",
    session_id: "gemini-1",
    display_title: "Gemini Session",
    file_path: "/tmp/gemini-1.jsonl",
    size_bytes: 10,
    mtime: "2026-03-23T00:00:00.000Z",
    probe: {
      ok: false,
      format: "jsonl",
      error: "parse failed",
      detected_title: "Gemini Session",
      title_source: "title",
    },
  },
];

function renderModelProbe(
  locale: "en" | "es" | "id" | "ru" = "en",
  overrides: Partial<Parameters<typeof useAppShellModel>[0]> = {},
) {
  const messages = getMessages(locale);

  function Probe() {
    const model = useAppShellModel({
      layoutView: "overview",
      providerView: "all",
      providersDiagnosticsOpen: false,
      providerTabs: buildVisibleProviderTabs(providerTabs).map((tab) => ({
        ...tab,
        scanned: 0,
        scan_ms: null,
        is_slow: false,
      })),
      providers: [],
      slowProviderIds: [],
      providerSessionRows: [],
      allProviderSessionRows: [],
      parserReports: [],
      allParserReports: [],
      dataSourceRows: [],
      selectedProviderFiles: {},
      runtimeLoading: false,
      recoveryLoading: false,
      threadsLoading: false,
      dataSourcesLoading: false,
      providerMatrixLoading: false,
      providerSessionsLoading: false,
      parserLoading: false,
      threadsFastBooting: false,
      providersRefreshing: false,
      refreshingAllData: false,
      providersLastRefreshAt: "",
      highRiskCount: 0,
      visibleRows: [],
      selectedProviderLabel: null,
      runtimeBackendReachable: false,
      runtimeBackendLatencyMs: null,
      runtimeBackendUrl: null,
      analyzeErrorKey: "",
      cleanupErrorKey: "",
      acknowledgedForensicsErrorKeys: { analyze: "", cleanup: "" },
      runtimeError: false,
      smokeStatusError: false,
      recoveryError: false,
      providerMatrixError: false,
      providerSessionsError: false,
      providerParserHealthError: false,
      providerSessionActionError: false,
      bulkActionError: false,
      showRuntimeBackendDegraded: false,
      recoveryBackupSets: 0,
      messages,
      ...overrides,
    });

    return createElement(
      "div",
      null,
      createElement("span", { "data-active": model.activeSummaryText }),
      createElement("span", { "data-sync": model.syncStatusText }),
      createElement("span", { "data-line": model.activeProviderSummaryLine }),
      createElement("span", { "data-parser": model.parserScoreText }),
      createElement("span", { "data-runtime": model.runtimeLatencyText }),
      createElement("span", { "data-runtime-status": model.runtimeStatusText }),
      createElement("span", { "data-focus-session-title": model.focusSessionTitle }),
      createElement("span", { "data-focus-session-meta": model.focusSessionMeta }),
      createElement("span", { "data-review-title": model.focusReviewTitle }),
      createElement("span", { "data-review-meta": model.focusReviewMeta }),
      createElement("span", { "data-global-errors": String(model.hasGlobalErrorStack) }),
      createElement("span", { "data-global-analyze": String(model.showGlobalAnalyzeDeleteError) }),
      createElement("span", { "data-global-cleanup": String(model.showGlobalCleanupDryRunError) }),
    );
  }

  return renderToStaticMarkup(createElement(Probe));
}

describe("appShellModel", () => {
  it("filters hidden tabs and keeps provider display order stable", () => {
    const visibleTabs = buildVisibleProviderTabs(providerTabs);

    expect(visibleTabs.map((tab) => tab.id)).toEqual(["all", "claude", "gemini", "copilot", "zeta"]);
  });

  it("keeps optional providers in all-provider ids and explicit selections", () => {
    const visibleTabs = buildVisibleProviderTabs(providerTabs);

    expect(buildVisibleProviderIds(visibleTabs, "all")).toEqual(["claude", "gemini", "copilot", "zeta"]);
    expect(buildVisibleProviderIds(visibleTabs, "copilot")).toEqual([
      "claude",
      "gemini",
      "copilot",
      "zeta",
    ]);
  });

  it("synthesizes visible providers from tabs when matrix data is missing", () => {
    const visibleTabs = buildVisibleProviderTabs(providerTabs);
    const visibleProviderIds = buildVisibleProviderIds(visibleTabs, "all");

    expect(
      buildVisibleProviders(visibleTabs, providers, visibleProviderIds).map((provider) => provider.provider),
    ).toEqual(["claude", "gemini", "copilot", "zeta"]);
    expect(
      buildVisibleProviders(visibleTabs, providers, visibleProviderIds).find((provider) => provider.provider === "copilot"),
    ).toMatchObject({
      provider: "copilot",
      name: "Copilot",
      capabilities: {
        read_sessions: true,
        analyze_context: true,
        safe_cleanup: true,
        hard_delete: true,
      },
    });
  });

  it("falls back to tab counts when provider matrix is empty", () => {
    const visibleTabs = buildVisibleProviderTabs(providerTabs);

    expect(buildVisibleProviderSummary(visibleTabs, [])).toEqual({
      total: 4,
      active: 1,
      detected: 2,
    });
  });

  it("aggregates parser and provider-session summaries", () => {
    expect(buildVisibleProviderSummary(buildVisibleProviderTabs(providerTabs), providers)).toEqual({
      total: 2,
      active: 1,
      detected: 1,
    });

    expect(buildVisibleParserSummary(parserReports)).toEqual({
      providers: 2,
      scanned: 15,
      parse_ok: 12,
      parse_fail: 3,
      parse_score: 80,
    });
  });

  it("counts visible provider session rows by current view", () => {
    expect(
      buildVisibleProviderSessionSummary({
        providerView: "all",
        visibleProviderSessionRows: providerSessionRows,
        visibleProviders: providers,
      }),
    ).toEqual({
      providers: 2,
      rows: 2,
      parse_ok: 1,
      parse_fail: 1,
    });

    expect(
      buildVisibleProviderSessionSummary({
        providerView: "claude",
        visibleProviderSessionRows: [providerSessionRows[0]],
        visibleProviders: providers,
      }),
    ).toEqual({
      providers: 1,
      rows: 1,
      parse_ok: 1,
      parse_fail: 0,
    });
  });

  it("builds search provider options from searchable ids instead of visible tabs", () => {
    const visibleTabs = buildVisibleProviderTabs(providerTabs);

    expect(buildSearchProviderOptions(visibleTabs)).toEqual([
      { id: "codex", name: "Codex" },
      { id: "claude", name: "Claude" },
      { id: "gemini", name: "Gemini" },
      { id: "copilot", name: "Copilot" },
    ]);
  });

  it("localizes overview status summaries for Indonesian", () => {
    const messages = getMessages("id").overview;
    const html = renderModelProbe("id");

    expect(html).toContain(
      `data-active="${messages.activeSummary.replace("{active}", "1").replace("{total}", "4")}"`,
    );
    expect(html).toContain(`data-sync="${messages.syncStatusIdle}"`);
    expect(html).toContain(
      `data-line="${messages.activeProvidersCountLine.replace("{count}", "1")}"`,
    );
    expect(html).toContain(`data-parser="${messages.statusUnavailable}"`);
    expect(html).toContain(`data-runtime="${messages.runtimeStatusDown}"`);
  });

  it("localizes recent thread fallback copy for Spanish", () => {
    const messages = getMessages("es").overview;
    const runningRow = {
      thread_id: "thread-1",
      title: "",
      risk_level: "high",
      risk_score: 90,
      risk_tags: ["ctx-high"],
      activity_status: "running",
      timestamp: "2026-03-24T00:00:00.000Z",
      is_pinned: false,
      source: "sessions",
    } as never;
    const noWorkspaceRow = {
      thread_id: "thread-2",
      title: "",
      risk_level: "high",
      risk_score: 70,
      risk_tags: ["no-cwd"],
      activity_status: "recent",
      timestamp: "2026-03-24T00:00:00.000Z",
      is_pinned: false,
      source: "sessions",
    } as never;

    expect(buildRecentThreadTitle(runningRow, messages)).toBe(messages.recentThreadTitleRunning);
    expect(buildRecentThreadSummary(noWorkspaceRow, messages)).toBe(
      messages.recentThreadSummaryNoWorkspace,
    );
  });

  it("shows booting copy while overview sources are still loading with no visible data", () => {
    const messages = getMessages("en").overview;
    const html = renderModelProbe("en", {
      runtimeLoading: true,
      threadsLoading: true,
      providerMatrixLoading: true,
      providerSessionRows: [],
      allProviderSessionRows: [],
      providers: [],
      providerTabs: [{ id: "all", name: "All", status: "active", scanned: 0, scan_ms: null, is_slow: false }],
    });

    expect(html).toContain(`data-active="${messages.statusSyncing}"`);
    expect(html).toContain(`data-parser="${messages.statusSyncing}"`);
    expect(html).toContain(`data-runtime="${messages.runtimeStatusSync}"`);
    expect(html).toContain(`data-focus-session-title="${messages.focusSessionSyncingTitle}"`);
  });

  it("shows updated sync text, active provider names, and session focus metadata when data exists", () => {
    const html = renderModelProbe("en", {
      providers,
      providerTabs: buildVisibleProviderTabs(providerTabs).map((tab) => ({
        ...tab,
        scanned: 0,
        scan_ms: null,
        is_slow: false,
      })),
      providerSessionRows,
      allProviderSessionRows: providerSessionRows,
      providersLastRefreshAt: "2026-03-24T12:30:00.000Z",
      runtimeBackendReachable: true,
      runtimeBackendLatencyMs: 88,
    });

    expect(html).toContain('data-line="Claude"');
    expect(html).toContain('data-runtime="88 ms"');
    expect(html).toContain('data-focus-session-title="Claude Session"');
    expect(html).toContain('data-focus-session-meta="Claude /');
    expect(html).toContain('data-sync="Updated');
  });

  it("keeps measured latency in the top runtime slot and uses local only for the summary label", () => {
    const messages = getMessages("en").overview;
    const html = renderModelProbe("en", {
      runtimeBackendReachable: true,
      runtimeBackendLatencyMs: 7,
      runtimeBackendUrl: "ts-native",
    });

    expect(html).toContain('data-runtime="7 ms"');
    expect(html).toContain(`data-runtime-status="${messages.runtimeStatusLocal}"`);
  });

  it("surfaces review queue and global error stack when overview is degraded outside forensics", () => {
    const html = renderModelProbe("en", {
      visibleRows: [
        {
          thread_id: "thread-1",
          title: "",
          risk_level: "high",
          risk_score: 90,
          risk_tags: ["no-cwd"],
          activity_status: "recent",
          timestamp: "2026-03-24T10:00:00.000Z",
          is_pinned: false,
          source: "sessions",
        } as never,
      ],
      analyzeErrorKey: "analyze:boom",
      cleanupErrorKey: "cleanup:boom",
      acknowledgedForensicsErrorKeys: { analyze: "", cleanup: "" },
    });

    expect(html).toContain('data-review-title="No-Workspace Review"');
    expect(html).toContain('data-review-meta="sessions / high /');
    expect(html).toContain('data-global-errors="true"');
    expect(html).toContain('data-global-analyze="true"');
    expect(html).toContain('data-global-cleanup="true"');
  });
});
