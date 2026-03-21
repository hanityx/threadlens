import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ROADMAP_LOG_FILE,
  ROADMAP_STATE_FILE,
} from "../../lib/constants.js";
import {
  cleanTitleText,
  isRecord,
  nowIsoUtc,
  parseNumber,
  readJsonFile,
  safeJsonParse,
} from "../../lib/utils.js";
import { getOverviewTs } from "../threads/overview.js";
import {
  getRelatedToolsStatusTs,
  getRuntimeHealthTs,
} from "../../lib/recovery.js";

async function readRoadmapState(): Promise<Record<string, unknown>[]> {
  const data = await readJsonFile(ROADMAP_STATE_FILE);
  if (Array.isArray(data)) {
    return data.filter((x) => isRecord(x));
  }
  if (isRecord(data) && Array.isArray(data.weeks)) {
    return data.weeks.filter((x) => isRecord(x));
  }
  return [];
}

async function readRoadmapCheckins(limit = 80): Promise<Record<string, unknown>[]> {
  try {
    const raw = await readFile(ROADMAP_LOG_FILE, "utf-8");
    const rows = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => safeJsonParse(line))
      .filter((x): x is Record<string, unknown> => isRecord(x));
    if (limit <= 0) return rows;
    return rows.slice(-limit);
  } catch {
    return [];
  }
}

export async function getRoadmapStatusTs() {
  const weeks = await readRoadmapState();
  const checkins = await readRoadmapCheckins(80);
  const statusCounts: Record<string, number> = {
    done: 0,
    in_progress: 0,
    planned: 0,
    blocked: 0,
  };
  for (const week of weeks) {
    const raw = String(week.status ?? "planned");
    const status = Object.prototype.hasOwnProperty.call(statusCounts, raw)
      ? raw
      : "planned";
    statusCounts[status] += 1;
  }
  const remainingTracks = weeks
    .filter((week) => String(week.status ?? "") !== "done")
    .map((week) => String(week.week_id ?? ""))
    .filter(Boolean);

  return {
    generated_at: nowIsoUtc(),
    status_counts: statusCounts,
    remaining_tracks: remainingTracks,
    weeks,
    checkins,
  };
}

export async function appendRoadmapCheckinTs(note: string, actor: string) {
  let overview: Record<string, unknown> = {};
  let runtime: Record<string, unknown> = {};
  let apps: Record<string, unknown> = {};

  try {
    const o = await getOverviewTs({ includeThreads: false, forceRefresh: false });
    if (isRecord(o)) overview = o;
  } catch {
    // no-op
  }
  try {
    const r = await getRuntimeHealthTs();
    if (isRecord(r)) runtime = r;
  } catch {
    // no-op
  }
  try {
    const a = await getRelatedToolsStatusTs();
    if (isRecord(a)) apps = a;
  } catch {
    // no-op
  }

  const summary = isRecord(overview.summary) ? overview.summary : {};
  const risk = isRecord(overview.risk_summary) ? overview.risk_summary : {};
  const appSummary = isRecord(apps.summary) ? apps.summary : {};

  const highRisk = parseNumber(summary.high_risk_threads);
  const ctxHigh = parseNumber(risk.ctx_high_total);
  const orphan = parseNumber(risk.orphan_candidates);
  const lightweightHealthScore = Math.max(
    0,
    100 -
      Math.min(
        75,
        highRisk * 4 + Math.floor(ctxHigh / 4) + Math.floor(orphan / 3),
      ),
  );

  const entry = {
    ts: nowIsoUtc(),
    actor: actor || "codex",
    note: cleanTitleText(note || "", 280),
    snapshot: {
      threads: parseNumber(summary.thread_total),
      high_risk: highRisk,
      ctx_high: ctxHigh,
      orphan,
      health_score: lightweightHealthScore,
      running_apps: parseNumber(appSummary.running_total),
      uptime_min: parseNumber(runtime.uptime_min, 0),
    },
  };

  await mkdir(path.dirname(ROADMAP_LOG_FILE), { recursive: true });
  await writeFile(ROADMAP_LOG_FILE, `${JSON.stringify(entry, null, 0)}\n`, {
    encoding: "utf-8",
    flag: "a",
  });
  return entry;
}
