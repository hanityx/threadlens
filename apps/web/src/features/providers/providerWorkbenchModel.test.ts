import { describe, expect, it } from "vitest";
import type { DataSourceInventoryRow, ProviderSessionRow, ProviderView } from "../../types";
import { buildProviderWorkbenchModel } from "./providerWorkbenchModel";

const providerTabs: Array<{
  id: ProviderView;
  name: string;
  status: "active" | "detected" | "missing";
  scanned: number;
  scan_ms: number | null;
  is_slow: boolean;
}> = [
  { id: "all", name: "All", status: "active", scanned: 0, scan_ms: null, is_slow: false },
  { id: "codex", name: "Codex", status: "active", scanned: 12, scan_ms: 320, is_slow: false },
  { id: "claude", name: "Claude", status: "detected", scanned: 4, scan_ms: 980, is_slow: true },
  { id: "copilot", name: "Copilot", status: "missing", scanned: 1, scan_ms: 450, is_slow: true },
];

const dataSourceRows: DataSourceInventoryRow[] = [
  {
    source_key: "codex_root",
    path: "/tmp/codex",
    present: true,
    file_count: 10,
    dir_count: 1,
    total_bytes: 1024,
    latest_mtime: "2026-03-24T00:00:00.000Z",
  },
  {
    source_key: "claude_root",
    path: "/tmp/claude",
    present: false,
    file_count: 0,
    dir_count: 1,
    total_bytes: 0,
    latest_mtime: "2026-03-24T00:00:00.000Z",
  },
];

const providerSessionRows: ProviderSessionRow[] = [];

describe("providerWorkbenchModel", () => {
  it("groups managed, core, and optional tabs", () => {
    const model = buildProviderWorkbenchModel({
      providerTabs,
      slowProviderIds: [],
      slowProviderThresholdMs: 1200,
      providerView: "all",
      dataSourceRows,
      providerSessionsLoading: false,
      providerSessionRows,
      providerFetchMetrics: {
        data_sources: null,
        matrix: null,
        sessions: null,
        parser: null,
      },
    });

    expect(model.providerTabCount).toBe(3);
    expect(model.managedProviderTabs.map((tab) => tab.id)).toEqual(["codex", "claude", "copilot"]);
    expect(model.coreProviderTabs.map((tab) => tab.id)).toEqual(["codex", "claude"]);
    expect(model.optionalProviderTabs.map((tab) => tab.id)).toEqual(["copilot"]);
  });

  it("builds slow threshold options and summary from current tabs", () => {
    const model = buildProviderWorkbenchModel({
      providerTabs,
      slowProviderIds: ["claude", "copilot"],
      slowProviderThresholdMs: 1500,
      providerView: "all",
      dataSourceRows,
      providerSessionsLoading: false,
      providerSessionRows,
      providerFetchMetrics: {
        data_sources: 100,
        matrix: 200,
        sessions: 300,
        parser: 1900,
      },
    });

    expect(model.slowThresholdOptions).toEqual([800, 1200, 1500, 1600, 2200, 3000]);
    expect(model.slowProviderSummary).toBe("Claude, Copilot");
    expect(model.hasSlowProviderFetch).toBe(true);
  });

  it("computes selected provider source state and zero state", () => {
    const model = buildProviderWorkbenchModel({
      providerTabs,
      slowProviderIds: [],
      slowProviderThresholdMs: 1200,
      providerView: "codex",
      dataSourceRows,
      providerSessionsLoading: false,
      providerSessionRows,
      providerFetchMetrics: {
        data_sources: null,
        matrix: null,
        sessions: null,
        parser: null,
      },
    });

    expect(model.detectedDataSourceCount).toBe(1);
    expect(model.selectedProviderDataSources.map((row) => row.source_key)).toEqual(["codex_root"]);
    expect(model.selectedProviderHasPresentSource).toBe(true);
    expect(model.showProviderSessionsZeroState).toBe(true);
  });
});
