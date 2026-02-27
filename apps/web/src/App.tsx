import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiEnvelope, BulkThreadActionResult } from "@codex/shared-contracts";
import { KpiCard } from "./components/KpiCard";
import { apiGet, apiPost } from "./api";

type RuntimeEnvelope = ApiEnvelope<{
  python_backend: { reachable: boolean; latency_ms: number | null; url: string };
  process: { pid: number; uptime_sec: number; node: string };
  tmux: { sessions: string[] };
}>;

type ThreadRow = {
  thread_id: string;
  title: string;
  risk_score: number;
  is_pinned: boolean;
  source: string;
  project_bucket?: string;
};

type ThreadsResponse = {
  rows?: ThreadRow[];
  total?: number;
  schema_version?: string;
};

type RecoveryResponse = {
  summary?: { backup_sets: number; checklist_done: number; checklist_total: number };
  generated_at?: string;
};

type ProviderMatrixProvider = {
  provider: string;
  name: string;
  status: "active" | "detected" | "missing";
  capability_level: "full" | "read-only" | "unavailable";
  capabilities: {
    read_sessions: boolean;
    analyze_context: boolean;
    safe_cleanup: boolean;
    hard_delete: boolean;
  };
  evidence?: {
    session_log_count?: number;
    notes?: string;
  };
};

type ProviderMatrixEnvelope = ApiEnvelope<{
  summary?: {
    total: number;
    active: number;
    detected: number;
    read_analyze_ready: number;
    safe_cleanup_ready: number;
    hard_delete_ready: number;
  };
  providers?: ProviderMatrixProvider[];
}>;

type AnalyzeDeleteReport = {
  id: string;
  exists: boolean;
  title?: string;
  risk_level?: string;
  risk_score?: number;
  summary?: string;
  parents?: string[];
  impacts?: string[];
};

type AnalyzeDeleteData = {
  count?: number;
  reports?: AnalyzeDeleteReport[];
};

type CleanupPreviewData = {
  ok?: boolean;
  mode?: string;
  confirm_token_expected?: string;
  target_file_count?: number;
  requested_ids?: number;
  confirm_help?: string;
};

type FilterMode = "all" | "high-risk" | "pinned";

const PAGE_SIZE = 300;
const INITIAL_CHUNK = 80;
const CHUNK_SIZE = 80;

function extractEnvelopeData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;
  const r = payload as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(r, "data")) {
    return (r.data as T | null) ?? null;
  }
  return payload as T;
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export function App() {
  const [query, setQuery] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [renderLimit, setRenderLimit] = useState(INITIAL_CHUNK);
  const [analysisRaw, setAnalysisRaw] = useState<unknown>(null);
  const [cleanupRaw, setCleanupRaw] = useState<unknown>(null);
  const queryClient = useQueryClient();
  const deferredQuery = useDeferredValue(query);

  const runtime = useQuery({
    queryKey: ["runtime"],
    queryFn: () => apiGet<RuntimeEnvelope>("/api/agent-runtime"),
    refetchInterval: 5000,
  });

  const threads = useQuery({
    queryKey: ["threads", deferredQuery],
    queryFn: () =>
      apiGet<ThreadsResponse>(
        `/api/threads?offset=0&limit=${PAGE_SIZE}&q=${encodeURIComponent(deferredQuery)}&sort=updated_desc`,
      ),
  });

  const recovery = useQuery({
    queryKey: ["recovery"],
    queryFn: () => apiGet<RecoveryResponse>("/api/recovery-center"),
    refetchInterval: 15000,
  });

  const providerMatrix = useQuery({
    queryKey: ["provider-matrix"],
    queryFn: () => apiGet<ProviderMatrixEnvelope>("/api/provider-matrix"),
    refetchInterval: 30000,
  });

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

  const rows = threads.data?.rows ?? [];
  const filteredRows = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !`${row.title ?? ""} ${row.thread_id}`.toLowerCase().includes(q)) return false;
      if (filterMode === "high-risk") return Number(row.risk_score ?? 0) >= 70;
      if (filterMode === "pinned") return Boolean(row.is_pinned);
      return true;
    });
  }, [rows, deferredQuery, filterMode]);

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
  const providers = providerMatrix.data?.data?.providers ?? [];
  const providerSummary = providerMatrix.data?.data?.summary;

  const busy =
    bulkPin.isPending ||
    bulkUnpin.isPending ||
    bulkArchive.isPending ||
    analyzeDelete.isPending ||
    cleanupDryRun.isPending;

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

  return (
    <main className="page">
      <section className="hero">
        <h1>Codex Mission Control</h1>
        <p>Tauri + Fastify 하이브리드 운영 대시보드</p>
      </section>

      <section className="kpi-grid">
        <KpiCard
          label="Python Backend"
          value={runtime.data?.data?.python_backend.reachable ? "Reachable" : "Down"}
          hint={runtime.data?.data?.python_backend.url}
        />
        <KpiCard
          label="Latency"
          value={runtime.data?.data?.python_backend.latency_ms ?? "-"}
          hint="ms"
        />
        <KpiCard label="Pinned" value={pinnedCount} hint={`/${rows.length}`} />
        <KpiCard label="High Risk" value={highRiskCount} hint="risk_score >= 70" />
        <KpiCard
          label="Recovery"
          value={`${recovery.data?.summary?.checklist_done ?? 0}/${recovery.data?.summary?.checklist_total ?? 0}`}
          hint={`backup sets ${recovery.data?.summary?.backup_sets ?? 0}`}
        />
      </section>

      <section className="panel provider-panel">
        <header>
          <h2>Multi AI Provider Matrix</h2>
          <span>
            active {providerSummary?.active ?? 0}/{providerSummary?.total ?? providers.length}
          </span>
        </header>
        <div className="provider-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Status</th>
                <th>Capability</th>
                <th>Read</th>
                <th>Analyze</th>
                <th>Safe Cleanup</th>
                <th>Hard Delete</th>
                <th>Logs</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.provider}>
                  <td className="title-col">{p.name}</td>
                  <td>
                    <span className={`status-pill status-${p.status}`}>{p.status}</span>
                  </td>
                  <td>{p.capability_level}</td>
                  <td>{p.capabilities.read_sessions ? "Y" : "-"}</td>
                  <td>{p.capabilities.analyze_context ? "Y" : "-"}</td>
                  <td>{p.capabilities.safe_cleanup ? "Y" : "-"}</td>
                  <td>{p.capabilities.hard_delete ? "Y" : "-"}</td>
                  <td>{p.evidence?.session_log_count ?? 0}</td>
                </tr>
              ))}
              {providers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="sub-hint">
                    provider matrix loading...
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="toolbar">
        <input
          placeholder="스레드 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
        />
        <select
          className="filter-select"
          value={filterMode}
          onChange={(e) => setFilterMode(e.target.value as FilterMode)}
        >
          <option value="all">전체</option>
          <option value="high-risk">High Risk (70+)</option>
          <option value="pinned">Pinned</option>
        </select>
        <button disabled={selectedIds.length === 0 || busy} onClick={() => bulkPin.mutate(selectedIds)}>
          선택 Pin
        </button>
        <button disabled={selectedIds.length === 0 || busy} onClick={() => bulkUnpin.mutate(selectedIds)}>
          선택 Unpin
        </button>
        <button
          disabled={selectedIds.length === 0 || busy}
          onClick={() => bulkArchive.mutate(selectedIds)}
        >
          선택 Local Archive
        </button>
        <button disabled={selectedIds.length === 0 || busy} onClick={() => analyzeDelete.mutate(selectedIds)}>
          삭제 영향 분석
        </button>
        <button disabled={selectedIds.length === 0 || busy} onClick={() => cleanupDryRun.mutate(selectedIds)}>
          정리 Dry-Run
        </button>
      </section>

      <section className="ops-layout">
        <section className="panel">
          <header>
            <h2>Threads</h2>
            <span>
              {filteredRows.length} filtered / {threads.data?.total ?? rows.length} total
            </span>
          </header>
          <div className="sub-toolbar">
            <label className="check-inline">
              <input type="checkbox" checked={allFilteredSelected} onChange={(e) => toggleSelectAllFiltered(e.target.checked)} />
              현재 필터 전체 선택
            </label>
            <span className="sub-hint">
              selected {selectedIds.length} · rendered {visibleRows.length}/{filteredRows.length}
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Title</th>
                  <th>Risk</th>
                  <th>Pinned</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const checked = Boolean(selected[row.thread_id]);
                  const isHighRisk = Number(row.risk_score ?? 0) >= 70;
                  return (
                    <tr key={row.thread_id} className={isHighRisk ? "risk-row" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setSelected((prev) => ({ ...prev, [row.thread_id]: e.target.checked }))}
                        />
                      </td>
                      <td className="title-col">{row.title || row.thread_id}</td>
                      <td>{row.risk_score ?? 0}</td>
                      <td>{row.is_pinned ? "Y" : "N"}</td>
                      <td>{row.source || row.project_bucket || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {threads.isError ? <div className="error-box">threads load error</div> : null}
        </section>

        <section className="panel impact-panel">
          <header>
            <h2>삭제 영향 / 정리 안전성</h2>
            <span>parents · token · drill-safe</span>
          </header>
          <div className="impact-body">
            <div className="impact-kv">
              <span>선택 스레드</span>
              <strong>{selectedIds.length}</strong>
            </div>
            <div className="impact-kv">
              <span>High Risk 포함</span>
              <strong>{selectedIds.filter((id) => (rows.find((r) => r.thread_id === id)?.risk_score ?? 0) >= 70).length}</strong>
            </div>
            <div className="impact-kv">
              <span>정리 토큰</span>
              <strong>{cleanupData?.confirm_token_expected ?? "-"}</strong>
            </div>
            <p className="sub-hint">{cleanupData?.confirm_help ?? "정리 실행 전 Dry-Run 토큰을 먼저 확인하세요."}</p>

            <div className="impact-list">
              <h3>선택된 스레드 영향 요약</h3>
              {selectedImpactRows.length === 0 ? (
                <p className="sub-hint">삭제 영향 분석 버튼으로 부모 영향(Parents) 확인</p>
              ) : (
                <ul>
                  {selectedImpactRows.slice(0, 12).map((row) => (
                    <li key={row.id}>
                      <strong>{row.title || row.id}</strong>
                      <span>{row.risk_level ?? "unknown"} / {row.risk_score ?? 0}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {analysisRaw ? (
              <details>
                <summary>분석 원본(JSON)</summary>
                <pre>{prettyJson(analysisRaw)}</pre>
              </details>
            ) : null}
            {cleanupRaw ? (
              <details>
                <summary>Dry-Run 원본(JSON)</summary>
                <pre>{prettyJson(cleanupRaw)}</pre>
              </details>
            ) : null}
            {(analyzeDelete.isError || cleanupDryRun.isError) ? (
              <div className="error-box">analysis/dry-run 요청 실패</div>
            ) : null}
          </div>
        </section>
      </section>

      {runtime.isError ? <div className="error-box">runtime 연결 실패</div> : null}
      {recovery.isError ? <div className="error-box">recovery 데이터 로드 실패</div> : null}
      {providerMatrix.isError ? <div className="error-box">provider matrix 로드 실패</div> : null}
      {busy ? (
        <div className="busy-indicator">
          batch action running...
        </div>
      ) : null}
    </main>
  );
}
