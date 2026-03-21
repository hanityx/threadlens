import { execFileSync } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ALERT_EVENTS_FILE,
  ALERT_RULES_FILE,
  ALERT_STATE_FILE,
} from "../../lib/constants.js";
import { getRuntimeHealthTs } from "../../lib/recovery.js";
import {
  isRecord,
  nowIsoUtc,
  parseNumber,
  readJsonFile,
} from "../../lib/utils.js";
import { getOverviewTs } from "../threads/overview.js";
import { getCodexObservatoryTs } from "./observatory.js";

export type AlertHookRule = {
  id: string;
  label: string;
  metric: string;
  op: "ge" | "gt" | "le" | "lt" | "eq";
  threshold: number;
  severity: "low" | "medium" | "high";
  cooldown_min: number;
  enabled: boolean;
  description: string;
};

export type AlertHooksConfig = {
  desktop_notify: boolean;
  rules: AlertHookRule[];
};

export type AlertHooksState = {
  last_fired_at: Record<string, string>;
  last_values: Record<string, number>;
};

export type AlertHookMetrics = {
  thread_total: number;
  high_risk_threads: number;
  ctx_high_total: number;
  orphan_candidates: number;
  health_score: number;
  health_fail: number;
  health_warn: number;
  loop_attention_total: number;
  process_total: number;
  mcp_duplicate_groups: number;
  codex_main_missing: number;
};

export type AlertHookAlert = {
  rule_id: string;
  label: string;
  severity: string;
  metric: string;
  op: string;
  value: number;
  threshold: number;
  description: string;
};

export type AlertHookEvent = {
  ts: string;
  rule_id: string;
  label: string;
  severity: string;
  metric: string;
  op: string;
  value: number;
  threshold: number;
  message: string;
};

export type AlertHooksData = {
  generated_at: string;
  config: AlertHooksConfig;
  metrics: AlertHookMetrics;
  active_alerts: AlertHookAlert[];
  emitted_events: AlertHookEvent[];
  recent_events: AlertHookEvent[];
  state: AlertHooksState;
};

type AlertHooksDeps = {
  configFilePath?: string;
  stateFilePath?: string;
  eventsFilePath?: string;
  overviewLoader?: typeof getOverviewTs;
  runtimeHealthLoader?: typeof getRuntimeHealthTs;
  observatoryLoader?: typeof getCodexObservatoryTs;
  now?: () => Date;
  nowIso?: () => string;
  desktopNotifier?: (title: string, message: string) => void | Promise<void>;
};

type UpdateAlertRuleInput = {
  rule_id: unknown;
  enabled?: unknown;
  threshold?: unknown;
  cooldown_min?: unknown;
};

function resolveDeps(deps?: AlertHooksDeps) {
  const now = deps?.now ?? (() => new Date());
  return {
    configFilePath: deps?.configFilePath ?? ALERT_RULES_FILE,
    stateFilePath: deps?.stateFilePath ?? ALERT_STATE_FILE,
    eventsFilePath: deps?.eventsFilePath ?? ALERT_EVENTS_FILE,
    overviewLoader: deps?.overviewLoader ?? getOverviewTs,
    runtimeHealthLoader: deps?.runtimeHealthLoader ?? getRuntimeHealthTs,
    observatoryLoader: deps?.observatoryLoader ?? getCodexObservatoryTs,
    now,
    nowIso: deps?.nowIso ?? (() => now().toISOString()),
    desktopNotifier: deps?.desktopNotifier ?? notifyDesktop,
  };
}

export function defaultAlertHooksConfig(): AlertHooksConfig {
  return {
    desktop_notify: false,
    rules: [
      {
        id: "high_risk_threads",
        label: "High Risk Threads",
        metric: "high_risk_threads",
        op: "ge",
        threshold: 8,
        severity: "high",
        cooldown_min: 20,
        enabled: true,
        description:
          "Alert when the high-risk thread count reaches the threshold.",
      },
      {
        id: "orphan_candidates",
        label: "Orphan Candidates",
        metric: "orphan_candidates",
        op: "ge",
        threshold: 50,
        severity: "medium",
        cooldown_min: 30,
        enabled: true,
        description:
          "Alert when orphan candidates grow beyond the threshold.",
      },
      {
        id: "health_score_low",
        label: "Health Score Low",
        metric: "health_score",
        op: "le",
        threshold: 70,
        severity: "high",
        cooldown_min: 15,
        enabled: true,
        description:
          "Alert when the system health score drops below the threshold.",
      },
      {
        id: "loop_attention",
        label: "Loop Attention",
        metric: "loop_attention_total",
        op: "ge",
        threshold: 1,
        severity: "medium",
        cooldown_min: 15,
        enabled: true,
        description: "Alert when a supervisor loop needs attention.",
      },
      {
        id: "mcp_duplicate_groups",
        label: "MCP Duplicate Groups",
        metric: "mcp_duplicate_groups",
        op: "ge",
        threshold: 1,
        severity: "medium",
        cooldown_min: 30,
        enabled: true,
        description: "Alert when duplicate MCP groups are detected.",
      },
    ],
  };
}

function defaultAlertHooksState(): AlertHooksState {
  return {
    last_fired_at: {},
    last_values: {},
  };
}

async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

export async function loadAlertHooksConfig(
  deps?: AlertHooksDeps,
): Promise<AlertHooksConfig> {
  const { configFilePath } = resolveDeps(deps);
  const raw = await readJsonFile(configFilePath);
  if (isRecord(raw) && Array.isArray(raw.rules)) {
    return {
      desktop_notify: Boolean(raw.desktop_notify),
      rules: raw.rules
        .filter((rule) => isRecord(rule))
        .map((rule) => ({
          id: String(rule.id ?? "").trim(),
          label: String(rule.label ?? rule.id ?? "").trim(),
          metric: String(rule.metric ?? "").trim(),
          op: normalizeOp(rule.op),
          threshold: parseNumber(rule.threshold, 0),
          severity: normalizeSeverity(rule.severity),
          cooldown_min: normalizeCooldown(rule.cooldown_min, 15),
          enabled: Boolean(rule.enabled ?? true),
          description: String(rule.description ?? "").trim(),
        })),
    };
  }
  const defaults = defaultAlertHooksConfig();
  await writeJsonFile(configFilePath, defaults);
  return defaults;
}

export async function saveAlertHooksConfig(
  config: AlertHooksConfig,
  deps?: AlertHooksDeps,
): Promise<void> {
  const { configFilePath } = resolveDeps(deps);
  await writeJsonFile(configFilePath, config);
}

export async function loadAlertHooksState(
  deps?: AlertHooksDeps,
): Promise<AlertHooksState> {
  const { stateFilePath } = resolveDeps(deps);
  const raw = await readJsonFile(stateFilePath);
  if (isRecord(raw)) {
    return {
      last_fired_at: isRecord(raw.last_fired_at)
        ? Object.fromEntries(
            Object.entries(raw.last_fired_at).map(([key, value]) => [key, String(value ?? "")]),
          )
        : {},
      last_values: isRecord(raw.last_values)
        ? Object.fromEntries(
            Object.entries(raw.last_values).map(([key, value]) => [key, parseNumber(value, 0)]),
          )
        : {},
    };
  }
  return defaultAlertHooksState();
}

export async function saveAlertHooksState(
  state: AlertHooksState,
  deps?: AlertHooksDeps,
): Promise<void> {
  const { stateFilePath } = resolveDeps(deps);
  await writeJsonFile(stateFilePath, state);
}

export async function readAlertHookEvents(
  limit = 120,
  deps?: AlertHooksDeps,
): Promise<AlertHookEvent[]> {
  const { eventsFilePath } = resolveDeps(deps);
  try {
    const raw = await readFile(eventsFilePath, "utf-8");
    const rows = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line);
          return isRecord(parsed) ? [parsed as unknown as AlertHookEvent] : [];
        } catch {
          return [];
        }
      });
    return limit > 0 ? rows.slice(-limit) : rows;
  } catch {
    return [];
  }
}

export async function appendAlertHookEvent(
  event: AlertHookEvent,
  deps?: AlertHooksDeps,
): Promise<void> {
  const { eventsFilePath } = resolveDeps(deps);
  await mkdir(path.dirname(eventsFilePath), { recursive: true });
  await appendFile(eventsFilePath, `${JSON.stringify(event)}\n`, "utf-8");
}

export async function collectAlertHookMetricsTs(
  options?: { forceRefresh?: boolean },
  deps?: AlertHooksDeps,
): Promise<AlertHookMetrics> {
  const { overviewLoader, runtimeHealthLoader, observatoryLoader } = resolveDeps(
    deps,
  );
  const forceRefresh = Boolean(options?.forceRefresh);
  const [overview, runtimeHealth, observatory] = await Promise.all([
    overviewLoader({ includeThreads: false, forceRefresh }),
    runtimeHealthLoader(),
    observatoryLoader({ forceRefresh }),
  ]);

  const summary: Record<string, unknown> = isRecord(overview?.summary)
    ? overview.summary
    : {};
  const risk: Record<string, unknown> = isRecord(overview?.risk_summary)
    ? overview.risk_summary
    : {};
  const runtimeHealthRecord: Record<string, unknown> = isRecord(runtimeHealth)
    ? runtimeHealth
    : {};
  const runtimeSummary: Record<string, unknown> = isRecord(runtimeHealthRecord.summary)
    ? (runtimeHealthRecord.summary as Record<string, unknown>)
    : {};
  const observatoryRecord: Record<string, unknown> = isRecord(observatory)
    ? observatory
    : {};
  const observatorySummary: Record<string, unknown> = isRecord(observatoryRecord.summary)
    ? (observatoryRecord.summary as Record<string, unknown>)
    : {};
  const classCounts = isRecord(observatorySummary.class_counts)
    ? observatorySummary.class_counts
    : {};
  const processGroups = Array.isArray(observatoryRecord.process_groups)
    ? observatoryRecord.process_groups
    : [];
  const heavyMcpGroups = processGroups.filter(
    (group) =>
      isRecord(group) &&
      String(group.signature ?? "").startsWith("omx-mcp:") &&
      parseNumber(group.count, 0) >= 4,
  );

  const highRisk = parseNumber(summary.high_risk_threads, 0);
  const ctxHigh = parseNumber(risk.ctx_high_total, 0);
  const orphan = parseNumber(risk.orphan_candidates, 0);
  const lightweightHealthScore = Math.max(
    0,
    100 -
      Math.min(
        75,
        highRisk * 4 + Math.floor(ctxHigh / 4) + Math.floor(orphan / 3),
      ),
  );

  return {
    thread_total: parseNumber(summary.thread_total, 0),
    high_risk_threads: highRisk,
    ctx_high_total: ctxHigh,
    orphan_candidates: orphan,
    health_score: parseNumber(runtimeHealthRecord.score, lightweightHealthScore),
    health_fail: parseNumber(runtimeSummary.fail, 0),
    health_warn: parseNumber(runtimeSummary.warn, 0),
    loop_attention_total: parseNumber(observatorySummary.loop_attention_total, 0),
    process_total: parseNumber(observatorySummary.process_total, 0),
    mcp_duplicate_groups: heavyMcpGroups.length,
    codex_main_missing:
      parseNumber(classCounts["codex-desktop-main"], 0) === 0 ? 1 : 0,
  };
}

export async function evaluateAlertHooksTs(
  options?: { forceRefresh?: boolean; emitEvents?: boolean },
  deps?: AlertHooksDeps,
): Promise<AlertHooksData> {
  const resolved = resolveDeps(deps);
  const forceRefresh = Boolean(options?.forceRefresh);
  const emitEvents = options?.emitEvents !== false;
  const config = await loadAlertHooksConfig(resolved);
  const currentState = await loadAlertHooksState(resolved);
  const metrics = await collectAlertHookMetricsTs({ forceRefresh }, resolved);
  const now = resolved.now();
  const generatedAt = resolved.nowIso();
  const lastFired = { ...currentState.last_fired_at };
  const lastValues = { ...currentState.last_values };
  const activeAlerts: AlertHookAlert[] = [];
  const emittedEvents: AlertHookEvent[] = [];
  let stateChanged = false;

  for (const rule of config.rules) {
    if (!rule.enabled) continue;
    const ruleId = String(rule.id ?? "").trim();
    const metricKey = String(rule.metric ?? "").trim() as keyof AlertHookMetrics;
    if (!ruleId || !metricKey) continue;
    const value = parseNumber(metrics[metricKey], 0);
    lastValues[ruleId] = value;

    if (!compareRule(rule.op, value, rule.threshold)) continue;

    activeAlerts.push({
      rule_id: ruleId,
      label: rule.label || ruleId,
      severity: rule.severity || "medium",
      metric: metricKey,
      op: rule.op || "ge",
      value,
      threshold: rule.threshold,
      description: rule.description || "",
    });

    if (!emitEvents) continue;

    const prev = parseIsoDate(lastFired[ruleId]);
    const inCooldown =
      prev !== null &&
      now.getTime() - prev.getTime() <
        normalizeCooldown(rule.cooldown_min, 15) * 60_000;
    if (inCooldown) continue;

    const event: AlertHookEvent = {
      ts: generatedAt,
      rule_id: ruleId,
      label: rule.label || ruleId,
      severity: rule.severity || "medium",
      metric: metricKey,
      op: rule.op || "ge",
      value,
      threshold: rule.threshold,
      message: `${rule.label || ruleId}: ${value} ${rule.op || "ge"} ${rule.threshold}`,
    };
    emittedEvents.push(event);
    await appendAlertHookEvent(event, resolved);
    lastFired[ruleId] = event.ts;
    stateChanged = true;
    if (config.desktop_notify) {
      await resolved.desktopNotifier("Provider Observatory Alert", event.message);
    }
  }

  if (!sameNumberMap(lastValues, currentState.last_values)) {
    stateChanged = true;
  }

  const nextState: AlertHooksState = {
    last_fired_at: lastFired,
    last_values: lastValues,
  };
  if (stateChanged) {
    await saveAlertHooksState(nextState, resolved);
  }

  return {
    generated_at: generatedAt,
    config,
    metrics,
    active_alerts: activeAlerts,
    emitted_events: emittedEvents,
    recent_events: await readAlertHookEvents(120, resolved),
    state: nextState,
  };
}

export async function getAlertHooksTs(
  options?: { forceRefresh?: boolean },
  deps?: AlertHooksDeps,
): Promise<AlertHooksData> {
  return evaluateAlertHooksTs(
    { forceRefresh: options?.forceRefresh, emitEvents: false },
    deps,
  );
}

export async function updateAlertHooksConfigTs(
  input: { desktop_notify?: unknown },
  deps?: AlertHooksDeps,
): Promise<{ ok: true; config: AlertHooksConfig; data: AlertHooksData }> {
  const resolved = resolveDeps(deps);
  const config = await loadAlertHooksConfig(resolved);
  if (input.desktop_notify !== undefined) {
    config.desktop_notify = Boolean(input.desktop_notify);
  }
  await saveAlertHooksConfig(config, resolved);
  const data = await evaluateAlertHooksTs(
    { forceRefresh: false, emitEvents: false },
    resolved,
  );
  return { ok: true, config, data };
}

export async function updateAlertHookRuleTs(
  input: UpdateAlertRuleInput,
  deps?: AlertHooksDeps,
): Promise<{ ok: true; data: AlertHooksData } | { ok: false; error: string }> {
  const ruleId = String(input.rule_id ?? "").trim();
  if (!ruleId) {
    return { ok: false, error: "rule_id is required" };
  }

  const resolved = resolveDeps(deps);
  const config = await loadAlertHooksConfig(resolved);
  let updated = false;
  let found = false;

  for (const rule of config.rules) {
    if (String(rule.id ?? "").trim() !== ruleId) continue;
    found = true;
    if (input.enabled !== undefined) {
      rule.enabled = Boolean(input.enabled);
      updated = true;
    }
    if (input.threshold !== undefined) {
      const threshold = Number(input.threshold);
      if (Number.isFinite(threshold)) {
        rule.threshold = threshold;
        updated = true;
      }
    }
    if (input.cooldown_min !== undefined) {
      const cooldown = Number.parseInt(String(input.cooldown_min), 10);
      if (Number.isFinite(cooldown) && cooldown > 0) {
        rule.cooldown_min = cooldown;
        updated = true;
      }
    }
    break;
  }

  if (!found || !updated) {
    return { ok: false, error: "rule not found or no valid changes" };
  }

  await saveAlertHooksConfig(config, resolved);
  const data = await evaluateAlertHooksTs(
    { forceRefresh: false, emitEvents: false },
    resolved,
  );
  return { ok: true, data };
}

export const updateAlertRuleTs = updateAlertHookRuleTs;

function normalizeOp(value: unknown): AlertHookRule["op"] {
  const op = String(value ?? "ge").trim().toLowerCase();
  if (op === "gt" || op === "le" || op === "lt" || op === "eq") return op;
  return "ge";
}

function normalizeSeverity(value: unknown): AlertHookRule["severity"] {
  const severity = String(value ?? "medium").trim().toLowerCase();
  if (severity === "low" || severity === "high") return severity;
  return "medium";
}

function normalizeCooldown(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function compareRule(op: string, value: number, threshold: number): boolean {
  const normalized = String(op ?? "ge").trim().toLowerCase();
  if (normalized === "ge") return value >= threshold;
  if (normalized === "gt") return value > threshold;
  if (normalized === "le") return value <= threshold;
  if (normalized === "lt") return value < threshold;
  if (normalized === "eq") return value === threshold;
  return false;
}

function parseIsoDate(raw: string | undefined): Date | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function sameNumberMap(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    if (leftKeys[index] !== rightKeys[index]) return false;
    if (
      parseNumber(left[leftKeys[index]], 0) !==
      parseNumber(right[rightKeys[index]], 0)
    ) {
      return false;
    }
  }
  return true;
}

function notifyDesktop(title: string, message: string): void {
  const safeTitle = String(title || "Provider Observatory Alert").replace(/"/g, "'");
  const safeMessage = String(message || "").replace(/"/g, "'");
  try {
    execFileSync(
      "osascript",
      ["-e", `display notification "${safeMessage}" with title "${safeTitle}"`],
      { stdio: "ignore", timeout: 4_000 },
    );
  } catch {
    // best-effort
  }
}
