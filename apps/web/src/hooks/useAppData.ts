import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiEnvelope, BulkThreadActionResult } from "@provider-surface/shared-contracts";
import { apiGet, apiPost } from "../api";
import { extractEnvelopeData, normalizeThreadRow, parseNum } from "../lib/helpers";
import type {
  RuntimeEnvelope,
  SmokeStatusEnvelope,
  ThreadsResponse,
  ThreadRow,
  RecoveryResponse,
  DataSourcesEnvelope,
  DataSourceInventoryRow,
  ProviderMatrixEnvelope,
  ProviderSessionsEnvelope,
  ProviderParserHealthEnvelope,
  ProviderSessionActionResult,
  RecoveryBackupExportResponse,
  AnalyzeDeleteData,
  CleanupPreviewData,
  ThreadForensicsEnvelope,
  TranscriptPayload,
  ExecutionGraphEnvelope,
  FilterMode,
  ProviderView,
  ProviderDataDepth,
  LayoutView,
  UiDensity,
} from "../types";
import { PAGE_SIZE, INITIAL_CHUNK, CHUNK_SIZE } from "../types";

/* ------------------------------------------------------------------ */
/*  useAppData – all state, queries, mutations, and derived values    */
/* ------------------------------------------------------------------ */

function providerActionSelectionKey(
  provider: string,
  action: "backup_local" | "archive_local" | "delete_local",
  filePaths: string[],
  options?: { backup_before_delete?: boolean },
): string {
  const normalized = Array.from(
    new Set(filePaths.map((item) => String(item || "").trim()).filter(Boolean)),
  ).sort();
  const backupBeforeDelete = options?.backup_before_delete ? "backup-first" : "direct";
  return `${provider}|${action}|${backupBeforeDelete}|${normalized.join("||")}`;
}

function normalizeThreadIds(threadIds: string[]): string[] {
  return Array.from(
    new Set(threadIds.map((item) => String(item || "").trim()).filter(Boolean)),
  ).slice(0, 500);
}

const THREADS_BOOTSTRAP_CACHE_KEY = "po-threads-cache-v1";
const LEGACY_THREADS_BOOTSTRAP_CACHE_KEY = "cmc-threads-cache-v1";
const THREADS_FAST_BOOT_LIMIT = 80;
const SLOW_PROVIDER_SCAN_MS_DEFAULT = 1200;
const SLOW_PROVIDER_SCAN_MS_MIN = 400;
const SLOW_PROVIDER_SCAN_MS_MAX = 6000;
const SLOW_PROVIDER_SCAN_MS_STORAGE_KEY = "po-slow-provider-threshold-ms";
const LEGACY_SLOW_PROVIDER_SCAN_MS_STORAGE_KEY = "cmc-slow-provider-threshold-ms";
const THEME_STORAGE_KEY = "po-theme";
const LEGACY_THEME_STORAGE_KEY = "cmc-theme";
const DENSITY_STORAGE_KEY = "po-density";
const LEGACY_DENSITY_STORAGE_KEY = "cmc-density";
const PROVIDER_VIEW_STORAGE_KEY = "po-provider-view";
const LEGACY_PROVIDER_VIEW_STORAGE_KEY = "cmc-provider-view";
const PROVIDER_DEPTH_STORAGE_KEY = "po-provider-depth";
const LEGACY_PROVIDER_DEPTH_STORAGE_KEY = "cmc-provider-depth";
type ProviderFetchMetrics = {
  data_sources: number | null;
  matrix: number | null;
  sessions: number | null;
  parser: number | null;
};
const FORENSICS_RETRY_DELAY_MS = 450;
const RUNTIME_BACKEND_DOWN_CACHED = "runtime-backend-down-cached";

function isTransientBackendError(raw: string): boolean {
  const normalized = String(raw || "").toLowerCase();
  return (
    normalized.includes("python-backend-unreachable") ||
    normalized.includes("legacy-backend-unreachable") ||
    normalized.includes("runtime-backend-unreachable") ||
    normalized.includes(RUNTIME_BACKEND_DOWN_CACHED) ||
    normalized.includes("status 502") ||
    normalized.includes("status 503") ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("socket hang up") ||
    normalized.includes("econnrefused") ||
    normalized.includes("etimedout")
  );
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function readStorageValue(keys: readonly string[]): string | null {
  if (typeof window === "undefined") return null;
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  }
  return null;
}

function writeStorageValue(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

async function postWithTransientRetry<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const retryDelaysMs = [FORENSICS_RETRY_DELAY_MS, FORENSICS_RETRY_DELAY_MS * 2];
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await apiPost<T>(path, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isTransientBackendError(message) || attempt >= retryDelaysMs.length) {
        throw error;
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, retryDelaysMs[attempt] ?? FORENSICS_RETRY_DELAY_MS),
      );
    }
  }
  throw new Error("transient-retry-exhausted");
}

function formatMutationErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const normalized = trimmed
    .replace(/^\/api\/[^\s]+\s+status\s+\d+:\s*/i, "")
    .trim();

  if (
    normalized.includes("python-backend-unreachable") ||
    normalized.includes("legacy-backend-unreachable") ||
    normalized.includes("runtime-backend-unreachable") ||
    normalized.includes("status 502") ||
    normalized.includes("status 503") ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes(RUNTIME_BACKEND_DOWN_CACHED)
  ) {
    return "Request failed because runtime connectivity is unstable. Check `pnpm --filter @provider-surface/api dev`, then retry.";
  }

  if (
    normalized.includes("no-valid-thread-ids") ||
    normalized.includes("no thread ids provided") ||
    normalized.includes("at least 1")
  ) {
    return "No valid thread IDs were selected. Select one or more threads and retry.";
  }

  if (normalized.includes("confirm_token")) {
    return "Confirmation token is invalid. Run dry-run again and retry with the latest token.";
  }

  return normalized || trimmed;
}

export function useAppData(options?: { providersDiagnosticsOpen?: boolean }) {
  const providersDiagnosticsOpen = options?.providersDiagnosticsOpen ?? false;
  /* ---- UI state ---- */
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const saved = readStorageValue([THEME_STORAGE_KEY, LEGACY_THEME_STORAGE_KEY]);
    return saved === "light" ? "light" : "dark";
  });
  const [density, setDensity] = useState<UiDensity>(() => {
    if (typeof window === "undefined") return "comfortable";
    const saved = readStorageValue([DENSITY_STORAGE_KEY, LEGACY_DENSITY_STORAGE_KEY]);
    return saved === "compact" ? "compact" : "comfortable";
  });
  const [layoutView, setLayoutView] = useState<LayoutView>("overview");
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [providerView, setProviderView] = useState<ProviderView>(() => {
    if (typeof window === "undefined") return "all";
    const saved = readStorageValue([PROVIDER_VIEW_STORAGE_KEY, LEGACY_PROVIDER_VIEW_STORAGE_KEY]);
    if (!saved || saved === "all") return "all";
    return saved;
  });
  const [providerDataDepth, setProviderDataDepth] = useState<ProviderDataDepth>(() => {
    if (typeof window === "undefined") return "balanced";
    const saved = readStorageValue([PROVIDER_DEPTH_STORAGE_KEY, LEGACY_PROVIDER_DEPTH_STORAGE_KEY]);
    if (saved === "fast" || saved === "balanced" || saved === "deep") return saved;
    return "balanced";
  });
  const [slowProviderThresholdMs, setSlowProviderThresholdMs] = useState<number>(() => {
    if (typeof window === "undefined") return SLOW_PROVIDER_SCAN_MS_DEFAULT;
    try {
      const raw = Number(
        readStorageValue([
          SLOW_PROVIDER_SCAN_MS_STORAGE_KEY,
          LEGACY_SLOW_PROVIDER_SCAN_MS_STORAGE_KEY,
        ]),
      );
      if (Number.isFinite(raw)) {
        return Math.min(SLOW_PROVIDER_SCAN_MS_MAX, Math.max(SLOW_PROVIDER_SCAN_MS_MIN, Math.round(raw)));
      }
    } catch {
      // ignore parse failures and use default
    }
    return SLOW_PROVIDER_SCAN_MS_DEFAULT;
  });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [selectedProviderFiles, setSelectedProviderFiles] = useState<Record<string, boolean>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [selectedSessionPath, setSelectedSessionPath] = useState<string>("");
  const [threadsFastBoot, setThreadsFastBoot] = useState(true);
  const [renderLimit, setRenderLimit] = useState(INITIAL_CHUNK);
  const [threadsBootstrapRows, setThreadsBootstrapRows] = useState<ThreadRow[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = readStorageValue([
        THREADS_BOOTSTRAP_CACHE_KEY,
        LEGACY_THREADS_BOOTSTRAP_CACHE_KEY,
      ]);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { rows?: Array<Record<string, unknown>> };
      if (!Array.isArray(parsed.rows)) return [];
      return parsed.rows.map((row) => normalizeThreadRow(row)).slice(0, PAGE_SIZE);
    } catch {
      return [];
    }
  });

  /* ---- action result state ---- */
  const [analysisRaw, setAnalysisRaw] = useState<unknown>(null);
  const [cleanupRaw, setCleanupRaw] = useState<unknown>(null);
  const [providerActionRaw, setProviderActionRaw] = useState<unknown>(null);
  const [providerActionTokens, setProviderActionTokens] = useState<
    Record<string, string>
  >({});
  const [providerDeleteBackupEnabled, setProviderDeleteBackupEnabled] = useState(true);
  const [recoveryBackupExportRaw, setRecoveryBackupExportRaw] = useState<unknown>(null);
  const [providersRefreshPending, setProvidersRefreshPending] = useState(false);
  const [globalRefreshPending, setGlobalRefreshPending] = useState(false);
  const [providersLastRefreshAt, setProvidersLastRefreshAt] = useState<string>("");
  const [providerFetchMetrics, setProviderFetchMetrics] = useState<ProviderFetchMetrics>({
    data_sources: null,
    matrix: null,
    sessions: null,
    parser: null,
  });
  const providerFetchStartRef = useRef<ProviderFetchMetrics>({
    data_sources: null,
    matrix: null,
    sessions: null,
    parser: null,
  });

  /* ---- detail / transcript state ---- */
  const [threadDetailRaw, setThreadDetailRaw] = useState<unknown>(null);
  const [threadDetailLoading, setThreadDetailLoading] = useState(false);
  const [threadTranscriptRaw, setThreadTranscriptRaw] = useState<unknown>(null);
  const [threadTranscriptLoading, setThreadTranscriptLoading] = useState(false);
  const [threadTranscriptLimit, setThreadTranscriptLimit] = useState(250);
  const [sessionTranscriptRaw, setSessionTranscriptRaw] = useState<unknown>(null);
  const [sessionTranscriptLoading, setSessionTranscriptLoading] = useState(false);
  const [sessionTranscriptLimit, setSessionTranscriptLimit] = useState(120);
  const [threadsFetchMs, setThreadsFetchMs] = useState<number | null>(null);
  const threadDetailCacheRef = useRef<Map<string, unknown>>(new Map());
  const threadTranscriptCacheRef = useRef<Map<string, unknown>>(new Map());
  const sessionTranscriptCacheRef = useRef<Map<string, unknown>>(new Map());

  const queryClient = useQueryClient();
  const deferredQuery = useDeferredValue(query);

  /* ---- theme persistence ---- */
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    writeStorageValue(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
    writeStorageValue(DENSITY_STORAGE_KEY, density);
  }, [density]);

  useEffect(() => {
    writeStorageValue(PROVIDER_VIEW_STORAGE_KEY, providerView);
  }, [providerView]);
  useEffect(() => {
    writeStorageValue(PROVIDER_DEPTH_STORAGE_KEY, providerDataDepth);
  }, [providerDataDepth]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    writeStorageValue(
      SLOW_PROVIDER_SCAN_MS_STORAGE_KEY,
      String(Math.min(SLOW_PROVIDER_SCAN_MS_MAX, Math.max(SLOW_PROVIDER_SCAN_MS_MIN, Math.round(slowProviderThresholdMs)))),
    );
  }, [slowProviderThresholdMs]);

  const wantsProvidersSummary = layoutView === "overview";
  const wantsProvidersPanel = layoutView === "providers";
  const wantsProvidersData = wantsProvidersSummary || wantsProvidersPanel;
  const wantsRoutingData = layoutView === "providers" && providersDiagnosticsOpen;
  const wantsRecoveryData = layoutView === "overview";
  const smokeStatusQueryEnabled = layoutView === "overview";
  const recoveryQueryEnabled = wantsRecoveryData;
  const providerMatrixQueryEnabled = wantsProvidersSummary || wantsProvidersPanel;
  const dataSourcesQueryEnabled = wantsProvidersData;
  const recoveryRefetchInterval = wantsRecoveryData ? 15000 : false;
  const smokeStatusRefetchInterval = layoutView === "overview" ? 20000 : false;
  const providerMatrixRefetchInterval = providerMatrixQueryEnabled ? 60000 : false;
  const providerSessionsRefetchInterval = wantsProvidersData ? 60000 : false;
  const providerParserRefetchInterval = wantsProvidersData ? 60000 : false;
  const dataSourcesRefetchInterval = wantsProvidersData ? 120000 : false;

  /* ================================================================ */
  /*  Queries                                                         */
  /* ================================================================ */

  const runtime = useQuery({
    queryKey: ["runtime"],
    queryFn: ({ signal }) =>
      apiGet<RuntimeEnvelope>("/api/agent-runtime", { signal }),
    refetchInterval: 10000,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const smokeStatus = useQuery({
    queryKey: ["smoke-status"],
    queryFn: ({ signal }) =>
      apiGet<SmokeStatusEnvelope>("/api/smoke-status?limit=6", { signal }),
    enabled: smokeStatusQueryEnabled,
    refetchInterval: smokeStatusRefetchInterval,
    staleTime: 10000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const isThreadsFocused = layoutView === "threads";
  const threadsQueryLimit =
    isThreadsFocused
      ? (threadsFastBoot ? THREADS_FAST_BOOT_LIMIT : PAGE_SIZE)
      : 60;

  const threads = useQuery({
    queryKey: ["threads", deferredQuery, threadsQueryLimit],
    queryFn: async ({ signal }) => {
      const startedAt = nowMs();
      try {
        return await apiGet<ThreadsResponse>(
        `/api/threads?offset=0&limit=${threadsQueryLimit}&q=${encodeURIComponent(deferredQuery)}&sort=updated_desc`,
        { signal },
        );
      } finally {
        if (!signal.aborted) {
          setThreadsFetchMs(Math.max(0, Math.round(nowMs() - startedAt)));
        }
      }
    },
    placeholderData: (previous) => previous,
    staleTime: 10000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  useEffect(() => {
    if (!threadsFastBoot) return;
    if (!isThreadsFocused) return;
    if (!threads.isSuccess) return;
    setThreadsFastBoot(false);
  }, [threadsFastBoot, isThreadsFocused, threads.isSuccess]);

  const recovery = useQuery({
    queryKey: ["recovery"],
    queryFn: ({ signal }) =>
      apiGet<RecoveryResponse>("/api/recovery-center", { signal }),
    enabled: recoveryQueryEnabled,
    refetchInterval: recoveryRefetchInterval,
    staleTime: 10000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const dataSources = useQuery({
    queryKey: ["data-sources"],
    queryFn: ({ signal }) =>
      apiGet<DataSourcesEnvelope>("/api/data-sources", { signal }),
    enabled: dataSourcesQueryEnabled,
    refetchInterval: dataSourcesRefetchInterval,
    staleTime: 60000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const providerMatrix = useQuery({
    queryKey: ["provider-matrix"],
    queryFn: ({ signal }) =>
      apiGet<ProviderMatrixEnvelope>("/api/provider-matrix", { signal }),
    enabled: providerMatrixQueryEnabled,
    refetchInterval: providerMatrixRefetchInterval,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 1,
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
    providerQueryView === "all"
      ? ""
      : `&provider=${encodeURIComponent(providerQueryView)}`;
  const providerSummarySessionsLimit = { fast: 30, balanced: 60, deep: 140 }[providerDataDepth];
  const providerSummaryParserLimit = { fast: 25, balanced: 40, deep: 80 }[providerDataDepth];
  const providerSessionsQueryKey = [
    "provider-sessions",
    providerQueryView,
    providerDataDepth,
    providerSessionsLimit,
  ] as const;
  const providerSessionsQueryPath =
    `/api/provider-sessions?limit=${providerSessionsLimit}${providerScopeQuery}`;
  const providerParserQueryKey = [
    "provider-parser-health",
    providerQueryView,
    providerDataDepth,
    providerParserLimit,
  ] as const;
  const providerParserQueryPath =
    `/api/provider-parser-health?limit=${providerParserLimit}${providerScopeQuery}`;
  const providerSummarySessionsQueryKey = [
    "provider-sessions-summary",
    "all",
    providerDataDepth,
    providerSummarySessionsLimit,
  ] as const;
  const providerSummarySessionsQueryPath =
    `/api/provider-sessions?limit=${providerSummarySessionsLimit}`;
  const providerSummaryParserQueryKey = [
    "provider-parser-health-summary",
    "all",
    providerDataDepth,
    providerSummaryParserLimit,
  ] as const;
  const providerSummaryParserQueryPath =
    `/api/provider-parser-health?limit=${providerSummaryParserLimit}`;
  const executionGraphQueryKey = ["execution-graph"] as const;
  const needsProviderSummaryQueries = wantsProvidersSummary && providerQueryView !== "all";

  const providerSessions = useQuery({
    queryKey: providerSessionsQueryKey,
    queryFn: ({ signal }) =>
      apiGet<ProviderSessionsEnvelope>(providerSessionsQueryPath, { signal }),
    placeholderData: (previous) => previous,
    enabled: providerSessionsQueryEnabled,
    refetchInterval: providerSessionsRefetchInterval,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const providerParserHealth = useQuery({
    queryKey: providerParserQueryKey,
    queryFn: ({ signal }) =>
      apiGet<ProviderParserHealthEnvelope>(providerParserQueryPath, { signal }),
    placeholderData: (previous) => previous,
    enabled: providerParserQueryEnabled,
    refetchInterval: providerParserRefetchInterval,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const providerSessionsSummary = useQuery({
    queryKey: providerSummarySessionsQueryKey,
    queryFn: ({ signal }) =>
      apiGet<ProviderSessionsEnvelope>(providerSummarySessionsQueryPath, { signal }),
    placeholderData: (previous) => previous,
    enabled: needsProviderSummaryQueries,
    refetchInterval: providerSessionsRefetchInterval,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const providerParserHealthSummary = useQuery({
    queryKey: providerSummaryParserQueryKey,
    queryFn: ({ signal }) =>
      apiGet<ProviderParserHealthEnvelope>(providerSummaryParserQueryPath, { signal }),
    placeholderData: (previous) => previous,
    enabled: needsProviderSummaryQueries,
    refetchInterval: providerParserRefetchInterval,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const executionGraph = useQuery({
    queryKey: executionGraphQueryKey,
    queryFn: ({ signal }) =>
      apiGet<ExecutionGraphEnvelope>("/api/execution-graph", { signal }),
    placeholderData: (previous) => previous,
    enabled: wantsRoutingData,
    refetchInterval: 20000,
    staleTime: 10000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

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

  useEffect(() => {
    settleProviderFetchMetric("data_sources", dataSources.isFetching);
  }, [dataSources.isFetching, settleProviderFetchMetric]);
  useEffect(() => {
    settleProviderFetchMetric("matrix", providerMatrix.isFetching);
  }, [providerMatrix.isFetching, settleProviderFetchMetric]);
  useEffect(() => {
    settleProviderFetchMetric("sessions", providerSessions.isFetching);
  }, [providerSessions.isFetching, settleProviderFetchMetric]);
  useEffect(() => {
    settleProviderFetchMetric("parser", providerParserHealth.isFetching);
  }, [providerParserHealth.isFetching, settleProviderFetchMetric]);

  /* ================================================================ */
  /*  Mutations                                                       */
  /* ================================================================ */

  const syncRuntimeAfterBackendFailure = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!isTransientBackendError(message)) return;
    queryClient.invalidateQueries({ queryKey: ["runtime"] });
  }, [queryClient]);

  const bulkPin = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      if (cachedReachable === false) {
        throw new Error(`${RUNTIME_BACKEND_DOWN_CACHED}: runtime-down`);
      }
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", {
        action: "pin",
        thread_ids: threadIds,
      });
    },
    onSuccess: (_data, threadIds) => {
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: syncRuntimeAfterBackendFailure,
  });

  const bulkUnpin = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      if (cachedReachable === false) {
        throw new Error(`${RUNTIME_BACKEND_DOWN_CACHED}: runtime-down`);
      }
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", {
        action: "unpin",
        thread_ids: threadIds,
      });
    },
    onSuccess: (_data, threadIds) => {
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
    onError: syncRuntimeAfterBackendFailure,
  });

  const bulkArchive = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      if (cachedReachable === false) {
        throw new Error(`${RUNTIME_BACKEND_DOWN_CACHED}: runtime-down`);
      }
      return apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", {
        action: "archive_local",
        thread_ids: threadIds,
      });
    },
    onSuccess: (_data, threadIds) => {
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
    onError: syncRuntimeAfterBackendFailure,
  });

  const analyzeDelete = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      if (cachedReachable === false) {
        throw new Error(`${RUNTIME_BACKEND_DOWN_CACHED}: runtime-down`);
      }
      const ids = normalizeThreadIds(threadIds);
      if (ids.length === 0) {
        throw new Error("no-valid-thread-ids");
      }
      return postWithTransientRetry<unknown>("/api/analyze-delete", { ids });
    },
    onSuccess: (data) => setAnalysisRaw(data),
    onError: syncRuntimeAfterBackendFailure,
  });

  const cleanupDryRun = useMutation({
    mutationFn: (threadIds: string[]) => {
      const cachedReachable = runtime.data?.data?.runtime_backend?.reachable;
      if (cachedReachable === false) {
        throw new Error(`${RUNTIME_BACKEND_DOWN_CACHED}: runtime-down`);
      }
      const ids = normalizeThreadIds(threadIds);
      if (ids.length === 0) {
        throw new Error("no-valid-thread-ids");
      }
      return postWithTransientRetry<unknown>("/api/local-cleanup", {
        ids,
        dry_run: true,
        options: {
          delete_cache: true,
          delete_session_logs: true,
          clean_state_refs: true,
        },
        confirm_token: "",
      });
    },
    onSuccess: (data) => setCleanupRaw(data),
    onError: syncRuntimeAfterBackendFailure,
  });

  const providerSessionAction = useMutation({
    mutationFn: (input: {
      provider: string;
      action: "backup_local" | "archive_local" | "delete_local";
      file_paths: string[];
      dry_run: boolean;
      confirm_token?: string;
      backup_before_delete?: boolean;
    }) =>
      apiPost<unknown>("/api/provider-session-action", {
        ...input,
        confirm_token: input.confirm_token ?? "",
      }),
    onSuccess: (data, variables) => {
      setProviderActionRaw(data);
      const actionData = extractEnvelopeData<ProviderSessionActionResult>(data);
      const expectedToken = String(actionData?.confirm_token_expected ?? "").trim();
      const key = providerActionSelectionKey(
        variables.provider,
        variables.action,
        variables.file_paths,
        { backup_before_delete: variables.backup_before_delete },
      );
      if (expectedToken) {
        setProviderActionTokens((prev) => ({ ...prev, [key]: expectedToken }));
      } else if (actionData?.ok && !variables.dry_run) {
        setProviderActionTokens((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
      queryClient.invalidateQueries({ queryKey: ["provider-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["provider-parser-health"] });
      queryClient.invalidateQueries({ queryKey: ["provider-matrix"] });
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
  });

  const recoveryBackupExport = useMutation({
    mutationFn: (backupIds: string[]) =>
      apiPost<RecoveryBackupExportResponse>("/api/recovery-backup-export", {
        backup_ids: backupIds,
      }),
    onSuccess: (data) => {
      setRecoveryBackupExportRaw(data);
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
  });

  const runtimeBackendReachable = runtime.data?.data?.runtime_backend?.reachable;
  useEffect(() => {
    if (runtimeBackendReachable !== true) return;
    if (
      !bulkPin.isError &&
      !bulkUnpin.isError &&
      !bulkArchive.isError &&
      !analyzeDelete.isError &&
      !cleanupDryRun.isError
    ) {
      return;
    }
    bulkPin.reset();
    bulkUnpin.reset();
    bulkArchive.reset();
    analyzeDelete.reset();
    cleanupDryRun.reset();
  }, [
    runtimeBackendReachable,
    bulkPin,
    bulkUnpin,
    bulkArchive,
    analyzeDelete,
    cleanupDryRun,
  ]);

  /* ================================================================ */
  /*  Derived / Memoized values                                       */
  /* ================================================================ */

  const rowsFromApi = useMemo(
    () => ((threads.data?.rows ?? []) as Array<Record<string, unknown>>).map((row) => normalizeThreadRow(row)),
    [threads.data?.rows],
  );
  const hasApiRows = Array.isArray(threads.data?.rows);
  const rows = hasApiRows ? rowsFromApi : threadsBootstrapRows;

  useEffect(() => {
    if (!hasApiRows || rowsFromApi.length === 0) return;
    setThreadsBootstrapRows(rowsFromApi);
    if (typeof window === "undefined") return;
    try {
      writeStorageValue(
        THREADS_BOOTSTRAP_CACHE_KEY,
        JSON.stringify({
          saved_at: Date.now(),
          rows: rowsFromApi.slice(0, PAGE_SIZE),
        }),
      );
    } catch {
      // ignore storage write failure
    }
  }, [hasApiRows, rowsFromApi]);

  const filteredRows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !`${row.title ?? ""} ${row.thread_id}`.toLowerCase().includes(q)) return false;
      if (filterMode === "high-risk") return Number(row.risk_score ?? 0) >= 70;
      if (filterMode === "pinned") return Boolean(row.is_pinned);
      return true;
    });
  }, [rows, deferredQuery, filterMode]);

  /* progressive rendering */
  useEffect(() => {
    setRenderLimit(INITIAL_CHUNK);
    if (filteredRows.length <= INITIAL_CHUNK) return;
    let raf = 0;
    let cancelled = false;
    const step = () => {
      if (cancelled) return;
      setRenderLimit((prev) => {
        const next = Math.min(prev + CHUNK_SIZE, filteredRows.length);
        if (next < filteredRows.length) {
          raf = requestAnimationFrame(step);
        }
        return next;
      });
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [filteredRows.length]);

  const visibleRows = filteredRows.slice(0, renderLimit);
  const selectedIds = Object.entries(selected)
    .filter(([, on]) => on)
    .map(([id]) => id);

  const selectedSet = new Set(selectedIds);
  const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedSet.has(row.thread_id));
  const pinnedCount = useMemo(() => rows.filter((r) => r.is_pinned).length, [rows]);
  const highRiskCount = useMemo(() => rows.filter((r) => Number(r.risk_score || 0) >= 70).length, [rows]);

  const analysisData = extractEnvelopeData<AnalyzeDeleteData>(analysisRaw);
  const cleanupData = extractEnvelopeData<CleanupPreviewData>(cleanupRaw);
  const smokeStatusRoot =
    extractEnvelopeData<NonNullable<SmokeStatusEnvelope["data"]>>(smokeStatus.data) ?? {};
  const smokeStatusLatest = smokeStatusRoot.latest;
  const selectedImpactRows = (analysisData?.reports ?? []).filter((r) => selectedSet.has(r.id));
  const analyzeDeleteErrorMessage = analyzeDelete.error instanceof Error
    ? formatMutationErrorMessage(analyzeDelete.error.message)
    : analyzeDelete.error
      ? formatMutationErrorMessage(String(analyzeDelete.error))
      : "";
  const cleanupDryRunErrorMessage = cleanupDryRun.error instanceof Error
    ? formatMutationErrorMessage(cleanupDryRun.error.message)
    : cleanupDryRun.error
      ? formatMutationErrorMessage(String(cleanupDryRun.error))
      : "";
  const bulkActionErrorMessage =
    bulkArchive.error instanceof Error
      ? formatMutationErrorMessage(bulkArchive.error.message)
      : bulkArchive.error
        ? formatMutationErrorMessage(String(bulkArchive.error))
        : bulkPin.error instanceof Error
          ? formatMutationErrorMessage(bulkPin.error.message)
          : bulkPin.error
            ? formatMutationErrorMessage(String(bulkPin.error))
            : bulkUnpin.error instanceof Error
              ? formatMutationErrorMessage(bulkUnpin.error.message)
              : bulkUnpin.error
                ? formatMutationErrorMessage(String(bulkUnpin.error))
                : "";
  const bulkActionError = bulkArchive.isError || bulkPin.isError || bulkUnpin.isError;
  const providerSessionActionErrorMessage = providerSessionAction.error instanceof Error
    ? formatMutationErrorMessage(providerSessionAction.error.message)
    : providerSessionAction.error
      ? formatMutationErrorMessage(String(providerSessionAction.error))
      : "";

  /* ---- provider derived ---- */
  const dataSourcesRoot = extractEnvelopeData<NonNullable<DataSourcesEnvelope["data"]>>(dataSources.data) ?? {};
  const dataSourceRows = useMemo<DataSourceInventoryRow[]>(() => {
    const sourceObj = dataSourcesRoot.sources;
    if (!sourceObj || typeof sourceObj !== "object") return [];
    const rows = Object.entries(sourceObj).map(([sourceKey, rawValue]) => {
      const value =
        rawValue && typeof rawValue === "object"
          ? (rawValue as Record<string, unknown>)
          : {};
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
  const providerSessionsRoot =
    extractEnvelopeData<NonNullable<ProviderSessionsEnvelope["data"]>>(providerSessions.data) ?? {};
  const providerParserRoot =
    extractEnvelopeData<NonNullable<ProviderParserHealthEnvelope["data"]>>(providerParserHealth.data) ?? {};
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
      if (existing) {
        existing.push(row);
      } else {
        map.set(provider, [row]);
      }
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
    () =>
      providerView === "all"
        ? allProviderSessionRows
        : currentProviderSessionRows,
    [providerView, allProviderSessionRows, currentProviderSessionRows],
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
      providers: parserReports.length,
      scanned,
      parse_ok: parseOk,
      parse_fail: parseFail,
      parse_score: scanned ? Number(((parseOk / scanned) * 100).toFixed(1)) : null,
    };
  }, [parserReports]);

  const providerTabs = useMemo(() => {
    const idsFromMatrix = providers
      .map((item) => String(item.provider || "").trim())
      .filter(Boolean);
    const idsFromRows = allProviderSessionRows
      .map((row) => String(row.provider || "").trim())
      .filter(Boolean);
    const mergedIds = Array.from(new Set([...idsFromMatrix, ...idsFromRows]));
    const providerItems = mergedIds.map((id) => {
      const meta = providerById.get(id);
      const scanned =
        scannedByProvider.get(id) ??
        sessionCountByProvider.get(id) ??
        0;
      const scanMs = scanMsByProvider.get(id) ?? null;
      return {
        id: id as ProviderView,
        name: meta?.name ?? id,
        status: meta?.status ?? (scanned > 0 ? "active" : "missing"),
        scanned,
        scan_ms: scanMs,
        is_slow: scanMs !== null && scanMs >= slowProviderThresholdMs,
      };
    });
    providerItems.sort((a, b) => {
      if (a.is_slow !== b.is_slow) return a.is_slow ? -1 : 1;
      const aScanMs = a.scan_ms ?? -1;
      const bScanMs = b.scan_ms ?? -1;
      if (aScanMs !== bScanMs) return bScanMs - aScanMs;
      if (a.scanned !== b.scanned) return b.scanned - a.scanned;
      return a.name.localeCompare(b.name);
    });
    return [
      {
        id: "all" as ProviderView,
        name: "All AI",
        status: "active" as const,
        scanned: allProviderSessionRows.length,
        scan_ms: null,
        is_slow: false,
      },
      ...providerItems,
    ];
  }, [
    providers,
    allProviderSessionRows,
    providerById,
    scannedByProvider,
    sessionCountByProvider,
    scanMsByProvider,
    slowProviderThresholdMs,
  ]);

  useEffect(() => {
    if (providerView === "all") return;
    const exists = providerTabs.some((tab) => tab.id === providerView);
    if (!exists) setProviderView("all");
  }, [providerView, providerTabs]);
  const selectedProviderLabel =
    providerView === "all" ? "All AI" : providerById.get(providerView)?.name ?? providerView;
  const selectedProviderFilePaths = useMemo(
    () =>
      providerSessionRows
        .filter((row) => Boolean(selectedProviderFiles[row.file_path]))
        .map((row) => row.file_path),
    [providerSessionRows, selectedProviderFiles],
  );
  const allProviderRowsSelected =
    providerSessionRows.length > 0 && providerSessionRows.every((row) => Boolean(selectedProviderFiles[row.file_path]));
  const providerRowsSampled = useMemo(() => {
    if (providerView === "all") {
      return allProviderSessionProviders.some((row) => Boolean(row.truncated));
    }
    const hit =
      currentProviderSessionProviders.find((row) => row.provider === providerView) ??
      allProviderSessionProviders.find((row) => row.provider === providerView);
    return Boolean(hit?.truncated);
  }, [providerView, allProviderSessionProviders, currentProviderSessionProviders]);
  const providerActionData = extractEnvelopeData<ProviderSessionActionResult>(providerActionRaw);
  const selectedProviderMeta = providerView === "all" ? null : providerById.get(providerView);
  const canRunProviderAction =
    providerView !== "all" &&
    selectedProviderFilePaths.length > 0 &&
    Boolean(selectedProviderMeta?.capabilities?.safe_cleanup);
  const readOnlyProviders = useMemo(
    () => providers.filter((p) => p.capability_level === "read-only").map((p) => p.name),
    [providers],
  );
  const cleanupReadyProviders = useMemo(
    () => providers.filter((p) => p.capabilities.safe_cleanup).map((p) => p.name),
    [providers],
  );

  /* ---- loading flags ---- */
  const runtimeLoading = runtime.isLoading && !runtime.data;
  const smokeStatusLoading = smokeStatus.isLoading && !smokeStatus.data;
  const recoveryLoading = recovery.isLoading && !recovery.data;
  const dataSourcesLoading = dataSources.isLoading && dataSourceRows.length === 0;
  const providerMatrixLoading = providerMatrix.isLoading && providers.length === 0;
  const providerSessionsLoading =
    providerView === "all"
      ? providerSessions.isLoading && allProviderSessionRows.length === 0
      : providerSessions.isLoading && currentProviderSessionRows.length === 0;
  const parserLoading =
    providerView === "all"
      ? providerParserHealth.isLoading && allParserReports.length === 0
      : providerParserHealth.isLoading && currentParserReports.length === 0;
  const threadsLoading = threads.isLoading && rows.length === 0;

  const executionGraphData = extractEnvelopeData<NonNullable<ExecutionGraphEnvelope["data"]>>(executionGraph.data);
  const executionGraphLoading = executionGraph.isLoading && !executionGraphData;
  const threadsFastBooting =
    threadsFastBoot &&
    isThreadsFocused &&
    (threads.isLoading || threads.isFetching);

  /* ---- detail selection ---- */
  const selectedThread = useMemo(
    () => rows.find((row) => row.thread_id === selectedThreadId) ?? null,
    [rows, selectedThreadId],
  );
  const selectedSession = useMemo(
    () => providerSessionRows.find((row) => row.file_path === selectedSessionPath) ?? null,
    [providerSessionRows, selectedSessionPath],
  );
  const selectedSessionMeta = selectedSession ? providerById.get(selectedSession.provider) : null;
  const canRunSelectedSessionAction = Boolean(
    selectedSessionMeta?.capabilities?.safe_cleanup,
  );
  const threadDetailData = extractEnvelopeData<ThreadForensicsEnvelope>(threadDetailRaw);
  const selectedThreadDetail = threadDetailData?.reports?.[0] ?? null;
  const threadTranscriptData = extractEnvelopeData<TranscriptPayload>(threadTranscriptRaw);
  const sessionTranscriptData = extractEnvelopeData<TranscriptPayload>(sessionTranscriptRaw);
  const recoveryBackupExportData =
    extractEnvelopeData<RecoveryBackupExportResponse>(recoveryBackupExportRaw);
  const recoveryBackupExportErrorMessage = recoveryBackupExport.error instanceof Error
    ? formatMutationErrorMessage(recoveryBackupExport.error.message)
    : recoveryBackupExport.error
      ? formatMutationErrorMessage(String(recoveryBackupExport.error))
      : "";

  /* ================================================================ */
  /*  Side-effects: detail / transcript loading                       */
  /* ================================================================ */

  useEffect(() => {
    if (!selectedThreadId) {
      setThreadDetailRaw(null);
      setThreadTranscriptRaw(null);
      setThreadTranscriptLimit(250);
      return;
    }
    const cached = threadDetailCacheRef.current.get(selectedThreadId);
    if (cached) {
      setThreadDetailRaw(cached);
      setThreadDetailLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setThreadDetailLoading(true);
    apiPost<unknown>(
      "/api/thread-forensics",
      { ids: [selectedThreadId] },
      { signal: controller.signal },
    )
      .then((data) => {
        if (!cancelled) {
          threadDetailCacheRef.current.set(selectedThreadId, data);
          setThreadDetailRaw(data);
        }
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
        if (!cancelled) setThreadDetailRaw(null);
      })
      .finally(() => {
        if (!cancelled) setThreadDetailLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      setThreadTranscriptRaw(null);
      return;
    }
    const cacheKey = `${selectedThreadId}|${threadTranscriptLimit}`;
    const cached = threadTranscriptCacheRef.current.get(cacheKey);
    if (cached) {
      setThreadTranscriptRaw(cached);
      setThreadTranscriptLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setThreadTranscriptLoading(true);
    apiGet<unknown>(
      `/api/thread-transcript?thread_id=${encodeURIComponent(selectedThreadId)}&limit=${threadTranscriptLimit}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!cancelled) {
          threadTranscriptCacheRef.current.set(cacheKey, data);
          setThreadTranscriptRaw(data);
        }
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
        if (!cancelled) setThreadTranscriptRaw(null);
      })
      .finally(() => {
        if (!cancelled) setThreadTranscriptLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedThreadId, threadTranscriptLimit]);

  useEffect(() => {
    if (!selectedSession) {
      setSessionTranscriptRaw(null);
      setSessionTranscriptLimit(250);
      return;
    }
    const cacheKey = `${selectedSession.provider}|${selectedSession.file_path}|${sessionTranscriptLimit}`;
    const cached = sessionTranscriptCacheRef.current.get(cacheKey);
    if (cached) {
      setSessionTranscriptRaw(cached);
      setSessionTranscriptLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setSessionTranscriptLoading(true);
    apiGet<unknown>(
      `/api/session-transcript?provider=${encodeURIComponent(selectedSession.provider)}&file_path=${encodeURIComponent(selectedSession.file_path)}&limit=${sessionTranscriptLimit}`,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!cancelled) {
          sessionTranscriptCacheRef.current.set(cacheKey, data);
          setSessionTranscriptRaw(data);
        }
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
        if (!cancelled) setSessionTranscriptRaw(null);
      })
      .finally(() => {
        if (!cancelled) setSessionTranscriptLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedSession, sessionTranscriptLimit]);

  /* ================================================================ */
  /*  Computed flags & action dispatchers                             */
  /* ================================================================ */

  const busy =
    bulkPin.isPending ||
    bulkUnpin.isPending ||
    bulkArchive.isPending ||
    analyzeDelete.isPending ||
    cleanupDryRun.isPending ||
    providerSessionAction.isPending ||
    recoveryBackupExport.isPending;

  const showProviders = layoutView === "providers";
  const showThreadsTable = layoutView === "threads";
  const showForensics = layoutView === "threads";
  const showRouting = layoutView === "providers";
  const showDetails = layoutView === "threads" || layoutView === "providers";

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      const next: Record<string, boolean> = {};
      filteredRows.forEach((row) => {
        next[row.thread_id] = true;
      });
      setSelected(next);
      return;
    }
    setSelected({});
  };

  const toggleSelectAllProviderRows = (
    checked: boolean,
    scopeFilePaths?: string[],
  ) => {
    const scope = (scopeFilePaths ?? providerSessionRows.map((row) => row.file_path))
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (checked) {
      const next: Record<string, boolean> = { ...selectedProviderFiles };
      scope.forEach((filePath) => {
        next[filePath] = true;
      });
      setSelectedProviderFiles(next);
      return;
    }
    const next: Record<string, boolean> = { ...selectedProviderFiles };
    scope.forEach((filePath) => {
      delete next[filePath];
    });
    setSelectedProviderFiles(next);
  };

  const runProviderAction = (
    action: "backup_local" | "archive_local" | "delete_local",
    dryRun: boolean,
    options?: { backup_before_delete?: boolean },
  ) => {
    if (providerView === "all" || selectedProviderFilePaths.length === 0) return;
    if (providerSessionAction.isError) {
      providerSessionAction.reset();
    }
    const key = providerActionSelectionKey(
      providerView,
      action,
      selectedProviderFilePaths,
      options,
    );
    const scopedToken = providerActionTokens[key] ?? "";
    const shouldPreview = action === "backup_local" ? dryRun : !dryRun && !scopedToken;
    providerSessionAction.mutate({
      provider: providerView,
      action,
      file_paths: selectedProviderFilePaths,
      dry_run: shouldPreview ? true : dryRun,
      confirm_token: dryRun ? "" : scopedToken,
      backup_before_delete: options?.backup_before_delete,
    });
  };

  const runSingleProviderAction = (
    provider: string,
    filePath: string,
    action: "backup_local" | "archive_local" | "delete_local",
    dryRun: boolean,
    options?: { backup_before_delete?: boolean },
  ) => {
    if (providerSessionAction.isError) {
      providerSessionAction.reset();
    }
    const key = providerActionSelectionKey(provider, action, [filePath], options);
    const scopedToken = providerActionTokens[key] ?? "";
    const shouldPreview = action === "backup_local" ? dryRun : !dryRun && !scopedToken;
    providerSessionAction.mutate({
      provider,
      action,
      file_paths: [filePath],
      dry_run: shouldPreview ? true : dryRun,
      confirm_token: dryRun ? "" : scopedToken,
      backup_before_delete: options?.backup_before_delete,
    });
  };

  const runRecoveryBackupExport = (backupIds: string[]) => {
    if (recoveryBackupExport.isError) {
      recoveryBackupExport.reset();
    }
    recoveryBackupExport.mutate(backupIds);
  };

  const prefetchProvidersData = useCallback(() => {
    void (async () => {
      const matrixEnvelope = await queryClient.fetchQuery({
        queryKey: ["provider-matrix"],
        queryFn: () => apiGet<ProviderMatrixEnvelope>("/api/provider-matrix"),
        staleTime: 30000,
      });

      const matrixData =
        extractEnvelopeData<NonNullable<ProviderMatrixEnvelope["data"]>>(matrixEnvelope) ?? {};
      const matrixProviderIds = new Set(
        (matrixData.providers ?? [])
          .map((item) => String(item.provider || "").trim())
          .filter(Boolean),
      );
      const prefetchProviderView =
        providerView === "all"
          ? "all"
          : matrixProviderIds.size === 0 || matrixProviderIds.has(providerView)
            ? providerView
            : "all";
      const prefetchSessionsLimit =
        prefetchProviderView === "all"
          ? { fast: 30, balanced: 60, deep: 140 }[providerDataDepth]
          : { fast: 120, balanced: 240, deep: 500 }[providerDataDepth];
      const prefetchParserLimit =
        prefetchProviderView === "all"
          ? { fast: 25, balanced: 40, deep: 80 }[providerDataDepth]
          : { fast: 80, balanced: 120, deep: 220 }[providerDataDepth];
      const prefetchScopeQuery =
        prefetchProviderView === "all"
          ? ""
          : `&provider=${encodeURIComponent(prefetchProviderView)}`;

      const jobs: Array<Promise<unknown>> = [
        queryClient.prefetchQuery({
          queryKey: ["data-sources"],
          queryFn: () => apiGet<DataSourcesEnvelope>("/api/data-sources"),
          staleTime: 60000,
        }),
        queryClient.prefetchQuery({
          queryKey: [
            "provider-sessions",
            prefetchProviderView,
            providerDataDepth,
            prefetchSessionsLimit,
          ],
          queryFn: () =>
            apiGet<ProviderSessionsEnvelope>(
              `/api/provider-sessions?limit=${prefetchSessionsLimit}${prefetchScopeQuery}`,
            ),
          staleTime: 30000,
        }),
        queryClient.prefetchQuery({
          queryKey: [
            "provider-parser-health",
            prefetchProviderView,
            providerDataDepth,
            prefetchParserLimit,
          ],
          queryFn: () =>
            apiGet<ProviderParserHealthEnvelope>(
              `/api/provider-parser-health?limit=${prefetchParserLimit}${prefetchScopeQuery}`,
            ),
          staleTime: 30000,
        }),
      ];

      await Promise.all(jobs);
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
      await queryClient.fetchQuery({
        queryKey: ["data-sources"],
        queryFn: () => apiGet<DataSourcesEnvelope>("/api/data-sources?refresh=1"),
        staleTime: 0,
      });
      await queryClient.fetchQuery({
        queryKey: ["provider-matrix"],
        queryFn: () =>
          apiGet<ProviderMatrixEnvelope>("/api/provider-matrix?refresh=1"),
        staleTime: 0,
      });
      await queryClient.fetchQuery({
        queryKey: providerSessionsQueryKey,
        queryFn: () =>
          apiGet<ProviderSessionsEnvelope>(`${providerSessionsQueryPath}&refresh=1`),
        staleTime: 0,
      });
      await queryClient.fetchQuery({
        queryKey: providerParserQueryKey,
        queryFn: () =>
          apiGet<ProviderParserHealthEnvelope>(`${providerParserQueryPath}&refresh=1`),
        staleTime: 0,
      });
      if (needsProviderSummaryQueries) {
        await queryClient.fetchQuery({
          queryKey: providerSummarySessionsQueryKey,
          queryFn: () =>
            apiGet<ProviderSessionsEnvelope>(`${providerSummarySessionsQueryPath}&refresh=1`),
          staleTime: 0,
        });
        await queryClient.fetchQuery({
          queryKey: providerSummaryParserQueryKey,
          queryFn: () =>
            apiGet<ProviderParserHealthEnvelope>(`${providerSummaryParserQueryPath}&refresh=1`),
          staleTime: 0,
        });
      }
      setProvidersLastRefreshAt(new Date().toISOString());
    } finally {
      setProvidersRefreshPending(false);
    }
  }, [
    queryClient,
    providerSessionsQueryKey,
    providerSessionsQueryPath,
    providerParserQueryKey,
    providerParserQueryPath,
    needsProviderSummaryQueries,
    providerSummarySessionsQueryKey,
    providerSummarySessionsQueryPath,
    providerSummaryParserQueryKey,
    providerSummaryParserQueryPath,
  ]);

  const refreshAllData = useCallback(async () => {
    if (globalRefreshPending) return;
    setGlobalRefreshPending(true);
    try {
      const refreshJobs: Array<Promise<unknown>> = [
        runtime.refetch({ cancelRefetch: false }),
        threads.refetch({ cancelRefetch: false }),
        smokeStatus.refetch({ cancelRefetch: false }),
        recovery.refetch({ cancelRefetch: false }),
      ];
      if (layoutView === "providers") {
        refreshJobs.push(executionGraph.refetch({ cancelRefetch: false }));
      }
      await Promise.allSettled(refreshJobs);
      if (layoutView === "providers" || layoutView === "overview") {
        await refreshProvidersData();
      }
    } finally {
      setGlobalRefreshPending(false);
    }
  }, [
    globalRefreshPending,
    runtime,
    threads,
    smokeStatus,
    recovery,
    layoutView,
    executionGraph,
    refreshProvidersData,
  ]);

  const providersRefreshing =
    providersRefreshPending ||
    providerMatrix.isFetching ||
    providerSessions.isFetching ||
    providerParserHealth.isFetching ||
    providerSessionsSummary.isFetching ||
    providerParserHealthSummary.isFetching;

  /* ================================================================ */
  /*  Public API                                                      */
  /* ================================================================ */

  return {
    /* UI state */
    theme, setTheme,
    density, setDensity,
    layoutView, setLayoutView,
    query, setQuery,
    filterMode, setFilterMode,
    providerView, setProviderView,
    providerDataDepth, setProviderDataDepth,
    slowProviderThresholdMs, setSlowProviderThresholdMs,
    selected, setSelected,
    selectedProviderFiles, setSelectedProviderFiles,
    selectedThreadId, setSelectedThreadId,
    selectedSessionPath, setSelectedSessionPath,

    /* query results (raw react-query objects for error states) */
    runtime, smokeStatus, threads, recovery, dataSources,
    providerMatrix, providerSessions, providerParserHealth,
    executionGraph,

    /* mutations (wrapped) */
    bulkPin: (ids: string[]) => bulkPin.mutate(ids),
    bulkUnpin: (ids: string[]) => bulkUnpin.mutate(ids),
    bulkArchive: (ids: string[]) => bulkArchive.mutate(ids),
    analyzeDelete: (ids: string[]) => analyzeDelete.mutate(ids),
    cleanupDryRun: (ids: string[]) => cleanupDryRun.mutate(ids),
    analyzeDeleteError: analyzeDelete.isError,
    cleanupDryRunError: cleanupDryRun.isError,
    analyzeDeleteErrorMessage,
    cleanupDryRunErrorMessage,
    bulkActionError,
    bulkActionErrorMessage,
    providerSessionActionError: providerSessionAction.isError,
    providerSessionActionErrorMessage,

    /* derived – threads */
    rows, filteredRows, visibleRows,
    selectedIds, allFilteredSelected,
    pinnedCount, highRiskCount,

    /* derived – analysis / cleanup */
    analysisRaw, cleanupRaw,
    analysisData, cleanupData,
    smokeStatusLatest,
    selectedImpactRows,

    /* derived – providers */
    providers, providerSummary,
    providerTabs, providerSessionRows,
    allProviderSessionRows,
    slowProviderIds,
    providerSessionSummary,
    providerSessionsLimit,
    providerRowsSampled,
    dataSourceRows,
    allProviderRowsSelected,
    selectedProviderLabel,
    selectedProviderFilePaths,
    canRunProviderAction,
    canRunSelectedSessionAction,
    providerActionData,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    recoveryBackupExportData,
    allParserReports,
    parserReports, parserSummary,
    readOnlyProviders, cleanupReadyProviders,

    /* derived – detail / transcripts */
    selectedThread, selectedSession,
    threadDetailLoading, selectedThreadDetail,
    threadTranscriptData, threadTranscriptLoading,
    threadTranscriptLimit, setThreadTranscriptLimit,
    sessionTranscriptData, sessionTranscriptLoading,
    sessionTranscriptLimit, setSessionTranscriptLimit,

    /* derived – execution graph */
    executionGraphData,

    /* loading flags */
    runtimeLoading, smokeStatusLoading, recoveryLoading, threadsLoading, dataSourcesLoading,
    providerMatrixLoading, providerSessionsLoading,
    parserLoading, executionGraphLoading,
    threadsFastBooting,
    threadsFetchMs,
    providersRefreshing,
    refreshingAllData: globalRefreshPending,
    providersLastRefreshAt,
    providerFetchMetrics,

    /* computed UI flags */
    busy,
    showProviders, showThreadsTable,
    showForensics, showRouting, showDetails,

    /* action dispatchers */
    toggleSelectAllFiltered,
    toggleSelectAllProviderRows,
    runProviderAction,
    runSingleProviderAction,
    runRecoveryBackupExport,
    recoveryBackupExportError: recoveryBackupExport.isError,
    recoveryBackupExportErrorMessage,
    prefetchProvidersData,
    prefetchRoutingData,
    refreshProvidersData,
    refreshAllData,
  };
}
