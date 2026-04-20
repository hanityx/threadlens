import { describe, expect, it } from "vitest";
import {
  buildDataSourceRows,
  mergeProviderScopedRows,
  pruneAvailableProviderSelections,
  resolveAllProviderRowsSelected,
  resolveProviderLimits,
  resolveProviderQueryView,
  resolveSelectedProviderLabel,
  shouldHydrateProviderScope,
  shouldResetProviderView,
} from "@/features/providers/hooks/useProvidersData";

describe("shouldResetProviderView", () => {
  it("does not reset the all-provider scope", () => {
    expect(
      shouldResetProviderView({
        layoutView: "providers",
        providerView: "all",
        providerTabs: [{ id: "all" }, { id: "codex" }],
        providerMatrixLoading: false,
        providerSessionsLoading: false,
        parserLoading: false,
      }),
    ).toBe(false);
  });

  it("does not reset a saved provider while overview is hydrating", () => {
    expect(
      shouldResetProviderView({
        layoutView: "overview",
        providerView: "gemini",
        providerTabs: [{ id: "all" }, { id: "codex" }],
        providerMatrixLoading: true,
        providerSessionsLoading: true,
        parserLoading: true,
      }),
    ).toBe(false);
  });

  it("resets to all only inside providers when the chosen provider is truly absent", () => {
    expect(
      shouldResetProviderView({
        layoutView: "providers",
        providerView: "gemini",
        providerTabs: [{ id: "all" }, { id: "codex" }, { id: "claude" }],
        providerMatrixLoading: false,
        providerSessionsLoading: false,
        parserLoading: false,
      }),
    ).toBe(true);
  });

  it("keeps the current provider when only one provider tab is available", () => {
    expect(
      shouldResetProviderView({
        layoutView: "providers",
        providerView: "codex",
        providerTabs: [{ id: "all" }],
        providerMatrixLoading: false,
        providerSessionsLoading: false,
        parserLoading: false,
      }),
    ).toBe(false);
  });
});

describe("provider query helpers", () => {
  it("falls back to all when the requested provider is absent", () => {
    expect(resolveProviderQueryView("codex", new Set(["codex"]))).toBe("codex");
    expect(resolveProviderQueryView("gemini", new Set(["codex"]))).toBe("all");
  });

  it("hydrates scoped provider queries only while matrix data is still missing", () => {
    expect(
      shouldHydrateProviderScope({
        providerView: "codex",
        knownProviderCount: 0,
        providerMatrixQueryEnabled: true,
        providerMatrixLoading: true,
        providerMatrixFetching: false,
      }),
    ).toBe(true);
    expect(
      shouldHydrateProviderScope({
        providerView: "all",
        knownProviderCount: 0,
        providerMatrixQueryEnabled: true,
        providerMatrixLoading: true,
        providerMatrixFetching: true,
      }),
    ).toBe(false);
  });

  it("resolves provider-specific limits and query suffixes from the depth", () => {
    expect(resolveProviderLimits("all", "fast")).toEqual({
      providerSessionsLimit: 30,
      providerParserLimit: 25,
      providerScopeQuery: "",
      providerSummarySessionsLimit: 30,
      providerSummaryParserLimit: 25,
    });
    expect(resolveProviderLimits("codex", "deep")).toEqual({
      providerSessionsLimit: 500,
      providerParserLimit: 220,
      providerScopeQuery: "&provider=codex",
      providerSummarySessionsLimit: 140,
      providerSummaryParserLimit: 80,
    });
  });
});

describe("provider data shaping helpers", () => {
  it("sorts data sources by presence, file count, and size", () => {
    expect(
      buildDataSourceRows({
        missing: { path: "/tmp/missing", present: false, file_count: 50, total_bytes: 999 },
        presentSmall: { path: "/tmp/a", present: true, file_count: 1, total_bytes: 10 },
        presentLarge: { path: "/tmp/b", present: true, file_count: 10, total_bytes: 100 },
      }),
    ).toEqual([
      {
        source_key: "presentLarge",
        path: "/tmp/b",
        present: true,
        file_count: 10,
        dir_count: 0,
        total_bytes: 100,
        latest_mtime: "",
      },
      {
        source_key: "presentSmall",
        path: "/tmp/a",
        present: true,
        file_count: 1,
        dir_count: 0,
        total_bytes: 10,
        latest_mtime: "",
      },
      {
        source_key: "missing",
        path: "/tmp/missing",
        present: false,
        file_count: 50,
        dir_count: 0,
        total_bytes: 999,
        latest_mtime: "",
      },
    ]);
    expect(buildDataSourceRows(undefined)).toEqual([]);
  });

  it("merges scoped rows by replacing only the active provider slice", () => {
    expect(
      mergeProviderScopedRows(
        [
          { provider: "codex", id: "summary-codex" },
          { provider: "claude", id: "summary-claude" },
        ],
        [{ provider: "codex", id: "current-codex" }],
        "codex",
      ),
    ).toEqual([
      { provider: "claude", id: "summary-claude" },
      { provider: "codex", id: "current-codex" },
    ]);
    expect(
      mergeProviderScopedRows(
        [{ provider: "codex", id: "summary-codex" }],
        [],
        "codex",
      ),
    ).toEqual([{ provider: "codex", id: "summary-codex" }]);
  });

  it("prunes stale selected provider files and detects when all visible rows are selected", () => {
    const selected = {
      "/tmp/codex-a.jsonl": true,
      "/tmp/codex-b.jsonl": false,
      "/tmp/stale.jsonl": true,
    };
    expect(
      pruneAvailableProviderSelections(
        selected,
        new Set(["/tmp/codex-a.jsonl", "/tmp/codex-b.jsonl"]),
      ),
    ).toEqual({ "/tmp/codex-a.jsonl": true });

    const unchanged = { "/tmp/codex-a.jsonl": true };
    expect(
      pruneAvailableProviderSelections(
        unchanged,
        new Set(["/tmp/codex-a.jsonl", "/tmp/codex-b.jsonl"]),
      ),
    ).toBe(unchanged);

    expect(
      resolveAllProviderRowsSelected(
        [{ file_path: "/tmp/codex-a.jsonl" }, { file_path: "/tmp/codex-b.jsonl" }],
        {
          "/tmp/codex-a.jsonl": true,
          "/tmp/codex-b.jsonl": true,
        },
      ),
    ).toBe(true);
    expect(
      resolveAllProviderRowsSelected(
        [{ file_path: "/tmp/codex-a.jsonl" }, { file_path: "/tmp/codex-b.jsonl" }],
        {
          "/tmp/codex-a.jsonl": true,
        },
      ),
    ).toBe(false);
  });
});

describe("resolveSelectedProviderLabel", () => {
  it("returns null for the all-provider scope", () => {
    expect(
      resolveSelectedProviderLabel({
        providerView: "all",
        providerById: new Map([["codex", { name: "Codex" }]]),
      }),
    ).toBeNull();
  });

  it("returns the provider display name for a concrete provider scope", () => {
    expect(
      resolveSelectedProviderLabel({
        providerView: "codex",
        providerById: new Map([["codex", { name: "Codex" }]]),
      }),
    ).toBe("Codex");
  });

  it("falls back to the provider id when no display name is available", () => {
    expect(
      resolveSelectedProviderLabel({
        providerView: "gemini",
        providerById: new Map([["gemini", {}]]),
      }),
    ).toBe("gemini");
  });
});
