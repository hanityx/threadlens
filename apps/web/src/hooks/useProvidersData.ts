import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DataSourcesEnvelope,
  DataSourceInventoryRow,
  ExecutionGraphEnvelope,
  LayoutView,
  ProviderDataDepth,
  ProviderMatrixEnvelope,
  ProviderParserHealthEnvelope,
  ProviderSessionsEnvelope,
  ProviderView,
} from "../types";
import { apiGet } from "../api";
import { extractEnvelopeData, parseNum } from "../lib/helpers";
import { pruneProviderSelectionForView, type ProviderFetchMetrics } from "./appDataUtils";

export function useProvidersData(options: {
  layoutView: LayoutView;
  providerView: ProviderView;
  setProviderView: (v: ProviderView) => void;
  providerDataDepth: ProviderDataDepth;
  slowProviderThresholdMs: number;
  providersDiagnosticsOpen: boolean;
}) {
  const {
    layoutView,
    providerView,
    setProviderView,
    providerDataDepth,
    slowProviderThresholdMs,
    providersDiagnosticsOpen,
  } = options;

  const queryClient = useQueryClient();
  const [selectedProviderFiles, setSelectedProviderFiles] = useState<Record<string, boolean>>({});
  const [selectedSessionPath, setSelectedSessionPath] = useState<string>("");
  const [providersRefreshPending, setProvidersRefreshPending] = useState(false);
  const [globalRefreshPending, setGlobalRefreshPending] = useState(false);
  const [providersLastRefreshAt, setProvidersLastRefreshAt] = useState<string>("");
  const [providerFetchMetrics, setProviderFetchMetrics] = useState<ProviderFetchMetrics>({
    data_sources: null, matrix: null, sessions: null, parser: null,
  });
  const providerFetchStartRef = useRef<ProviderFetchMetrics>({
    data_sources: null, matrix: null, sessions: null, parser: null,
  });

  /* ---- query enablement ---- */
  const wantsProvidersSummary = layoutView === "overview";
  const wantsProvidersPanel = layoutView === "providers";
  const wantsProvidersData = wantsProvidersSummary || wantsProvidersPanel;
  const wantsRoutingData = layoutView === "providers" && providersDiagnosticsOpen;
  const wantsRecoveryData = layoutView === "overview";

  const providerMatrixQueryEnabled = wantsProvidersSummary || wantsProvidersPanel;
  const dataSourcesQueryEnabled = wantsProvidersData;
  const providerMatrixRefetchInterval = providerMatrixQueryEnabled ? 60000 : false;
  const providerSessionsRefetchInterval = wantsProvidersData ? 60000 : false;
  const providerParserRefetchInterval = wantsProvidersData ? 60000 : false;
  const dataSourcesRefetchInterval = wantsProvidersData ? 120000 : false;

  /* ---- queries ---- */
  const dataSources = useQuery({
    queryKey: ["data-sources"],
    queryFn: ({ signal }) => apiGet<DataSourcesEnvelope>("/api/data-sources", { signal }),
    enabled: dataSourcesQueryEnabled,
    refetchInterval: dataSourcesRefetchInterval,
    staleTime: 60000, refetchOnWindowFocus: false, retry: 1,
  });

  const providerMatrix = useQuery({
    queryKey: ["provider-matrix"],
    queryFn: ({ signal }) => apiGet<ProviderMatrixEnvelope>("/api/provider-matrix", { signal }),
    enabled: providerMatrixQueryEnabled,
    refetchInterval: providerMatrixRefetchInterval,
    staleTime: 30000, refetchOnWindowFocus: false, retry: 1,
  });

  const providerMatrixForQuery =
    extractEnvelopeData<NonNullable<ProviderMatrixEnvelope["data"]>>(providerMatrix.data) ?? {};
  const knownProviderIds = new Set(
    (providerMatrixForQuery.providers ?? [])
      .map((item) => String(item.provider || "").trim())
      .filter(Boolean),
  );
  const providerQueryView =
    providerView !== "all" && knownProviderIds.has(providerView)
      ? providerView
      : "all";
  const providerScopeHydrating =
    providerView !== "all" &&
    knownProviderIds.size === 0 &&
    providerMatrixQueryEnabled &&
    (providerMatrix.isLoading || providerMatrix.isFetching);
  const providerSessionsQueryEnabled = wantsProvidersData && !providerScopeHydrating;
  const providerParserQueryEnabled = wantsProvidersData && !providerScopeHydrating;

  const providerSessionsLimit =
    providerQueryView === "all"
      ? { fast: 30, balanced: 60, deep: 140 }[providerDataDepth]
      : { fast: 120, balanced: 240, deep: 500 }[providerDataDepth];
  const providerParserLimit =
    providerQueryView === "all"
      ? { fast: 25, balanced: 40, deep: 80 }[providerDataDepth]
      : { fast: 80, balanced: 120, deep: 220 }[providerDataDepth];
  const providerScopeQuery =
    providerQueryView === "all" ? "" : `&provider=${encodeURIComponent(providerQueryView)}`;
  const providerSummarySessionsLimit = { fast: 30, balanced: 60, deep: 140 }[providerDataDepth];
  const providerSummaryParserLimit = { fast: 25, balanced: 40, deep: 80 }[providerDataDepth];

  const providerSessionsQueryKey = ["provider-sessions", providerQueryView, providerDataDepth, providerSessionsLimit] as const;
  const providerSessionsQueryPath = `/api/provider-sessions?limit=${providerSessionsLimit}${providerScopeQuery}`;
  const providerParserQueryKey = ["provider-parser-health", providerQueryView, providerDataDepth, providerParserLimit] as const;
  const providerParserQueryPath = `/api/provider-parser-health?limit=${providerParserLimit}${providerScopeQuery}`;
  const providerSummarySessionsQueryKey = ["provider-sessions-summary", "all", providerDataDepth, providerSummarySessionsLimit] as const;
  const providerSummarySessionsQueryPath = `/api/provider-sessions?limit=${providerSummarySessionsLimit}`;
  const providerSummaryParserQueryKey = ["provider-parser-health-summary", "all", providerDataDepth, providerSummaryParserLimit] as const;
  const providerSummaryParserQueryPath = `/api/provider-parser-health?limit=${providerSummaryParserLimit}`;
  const executionGraphQueryKey = ["execution-graph"] as const;
  const needsProviderSummaryQueries = wantsProvidersSummary && providerQueryView !== "all";

  const providerSessions = useQuery({
    queryKey: providerSessionsQueryKey,
    queryFn: ({ signal }) => apiGet<ProviderSessionsEnvelope>(providerSessionsQueryPath, { signal }),
    placeholderData: (previous) => previous,
    enabled: providerSessionsQueryEnabled,
    refetchInterval: providerSessionsRefetchInterval,
    staleTime: 30000, refetchOnWindowFocus: false, retry: 1,
  });
  const providerParserHealth = useQuery({
    queryKey: providerParserQueryKey,
    queryFn: ({ signal }) => apiGet<ProviderParserHealthEnvelope>(providerParserQueryPath, { signal }),
    placeholderData: (previous) => previous,
    enabled: providerParserQueryEnabled,
    refetchInterval: providerParserRefetchInterval,
    staleTime: 30000, refetchOnWindowFocus: false, retry: 1,
  });
  const providerSessionsSummary = useQuery({
    queryKey: providerSummarySessionsQueryKey,
    queryFn: ({ signal }) => apiGet<ProviderSessionsEnvelope>(providerSummarySessionsQueryPath, { signal }),
    placeholderData: (previous) => previous,
    enabled: needsProviderSummaryQueries,
    refetchInterval: providerSessionsRefetchInterval,
    staleTime: 30000, refetchOnWindowFocus: false, retry: 1,
  });
  const providerParserHealthSummary = useQuery({
    queryKey: providerSummaryParserQueryKey,
    queryFn: ({ signal }) => apiGet<ProviderParserHealthEnvelope>(providerSummaryParserQueryPath, { signal }),
    placeholderData: (previous) => previous,
    enabled: needsProviderSummaryQueries,
    refetchInterval: providerParserRefetchInterval,
    staleTime: 30000, refetchOnWindowFocus: false, retry: 1,
  });
  const executionGraph = useQuery({
    queryKey: executionGraphQueryKey,
    queryFn: ({ signal }) => apiGet<ExecutionGraphEnvelope>("/api/execution-graph", { signal }),
    placeholderData: (previous) => previous,
    enabled: wantsRoutingData,
    refetchInterval: 20000, staleTime: 10000, refetchOnWindowFocus: false, retry: 1,
  });

  /* ---- fetch metrics ---- */
  const settleProviderFetchMetric = useCallback(
    (key: keyof ProviderFetchMetrics, isFetching: boolean) => {
      if (isFetching) {
        if (providerFetchStartRef.current[key] === null) {
          providerFetchStartRef.current[key] = Date.now();
        }
        return;
      }
      const startedAt = providerFetchStartRef.current[key];
      if (startedAt === null) return;
      providerFetchStartRef.current[key] = null;
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      setProviderFetchMetrics((prev) => ({ ...prev, [key]: elapsedMs }));
    },
    [],
  );
  useEffect(() => { settleProviderFetchMetric("data_sources", dataSources.isFetching); }, [dataSources.isFetching, settleProviderFetchMetric]);
  useEffect(() => { settleProviderFetchMetric("matrix", providerMatrix.isFetching); }, [providerMatrix.isFetching, settleProviderFetchMetric]);
  useEffect(() => { settleProviderFetchMetric("sessions", providerSessions.isFetching); }, [providerSessions.isFetching, settleProviderFetchMetric]);
  useEffect(() => { settleProviderFetchMetric("parser", providerParserHealth.isFetching); }, [providerParserHealth.isFetching, settleProviderFetchMetric]);

  /* ---- derived data ---- */
  const dataSourcesRoot = extractEnvelopeData<NonNullable<DataSourcesEnvelope["data"]>>(dataSources.data) ?? {};
  const dataSourceRows = useMemo<DataSourceInventoryRow[]>(() => {
    const sourceObj = dataSourcesRoot.sources;
    if (!sourceObj || typeof sourceObj !== "object") return [];
    const rows = Object.entries(sourceObj).map(([sourceKey, rawValue]) => {
      const value = rawValue && typeof rawValue === "object" ? (rawValue as Record<string, unknown>) : {};
      return {
        source_key: sourceKey,
        path: String(value.path ?? ""),
        present: Boolean(value.present ?? value.exists),
        file_count: parseNum(value.file_count),
        dir_count: parseNum(value.dir_count),
        total_bytes: parseNum(value.total_bytes ?? value.size_bytes),
        latest_mtime: String(value.latest_mtime ?? value.mtime ?? ""),
      };
    });
    rows.sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      if (a.file_count !== b.file_count) return b.file_count - a.file_count;
      if (a.total_bytes !== b.total_bytes) return b.total_bytes - a.total_bytes;
      return a.source_key.localeCompare(b.source_key);
    });
    return rows;
  }, [dataSourcesRoot.sources]);

  const providerMatrixRoot = extractEnvelopeData<NonNullable<ProviderMatrixEnvelope["data"]>>(providerMatrix.data) ?? {};
  const providerSessionsRoot = extractEnvelopeData<NonNullable<ProviderSessionsEnvelope["data"]>>(providerSessions.data) ?? {};
  const providerParserRoot = extractEnvelopeData<NonNullable<ProviderParserHealthEnvelope["data"]>>(providerParserHealth.data) ?? {};
  const providerSessionsSummaryRoot =
    providerQueryView === "all"
      ? providerSessionsRoot
      : extractEnvelopeData<NonNullable<ProviderSessionsEnvelope["data"]>>(providerSessionsSummary.data) ?? {};
  const providerParserSummaryRoot =
    providerQueryView === "all"
      ? providerParserRoot
      : extractEnvelopeData<NonNullable<ProviderParserHealthEnvelope["data"]>>(providerParserHealthSummary.data) ?? {};

  const providers = providerMatrixRoot.providers ?? [];
  const providerSummary = providerMatrixRoot.summary;
  const currentProviderSessionRows = providerSessionsRoot.rows ?? [];
  const currentProviderSessionProviders = providerSessionsRoot.providers ?? [];
  const currentParserReports = providerParserRoot.reports ?? [];

  const allProviderSessionRows = useMemo(() => {
    const summaryRows = providerSessionsSummaryRoot.rows ?? [];
    if (providerQueryView === "all") return summaryRows;
    if (currentProviderSessionRows.length === 0) return summaryRows;
    return [
      ...summaryRows.filter((row) => row.provider !== providerQueryView),
      ...currentProviderSessionRows,
    ];
  }, [providerSessionsSummaryRoot.rows, providerQueryView, currentProviderSessionRows]);
  const allProviderSessionProviders = useMemo(() => {
    const summaryProviders = providerSessionsSummaryRoot.providers ?? [];
    if (providerQueryView === "all") return summaryProviders;
    if (currentProviderSessionProviders.length === 0) return summaryProviders;
    return [
      ...summaryProviders.filter((row) => row.provider !== providerQueryView),
      ...currentProviderSessionProviders,
    ];
  }, [providerSessionsSummaryRoot.providers, providerQueryView, currentProviderSessionProviders]);
  const allParserReports = useMemo(() => {
    const summaryReports = providerParserSummaryRoot.reports ?? [];
    if (providerQueryView === "all") return summaryReports;
    if (currentParserReports.length === 0) return summaryReports;
    return [
      ...summaryReports.filter((row) => row.provider !== providerQueryView),
      ...currentParserReports,
    ];
  }, [providerParserSummaryRoot.reports, providerQueryView, currentParserReports]);

  const providerRowsByProvider = useMemo(() => {
    const map = new Map<string, typeof allProviderSessionRows>();
    allProviderSessionRows.forEach((row) => {
      const provider = String(row.provider || "").trim();
      if (!provider) return;
      const existing = map.get(provider);
      if (existing) { existing.push(row); } else { map.set(provider, [row]); }
    });
    return map;
  }, [allProviderSessionRows]);
  const sessionCountByProvider = useMemo(
    () => new Map(Array.from(providerRowsByProvider.entries()).map(([provider, rows]) => [provider, rows.length])),
    [providerRowsByProvider],
  );
  const providerById = useMemo(() => new Map(providers.map((p) => [p.provider, p])), [providers]);
  const scannedByProvider = useMemo(
    () => new Map(allProviderSessionProviders.map((p) => [p.provider, p.scanned])),
    [allProviderSessionProviders],
  );
  const scanMsByProvider = useMemo(() => {
    const map = new Map<string, number>();
    allProviderSessionProviders.forEach((provider) => {
      const ms = parseNum(provider.scan_ms);
      if (ms > 0) map.set(provider.provider, ms);
    });
    allParserReports.forEach((report) => {
      if (map.has(report.provider)) return;
      const ms = parseNum(report.scan_ms);
      if (ms > 0) map.set(report.provider, ms);
    });
    return map;
  }, [allProviderSessionProviders, allParserReports]);
  const slowProviderIds = useMemo(
    () =>
      Array.from(scanMsByProvider.entries())
        .filter(([, ms]) => ms >= slowProviderThresholdMs)
        .sort((a, b) => b[1] - a[1])
        .map(([provider]) => provider),
    [scanMsByProvider, slowProviderThresholdMs],
  );
  const providerSessionRows = useMemo(
    () => providerView === "all" ? allProviderSessionRows : currentProviderSessionRows,
    [providerView, allProviderSessionRows, currentProviderSessionRows],
  );
  const providerScopedFilePaths = useMemo(
    () => providerSessionRows.map((row) => row.file_path).filter(Boolean),
    [providerSessionRows],
  );
  const availableProviderFilePaths = useMemo(
    () => new Set(allProviderSessionRows.map((row) => row.file_path).filter(Boolean)),
    [allProviderSessionRows],
  );
  const providerSessionSummary = useMemo(() => {
    const parseOk = providerSessionRows.filter((row) => row.probe.ok).length;
    const parseFail = providerSessionRows.length - parseOk;
    const providerCountFromRows = sessionCountByProvider.size;
    return {
      providers: providerView === "all" ? providers.length || providerCountFromRows : 1,
      rows: providerSessionRows.length,
      parse_ok: parseOk,
      parse_fail: parseFail,
    };
  }, [providerView, providerSessionRows, providers.length, sessionCountByProvider.size]);
  const parserReports = useMemo(
    () => (providerView === "all" ? allParserReports : currentParserReports),
    [providerView, allParserReports, currentParserReports],
  );
  const parserSummary = useMemo(() => {
    const scanned = parserReports.reduce((sum, report) => sum + parseNum(report.scanned), 0);
    const parseOk = parserReports.reduce((sum, report) => sum + parseNum(report.parse_ok), 0);
    const parseFail = parserReports.reduce((sum, report) => sum + parseNum(report.parse_fail), 0);
    return {
      providers: parserReports.length, scanned, parse_ok: parseOk, parse_fail: parseFail,
      parse_score: scanned ? Number(((parseOk / scanned) * 100).toFixed(1)) : null,
    };
  }, [parserReports]);

  const providerTabs = useMemo(() => {
    const idsFromMatrix = providers.map((item) => String(item.provider || "").trim()).filter(Boolean);
    const idsFromRows = allProviderSessionRows.map((row) => String(row.provider || "").trim()).filter(Boolean);
    const mergedIds = Array.from(new Set([...idsFromMatrix, ...idsFromRows]));
    const providerItems = mergedIds.map((id) => {
      const meta = providerById.get(id);
      const scanned = scannedByProvider.get(id) ?? sessionCountByProvider.get(id) ?? 0;
      const scanMs = scanMsByProvider.get(id) ?? null;
      return {
        id: id as ProviderView, name: meta?.name ?? id,
        status: meta?.status ?? (scanned > 0 ? "active" : "missing"),
        scanned, scan_ms: scanMs, is_slow: scanMs !== null && scanMs >= slowProviderThresholdMs,
      };
    });
    providerItems.sort((a, b) => {
      if (a.is_slow !== b.is_slow) return a.is_slow ? -1 : 1;
      const aScanMs = a.scan_ms ?? -1; const bScanMs = b.scan_ms ?? -1;
      if (aScanMs !== bScanMs) return bScanMs - aScanMs;
      if (a.scanned !== b.scanned) return b.scanned - a.scanned;
      return a.name.localeCompare(b.name);
    });
    return [
      { id: "all" as ProviderView, name: "All AI", status: "active" as const, scanned: allProviderSessionRows.length, scan_ms: null, is_slow: false },
      ...providerItems,
    ];
  }, [providers, allProviderSessionRows, providerById, scannedByProvider, sessionCountByProvider, scanMsByProvider, slowProviderThresholdMs]);

  useEffect(() => {
    if (providerView === "all") return;
    if (providerTabs.length <= 1) return;
    const exists = providerTabs.some((tab) => tab.id === providerView);
    if (!exists) setProviderView("all");
  }, [providerView, providerTabs, setProviderView]);
  useEffect(() => {
    if (!selectedSessionPath) return;
    if (availableProviderFilePaths.has(selectedSessionPath)) return;
    setSelectedSessionPath("");
  }, [availableProviderFilePaths, selectedSessionPath]);
  useEffect(() => {
    setSelectedProviderFiles((prev) =>
      pruneProviderSelectionForView(prev, providerView, providerScopedFilePaths),
    );
  }, [providerScopedFilePaths, providerView]);
  useEffect(() => {
    setSelectedProviderFiles((prev) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [filePath, selected] of Object.entries(prev)) {
        if (!selected) continue;
        if (availableProviderFilePaths.has(filePath)) {
          next[filePath] = true;
          continue;
        }
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [availableProviderFilePaths]);

  const selectedProviderLabel =
    providerView === "all"
      ? "All local AI"
      : providerById.get(providerView)?.name ?? providerView;
  const selectedProviderFilePaths = useMemo(
    () => providerSessionRows.filter((row) => Boolean(selectedProviderFiles[row.file_path])).map((row) => row.file_path),
    [providerSessionRows, selectedProviderFiles],
  );
  const selectedProviderIds = useMemo(() => {
    return Array.from(
      new Set(
        providerSessionRows
          .filter((row) => Boolean(selectedProviderFiles[row.file_path]))
          .map((row) => String(row.provider || "").trim())
          .filter(Boolean),
      ),
    );
  }, [providerSessionRows, selectedProviderFiles]);
  const allProviderRowsSelected = providerSessionRows.length > 0 && providerSessionRows.every((row) => Boolean(selectedProviderFiles[row.file_path]));
  const providerRowsSampled = useMemo(() => {
    if (providerView === "all") return allProviderSessionProviders.some((row) => Boolean(row.truncated));
    const hit = currentProviderSessionProviders.find((row) => row.provider === providerView) ?? allProviderSessionProviders.find((row) => row.provider === providerView);
    return Boolean(hit?.truncated);
  }, [providerView, allProviderSessionProviders, currentProviderSessionProviders]);
  const providerActionProvider = useMemo(() => {
    if (providerView !== "all") return providerView;
    if (selectedProviderIds.length !== 1) return "";
    return selectedProviderIds[0] ?? "";
  }, [providerView, selectedProviderIds]);
  const selectedProviderMeta = providerActionProvider ? providerById.get(providerActionProvider) ?? null : null;
  const canRunProviderAction =
    Boolean(providerActionProvider) &&
    selectedProviderFilePaths.length > 0 &&
    Boolean(selectedProviderMeta?.capabilities?.safe_cleanup);
  const readOnlyProviders = useMemo(() => providers.filter((p) => p.capability_level === "read-only").map((p) => p.name), [providers]);
  const cleanupReadyProviders = useMemo(() => providers.filter((p) => p.capabilities.safe_cleanup).map((p) => p.name), [providers]);

  const executionGraphData = extractEnvelopeData<NonNullable<ExecutionGraphEnvelope["data"]>>(executionGraph.data);

  /* ---- loading flags ---- */
  const dataSourcesLoading = dataSources.isLoading && dataSourceRows.length === 0;
  const providerMatrixLoading = providerMatrix.isLoading && providers.length === 0;
  const providerSessionsLoading = providerView === "all"
    ? providerSessions.isLoading && allProviderSessionRows.length === 0
    : providerSessions.isLoading && currentProviderSessionRows.length === 0;
  const parserLoading = providerView === "all"
    ? providerParserHealth.isLoading && allParserReports.length === 0
    : providerParserHealth.isLoading && currentParserReports.length === 0;
  const executionGraphLoading = executionGraph.isLoading && !executionGraphData;
  const providersRefreshing = providersRefreshPending || providerMatrix.isFetching || providerSessions.isFetching || providerParserHealth.isFetching || providerSessionsSummary.isFetching || providerParserHealthSummary.isFetching;

  /* ---- selection actions ---- */
  const toggleSelectAllProviderRows = (checked: boolean, scopeFilePaths?: string[]) => {
    const scope = (scopeFilePaths ?? providerSessionRows.map((row) => row.file_path))
      .map((item) => String(item || "").trim()).filter(Boolean);
    if (checked) {
      const next: Record<string, boolean> = { ...selectedProviderFiles };
      scope.forEach((filePath) => { next[filePath] = true; });
      setSelectedProviderFiles(next);
      return;
    }
    const next: Record<string, boolean> = { ...selectedProviderFiles };
    scope.forEach((filePath) => { delete next[filePath]; });
    setSelectedProviderFiles(next);
  };

  /* ---- prefetch / refresh ---- */
  const prefetchProvidersData = useCallback(() => {
    void (async () => {
      const matrixEnvelope = await queryClient.fetchQuery({
        queryKey: ["provider-matrix"],
        queryFn: () => apiGet<ProviderMatrixEnvelope>("/api/provider-matrix"),
        staleTime: 30000,
      });
      const matrixData = extractEnvelopeData<NonNullable<ProviderMatrixEnvelope["data"]>>(matrixEnvelope) ?? {};
      const matrixProviderIds = new Set((matrixData.providers ?? []).map((item) => String(item.provider || "").trim()).filter(Boolean));
      const prefetchProviderView = providerView === "all" ? "all" : matrixProviderIds.size === 0 || matrixProviderIds.has(providerView) ? providerView : "all";
      const prefetchSessionsLimit = prefetchProviderView === "all" ? { fast: 30, balanced: 60, deep: 140 }[providerDataDepth] : { fast: 120, balanced: 240, deep: 500 }[providerDataDepth];
      const prefetchParserLimit = prefetchProviderView === "all" ? { fast: 25, balanced: 40, deep: 80 }[providerDataDepth] : { fast: 80, balanced: 120, deep: 220 }[providerDataDepth];
      const prefetchScopeQuery = prefetchProviderView === "all" ? "" : `&provider=${encodeURIComponent(prefetchProviderView)}`;
      await Promise.all([
        queryClient.prefetchQuery({ queryKey: ["data-sources"], queryFn: () => apiGet<DataSourcesEnvelope>("/api/data-sources"), staleTime: 60000 }),
        queryClient.prefetchQuery({ queryKey: ["provider-sessions", prefetchProviderView, providerDataDepth, prefetchSessionsLimit], queryFn: () => apiGet<ProviderSessionsEnvelope>(`/api/provider-sessions?limit=${prefetchSessionsLimit}${prefetchScopeQuery}`), staleTime: 30000 }),
        queryClient.prefetchQuery({ queryKey: ["provider-parser-health", prefetchProviderView, providerDataDepth, prefetchParserLimit], queryFn: () => apiGet<ProviderParserHealthEnvelope>(`/api/provider-parser-health?limit=${prefetchParserLimit}${prefetchScopeQuery}`), staleTime: 30000 }),
      ]);
    })().catch(() => undefined);
  }, [queryClient, providerView, providerDataDepth]);

  const prefetchRoutingData = useCallback(() => {
    void queryClient.prefetchQuery({
      queryKey: executionGraphQueryKey,
      queryFn: () => apiGet<ExecutionGraphEnvelope>("/api/execution-graph"),
      staleTime: 10000,
    });
  }, [queryClient, executionGraphQueryKey]);

  const refreshProvidersData = useCallback(async () => {
    setProvidersRefreshPending(true);
    try {
      await queryClient.fetchQuery({ queryKey: ["data-sources"], queryFn: () => apiGet<DataSourcesEnvelope>("/api/data-sources?refresh=1"), staleTime: 0 });
      await queryClient.fetchQuery({ queryKey: ["provider-matrix"], queryFn: () => apiGet<ProviderMatrixEnvelope>("/api/provider-matrix?refresh=1"), staleTime: 0 });
      await queryClient.fetchQuery({ queryKey: providerSessionsQueryKey, queryFn: () => apiGet<ProviderSessionsEnvelope>(`${providerSessionsQueryPath}&refresh=1`), staleTime: 0 });
      await queryClient.fetchQuery({ queryKey: providerParserQueryKey, queryFn: () => apiGet<ProviderParserHealthEnvelope>(`${providerParserQueryPath}&refresh=1`), staleTime: 0 });
      if (needsProviderSummaryQueries) {
        await queryClient.fetchQuery({ queryKey: providerSummarySessionsQueryKey, queryFn: () => apiGet<ProviderSessionsEnvelope>(`${providerSummarySessionsQueryPath}&refresh=1`), staleTime: 0 });
        await queryClient.fetchQuery({ queryKey: providerSummaryParserQueryKey, queryFn: () => apiGet<ProviderParserHealthEnvelope>(`${providerSummaryParserQueryPath}&refresh=1`), staleTime: 0 });
      }
      setProvidersLastRefreshAt(new Date().toISOString());
    } finally {
      setProvidersRefreshPending(false);
    }
  }, [queryClient, providerSessionsQueryKey, providerSessionsQueryPath, providerParserQueryKey, providerParserQueryPath, needsProviderSummaryQueries, providerSummarySessionsQueryKey, providerSummarySessionsQueryPath, providerSummaryParserQueryKey, providerSummaryParserQueryPath]);

  return {
    selectedProviderFiles, setSelectedProviderFiles,
    selectedSessionPath, setSelectedSessionPath,
    dataSources, providerMatrix, providerSessions, providerParserHealth, executionGraph,
    providers, providerSummary, providerTabs, providerSessionRows,
    allProviderSessionRows, slowProviderIds, providerSessionSummary,
    providerSessionsLimit, providerRowsSampled, dataSourceRows,
    allProviderRowsSelected, selectedProviderLabel, selectedProviderFilePaths,
    providerActionProvider, canRunProviderAction, selectedProviderMeta,
    allParserReports, parserReports, parserSummary,
    readOnlyProviders, cleanupReadyProviders,
    executionGraphData,
    dataSourcesLoading, providerMatrixLoading, providerSessionsLoading,
    parserLoading, executionGraphLoading,
    providersRefreshing, providersLastRefreshAt, providerFetchMetrics,
    globalRefreshPending, setGlobalRefreshPending,
    wantsRecoveryData,
    toggleSelectAllProviderRows,
    prefetchProvidersData, prefetchRoutingData, refreshProvidersData,
    /* internals for refreshAllData */
    _providerSessionAction: providerSessions,
  };
}
