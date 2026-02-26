import { useMemo, useState } from "react";
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

const PAGE_SIZE = 120;

export function App() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  const runtime = useQuery({
    queryKey: ["runtime"],
    queryFn: () => apiGet<RuntimeEnvelope>("/api/agent-runtime"),
    refetchInterval: 5000,
  });

  const threads = useQuery({
    queryKey: ["threads"],
    queryFn: () =>
      apiGet<ThreadsResponse>(`/api/threads?offset=0&limit=${PAGE_SIZE}&q=${encodeURIComponent(query)}&sort=updated_desc`),
  });

  const recovery = useQuery({
    queryKey: ["recovery"],
    queryFn: () => apiGet<RecoveryResponse>("/api/recovery-center"),
    refetchInterval: 15000,
  });

  const bulkPin = useMutation({
    mutationFn: (threadIds: string[]) =>
      apiPost<ApiEnvelope<BulkThreadActionResult>>("/api/bulk-thread-action", { action: "pin", thread_ids: threadIds }),
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

  const rows = threads.data?.rows ?? [];
  const selectedIds = Object.entries(selected)
    .filter(([, on]) => on)
    .map(([id]) => id);

  const pinnedCount = useMemo(() => rows.filter((r) => r.is_pinned).length, [rows]);
  const highRiskCount = useMemo(() => rows.filter((r) => Number(r.risk_score || 0) >= 70).length, [rows]);

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

      <section className="toolbar">
        <input
          placeholder="스레드 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
        />
        <button disabled={selectedIds.length === 0 || bulkPin.isPending} onClick={() => bulkPin.mutate(selectedIds)}>
          선택 Pin
        </button>
        <button
          disabled={selectedIds.length === 0 || bulkArchive.isPending}
          onClick={() => bulkArchive.mutate(selectedIds)}
        >
          선택 Local Archive
        </button>
      </section>

      <section className="panel">
        <header>
          <h2>Threads</h2>
          <span>{threads.data?.total ?? rows.length} items</span>
        </header>
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
              {rows.map((row) => {
                const checked = Boolean(selected[row.thread_id]);
                return (
                  <tr key={row.thread_id}>
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
                    <td>{row.source || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
