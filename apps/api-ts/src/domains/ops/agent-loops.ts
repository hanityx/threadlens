import { spawnSync } from "node:child_process";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nowIsoUtc } from "../../lib/utils.js";

const LOOP_ALLOWED_ACTIONS = new Set([
  "start",
  "stop",
  "restart",
  "run2",
  "status",
  "watch-start",
  "watch-stop",
  "watch-status",
] as const);

export type AgentLoopAction = "start" | "stop" | "restart" | "run2" | "status" | "watch-start" | "watch-stop" | "watch-status";

type LoopControlSpec = {
  id: string;
  label: string;
  controller: string;
};

type RunLoopControlResult = {
  ok: boolean;
  error?: string;
  returncode?: number | null;
  stdout?: string;
  stderr?: string;
  controller?: string;
  action?: string;
};

export type AgentLoopSnapshot = {
  loop_id: string;
  label?: string;
  controller?: string;
  live_session?: string;
  running?: boolean;
  watchdog_running?: boolean;
  phase?: string;
  rid?: string;
  verdict?: string;
  instruction?: string;
  history_age_sec?: number | null;
  staleness?: "fresh" | "aging" | "stale" | "unknown";
  has_attention?: boolean;
  attention_reasons?: string[];
  current_status?: Record<string, string>;
  loop_state_line?: string;
  history_tail?: string[];
  summary_kv?: Record<string, string>;
  status_raw?: string;
  status_error?: string;
  watchdog_error?: string;
  updated_at?: string;
  ok?: false;
  error?: string;
};

export type AgentLoopsStatusPayload = {
  generated_at: string;
  count: number;
  rows: AgentLoopSnapshot[];
};

export type AgentLoopActionPayload = {
  generated_at: string;
  ok: boolean;
  loop_id: string;
  action: string;
  result: RunLoopControlResult;
  loop: AgentLoopSnapshot;
};

type AgentLoopsOptions = {
  env?: NodeJS.ProcessEnv;
  projectRoot?: string;
  now?: () => number;
};

function defaultProjectRoot(): string {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../../../",
  );
}

function sanitizeLoopControlSpec(raw: unknown, projectRoot: string): LoopControlSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const label = String(record.label ?? record.name ?? "").trim();
  const controllerRaw = String(record.controller ?? record.path ?? "").trim();
  const providedId = String(record.id ?? "").trim();
  if (!label || !controllerRaw) return null;
  const loopId = providedId || label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!loopId) return null;
  const controller = path.isAbsolute(controllerRaw)
    ? path.resolve(controllerRaw)
    : path.resolve(projectRoot, controllerRaw);
  return {
    id: loopId,
    label,
    controller,
  };
}

function loadLoopControlSpecs(options: AgentLoopsOptions = {}): Record<string, LoopControlSpec> {
  const env = options.env ?? process.env;
  const projectRoot = path.resolve(options.projectRoot ?? defaultProjectRoot());
  const raw = String(env.THREADLENS_LOOP_CONTROLLERS_JSON ?? "").trim() ||
    // Legacy THREADLENS_ prefix is kept for backward-compatible local automation.
    String(env.THREADLENS_LOOP_CONTROLLERS_JSON ?? "").trim();
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  const items: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.entries(parsed as Record<string, unknown>).map(([id, value]) => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return null;
          return { id, ...(value as Record<string, unknown>) };
        }).filter(Boolean) as unknown[]
      : [];

  const out: Record<string, LoopControlSpec> = {};
  for (const item of items) {
    const spec = sanitizeLoopControlSpec(item, projectRoot);
    if (!spec) continue;
    out[spec.id] = spec;
  }
  return out;
}

function parseKvLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].trim();
  }
  return out;
}

async function readTextFile(filePath: string, maxChars: number): Promise<string> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return raw.slice(0, maxChars);
  } catch {
    return "";
  }
}

async function tailLines(filePath: string, maxLines: number): Promise<string[]> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.replace(/[\r\n]+$/, ""))
      .filter((line) => line.length > 0)
      .slice(-Math.max(0, maxLines));
  } catch {
    return [];
  }
}

function classifyStaleness(ageSec: number | null): "fresh" | "aging" | "stale" | "unknown" {
  if (ageSec == null) return "unknown";
  if (ageSec <= 180) return "fresh";
  if (ageSec <= 900) return "aging";
  return "stale";
}

async function readLoopState(stateDir: string, now: () => number) {
  const safeDir = String(stateDir ?? "").trim();
  if (!safeDir) {
    return {
      current_status: {},
      loop_state_line: "",
      history_tail: [],
      history_age_sec: null,
      summary_kv: {},
      summary_text: "",
    };
  }

  try {
    const dirStat = await stat(safeDir);
    if (!dirStat.isDirectory()) throw new Error("not-dir");
  } catch {
    return {
      current_status: {},
      loop_state_line: "",
      history_tail: [],
      history_age_sec: null,
      summary_kv: {},
      summary_text: "",
    };
  }

  const currentStatusText = await readTextFile(path.join(safeDir, "current_status.txt"), 4000);
  const loopStateLines = await tailLines(path.join(safeDir, "loop_state.txt"), 1);
  const historyTail = await tailLines(path.join(safeDir, "cycle_history.tsv"), 10);
  const summaryText = await readTextFile(path.join(safeDir, "latest_summary.txt"), 12_000);

  let historyAgeSec: number | null = null;
  try {
    const histStat = await stat(path.join(safeDir, "cycle_history.tsv"));
    historyAgeSec = Math.max(0, Math.floor(now() - histStat.mtimeMs / 1000));
  } catch {
    historyAgeSec = null;
  }

  return {
    current_status: parseKvLines(currentStatusText),
    loop_state_line: loopStateLines[0] ?? "",
    history_tail: historyTail,
    history_age_sec: historyAgeSec,
    summary_kv: parseKvLines(summaryText),
    summary_text: summaryText,
  };
}

function loopActionTimeoutMs(action: string): number {
  if (action === "run2") return 600_000;
  if (action === "status" || action === "watch-status") return 25_000;
  return 45_000;
}

async function resolveRunLoopControl(
  loopId: string,
  action: string,
  options: AgentLoopsOptions = {},
): Promise<RunLoopControlResult> {
  const specs = loadLoopControlSpecs(options);
  const projectRoot = path.resolve(options.projectRoot ?? defaultProjectRoot());
  const spec = specs[loopId];
  if (!spec) {
    return { ok: false, error: `unknown loop_id: ${loopId}` };
  }
  if (!LOOP_ALLOWED_ACTIONS.has(action as AgentLoopAction)) {
    return { ok: false, error: `unsupported action: ${action}` };
  }
  try {
    await access(spec.controller);
  } catch {
    return {
      ok: false,
      error: `controller not found: ${spec.controller}`,
      controller: spec.controller,
    };
  }

  const proc = spawnSync(spec.controller, [action], {
    cwd: projectRoot,
    encoding: "utf-8",
    timeout: loopActionTimeoutMs(action),
  });
  if (proc.error) {
    if ((proc.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
      return {
        ok: false,
        error: "timeout",
        stdout: String(proc.stdout ?? ""),
        stderr: String(proc.stderr ?? ""),
        controller: spec.controller,
        action,
      };
    }
    return {
      ok: false,
      error: proc.error.message,
      stdout: String(proc.stdout ?? ""),
      stderr: String(proc.stderr ?? ""),
      controller: spec.controller,
      action,
    };
  }

  return {
    ok: proc.status === 0,
    returncode: proc.status,
    stdout: String(proc.stdout ?? ""),
    stderr: String(proc.stderr ?? ""),
    controller: spec.controller,
    action,
  };
}

export async function getAgentLoopSnapshotTs(
  loopId: string,
  options: AgentLoopsOptions = {},
): Promise<AgentLoopSnapshot> {
  const specs = loadLoopControlSpecs(options);
  const now = options.now ?? (() => Date.now() / 1000);
  const spec = specs[loopId];
  if (!spec) {
    return { loop_id: loopId, ok: false, error: "unknown loop" };
  }

  const statusRes = await resolveRunLoopControl(loopId, "status", options);
  const watchRes = await resolveRunLoopControl(loopId, "watch-status", options);
  const statusKv = parseKvLines(String(statusRes.stdout ?? ""));
  const state = await readLoopState(String(statusKv.state_dir ?? ""), now);
  const currentStatus = state.current_status;
  const summaryKv = state.summary_kv;
  const historyAgeSec = state.history_age_sec;
  const staleness = classifyStaleness(historyAgeSec);
  const running = String(statusKv.running ?? "").toLowerCase() === "yes";
  const watchdogRunning = Boolean(watchRes.ok);
  const rid = currentStatus.rid || summaryKv.RID || statusKv.RID || "";
  const phase = currentStatus.phase || (running ? "running" : "idle");
  const verdict = summaryKv.VERDICT || "";
  const instruction = summaryKv.INSTRUCTION || summaryKv.FOLLOWUP || "";

  const attentionReasons: string[] = [];
  if (!running) attentionReasons.push("loop-stopped");
  if (staleness === "stale") attentionReasons.push("history-stale");
  if (statusRes.ok === false) attentionReasons.push("status-error");
  if (watchRes.ok === false) attentionReasons.push("watchdog-off");

  return {
    loop_id: loopId,
    label: spec.label,
    controller: spec.controller,
    live_session: String(statusKv.live_session ?? ""),
    running,
    watchdog_running: watchdogRunning,
    phase,
    rid,
    verdict,
    instruction,
    history_age_sec: historyAgeSec,
    staleness,
    has_attention: attentionReasons.length > 0,
    attention_reasons: attentionReasons,
    current_status: currentStatus,
    loop_state_line: state.loop_state_line,
    history_tail: state.history_tail,
    summary_kv: summaryKv,
    status_raw: String(statusRes.stdout ?? "").slice(0, 6000),
    status_error: String(statusRes.error || statusRes.stderr || "").slice(0, 600),
    watchdog_error: String(watchRes.error || watchRes.stderr || "").slice(0, 600),
    updated_at: new Date(now() * 1000).toISOString(),
  };
}

export async function getAgentLoopsStatusTs(
  options: AgentLoopsOptions = {},
): Promise<AgentLoopsStatusPayload> {
  const specs = loadLoopControlSpecs(options);
  const rows: AgentLoopSnapshot[] = [];
  for (const loopId of Object.keys(specs)) {
    rows.push(await getAgentLoopSnapshotTs(loopId, options));
  }
  return {
    generated_at: nowIsoUtc(),
    count: rows.length,
    rows,
  };
}

export async function runAgentLoopActionTs(
  loopId: string,
  action: string,
  options: AgentLoopsOptions = {},
): Promise<AgentLoopActionPayload> {
  const result = await resolveRunLoopControl(loopId, action, options);
  const loop = await getAgentLoopSnapshotTs(loopId, options);
  return {
    generated_at: nowIsoUtc(),
    ok: Boolean(result.ok),
    loop_id: loopId,
    action,
    result,
    loop,
  };
}
