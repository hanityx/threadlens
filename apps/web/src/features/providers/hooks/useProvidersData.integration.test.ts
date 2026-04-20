import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseQuery = vi.fn();
const mockUseQueryClient = vi.fn();
const mockApiGet = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useQueryClient: () => mockUseQueryClient(),
}));

vi.mock("@/api", async () => {
  const actual = await vi.importActual<typeof import("@/api")>("@/api");
  return {
    ...actual,
    apiGet: (...args: unknown[]) => mockApiGet(...args),
  };
});

import { useProvidersData } from "@/features/providers/hooks/useProvidersData";

function makeQueryState(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    ...overrides,
  };
}

function renderProvidersData(options?: {
  layoutView?: "overview" | "providers" | "threads" | "search";
  providerView?: "all" | "codex" | "claude";
}) {
  const fetchQuery = vi.fn(async ({ queryKey, queryFn }: { queryKey: readonly unknown[]; queryFn: () => Promise<unknown> }) => {
    const key = String(queryKey[0]);
    if (key === "provider-matrix") {
      return {
        data: {
          providers: [
            {
              provider: "codex",
              name: "Codex",
              status: "active",
              capability_level: "full",
              capabilities: { read_sessions: true, analyze_context: true, safe_cleanup: true, hard_delete: true },
            },
            {
              provider: "claude",
              name: "Claude",
              status: "detected",
              capability_level: "read-only",
              capabilities: { read_sessions: true, analyze_context: true, safe_cleanup: false, hard_delete: false },
            },
          ],
          summary: { total: 2, active: 1, detected: 1 },
        },
      };
    }
    if (key === "provider-sessions") {
      return {
        data: {
          rows: [
            {
              provider: "codex",
              file_path: "/tmp/codex-a.jsonl",
              probe: { ok: true },
            },
          ],
          providers: [{ provider: "codex", scanned: 1, scan_ms: 12, truncated: false }],
        },
      };
    }
    if (key === "provider-parser-health") {
      return {
        data: {
          reports: [{ provider: "codex", scanned: 1, parse_ok: 1, parse_fail: 0, scan_ms: 10 }],
        },
      };
    }
    if (key === "data-sources") {
      return {
        data: {
          sources: {
            "codex:history": {
              path: "/tmp/codex",
              present: true,
              file_count: 2,
              total_bytes: 100,
            },
          },
        },
      };
    }
    return queryFn();
  });
  const prefetchQuery = vi.fn(async ({ queryKey }: { queryKey: readonly unknown[] }) => ({ queryKey }));
  mockUseQueryClient.mockReturnValue({ fetchQuery, prefetchQuery });

  mockApiGet.mockReset();
  mockApiGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/execution-graph")) {
      return { data: { nodes: [{ id: "exec-1" }] } };
    }
    return { data: {} };
  });

  const queries = [
    makeQueryState({
      data: {
        data: {
          sources: {
            "codex:history": { path: "/tmp/codex", present: true, file_count: 2, total_bytes: 100 },
          },
        },
      },
    }),
    makeQueryState({
      data: {
        data: {
          providers: [
            {
              provider: "codex",
              name: "Codex",
              status: "active",
              capability_level: "full",
              capabilities: { read_sessions: true, analyze_context: true, safe_cleanup: true, hard_delete: true },
            },
            {
              provider: "claude",
              name: "Claude",
              status: "detected",
              capability_level: "read-only",
              capabilities: { read_sessions: true, analyze_context: true, safe_cleanup: false, hard_delete: false },
            },
          ],
          summary: { total: 2, active: 1, detected: 1 },
        },
      },
    }),
    makeQueryState({
      data: {
        data: {
          rows: [
            {
              provider: "codex",
              file_path: "/tmp/codex-a.jsonl",
              probe: { ok: true },
            },
          ],
          providers: [{ provider: "codex", scanned: 1, scan_ms: 12, truncated: false }],
        },
      },
    }),
    makeQueryState({
      data: {
        data: {
          reports: [{ provider: "codex", scanned: 1, parse_ok: 1, parse_fail: 0, scan_ms: 10 }],
        },
      },
    }),
    makeQueryState({
      data: {
        data: {
          rows: [
            {
              provider: "codex",
              file_path: "/tmp/codex-a.jsonl",
              probe: { ok: true },
            },
            {
              provider: "claude",
              file_path: "/tmp/claude-a.jsonl",
              probe: { ok: false },
            },
          ],
          providers: [
            { provider: "codex", scanned: 1, scan_ms: 12, truncated: false },
            { provider: "claude", scanned: 1, scan_ms: 14, truncated: false },
          ],
        },
      },
    }),
    makeQueryState({
      data: {
        data: {
          reports: [
            { provider: "codex", scanned: 1, parse_ok: 1, parse_fail: 0, scan_ms: 10 },
            { provider: "claude", scanned: 1, parse_ok: 0, parse_fail: 1, scan_ms: 11 },
          ],
        },
      },
    }),
    makeQueryState({
      data: {
        data: {
          nodes: [{ id: "exec-1" }],
        },
      },
      refetch: vi.fn(),
    }),
  ];
  let queryIndex = 0;
  mockUseQuery.mockImplementation(() => queries[queryIndex++]);

  const setProviderView = vi.fn();
  let latest: ReturnType<typeof useProvidersData> | undefined;

  function Harness() {
    latest = useProvidersData({
      layoutView: options?.layoutView ?? "overview",
      providerView: options?.providerView ?? "codex",
      setProviderView,
      providerDataDepth: "balanced",
      slowProviderThresholdMs: 1000,
      providersDiagnosticsOpen: true,
    });
    return createElement("div", null, "hook");
  }

  renderToStaticMarkup(createElement(Harness));

  return {
    result: latest as ReturnType<typeof useProvidersData>,
    setProviderView,
    fetchQuery,
    prefetchQuery,
  };
}

describe("useProvidersData integration", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockUseQueryClient.mockReset();
    mockApiGet.mockReset();
  });

  it("derives scoped provider state from query data", () => {
    const { result } = renderProvidersData();

    expect(result.selectedProviderLabel).toBe("Codex");
    expect(result.providerActionProvider).toBe("codex");
    expect(result.canRunProviderAction).toBe(false);
    expect(result.readOnlyProviders).toEqual(["Claude"]);
    expect(result.cleanupReadyProviders).toEqual(["Codex"]);
    expect(result.providerSessionRows).toHaveLength(1);
    expect(result.allProviderSessionRows).toHaveLength(2);
    expect(result.providerSessionSummary).toEqual({
      providers: 1,
      rows: 1,
      parse_ok: 1,
      parse_fail: 0,
    });
    expect(result.wantsRecoveryData).toBe(true);
  });

  it("prefetches provider and routing queries through the query client", async () => {
    const { result, fetchQuery, prefetchQuery } = renderProvidersData();

    await result.prefetchProvidersData();
    result.prefetchRoutingData();

    expect(fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["provider-matrix"],
      }),
    );
    expect(prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["data-sources"],
      }),
    );
    expect(prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["provider-sessions", "codex", "balanced", 240],
      }),
    );
    expect(prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["provider-parser-health", "codex", "balanced", 120],
      }),
    );
    expect(prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["execution-graph"],
      }),
    );
  });

  it("refreshes scoped provider data plus overview summaries", async () => {
    const { result, fetchQuery } = renderProvidersData();

    await result.refreshProvidersData();

    expect(fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["data-sources"],
      }),
    );
    expect(fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["provider-matrix"],
      }),
    );
    expect(fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["provider-sessions", "codex", "balanced", 240],
      }),
    );
    expect(fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["provider-parser-health", "codex", "balanced", 120],
      }),
    );
    expect(fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["provider-sessions-summary", "all", "balanced", 60],
      }),
    );
    expect(fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["provider-parser-health-summary", "all", "balanced", 40],
      }),
    );
  });
});
