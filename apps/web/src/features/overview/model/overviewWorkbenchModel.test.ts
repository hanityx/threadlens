import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderSessionRow } from "@/shared/types";

const mockReadStorageValue = vi.fn();

vi.mock("@/shared/lib/appState", async () => {
  const actual = await vi.importActual<typeof import("@/shared/lib/appState")>(
    "@/shared/lib/appState",
  );
  return {
    ...actual,
    readStorageValue: (...args: unknown[]) => mockReadStorageValue(...args),
  };
});

import {
  buildInterleavedSessionPreview,
  describeOverviewSessionSource,
  describeSessionFreshnessDot,
  describeSessionHealthDot,
  describeSessionWeightDot,
  formatOverviewMessage,
  formatOverviewReviewRisk,
  formatOverviewReviewSource,
  providerFromDataSource,
  readStoredSetupSelectionIds,
} from "@/features/overview/model/overviewWorkbenchModel";

const overviewMessages = {
  sourceLocalArchive: "Local archive",
  sourceProjectTrace: "Project trace",
  sourceWorkspaceTemp: "Workspace temp",
  sourceSessionTrace: "Session trace",
  reviewMetaFallbackSource: "Unknown source",
  reviewMetaFallbackRisk: "Unknown risk",
  reviewSourceSessions: "Sessions",
  reviewSourceProjects: "Projects",
  reviewSourceTmp: "Temp",
  reviewRiskHigh: "High",
  reviewRiskMedium: "Medium",
  reviewRiskLow: "Low",
  dotReadableSession: "Readable session",
  dotProbeIssue: "Probe issue",
  dotProbeIssueWithError: "Probe issue: {error}",
  dotUnknownRecency: "Unknown recency",
  dotFreshLast24Hours: "Fresh in 24h",
  dotStaleMoreThan7Days: "Older than 7d",
  dotRecentWithinWeek: "Recent within week",
  dotHeavySessionFootprint: "Heavy {size}",
  dotLightSessionFootprint: "Light {size}",
  dotMediumSessionFootprint: "Medium {size}",
  commandShellLabel: "cmd",
  commandPathSessions: "sessions",
  commandPathActive: "active",
  commandStatusLabel: "status",
  today: "today",
  updatedAt: "updated",
  rowsValue: "rows",
  primarySummary: "summary",
  backupsRuntimeSummary: "backup summary",
} as const;

function makeRow(overrides: Partial<ProviderSessionRow> = {}): ProviderSessionRow {
  return {
    provider: "codex",
    source: "sessions",
    session_id: "session-1",
    display_title: "Session 1",
    file_path: "/tmp/session-1.jsonl",
    size_bytes: 1024,
    mtime: "2026-04-20T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Session 1",
      title_source: "header",
    },
    ...overrides,
  };
}

describe("overviewWorkbenchModel helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T12:00:00.000Z"));
    mockReadStorageValue.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats overview template text and source or risk labels across fallback branches", () => {
    expect(
      formatOverviewMessage("Hello {name}, {count}", {
        name: "threadlens",
        count: 3,
      }),
    ).toBe("Hello threadlens, 3");

    expect(describeOverviewSessionSource("sessions", overviewMessages)).toBe("Local archive");
    expect(describeOverviewSessionSource("projects", overviewMessages)).toBe("Project trace");
    expect(describeOverviewSessionSource("tmp", overviewMessages)).toBe("Workspace temp");
    expect(describeOverviewSessionSource("other", overviewMessages)).toBe("Session trace");

    expect(formatOverviewReviewSource("sessions", overviewMessages)).toBe("Sessions");
    expect(formatOverviewReviewSource("projects", overviewMessages)).toBe("Projects");
    expect(formatOverviewReviewSource("tmp", overviewMessages)).toBe("Temp");
    expect(formatOverviewReviewSource(undefined, overviewMessages)).toBe("Unknown source");
    expect(formatOverviewReviewSource("archive", overviewMessages)).toBe("archive");

    expect(formatOverviewReviewRisk("high", overviewMessages)).toBe("High");
    expect(formatOverviewReviewRisk("medium", overviewMessages)).toBe("Medium");
    expect(formatOverviewReviewRisk("low", overviewMessages)).toBe("Low");
    expect(formatOverviewReviewRisk(undefined, overviewMessages)).toBe("Unknown risk");
    expect(formatOverviewReviewRisk("custom", overviewMessages)).toBe("custom");
  });

  it("maps data sources to providers and filters stored setup selections safely", () => {
    expect(providerFromDataSource("claude_logs")).toBe("claude");
    expect(providerFromDataSource("gemini_sessions")).toBe("gemini");
    expect(providerFromDataSource("copilot_cache")).toBe("copilot");
    expect(providerFromDataSource("chat_store")).toBe("chatgpt");
    expect(providerFromDataSource("codex_history")).toBe("codex");
    expect(providerFromDataSource("sessions")).toBe("codex");
    expect(providerFromDataSource("unknown")).toBeNull();

    mockReadStorageValue.mockReturnValue(JSON.stringify(["codex", "chatgpt", "claude", "codex", "ghost"]));
    expect(readStoredSetupSelectionIds(new Set(["codex", "claude"]))).toEqual(["codex", "claude"]);

    mockReadStorageValue.mockReturnValue("not-json");
    expect(readStoredSetupSelectionIds(new Set(["codex"]))).toEqual([]);

    mockReadStorageValue.mockReturnValue(null);
    expect(readStoredSetupSelectionIds(new Set(["codex"]))).toEqual([]);
  });

  it("describes session dots across health, freshness, and weight branches", () => {
    expect(describeSessionHealthDot(makeRow(), overviewMessages)).toEqual({
      label: "Readable session",
      className: "is-active",
    });
    expect(
      describeSessionHealthDot(
        makeRow({
          probe: {
            ok: false,
            format: "jsonl",
            error: "bad header",
            detected_title: "Session 1",
            title_source: "header",
          },
        }),
        overviewMessages,
      ),
    ).toEqual({
      label: "Probe issue: bad header",
      className: "is-warn",
    });
    expect(
      describeSessionHealthDot(
        makeRow({
          probe: {
            ok: false,
            format: "jsonl",
            error: null,
            detected_title: "Session 1",
            title_source: "header",
          },
        }),
        overviewMessages,
      ),
    ).toEqual({
      label: "Probe issue",
      className: "is-warn",
    });

    expect(
      describeSessionFreshnessDot(
        makeRow({ mtime: "2026-04-20T10:00:00.000Z" }),
        overviewMessages,
      ),
    ).toEqual({ label: "Fresh in 24h", className: "is-active" });
    expect(
      describeSessionFreshnessDot(
        makeRow({ mtime: "2026-04-15T10:00:00.000Z" }),
        overviewMessages,
      ),
    ).toEqual({ label: "Recent within week", className: "" });
    expect(
      describeSessionFreshnessDot(
        makeRow({ mtime: "2026-04-01T10:00:00.000Z" }),
        overviewMessages,
      ),
    ).toEqual({ label: "Older than 7d", className: "is-warn" });
    expect(
      describeSessionFreshnessDot(
        makeRow({ mtime: "not-a-date" }),
        overviewMessages,
      ),
    ).toEqual({ label: "Unknown recency", className: "" });

    expect(
      describeSessionWeightDot(makeRow({ size_bytes: 30 * 1024 * 1024 }), overviewMessages),
    ).toEqual({
      label: "Heavy 30MB",
      className: "is-active",
    });
    expect(
      describeSessionWeightDot(makeRow({ size_bytes: 256 * 1024 }), overviewMessages),
    ).toEqual({
      label: "Light 256KB",
      className: "",
    });
    expect(
      describeSessionWeightDot(makeRow({ size_bytes: 2 * 1024 * 1024 }), overviewMessages),
    ).toEqual({
      label: "Medium 2.0MB",
      className: "",
    });
  });

  it("interleaves preview rows by provider while preferring the requested provider first", () => {
    const rows = [
      makeRow({
        provider: "claude",
        session_id: "claude-older",
        file_path: "/tmp/claude-older.jsonl",
        mtime: "2026-04-18T00:00:00.000Z",
      }),
      makeRow({
        provider: "codex",
        session_id: "codex-newer",
        file_path: "/tmp/codex-newer.jsonl",
        mtime: "2026-04-20T09:00:00.000Z",
      }),
      makeRow({
        provider: "claude",
        session_id: "claude-newer",
        file_path: "/tmp/claude-newer.jsonl",
        mtime: "2026-04-20T10:00:00.000Z",
      }),
      makeRow({
        provider: "codex",
        session_id: "codex-older",
        file_path: "/tmp/codex-older.jsonl",
        mtime: "2026-04-17T00:00:00.000Z",
      }),
    ];

    expect(
      buildInterleavedSessionPreview(rows, "claude", 3).map((row) => row.session_id),
    ).toEqual(["claude-newer", "codex-newer", "claude-older"]);

    expect(
      buildInterleavedSessionPreview(rows, "codex", 10).map((row) => row.session_id),
    ).toEqual(["codex-newer", "claude-newer", "codex-older", "claude-older"]);
  });
});
