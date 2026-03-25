import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { CODEX_HOME } from "./constants.js";
import { isRecord, nowIsoUtc, safeJsonParse } from "./utils.js";

type HostSnapshot = {
  alias: string;
  hostname: string;
  reachable: boolean;
  captured_at: string;
  errors: string[];
  sessions_file_count: number;
  rollout_file_count: number;
  latest_rollout_id: string;
  latest_rollout_mtime: string;
  thread_order_count: number;
  thread_titles_count: number;
  thread_hints_count: number;
  db_thread_count: number | null;
  db_archived_count: number | null;
  active_roots: string[];
  config_sha256: string;
  global_state_sha256: string;
};

type SyncIssue = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  hint: string;
};

type SyncActionPreview = {
  id: string;
  title: string;
  direction: string;
  risk: "low" | "medium" | "high";
  command_preview: string;
  disabled_reason: string;
};

type ThreadStateStats = {
  order_count: number;
  titles_count: number;
  hints_count: number;
  active_roots: string[];
};

type SessionStats = {
  sessions_file_count: number;
  rollout_file_count: number;
  latest_rollout_id: string;
  latest_rollout_mtime: string;
};

const REMOTE_ALIAS = String(process.env.SYNC_LENS_REMOTE_ALIAS ?? "").trim();

function shaShort(value: string): string {
  return value ? value.slice(0, 12) : "";
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): { ok: boolean; stdout: string; stderr: string } {
  const proc = spawnSync(command, args, {
    encoding: "utf-8",
    timeout: timeoutMs,
  });
  return {
    ok: proc.status === 0,
    stdout: String(proc.stdout ?? "").trim(),
    stderr: String(proc.stderr ?? "").trim(),
  };
}

async function sha256File(filePath: string): Promise<string> {
  try {
    const data = await readFile(filePath);
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return "";
  }
}

function parseThreadStateStats(raw: unknown): ThreadStateStats {
  if (!isRecord(raw)) {
    return {
      order_count: 0,
      titles_count: 0,
      hints_count: 0,
      active_roots: [],
    };
  }

  const stateObj = isRecord(raw.state) ? raw.state : raw;
  const props = isRecord(stateObj.properties) ? stateObj.properties : {};
  const threadTitlesRaw =
    (isRecord(stateObj["thread-titles"]) && stateObj["thread-titles"]) ||
    (isRecord(props["thread-titles"]) && props["thread-titles"]) ||
    {};
  const hintsRaw =
    (isRecord(stateObj["thread-workspace-root-hints"]) &&
      stateObj["thread-workspace-root-hints"]) ||
    (isRecord(props["thread-workspace-root-hints"]) &&
      props["thread-workspace-root-hints"]) ||
    {};
  const activeRootsRaw =
    (Array.isArray(stateObj["active-workspace-roots"]) &&
      stateObj["active-workspace-roots"]) ||
    (Array.isArray(props["active-workspace-roots"]) &&
      props["active-workspace-roots"]) ||
    [];

  const order = Array.isArray(threadTitlesRaw.order)
    ? threadTitlesRaw.order.filter((v) => typeof v === "string")
    : [];
  const titles = isRecord(threadTitlesRaw.titles) ? threadTitlesRaw.titles : {};
  const hints = isRecord(hintsRaw) ? hintsRaw : {};
  const activeRoots = activeRootsRaw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    order_count: order.length,
    titles_count: Object.keys(titles).length,
    hints_count: Object.keys(hints).length,
    active_roots: activeRoots,
  };
}

async function collectSessionStats(sessionsDir: string): Promise<SessionStats> {
  const pendingDirs: string[] = [sessionsDir];
  let sessionsFileCount = 0;
  let rolloutFileCount = 0;
  let latestRolloutId = "";
  let latestRolloutMtime = "";
  let latestMs = 0;

  while (pendingDirs.length > 0) {
    const currentDir = pendingDirs.pop() as string;
    const entries = await readdir(currentDir, { withFileTypes: true }).catch(
      () => [],
    );
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        pendingDirs.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      sessionsFileCount += 1;
      if (!/^rollout-.*\.jsonl$/i.test(entry.name)) continue;

      rolloutFileCount += 1;
      const match = /-([0-9a-f-]{36})\.jsonl$/i.exec(entry.name);
      const maybeId = match?.[1] ?? "";
      const st = await stat(fullPath).catch(() => null);
      const mtimeMs = Number(st?.mtimeMs ?? 0);
      if (mtimeMs > latestMs) {
        latestMs = mtimeMs;
        latestRolloutId = maybeId;
        latestRolloutMtime = st?.mtime.toISOString() ?? "";
      }
    }
  }

  return {
    sessions_file_count: sessionsFileCount,
    rollout_file_count: rolloutFileCount,
    latest_rollout_id: latestRolloutId,
    latest_rollout_mtime: latestRolloutMtime,
  };
}

function readSqliteCount(dbPath: string, sql: string): number | null {
  const result = runCommand("sqlite3", [dbPath, sql], 8000);
  if (!result.ok) return null;
  const value = Number(result.stdout);
  return Number.isFinite(value) ? value : null;
}

function buildRemoteSshArgs(alias: string, remotePythonScript: string): string[] {
  const args = ["-o", "BatchMode=yes", "-o", "ConnectTimeout=3"];
  args.push(alias, "python3", "-c", remotePythonScript);
  return args;
}

async function collectLocalSnapshot(alias: string): Promise<HostSnapshot> {
  const codexRoot = CODEX_HOME;
  const sessionsDir = path.join(codexRoot, "sessions");
  const globalStatePath = path.join(codexRoot, ".codex-global-state.json");
  const configPath = path.join(codexRoot, "config.toml");
  const sqlitePath = path.join(codexRoot, "state_5.sqlite");
  const host = runCommand("hostname", [], 1000).stdout || "localhost";

  const globalRaw = await readFile(globalStatePath, "utf-8").catch(() => "");
  const parsedState = safeJsonParse(globalRaw);
  const threadStats = parseThreadStateStats(parsedState);
  const sessionStats = await collectSessionStats(sessionsDir);

  const dbThreadCount = readSqliteCount(sqlitePath, "select count(*) from threads;");
  const dbArchivedCount = readSqliteCount(
    sqlitePath,
    "select count(*) from threads where archived=1;",
  );
  const configHash = await sha256File(configPath);
  const globalHash = await sha256File(globalStatePath);

  const errors: string[] = [];
  if (dbThreadCount === null) errors.push("sqlite-thread-count-unavailable");
  if (dbArchivedCount === null) errors.push("sqlite-archived-count-unavailable");
  if (!configHash) errors.push("config-hash-unavailable");
  if (!globalHash) errors.push("global-state-hash-unavailable");

  return {
    alias,
    hostname: host,
    reachable: true,
    captured_at: nowIsoUtc(),
    errors,
    sessions_file_count: sessionStats.sessions_file_count,
    rollout_file_count: sessionStats.rollout_file_count,
    latest_rollout_id: sessionStats.latest_rollout_id,
    latest_rollout_mtime: sessionStats.latest_rollout_mtime,
    thread_order_count: threadStats.order_count,
    thread_titles_count: threadStats.titles_count,
    thread_hints_count: threadStats.hints_count,
    db_thread_count: dbThreadCount,
    db_archived_count: dbArchivedCount,
    active_roots: threadStats.active_roots,
    config_sha256: configHash,
    global_state_sha256: globalHash,
  };
}

function collectRemoteSnapshot(alias: string): HostSnapshot {
  if (process.env.VITEST) {
    return {
      alias,
      hostname: alias,
      reachable: false,
      captured_at: nowIsoUtc(),
      errors: ["remote-check-skipped-in-tests"],
      sessions_file_count: 0,
      rollout_file_count: 0,
      latest_rollout_id: "",
      latest_rollout_mtime: "",
      thread_order_count: 0,
      thread_titles_count: 0,
      thread_hints_count: 0,
      db_thread_count: null,
      db_archived_count: null,
      active_roots: [],
      config_sha256: "",
      global_state_sha256: "",
    };
  }

  if (!alias) {
    return {
      alias: "secondary",
      hostname: "secondary",
      reachable: false,
      captured_at: nowIsoUtc(),
      errors: ["remote-alias-not-configured"],
      sessions_file_count: 0,
      rollout_file_count: 0,
      latest_rollout_id: "",
      latest_rollout_mtime: "",
      thread_order_count: 0,
      thread_titles_count: 0,
      thread_hints_count: 0,
      db_thread_count: null,
      db_archived_count: null,
      active_roots: [],
      config_sha256: "",
      global_state_sha256: "",
    };
  }

  const remotePythonScript = `
import hashlib
import json
import os
import pathlib
import re
import sqlite3
from datetime import datetime, timezone

home = pathlib.Path.home()
codex = home / ".codex"
sessions = codex / "sessions"
global_state = codex / ".codex-global-state.json"
config = codex / "config.toml"
sqlite_file = codex / "state_5.sqlite"

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def sha256_file(p):
    try:
        h = hashlib.sha256()
        with open(p, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return ""

def parse_state(raw):
    if not isinstance(raw, dict):
        return (0, 0, 0, [])
    state = raw.get("state") if isinstance(raw.get("state"), dict) else raw
    props = state.get("properties") if isinstance(state.get("properties"), dict) else {}
    thread_titles = state.get("thread-titles") if isinstance(state.get("thread-titles"), dict) else props.get("thread-titles", {})
    hints = state.get("thread-workspace-root-hints")
    if not isinstance(hints, dict):
        hints = props.get("thread-workspace-root-hints", {})
    active = state.get("active-workspace-roots")
    if not isinstance(active, list):
        active = props.get("active-workspace-roots", [])
    order = thread_titles.get("order") if isinstance(thread_titles.get("order"), list) else []
    titles = thread_titles.get("titles") if isinstance(thread_titles.get("titles"), dict) else {}
    active_roots = [str(x).strip() for x in active if isinstance(x, str) and str(x).strip()]
    return (len(order), len(titles), len(hints) if isinstance(hints, dict) else 0, active_roots)

def collect_sessions_stats(root):
    total_files = 0
    rollout_files = 0
    latest_id = ""
    latest_mtime = ""
    latest_mtime_ms = 0.0
    if not root.exists():
        return total_files, rollout_files, latest_id, latest_mtime
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            total_files += 1
            if not (name.startswith("rollout-") and name.endswith(".jsonl")):
                continue
            rollout_files += 1
            m = re.search(r"-([0-9a-f-]{36})\\.jsonl$", name, re.IGNORECASE)
            full = pathlib.Path(dirpath) / name
            try:
                st = full.stat()
                if st.st_mtime > latest_mtime_ms:
                    latest_mtime_ms = st.st_mtime
                    latest_mtime = datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")
                    latest_id = m.group(1) if m else ""
            except Exception:
                pass
    return total_files, rollout_files, latest_id, latest_mtime

def sqlite_count(file_path, query):
    try:
        con = sqlite3.connect(str(file_path))
        cur = con.cursor()
        row = cur.execute(query).fetchone()
        con.close()
        if not row:
            return None
        value = row[0]
        return int(value) if value is not None else None
    except Exception:
        return None

errors = []
try:
    raw_state_text = global_state.read_text("utf-8")
    parsed = json.loads(raw_state_text)
except Exception:
    parsed = {}
    errors.append("global-state-read-failed")

order_count, titles_count, hints_count, active_roots = parse_state(parsed)
sessions_file_count, rollout_file_count, latest_rollout_id, latest_rollout_mtime = collect_sessions_stats(sessions)
db_thread_count = sqlite_count(sqlite_file, "select count(*) from threads;")
db_archived_count = sqlite_count(sqlite_file, "select count(*) from threads where archived=1;")

if db_thread_count is None:
    errors.append("sqlite-thread-count-unavailable")
if db_archived_count is None:
    errors.append("sqlite-archived-count-unavailable")

config_hash = sha256_file(config)
state_hash = sha256_file(global_state)
if not config_hash:
    errors.append("config-hash-unavailable")
if not state_hash:
    errors.append("global-state-hash-unavailable")

payload = {
    "alias": "${alias}",
    "hostname": os.uname().nodename,
    "reachable": True,
    "captured_at": now_iso(),
    "errors": errors,
    "sessions_file_count": sessions_file_count,
    "rollout_file_count": rollout_file_count,
    "latest_rollout_id": latest_rollout_id,
    "latest_rollout_mtime": latest_rollout_mtime,
    "thread_order_count": order_count,
    "thread_titles_count": titles_count,
    "thread_hints_count": hints_count,
    "db_thread_count": db_thread_count,
    "db_archived_count": db_archived_count,
    "active_roots": active_roots,
    "config_sha256": config_hash,
    "global_state_sha256": state_hash,
}

print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
`.trim();

  const remoteResult = runCommand(
    "ssh",
    buildRemoteSshArgs(alias, remotePythonScript),
    15000,
  );

  if (!remoteResult.ok || !remoteResult.stdout) {
    return {
      alias,
      hostname: alias,
      reachable: false,
      captured_at: nowIsoUtc(),
      errors: [
        remoteResult.stderr
          ? `remote-ssh-failed:${remoteResult.stderr}`
          : "remote-ssh-failed",
      ],
      sessions_file_count: 0,
      rollout_file_count: 0,
      latest_rollout_id: "",
      latest_rollout_mtime: "",
      thread_order_count: 0,
      thread_titles_count: 0,
      thread_hints_count: 0,
      db_thread_count: null,
      db_archived_count: null,
      active_roots: [],
      config_sha256: "",
      global_state_sha256: "",
    };
  }

  const parsed = safeJsonParse(remoteResult.stdout);
  if (!isRecord(parsed)) {
    return {
      alias,
      hostname: alias,
      reachable: false,
      captured_at: nowIsoUtc(),
      errors: ["remote-json-parse-failed"],
      sessions_file_count: 0,
      rollout_file_count: 0,
      latest_rollout_id: "",
      latest_rollout_mtime: "",
      thread_order_count: 0,
      thread_titles_count: 0,
      thread_hints_count: 0,
      db_thread_count: null,
      db_archived_count: null,
      active_roots: [],
      config_sha256: "",
      global_state_sha256: "",
    };
  }

  return {
    alias: String(parsed.alias ?? alias),
    hostname: String(parsed.hostname ?? alias),
    reachable: Boolean(parsed.reachable),
    captured_at: String(parsed.captured_at ?? nowIsoUtc()),
    errors: Array.isArray(parsed.errors)
      ? parsed.errors
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    sessions_file_count: Number(parsed.sessions_file_count ?? 0) || 0,
    rollout_file_count: Number(parsed.rollout_file_count ?? 0) || 0,
    latest_rollout_id: String(parsed.latest_rollout_id ?? ""),
    latest_rollout_mtime: String(parsed.latest_rollout_mtime ?? ""),
    thread_order_count: Number(parsed.thread_order_count ?? 0) || 0,
    thread_titles_count: Number(parsed.thread_titles_count ?? 0) || 0,
    thread_hints_count: Number(parsed.thread_hints_count ?? 0) || 0,
    db_thread_count:
      parsed.db_thread_count === null || parsed.db_thread_count === undefined
        ? null
        : Number(parsed.db_thread_count),
    db_archived_count:
      parsed.db_archived_count === null || parsed.db_archived_count === undefined
        ? null
        : Number(parsed.db_archived_count),
    active_roots: Array.isArray(parsed.active_roots)
      ? parsed.active_roots
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    config_sha256: String(parsed.config_sha256 ?? ""),
    global_state_sha256: String(parsed.global_state_sha256 ?? ""),
  };
}

function buildIssues(local: HostSnapshot, secondary: HostSnapshot): SyncIssue[] {
  const issues: SyncIssue[] = [];

  if (!secondary.reachable) {
    issues.push({
      id: "secondary-unreachable",
      severity: "high",
      title: "Secondary host is unreachable",
      detail: "Live comparison cannot read the secondary host snapshot.",
      hint: "Check SSH connectivity and host alias, then refresh this panel.",
    });
    return issues;
  }

  const checkPerHost = (host: HostSnapshot, scope: string) => {
    if (
      host.db_thread_count !== null &&
      host.thread_order_count !== host.db_thread_count
    ) {
      issues.push({
        id: `${scope}-order-db-mismatch`,
        severity: "high",
        title: `${scope} thread index mismatch`,
        detail: `thread_order_count (${host.thread_order_count}) != db_thread_count (${host.db_thread_count})`,
        hint: "Rebuild the thread index or refresh the local state map.",
      });
    }
    if (host.thread_order_count !== host.rollout_file_count) {
      issues.push({
        id: `${scope}-order-rollout-mismatch`,
        severity: "medium",
        title: `${scope} session index drift`,
        detail: `thread_order_count (${host.thread_order_count}) != rollout_file_count (${host.rollout_file_count})`,
        hint: "Compare sessions folder and global state order list.",
      });
    }
  };

  checkPerHost(local, "Primary");
  checkPerHost(secondary, "Secondary");

  const orderDelta = Math.abs(local.thread_order_count - secondary.thread_order_count);
  if (orderDelta > 0) {
    issues.push({
      id: "cross-order-drift",
      severity: orderDelta > 10 ? "high" : "medium",
      title: "Cross-host thread count drift",
      detail: `thread_order_count delta is ${orderDelta} between hosts.`,
      hint: "Plan one-way sync using one host as single writer.",
    });
  }

  const rolloutDelta = Math.abs(local.rollout_file_count - secondary.rollout_file_count);
  if (rolloutDelta > 0) {
    issues.push({
      id: "cross-rollout-drift",
      severity: rolloutDelta > 20 ? "high" : "medium",
      title: "Cross-host session file drift",
      detail: `rollout_file_count delta is ${rolloutDelta} between hosts.`,
      hint: "Run a staged rsync for sessions before state file sync.",
    });
  }

  if (
    local.config_sha256 &&
    secondary.config_sha256 &&
    local.config_sha256 !== secondary.config_sha256
  ) {
    issues.push({
      id: "config-hash-drift",
      severity: "low",
      title: "Config hash differs across hosts",
      detail: `primary=${shaShort(local.config_sha256)} secondary=${shaShort(secondary.config_sha256)}`,
      hint: "Diff config.toml before enabling one-click sync.",
    });
  }

  if (
    local.global_state_sha256 &&
    secondary.global_state_sha256 &&
    local.global_state_sha256 !== secondary.global_state_sha256
  ) {
    issues.push({
      id: "global-state-hash-drift",
      severity: "low",
      title: "Global state hash differs across hosts",
      detail: `primary=${shaShort(local.global_state_sha256)} secondary=${shaShort(secondary.global_state_sha256)}`,
      hint: "Treat global state as single-writer data to avoid sidebar drift.",
    });
  }

  return issues;
}

function calculateScore(local: HostSnapshot, secondary: HostSnapshot, issues: SyncIssue[]): number {
  let score = 100;
  if (!secondary.reachable) score -= 45;

  if (local.db_thread_count !== null && local.thread_order_count !== local.db_thread_count) {
    score -= 20;
  }
  if (
    secondary.db_thread_count !== null &&
    secondary.thread_order_count !== secondary.db_thread_count
  ) {
    score -= 20;
  }

  for (const issue of issues) {
    if (issue.severity === "high") score -= 12;
    if (issue.severity === "medium") score -= 7;
    if (issue.severity === "low") score -= 3;
  }
  return Math.max(0, Math.min(100, score));
}

function buildActionPreviews(): SyncActionPreview[] {
  const blocked = "Read-only preview mode: execution disabled for safety";
  return [
    {
      id: "pull-sessions-secondary-to-primary",
      title: "Preview: pull sessions from secondary to primary",
      direction: "secondary -> primary",
      risk: "high",
      command_preview:
        "rsync -a --delete \"secondary:$HOME/.codex/sessions/\" \"$HOME/.codex/sessions/\"",
      disabled_reason: blocked,
    },
    {
      id: "push-sessions-primary-to-secondary",
      title: "Preview: push sessions from primary to secondary",
      direction: "primary -> secondary",
      risk: "high",
      command_preview:
        "rsync -a --delete \"$HOME/.codex/sessions/\" \"secondary:$HOME/.codex/sessions/\"",
      disabled_reason: blocked,
    },
    {
      id: "sync-state-files-primary-to-secondary",
      title: "Preview: sync global-state + sqlite to secondary",
      direction: "primary -> secondary",
      risk: "high",
      command_preview:
        "rsync -a \"$HOME/.codex/.codex-global-state.json\" \"$HOME/.codex/state_5.sqlite\" \"secondary:$HOME/.codex/\"",
      disabled_reason: blocked,
    },
    {
      id: "enable-recurring-delta-sync",
      title: "Preview: enable recurring delta sync automation",
      direction: "scheduled",
      risk: "medium",
      command_preview:
        "launchd task: run one-way rsync every 10m with preflight checks",
      disabled_reason: blocked,
    },
  ];
}

export async function getSyncLensStatusTs() {
  const local = await collectLocalSnapshot("primary");
  const secondary = collectRemoteSnapshot(REMOTE_ALIAS);
  const issues = buildIssues(local, secondary);
  const score = calculateScore(local, secondary, issues);

  const diff = {
    rollout_file_delta: local.rollout_file_count - secondary.rollout_file_count,
    thread_order_delta: local.thread_order_count - secondary.thread_order_count,
    db_thread_delta:
      local.db_thread_count !== null && secondary.db_thread_count !== null
        ? local.db_thread_count - secondary.db_thread_count
        : null,
    archived_delta:
      local.db_archived_count !== null && secondary.db_archived_count !== null
        ? local.db_archived_count - secondary.db_archived_count
        : null,
    config_hash_equal:
      Boolean(local.config_sha256) &&
      Boolean(secondary.config_sha256) &&
      local.config_sha256 === secondary.config_sha256,
    global_state_hash_equal:
      Boolean(local.global_state_sha256) &&
      Boolean(secondary.global_state_sha256) &&
      local.global_state_sha256 === secondary.global_state_sha256,
  };

  const status =
    !secondary.reachable ? "partial" : issues.length === 0 ? "aligned" : "drifted";

  return {
    generated_at: nowIsoUtc(),
    mode: "read-only-preview",
    status,
    score,
    primary: local,
    secondary,
    diff,
    issues,
    actions: buildActionPreviews(),
  };
}
