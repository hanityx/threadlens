import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiEnvelope, BulkThreadActionResult, ExecutionGraphData } from "@codex/shared-contracts";
import { apiGet, apiPost } from "../api";
import { extractEnvelopeData, normalizeThreadRow, parseNum } from "../lib/helpers";
import { detectInitialLocale } from "../i18n";
import type {
  RuntimeEnvelope,
  ThreadsResponse,
  RecoveryResponse,
  ProviderMatrixEnvelope,
  ProviderSessionsEnvelope,
  ProviderParserHealthEnvelope,
  ProviderSessionActionResult,
  AnalyzeDeleteData,
  CleanupPreviewData,
  ThreadForensicsEnvelope,
  TranscriptPayload,
  ExecutionGraphEnvelope,
  FilterMode,
  ProviderView,
  LayoutView,
  Locale,
} from "../types";
import { PAGE_SIZE, INITIAL_CHUNK, CHUNK_SIZE, PROVIDER_ORDER } from "../types";

/* ------------------------------------------------------------------ */
/*  useAppData – all state, queries, mutations, and derived values    */
/* ------------------------------------------------------------------ */

function providerActionSelectionKey(
  provider: Exclude<ProviderView, "all">,
  action: "archive_local" | "delete_local",
  filePaths: string[],
): string {
  const normalized = Array.from(
    new Set(filePaths.map((item) => String(item || "").trim()).filter(Boolean)),
  ).sort();
  return `${provider}|${action}|${normalized.join("||")}`;
}

export function useAppData() {
  /* ---- UI state ---- */
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    const saved = window.localStorage.getItem("cmc-theme");
    return saved === "light" ? "light" : "dark";
  });
  const [locale, setLocale] = useState<Locale>(() => detectInitialLocale());
  const [layoutView, setLayoutView] = useState<LayoutView>("threads");
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [providerView, setProviderView] = useState<ProviderView>("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [selectedProviderFiles, setSelectedProviderFiles] = useState<Record<string, boolean>>({});
  const [selectedThreadId, setSelectedThreadId] = useState<string>("");
  const [selectedSessionPath, setSelectedSessionPath] = useState<string>("");
  const [renderLimit, setRenderLimit] = useState(INITIAL_CHUNK);

  /* ---- action result state ---- */
  const [analysisRaw, setAnalysisRaw] = useState<unknown>(null);
  const [cleanupRaw, setCleanupRaw] = useState<unknown>(null);
  const [providerActionRaw, setProviderActionRaw] = useState<unknown>(null);
  const [providerActionTokens, setProviderActionTokens] = useState<
    Record<string, string>
  >({});

  /* ---- detail / transcript state ---- */
  const [threadDetailRaw, setThreadDetailRaw] = useState<unknown>(null);
  const [threadDetailLoading, setThreadDetailLoading] = useState(false);
  const [threadTranscriptRaw, setThreadTranscriptRaw] = useState<unknown>(null);
  const [threadTranscriptLoading, setThreadTranscriptLoading] = useState(false);
  const [threadTranscriptLimit, setThreadTranscriptLimit] = useState(250);
  const [sessionTranscriptRaw, setSessionTranscriptRaw] = useState<unknown>(null);
  const [sessionTranscriptLoading, setSessionTranscriptLoading] = useState(false);
  const [sessionTranscriptLimit, setSessionTranscriptLimit] = useState(250);

  const queryClient = useQueryClient();
  const deferredQuery = useDeferredValue(query);

  /* ---- theme persistence ---- */
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("cmc-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("cmc-locale", locale);
  }, [locale]);

  /* ================================================================ */
  /*  Queries                                                         */
  /* ================================================================ */

  const runtime = useQuery({
    queryKey: ["runtime"],
    queryFn: () => apiGet<RuntimeEnvelope>("/api/agent-runtime"),
    refetchInterval: 10000,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const threads = useQuery({
    queryKey: ["threads", deferredQuery],
    queryFn: () =>
      apiGet<ThreadsResponse>(
        `/api/threads?offset=0&limit=${PAGE_SIZE}&q=${encodeURIComponent(deferredQuery)}&sort=updated_desc`,
      ),
    placeholderData: (previous) => previous,
    staleTime: 10000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const recovery = useQuery({
    queryKey: ["recovery"],
    queryFn: () => apiGet<RecoveryResponse>("/api/recovery-center"),
    refetchInterval: 15000,
    staleTime: 10000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const providerMatrix = useQuery({
    queryKey: ["provider-matrix"],
    queryFn: () => apiGet<ProviderMatrixEnvelope>("/api/provider-matrix"),
    refetchInterval: 60000,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const providerSessions = useQuery({
    queryKey: ["provider-sessions", "all"],
    queryFn: () => apiGet<ProviderSessionsEnvelope>("/api/provider-sessions?limit=80"),
    refetchInterval: 60000,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const providerParserHealth = useQuery({
    queryKey: ["provider-parser-health", "all"],
    queryFn: () => apiGet<ProviderParserHealthEnvelope>("/api/provider-parser-health?limit=80"),
    refetchInterval: 60000,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const executionGraph = useQuery({
    queryKey: ["execution-graph"],
    queryFn: () => apiGet<ExecutionGraphEnvelope>("/api/execution-graph"),
    refetchInterval: 20000,
    staleTime: 10000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  /* ================================================================ */
  /*  Mutations                                                       */
  /* ================================================================ */

  const bulkPin = useMutation({
    mutationFn: (threadIds: string[]) =>
      apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", { action: "pin", thread_ids: threadIds }),
    onSuccess: () => {
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  const bulkUnpin = useMutation({
    mutationFn: (threadIds: string[]) =>
      apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", {
        action: "unpin",
        thread_ids: threadIds,
      }),
    onSuccess: () => {
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["threads"] });
    },
  });

  const bulkArchive = useMutation({
    mutationFn: (threadIds: string[]) =>
      apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", {
        action: "archive_local",
        thread_ids: threadIds,
      }),
    onSuccess: () => {
      setSelected({});
      queryClient.invalidateQueries({ queryKey: ["threads"] });
      queryClient.invalidateQueries({ queryKey: ["recovery"] });
    },
  });

  const analyzeDelete = useMutation({
    mutationFn: (threadIds: string[]) => apiPost<unknown>("/api/analyze-delete", { ids: threadIds }),
    onSuccess: (data) => setAnalysisRaw(data),
  });

  const cleanupDryRun = useMutation({
    mutationFn: (threadIds: string[]) =>
      apiPost<unknown>("/api/local-cleanup", {
        ids: threadIds,
        dry_run: true,
        options: {
          delete_cache: true,
          delete_session_logs: true,
          clean_state_refs: true,
        },
        confirm_token: "",
      }),
    onSuccess: (data) => setCleanupRaw(data),
  });

  const providerSessionAction = useMutation({
    mutationFn: (input: {
      provider: Exclude<ProviderView, "all">;
      action: "archive_local" | "delete_local";
      file_paths: string[];
      dry_run: boolean;
      confirm_token?: string;
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
    },
  });

  /* ================================================================ */
  /*  Derived / Memoized values                                       */
  /* ================================================================ */

  const rows = useMemo(
    () => ((threads.data?.rows ?? []) as Array<Record<string, unknown>>).map((row) => normalizeThreadRow(row)),
    [threads.data?.rows],
  );

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
  const selectedImpactRows = (analysisData?.reports ?? []).filter((r) => selectedSet.has(r.id));

  /* ---- provider derived ---- */
  const providerMatrixRoot = extractEnvelopeData<NonNullable<ProviderMatrixEnvelope["data"]>>(providerMatrix.data) ?? {};
  const providerSessionsRoot = extractEnvelopeData<NonNullable<ProviderSessionsEnvelope["data"]>>(providerSessions.data) ?? {};
  const providerParserRoot =
    extractEnvelopeData<NonNullable<ProviderParserHealthEnvelope["data"]>>(providerParserHealth.data) ?? {};

  const providers = providerMatrixRoot.providers ?? [];
  const providerSummary = providerMatrixRoot.summary;
  const allProviderSessionRows = providerSessionsRoot.rows ?? [];
  const allProviderSessionProviders = providerSessionsRoot.providers ?? [];
  const allParserReports = providerParserRoot.reports ?? [];
  const providerById = useMemo(() => new Map(providers.map((p) => [p.provider, p])), [providers]);
  const scannedByProvider = useMemo(
    () => new Map(allProviderSessionProviders.map((p) => [p.provider, p.scanned])),
    [allProviderSessionProviders],
  );
  const providerSessionRows = useMemo(
    () =>
      providerView === "all"
        ? allProviderSessionRows
        : allProviderSessionRows.filter((row) => row.provider === providerView),
    [providerView, allProviderSessionRows],
  );
  const providerSessionSummary = useMemo(() => {
    const parseOk = providerSessionRows.filter((row) => row.probe.ok).length;
    const parseFail = providerSessionRows.length - parseOk;
    return {
      providers: providerView === "all" ? providers.length || PROVIDER_ORDER.length : 1,
      rows: providerSessionRows.length,
      parse_ok: parseOk,
      parse_fail: parseFail,
    };
  }, [providerView, providerSessionRows, providers.length]);

  const parserReports = useMemo(
    () => (providerView === "all" ? allParserReports : allParserReports.filter((report) => report.provider === providerView)),
    [providerView, allParserReports],
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

  const providerTabs = useMemo(
    () => [
      {
        id: "all" as ProviderView,
        name: "All AI",
        status: "active" as const,
        scanned: allProviderSessionRows.length,
      },
      ...PROVIDER_ORDER.map((id) => {
        const meta = providerById.get(id);
        return {
          id,
          name: meta?.name ?? id,
          status: meta?.status ?? ("missing" as const),
          scanned:
            scannedByProvider.get(id) ??
            allProviderSessionRows.filter((row) => row.provider === id).length,
        };
      }),
    ],
    [providerById, scannedByProvider, allProviderSessionRows],
  );
  const selectedProviderLabel = providerView === "all" ? "All AI" : providerById.get(providerView)?.name ?? providerView;
  const selectedProviderFilePaths = useMemo(
    () =>
      providerSessionRows
        .filter((row) => Boolean(selectedProviderFiles[row.file_path]))
        .map((row) => row.file_path),
    [providerSessionRows, selectedProviderFiles],
  );
  const allProviderRowsSelected =
    providerSessionRows.length > 0 && providerSessionRows.every((row) => Boolean(selectedProviderFiles[row.file_path]));
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
  const recoveryLoading = recovery.isLoading && !recovery.data;
  const providerMatrixLoading = providerMatrix.isLoading && providers.length === 0;
  const providerSessionsLoading = providerSessions.isLoading && allProviderSessionRows.length === 0;
  const parserLoading = providerParserHealth.isLoading && allParserReports.length === 0;
  const threadsLoading = threads.isLoading && rows.length === 0;

  const executionGraphData = extractEnvelopeData<NonNullable<ExecutionGraphEnvelope["data"]>>(executionGraph.data);
  const executionGraphLoading = executionGraph.isLoading && !executionGraphData;

  /* ---- detail selection ---- */
  const selectedThread = useMemo(
    () => rows.find((row) => row.thread_id === selectedThreadId) ?? null,
    [rows, selectedThreadId],
  );
  const selectedSession = useMemo(
    () => providerSessionRows.find((row) => row.file_path === selectedSessionPath) ?? null,
    [providerSessionRows, selectedSessionPath],
  );
  const threadDetailData = extractEnvelopeData<ThreadForensicsEnvelope>(threadDetailRaw);
  const selectedThreadDetail = threadDetailData?.reports?.[0] ?? null;
  const threadTranscriptData = extractEnvelopeData<TranscriptPayload>(threadTranscriptRaw);
  const sessionTranscriptData = extractEnvelopeData<TranscriptPayload>(sessionTranscriptRaw);

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
    let cancelled = false;
    setThreadDetailLoading(true);
    apiPost<unknown>("/api/thread-forensics", { ids: [selectedThreadId] })
      .then((data) => {
        if (!cancelled) setThreadDetailRaw(data);
      })
      .catch(() => {
        if (!cancelled) setThreadDetailRaw(null);
      })
      .finally(() => {
        if (!cancelled) setThreadDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      setThreadTranscriptRaw(null);
      return;
    }
    let cancelled = false;
    setThreadTranscriptLoading(true);
    apiGet<unknown>(`/api/thread-transcript?thread_id=${encodeURIComponent(selectedThreadId)}&limit=${threadTranscriptLimit}`)
      .then((data) => {
        if (!cancelled) setThreadTranscriptRaw(data);
      })
      .catch(() => {
        if (!cancelled) setThreadTranscriptRaw(null);
      })
      .finally(() => {
        if (!cancelled) setThreadTranscriptLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedThreadId, threadTranscriptLimit]);

  useEffect(() => {
    if (!selectedSession) {
      setSessionTranscriptRaw(null);
      setSessionTranscriptLimit(250);
      return;
    }
    let cancelled = false;
    setSessionTranscriptLoading(true);
    apiGet<unknown>(
      `/api/session-transcript?provider=${encodeURIComponent(selectedSession.provider)}&file_path=${encodeURIComponent(selectedSession.file_path)}&limit=${sessionTranscriptLimit}`,
    )
      .then((data) => {
        if (!cancelled) setSessionTranscriptRaw(data);
      })
      .catch(() => {
        if (!cancelled) setSessionTranscriptRaw(null);
      })
      .finally(() => {
        if (!cancelled) setSessionTranscriptLoading(false);
      });
    return () => {
      cancelled = true;
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
    providerSessionAction.isPending;

  const showProviders = layoutView === "overview" || layoutView === "providers";
  const showThreadsTable = layoutView === "overview" || layoutView === "threads";
  const showForensics = layoutView === "overview" || layoutView === "forensics";
  const showRouting = layoutView === "overview" || layoutView === "routing";
  const showDetails = layoutView === "overview" || layoutView === "threads" || layoutView === "forensics";

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

  const toggleSelectAllProviderRows = (checked: boolean) => {
    if (checked) {
      const next: Record<string, boolean> = { ...selectedProviderFiles };
      providerSessionRows.forEach((row) => {
        next[row.file_path] = true;
      });
      setSelectedProviderFiles(next);
      return;
    }
    const next: Record<string, boolean> = { ...selectedProviderFiles };
    providerSessionRows.forEach((row) => {
      delete next[row.file_path];
    });
    setSelectedProviderFiles(next);
  };

  const runProviderAction = (action: "archive_local" | "delete_local", dryRun: boolean) => {
    if (providerView === "all" || selectedProviderFilePaths.length === 0) return;
    const key = providerActionSelectionKey(
      providerView,
      action,
      selectedProviderFilePaths,
    );
    const scopedToken = providerActionTokens[key] ?? "";
    const shouldPreview = !dryRun && !scopedToken;
    providerSessionAction.mutate({
      provider: providerView,
      action,
      file_paths: selectedProviderFilePaths,
      dry_run: shouldPreview ? true : dryRun,
      confirm_token: dryRun ? "" : scopedToken,
    });
  };

  const runSingleProviderAction = (
    provider: Exclude<ProviderView, "all">,
    filePath: string,
    action: "archive_local" | "delete_local",
    dryRun: boolean,
  ) => {
    const key = providerActionSelectionKey(provider, action, [filePath]);
    const scopedToken = providerActionTokens[key] ?? "";
    const shouldPreview = !dryRun && !scopedToken;
    providerSessionAction.mutate({
      provider,
      action,
      file_paths: [filePath],
      dry_run: shouldPreview ? true : dryRun,
      confirm_token: dryRun ? "" : scopedToken,
    });
  };

  /* ================================================================ */
  /*  Public API                                                      */
  /* ================================================================ */

  return {
    /* UI state */
    theme, setTheme,
    locale, setLocale,
    layoutView, setLayoutView,
    query, setQuery,
    filterMode, setFilterMode,
    providerView, setProviderView,
    selected, setSelected,
    selectedProviderFiles, setSelectedProviderFiles,
    selectedThreadId, setSelectedThreadId,
    selectedSessionPath, setSelectedSessionPath,

    /* query results (raw react-query objects for error states) */
    runtime, threads, recovery,
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
    providerSessionActionError: providerSessionAction.isError,

    /* derived – threads */
    rows, filteredRows, visibleRows,
    selectedIds, allFilteredSelected,
    pinnedCount, highRiskCount,

    /* derived – analysis / cleanup */
    analysisRaw, cleanupRaw,
    analysisData, cleanupData,
    selectedImpactRows,

    /* derived – providers */
    providers, providerSummary,
    providerTabs, providerSessionRows,
    providerSessionSummary,
    allProviderRowsSelected,
    selectedProviderLabel,
    selectedProviderFilePaths,
    canRunProviderAction,
    providerActionData,
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
    runtimeLoading, recoveryLoading, threadsLoading,
    providerMatrixLoading, providerSessionsLoading,
    parserLoading, executionGraphLoading,

    /* computed UI flags */
    busy,
    showProviders, showThreadsTable,
    showForensics, showRouting, showDetails,

    /* action dispatchers */
    toggleSelectAllFiltered,
    toggleSelectAllProviderRows,
    runProviderAction,
    runSingleProviderAction,
  };
}
