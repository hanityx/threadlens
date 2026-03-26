import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api";
import { extractEnvelopeData, formatDateTime } from "../../lib/helpers";
import type {
  Locale,
  SyncLensActionPreview,
  SyncLensEnvelope,
  SyncLensHostSnapshot,
  SyncLensIssue,
} from "../../types";

type Props = {
  locale: Locale;
};

type CopyText = {
  title: string;
  subtitle: string;
  readOnly: string;
  statusAligned: string;
  statusDrifted: string;
  statusPartial: string;
  score: string;
  generatedAt: string;
  refreshing: string;
  refreshNow: string;
  hostPrimary: string;
  hostSecondary: string;
  hostReachable: string;
  hostUnreachable: string;
  sessions: string;
  threadOrder: string;
  dbThreads: string;
  dbArchived: string;
  latestRollout: string;
  activeRoots: string;
  diffTitle: string;
  diffThreadOrder: string;
  diffRollouts: string;
  diffDbThreads: string;
  diffArchived: string;
  hashConfig: string;
  hashState: string;
  equal: string;
  different: string;
  issuesTitle: string;
  noIssues: string;
  actionsTitle: string;
  actionDirection: string;
  actionRisk: string;
  actionCommand: string;
  actionDisabled: string;
};

const COPY: Record<Locale, CopyText> = {
  en: {
    title: "Mac Sync Lens",
    subtitle: "MacBook vs Mac mini thread/state drift map",
    readOnly: "Read-only mode: no machine writes. Preview only.",
    statusAligned: "Aligned",
    statusDrifted: "Drifted",
    statusPartial: "Partial",
    score: "Score",
    generatedAt: "Checked",
    refreshing: "Refreshing...",
    refreshNow: "Refresh",
    hostPrimary: "Primary (current)",
    hostSecondary: "Secondary (remote)",
    hostReachable: "reachable",
    hostUnreachable: "unreachable",
    sessions: "Session files",
    threadOrder: "Thread order",
    dbThreads: "DB threads",
    dbArchived: "DB archived",
    latestRollout: "Latest rollout",
    activeRoots: "Active roots",
    diffTitle: "Drift Visualization",
    diffThreadOrder: "Thread order delta",
    diffRollouts: "Rollout file delta",
    diffDbThreads: "DB thread delta",
    diffArchived: "Archived delta",
    hashConfig: "Config hash",
    hashState: "Global state hash",
    equal: "Equal",
    different: "Different",
    issuesTitle: "Detected Issues",
    noIssues: "No drift issue detected in current snapshot.",
    actionsTitle: "One-click Sync (Preview)",
    actionDirection: "Direction",
    actionRisk: "Risk",
    actionCommand: "Command preview",
    actionDisabled: "Execution disabled",
  },
};

function statusLabel(status: string, copy: CopyText): string {
  if (status === "aligned") return copy.statusAligned;
  if (status === "drifted") return copy.statusDrifted;
  return copy.statusPartial;
}

function hashShort(value: string): string {
  if (!value) return "-";
  return value.slice(0, 12);
}

function riskClass(risk: string): string {
  if (risk === "high") return "is-high";
  if (risk === "medium") return "is-medium";
  return "is-low";
}

function severityClass(severity: string): string {
  if (severity === "high") return "is-high";
  if (severity === "medium") return "is-medium";
  return "is-low";
}

function HostCard({
  host,
  title,
  copy,
}: {
  host: SyncLensHostSnapshot;
  title: string;
  copy: CopyText;
}) {
  return (
    <article className="sync-lens-host-card">
      <div className="sync-lens-host-top">
        <strong>{title}</strong>
        <span className={`sync-lens-reach ${host.reachable ? "is-up" : "is-down"}`}>
          {host.reachable ? copy.hostReachable : copy.hostUnreachable}
        </span>
      </div>
      <div className="mono-sub">{host.hostname || "-"}</div>
      <div className="sync-lens-host-grid">
        <div>
          <span>{copy.sessions}</span>
          <strong>{host.rollout_file_count}</strong>
        </div>
        <div>
          <span>{copy.threadOrder}</span>
          <strong>{host.thread_order_count}</strong>
        </div>
        <div>
          <span>{copy.dbThreads}</span>
          <strong>{host.db_thread_count ?? "-"}</strong>
        </div>
        <div>
          <span>{copy.dbArchived}</span>
          <strong>{host.db_archived_count ?? "-"}</strong>
        </div>
      </div>
      <div className="sync-lens-host-meta">
        <span>{copy.latestRollout}</span>
        <strong className="mono-sub">{hashShort(host.latest_rollout_id)}</strong>
      </div>
      <div className="sync-lens-host-meta">
        <span>{copy.activeRoots}</span>
        <strong className="mono-sub">{host.active_roots.length}</strong>
      </div>
      {host.errors.length > 0 ? (
        <div className="sync-lens-host-errors">
          {host.errors.map((item) => (
            <span key={`${host.alias}-${item}`} className="mono-sub">
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function DriftBar({
  label,
  value,
  maxAbs,
}: {
  label: string;
  value: number;
  maxAbs: number;
}) {
  const width = Math.max(6, Math.round((Math.abs(value) / maxAbs) * 100));
  return (
    <div className="sync-lens-drift-row">
      <div className="sync-lens-drift-top">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="sync-lens-drift-track">
        <div
          className={`sync-lens-drift-fill ${
            value === 0 ? "is-zero" : value > 0 ? "is-positive" : "is-negative"
          }`}
          style={{ width: `${Math.min(width, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function SyncLensPanel({ locale }: Props) {
  const copy = COPY[locale];
  const query = useQuery({
    queryKey: ["sync-lens"],
    queryFn: ({ signal }) => apiGet<SyncLensEnvelope>("/api/sync-lens", { signal }),
    staleTime: 10000,
    refetchInterval: 30000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const data = useMemo(
    () =>
      extractEnvelopeData<NonNullable<SyncLensEnvelope["data"]>>(query.data),
    [query.data],
  );

  const driftMaxAbs = useMemo(() => {
    if (!data) return 1;
    return Math.max(
      1,
      Math.abs(data.diff.thread_order_delta),
      Math.abs(data.diff.rollout_file_delta),
      Math.abs(data.diff.db_thread_delta ?? 0),
      Math.abs(data.diff.archived_delta ?? 0),
    );
  }, [data]);

  return (
    <section className="panel sync-lens-panel">
      <header>
        <div>
          <h2>{copy.title}</h2>
          <span className="sync-lens-subtitle">{copy.subtitle}</span>
        </div>
        <div className="sync-lens-header-actions">
          <button
            type="button"
            className="btn-outline"
            onClick={() => {
              void query.refetch();
            }}
            disabled={query.isFetching}
          >
            {query.isFetching ? copy.refreshing : copy.refreshNow}
          </button>
        </div>
      </header>

      <div className="impact-body sync-lens-body">
        <div className="sync-lens-summary">
          <div className="sync-lens-status-wrap">
            <span className={`sync-lens-status is-${data?.status ?? "partial"}`}>
              {statusLabel(data?.status ?? "partial", copy)}
            </span>
            <span className="sub-hint">{copy.readOnly}</span>
          </div>
          <div className="sync-lens-score-wrap">
            <span className="sync-lens-score-label">{copy.score}</span>
            <strong className="sync-lens-score-value">{data?.score ?? "-"}</strong>
            <div className="sync-lens-score-track" role="presentation">
              <div
                className={`sync-lens-score-fill is-${(data?.score ?? 0) >= 80 ? "good" : (data?.score ?? 0) >= 50 ? "warn" : "bad"}`}
                style={{ width: `${Math.max(4, Math.min(100, data?.score ?? 0))}%` }}
              />
            </div>
            <span className="mono-sub">
              {copy.generatedAt} {formatDateTime(data?.generated_at)}
            </span>
          </div>
        </div>

        {query.isLoading ? <div className="skeleton-line" /> : null}
        {query.isError ? <div className="error-box">Failed to load Sync Lens</div> : null}

        {data ? (
          <>
            <div className="sync-lens-host-grid-wrap">
              <HostCard host={data.primary} title={copy.hostPrimary} copy={copy} />
              <HostCard host={data.secondary} title={copy.hostSecondary} copy={copy} />
            </div>

            <section className="sync-lens-drift-block">
              <h3>{copy.diffTitle}</h3>
              <div className="sync-lens-drift-grid">
                <DriftBar
                  label={copy.diffThreadOrder}
                  value={data.diff.thread_order_delta}
                  maxAbs={driftMaxAbs}
                />
                <DriftBar
                  label={copy.diffRollouts}
                  value={data.diff.rollout_file_delta}
                  maxAbs={driftMaxAbs}
                />
                <DriftBar
                  label={copy.diffDbThreads}
                  value={data.diff.db_thread_delta ?? 0}
                  maxAbs={driftMaxAbs}
                />
                <DriftBar
                  label={copy.diffArchived}
                  value={data.diff.archived_delta ?? 0}
                  maxAbs={driftMaxAbs}
                />
              </div>
              <div className="sync-lens-hash-grid">
                <div>
                  <span>{copy.hashConfig}</span>
                  <strong>{data.diff.config_hash_equal ? copy.equal : copy.different}</strong>
                </div>
                <div>
                  <span>{copy.hashState}</span>
                  <strong>{data.diff.global_state_hash_equal ? copy.equal : copy.different}</strong>
                </div>
                <div>
                  <span>Primary hash</span>
                  <strong className="mono-sub">{hashShort(data.primary.global_state_sha256)}</strong>
                </div>
                <div>
                  <span>Secondary hash</span>
                  <strong className="mono-sub">{hashShort(data.secondary.global_state_sha256)}</strong>
                </div>
              </div>
            </section>

            <section className="sync-lens-issues-block">
              <h3>{copy.issuesTitle}</h3>
              {data.issues.length === 0 ? (
                <p className="sub-hint">{copy.noIssues}</p>
              ) : (
                <div className="sync-lens-issues-grid">
                  {data.issues.map((issue: SyncLensIssue) => (
                    <article key={issue.id} className="sync-lens-issue-card">
                      <div className="sync-lens-issue-top">
                        <strong>{issue.title}</strong>
                        <span className={`sync-lens-issue-severity ${severityClass(issue.severity)}`}>
                          {issue.severity}
                        </span>
                      </div>
                      <p>{issue.detail}</p>
                      <span className="mono-sub">{issue.hint}</span>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="sync-lens-actions-block">
              <h3>{copy.actionsTitle}</h3>
              <div className="sync-lens-actions-grid">
                {data.actions.map((action: SyncLensActionPreview) => (
                  <article key={action.id} className="sync-lens-action-card">
                    <div className="sync-lens-action-top">
                      <strong>{action.title}</strong>
                      <span className={`sync-lens-action-risk ${riskClass(action.risk)}`}>
                        {copy.actionRisk}: {action.risk}
                      </span>
                    </div>
                    <div className="sync-lens-action-meta">
                      <span>{copy.actionDirection}</span>
                      <strong>{action.direction}</strong>
                    </div>
                    <div className="sync-lens-action-meta">
                      <span>{copy.actionCommand}</span>
                      <code>{action.command_preview}</code>
                    </div>
                    <button type="button" disabled>
                      {copy.actionDisabled}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}
