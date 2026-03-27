import path from "node:path";
import {
  CHAT_DIR,
  CODEX_GLOBAL_STATE_FILE,
  CODEX_HOME,
  LABS_DIR,
} from "../../lib/constants.js";
import {
  pathExists,
  readJsonFile,
} from "../../lib/utils.js";
import { getProviderSessionScan } from "../providers/search.js";
import { loadCodexUiState } from "./state.js";
import { collectCodexLocalRefs, readCodexSessionMeta } from "./metadata.js";

type OverviewThreadRow = {
  id: string;
  thread_id: string;
  title: string;
  title_source: string;
  pinned: boolean;
  in_order: boolean;
  order_index: number;
  has_local_data: boolean;
  project_buckets: string[];
  cwd: string;
  timestamp: string;
  has_session_log: boolean;
  session_source: string;
  history_text: string;
  local_cache_paths: string[];
  inferred_time: string;
  session_line_count: number;
  session_tool_calls: number;
  session_bytes: number;
  last_activity: string;
  activity_status: string;
  activity_age_min: number | null;
  cache_bytes: number;
  context_score: number;
  age_days: number | null;
  risk_score: number;
  risk_level: "high" | "medium" | "low";
  risk_tags: string[];
  is_gui_thread: boolean;
  gui_has_runtime_link: boolean;
  matches_active_workspace: boolean;
  gui_hidden_candidate: boolean;
};

const OVERVIEW_CACHE_TTL_MS = 20_000;
let overviewCache:
  | {
      full?: { expires_at: number; payload: Record<string, unknown> };
      lite?: { expires_at: number; payload: Record<string, unknown> };
    }
  | null = null;

function parseAgeDetails(isoValue: string): {
  activity_status: string;
  activity_age_min: number | null;
  age_days: number | null;
} {
  if (!isoValue) {
    return {
      activity_status: "unknown",
      activity_age_min: null,
      age_days: null,
    };
  }
  const ts = Date.parse(isoValue);
  if (!Number.isFinite(ts)) {
    return {
      activity_status: "unknown",
      activity_age_min: null,
      age_days: null,
    };
  }
  const ageMs = Math.max(0, Date.now() - ts);
  const ageMin = Math.floor(ageMs / 60_000);
  const ageDays = Math.floor(ageMs / 86_400_000);
  const activityStatus =
    ageMs <= 5 * 60_000
      ? "running"
      : ageMs <= 60 * 60_000
        ? "warm"
        : ageMs <= 24 * 60 * 60_000
          ? "recent"
          : "stale";
  return {
    activity_status: activityStatus,
    activity_age_min: ageMin,
    age_days: ageDays,
  };
}

function calcContextScore(sizeBytes: number, formatOk: boolean): number {
  const estimatedLines = sizeBytes > 0 ? Math.min(5000, Math.max(1, Math.floor(sizeBytes / 180))) : 0;
  const estimatedTools = sizeBytes > 0 ? Math.min(1200, Math.floor(sizeBytes / 12000)) : 0;
  const sessionMb = sizeBytes / (1024 * 1024);
  const score =
    Math.min(30, (estimatedLines / 120) * 30) +
    Math.min(30, (estimatedTools / 25) * 30) +
    Math.min(20, (sessionMb / 2) * 20) +
    (formatOk ? 0 : 12);
  return Math.round(Math.min(100, score));
}

function calcRisk(
  contextScore: number,
  activityAgeDays: number | null,
  row: {
    pinned: boolean;
    in_order: boolean;
    has_local_data: boolean;
    session_source: string;
    cwd: string;
    title_source: string;
  },
): { risk_score: number; risk_level: "high" | "medium" | "low"; risk_tags: string[] } {
  const tags: string[] = [];
  let risk = 0;
  const isInternal = row.title_source !== "global-state";
  if (isInternal) {
    tags.push("internal");
    risk += 18;
  }
  if (contextScore >= 85) {
    tags.push("ctx-critical");
    risk += 40;
  } else if (contextScore >= 70) {
    tags.push("ctx-high");
    risk += 28;
  } else if (contextScore >= 50) {
    tags.push("ctx-medium");
    risk += 12;
  }
  if (activityAgeDays !== null && activityAgeDays >= 30) {
    tags.push("stale");
    risk += isInternal ? 10 : 4;
  }
  if (
    isInternal &&
    row.has_local_data &&
    !row.in_order &&
    !row.pinned &&
    row.session_source !== "archived_sessions"
  ) {
    tags.push("orphan-candidate");
    risk += 24;
  }
  if (!row.cwd.trim()) {
    tags.push("no-cwd");
    risk += 8;
  }
  const riskScore = Math.max(0, Math.min(100, Math.round(risk)));
  const riskLevel =
    riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low";
  return {
    risk_score: riskScore,
    risk_level: riskLevel,
    risk_tags: tags,
  };
}

async function listLabsProjects(limit = 30) {
  const exists = await pathExists(LABS_DIR);
  if (!exists) return [];
  try {
    const entries = await (await import("node:fs/promises")).readdir(LABS_DIR, {
      withFileTypes: true,
    });
    return entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit)
      .map((entry) => ({
        name: entry.name,
        path: path.join(LABS_DIR, entry.name),
        is_git: false,
      }));
  } catch {
    return [];
  }
}

async function buildOverview(includeThreads: boolean, forceRefresh: boolean) {
  const state = await loadCodexUiState();
  const scanLimit = includeThreads ? 240 : 160;
  const scan = await getProviderSessionScan("codex", scanLimit, {
    forceRefresh,
  });
  const orderIndex = new Map(state.order.map((id, index) => [id, index]));
  const pinned = new Set(state.pinned);
  const archived = new Set(state.archived);
  const activeRoots = state.active;
  const visibleScanRows = scan.rows.filter((row) => !archived.has(row.session_id));
  const { refs } = await collectCodexLocalRefs(
    visibleScanRows.map((row) => row.session_id),
    CHAT_DIR,
  );
  const sessionMetaByThreadId = new Map(
    await Promise.all(
      visibleScanRows.map(async (row) => [row.session_id, await readCodexSessionMeta(row.file_path)] as const),
    ),
  );

  const rows: OverviewThreadRow[] = scan.rows
    .filter((row) => !archived.has(row.session_id))
    .map((row) => {
    const threadId = row.session_id;
    const stateTitle = state.titles[threadId] || "";
    const title = stateTitle || row.display_title || row.probe.detected_title || threadId;
    const titleSource = stateTitle ? "global-state" : row.probe.title_source || "provider-scan";
    const inferredTime = row.mtime || "";
    const age = parseAgeDetails(inferredTime);
    const localRef = refs.get(threadId);
    const sessionMeta = sessionMetaByThreadId.get(threadId) ?? { has_session_log: true, cwd: "" };
    const hasLocalData = Boolean(localRef?.has_local_data);
    const projectBuckets = Array.from(localRef?.project_buckets ?? []).sort();
    const cwd = sessionMeta.cwd;
    const matchesActiveWorkspace = cwd
      ? activeRoots.some((root) => {
          const normalizedRoot = String(root ?? "").trim();
          return Boolean(
            normalizedRoot &&
            (cwd === normalizedRoot || cwd.startsWith(`${normalizedRoot}${path.sep}`)),
          );
        })
      : false;
    const contextScore = calcContextScore(row.size_bytes, row.probe.ok);
    const risk = calcRisk(contextScore, age.age_days, {
      pinned: pinned.has(threadId),
      in_order: orderIndex.has(threadId),
      has_local_data: hasLocalData,
      session_source: row.source,
      cwd,
      title_source: titleSource,
    });
      return {
        id: threadId,
        thread_id: threadId,
        title,
        title_source: titleSource,
        pinned: pinned.has(threadId),
        in_order: orderIndex.has(threadId),
        order_index: orderIndex.get(threadId) ?? 999999,
        has_local_data: hasLocalData,
        project_buckets: projectBuckets,
        cwd,
        timestamp: row.mtime,
        has_session_log: sessionMeta.has_session_log,
        session_source: row.source,
        history_text: "",
        local_cache_paths: [row.file_path],
        inferred_time: inferredTime,
        session_line_count: Math.min(5000, Math.max(1, Math.floor(row.size_bytes / 180))),
        session_tool_calls: Math.min(1200, Math.max(0, Math.floor(row.size_bytes / 12000))),
        session_bytes: row.size_bytes,
        last_activity: row.mtime,
        activity_status: age.activity_status,
        activity_age_min: age.activity_age_min,
        cache_bytes: 0,
        context_score: contextScore,
        age_days: age.age_days,
        risk_score: risk.risk_score,
        risk_level: risk.risk_level,
        risk_tags: risk.risk_tags,
        is_gui_thread: titleSource === "global-state",
        gui_has_runtime_link: true,
        matches_active_workspace: matchesActiveWorkspace,
        gui_hidden_candidate:
          titleSource === "global-state" &&
          !matchesActiveWorkspace &&
          activeRoots.length > 0,
      };
    });

  rows.sort((a, b) => {
    if (a.order_index !== b.order_index) return a.order_index - b.order_index;
    return Date.parse(b.timestamp || "") - Date.parse(a.timestamp || "");
  });

  const riskSummary = {
    high: rows.filter((row) => row.risk_level === "high").length,
    medium: rows.filter((row) => row.risk_level === "medium").length,
    low: rows.filter((row) => row.risk_level === "low").length,
    internal_total: rows.filter((row) => row.title_source !== "global-state").length,
    orphan_candidates: rows.filter((row) => row.risk_tags.includes("orphan-candidate")).length,
    stale_total: rows.filter((row) => row.risk_tags.includes("stale")).length,
    ctx_high_total: rows.filter((row) => row.context_score >= 70).length,
  };

  const recommendations: Array<{
    id: string;
    label: string;
    description: string;
    filters: Record<string, unknown>;
  }> = [];
  if (riskSummary.orphan_candidates > 0) {
    recommendations.push({
      id: "cleanup_orphans",
      label: "Review orphan candidates",
      description: `Preview and clean up ${riskSummary.orphan_candidates} threads tagged as orphan-candidate.`,
      filters: { scope: "internal", minRisk: 40 },
    });
  }
  if (riskSummary.ctx_high_total > 0) {
    recommendations.push({
      id: "reduce_context_pressure",
      label: "Reduce context pressure",
      description: `${riskSummary.ctx_high_total} threads have a context score of 70 or higher.`,
      filters: { scope: "all", minCtx: 70, sort: "ctx_desc" },
    });
  }

  const workspaces = state.workspaces.map((workspacePath) => ({
    path: workspacePath,
    exists: true,
    active: state.active.includes(workspacePath),
    label: state.labels[workspacePath] || "",
  }));

  const syncStatus = {
    share_mode: "partial",
    gui_sidebar_threads: rows.filter((row) => row.is_gui_thread).length,
    terminal_session_threads: rows.filter((row) => row.has_session_log).length,
    linked_gui_terminal_threads: rows.filter(
      (row) => row.is_gui_thread && row.has_session_log,
    ).length,
    internal_only_threads: rows.filter((row) => !row.is_gui_thread).length,
    gui_meta_only_threads: 0,
    gui_unknown_cwd_threads: rows.filter((row) => row.is_gui_thread && !row.cwd).length,
    gui_active_workspace_matched: rows.filter((row) => row.matches_active_workspace).length,
    gui_hidden_candidate_threads: rows.filter((row) => row.gui_hidden_candidate).length,
    note: "TS overview currently models Codex threads from provider scans plus local global-state metadata.",
  };

  const result: Record<string, unknown> = {
    summary: {
      thread_total: rows.length,
      thread_with_local_data: rows.filter((row) => row.has_local_data).length,
      thread_pinned: rows.filter((row) => row.pinned).length,
      thread_with_session_log: rows.filter((row) => row.has_session_log).length,
      workspace_total: workspaces.length,
      workspace_active: workspaces.filter((row) => row.active).length,
      labs_project_total: (await listLabsProjects()).length,
      project_bucket_total: 0,
      high_context_threads: rows.filter((row) => row.context_score >= 70).length,
      high_risk_threads: riskSummary.high,
    },
    workspaces,
    project_buckets: [],
    labs_projects: await listLabsProjects(),
    paths: {
      codex_global_state: CODEX_GLOBAL_STATE_FILE,
      chat_root: CHAT_DIR,
      labs_root: LABS_DIR,
      codex_sessions_root: path.join(CODEX_HOME, "sessions"),
      codex_archived_sessions_root: path.join(CODEX_HOME, "archived_sessions"),
    },
    conv_index: {},
    context_bottlenecks: [],
    risk_summary: riskSummary,
    recommendations,
    sync_status: syncStatus,
  };

  if (includeThreads) {
    result.threads = rows;
  }

  return result;
}

export async function getOverviewTs(options?: {
  includeThreads?: boolean;
  forceRefresh?: boolean;
}) {
  const includeThreads = Boolean(options?.includeThreads);
  const forceRefresh = Boolean(options?.forceRefresh);
  const cacheKey = includeThreads ? "full" : "lite";
  const now = Date.now();
  if (!forceRefresh && overviewCache?.[cacheKey] && overviewCache[cacheKey]!.expires_at > now) {
    return overviewCache[cacheKey]!.payload;
  }
  const payload = await buildOverview(includeThreads, forceRefresh);
  overviewCache = overviewCache ?? {};
  overviewCache[cacheKey] = {
    expires_at: now + OVERVIEW_CACHE_TTL_MS,
    payload,
  };
  return payload;
}

export function invalidateOverviewTsCache(): void {
  overviewCache = null;
}
