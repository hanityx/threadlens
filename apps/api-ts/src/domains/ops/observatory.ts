import { runCmdText } from "../../lib/utils.js";

type ObservatoryCacheEntry = {
  expiresAt: number;
  payload: Record<string, unknown>;
};

let observatoryCache: ObservatoryCacheEntry | null = null;

function safeInt(value: string, fallback = 0): number {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeFloat(value: string, fallback = 0): number {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clipText(text: string, maxLen: number): string {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1).trim()}…`;
}

function isCodexRelatedCommand(commandLc: string): boolean {
  if (!commandLc) return false;
  const keywords = [
    "codex",
    "openai.chat-helper",
    "agent-loop",
    "oh-my-codex",
    "threadlens",
    "conductor",
    "tmux",
  ];
  if (!keywords.some((keyword) => commandLc.includes(keyword))) return false;
  const noise = [
    "ps -axo",
    "rg -i codex",
    "launchctl list",
    "curl -s http://127.0.0.1:8788",
    "lsof -np -itcp",
    "tmux list-panes -a",
  ];
  return !noise.some((fragment) => commandLc.includes(fragment));
}

function classifyCodexProcess(command: string): string {
  const lc = String(command || "").toLowerCase();
  if (lc.includes("/applications/codex.app/contents/macos/codex")) return "codex-desktop-main";
  if (lc.includes("codex helper (renderer)")) return "codex-desktop-renderer";
  if (lc.includes("codex helper --type=gpu-process")) return "codex-desktop-gpu";
  if (lc.includes("codex helper --type=utility")) return "codex-desktop-utility";
  if (lc.includes("codex app-server") && lc.includes("vscode/extensions/openai.chatgpt")) {
    return "vscode-codex-app-server";
  }
  if (lc.includes("codex app-server")) return "codex-app-server";
  if (lc.includes("oh-my-codex/dist/mcp/")) return "omx-mcp";
  if (lc.includes("openai.chat-helper")) return "openai-chat-helper";
  if (lc.includes("agent-loop") || lc.includes("loop control") || lc.includes("supervisor")) {
    return "automation-loop";
  }
  if (
    lc.includes("threadlens/apps/api-ts") ||
    lc.includes("@threadlens/api") ||
    lc.includes("src/app/create-server.ts")
  ) {
    return "overview-server";
  }
  if (lc.includes("tmux")) return "tmux";
  if (lc.includes("conductor")) return "conductor";
  return "codex-related";
}

function processSignature(processClass: string, command: string): string {
  const lc = String(command || "").trim().toLowerCase();
  if (processClass === "omx-mcp") {
    const match = lc.match(/\/mcp\/([^/\s]+)$/);
    return `omx-mcp:${match?.[1] ?? "unknown"}`;
  }
  if (processClass.startsWith("codex-desktop")) {
    const match = lc.match(/--type=([a-z\-]+)/);
    return match ? `codex-helper:${match[1]}` : processClass;
  }
  if (processClass === "codex-app-server" || processClass === "vscode-codex-app-server") {
    return lc.includes("vscode/extensions/openai.chatgpt")
      ? "codex-app-server:vscode"
      : "codex-app-server:desktop";
  }
  if (processClass === "automation-loop") {
    const match = lc.match(/([a-z0-9._-]*(?:loop|control|controller|supervisor|injector)[a-z0-9._-]*\.sh)/);
    if (match) return `automation:${match[1].split("/").pop()}`;
  }
  const token = String(command || "").split(/\s+/)[0] || processClass;
  return `${processClass}:${token.split("/").pop()}`;
}

function collectCodexProcesses() {
  const out = runCmdText("ps -axo pid=,ppid=,%cpu=,%mem=,state=,etime=,command=", 10_000);
  const rows: Array<Record<string, unknown>> = [];
  for (const raw of out.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/, 7);
    if (parts.length < 7) continue;
    const command = parts[6]?.trim() ?? "";
    const lc = command.toLowerCase();
    if (!isCodexRelatedCommand(lc)) continue;
    const processClass = classifyCodexProcess(command);
    rows.push({
      pid: safeInt(parts[0], 0),
      ppid: safeInt(parts[1], 0),
      cpu: Number(safeFloat(parts[2], 0).toFixed(2)),
      mem: Number(safeFloat(parts[3], 0).toFixed(2)),
      state: parts[4],
      etime: parts[5],
      process_class: processClass,
      signature: processSignature(processClass, command),
      command: clipText(command, 700),
      command_clip: clipText(command, 240),
    });
  }
  rows.sort((a, b) => {
    const cpuDiff = Number(b.cpu ?? 0) - Number(a.cpu ?? 0);
    if (cpuDiff !== 0) return cpuDiff;
    const memDiff = Number(b.mem ?? 0) - Number(a.mem ?? 0);
    if (memDiff !== 0) return memDiff;
    return Number(a.pid ?? 0) - Number(b.pid ?? 0);
  });

  const grouped = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = String(row.signature ?? "unknown");
    const existing = grouped.get(key) ?? {
      signature: key,
      process_class: row.process_class,
      count: 0,
      cpu_total: 0,
      mem_total: 0,
      max_etime: "",
      sample_command: row.command_clip,
    };
    existing.count = Number(existing.count ?? 0) + 1;
    existing.cpu_total = Number((Number(existing.cpu_total ?? 0) + Number(row.cpu ?? 0)).toFixed(2));
    existing.mem_total = Number((Number(existing.mem_total ?? 0) + Number(row.mem ?? 0)).toFixed(2));
    if (!existing.max_etime) existing.max_etime = row.etime;
    grouped.set(key, existing);
  }

  const processGroups = Array.from(grouped.values()).sort((a, b) => {
    const countDiff = Number(b.count ?? 0) - Number(a.count ?? 0);
    if (countDiff !== 0) return countDiff;
    const cpuDiff = Number(b.cpu_total ?? 0) - Number(a.cpu_total ?? 0);
    if (cpuDiff !== 0) return cpuDiff;
    return String(a.signature ?? "").localeCompare(String(b.signature ?? ""));
  });

  return {
    processes: rows,
    process_groups: processGroups,
  };
}

function collectTmuxSnapshot() {
  const sessions: Array<Record<string, unknown>> = [];
  const panes: Array<Record<string, unknown>> = [];
  const tmuxLs = runCmdText("tmux ls", 4000);
  for (const raw of tmuxLs.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const match = line.match(/^([^:]+):\s+([0-9]+)\s+windows?\s+\((.*)\)$/);
    if (match) {
      const session = match[1].trim();
      sessions.push({
        session,
        windows: safeInt(match[2], 0),
        meta: match[3].trim(),
        related: /(codex|agent.loop|autopilot|overview|omx)/i.test(session),
      });
      continue;
    }
    sessions.push({ session: line, windows: 0, meta: "", related: false });
  }

  const paneLs = runCmdText(
    "tmux list-panes -a -F '#S|#I.#P|#{pane_active}|#{pane_pid}|#{pane_current_command}|#{pane_current_path}'",
    4000,
  );
  for (const raw of paneLs.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split("|", 6);
    if (parts.length < 6) continue;
    const session = parts[0].trim();
    panes.push({
      session,
      pane: parts[1].trim(),
      active: parts[2].trim() === "1",
      pid: safeInt(parts[3], 0),
      command: parts[4].trim(),
      path: parts[5].trim(),
      related: /(codex|agent.loop|autopilot|overview|omx)/i.test(session),
    });
  }

  sessions.sort((a, b) => String(a.session ?? "").localeCompare(String(b.session ?? "")));
  panes.sort((a, b) => {
    const sessionDiff = String(a.session ?? "").localeCompare(String(b.session ?? ""));
    if (sessionDiff !== 0) return sessionDiff;
    return String(a.pane ?? "").localeCompare(String(b.pane ?? ""));
  });

  return { sessions, panes };
}

function collectLaunchServices() {
  const out = runCmdText("launchctl list", 6000);
  const rows: Array<Record<string, unknown>> = [];
  for (const raw of out.split("\n")) {
    const line = raw.trim();
    if (!line || line.toLowerCase().startsWith("pid")) continue;
    const parts = line.split(/\s+/, 3);
    if (parts.length < 3) continue;
    const label = parts[2];
    if (!/(codex|openai|agent.loop|chat-helper|conductor|omx)/i.test(label)) continue;
    rows.push({
      label,
      pid: parts[0] === "-" ? null : safeInt(parts[0], 0),
      status: parts[1],
    });
  }
  rows.sort((a, b) => String(a.label ?? "").localeCompare(String(b.label ?? "")));
  return rows;
}

function collectListeners(relatedPids: Set<number>) {
  const out = runCmdText("lsof -nP -iTCP -sTCP:LISTEN", 6000);
  const rows: Array<Record<string, unknown>> = [];
  const lines = out.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    if (index === 0 && line.toLowerCase().startsWith("command")) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;
    const command = parts[0];
    const pid = safeInt(parts[1], 0);
    const listen = parts[parts.length - 1];
    if (
      !relatedPids.has(pid) &&
      !/(codex|node|tmux|openai)/i.test(command) &&
      listen !== "127.0.0.1:8788"
    ) {
      continue;
    }
    rows.push({ command, pid, listen });
  }
  rows.sort((a, b) => {
    const commandDiff = String(a.command ?? "").localeCompare(String(b.command ?? ""));
    if (commandDiff !== 0) return commandDiff;
    return Number(a.pid ?? 0) - Number(b.pid ?? 0);
  });
  return rows;
}

export async function getCodexObservatoryTs(options?: {
  forceRefresh?: boolean;
  ttlMs?: number;
}) {
  const ttlMs = Math.max(1000, options?.ttlMs ?? 5000);
  const now = Date.now();
  if (!options?.forceRefresh && observatoryCache && observatoryCache.expiresAt > now) {
    return observatoryCache.payload;
  }

  const { processes, process_groups } = collectCodexProcesses();
  const class_counts = processes.reduce<Record<string, number>>((acc, row) => {
    const key = String(row.process_class ?? "unknown");
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const tmux = collectTmuxSnapshot();
  const launch_services = collectLaunchServices();
  const relatedPids = new Set(
    processes
      .map((row) => Number(row.pid ?? 0))
      .filter((pid) => Number.isFinite(pid) && pid > 0),
  );
  const listeners = collectListeners(relatedPids);
  const loops_digest: Array<Record<string, unknown>> = [];
  const mcpGroups = process_groups.filter((group) =>
    String(group.signature ?? "").startsWith("omx-mcp:"),
  );
  const heavyMcp = mcpGroups.filter((group) => Number(group.count ?? 0) >= 4);
  const alerts: string[] = [];
  if (Number(class_counts["codex-desktop-main"] ?? 0) === 0) {
    alerts.push("The Codex desktop main process is not visible.");
  }
  if (heavyMcp.length > 0) {
    alerts.push(`Detected ${heavyMcp.length} duplicated OMX MCP groups. Cleanup may be needed.`);
  }

  const payload = {
    generated_at: new Date(now).toISOString(),
    summary: {
      process_total: processes.length,
      process_group_total: process_groups.length,
      class_counts,
      mcp_group_total: mcpGroups.length,
      tmux_session_total: tmux.sessions.length,
      tmux_related_session_total: tmux.sessions.filter((row) => Boolean(row.related)).length,
      tmux_pane_total: tmux.panes.length,
      launch_service_total: launch_services.length,
      listener_total: listeners.length,
      loop_total: 0,
      loop_running_total: 0,
      loop_attention_total: 0,
    },
    alerts,
    process_groups: process_groups.slice(0, 120),
    processes: processes.slice(0, 260),
    tmux,
    launch_services: launch_services.slice(0, 200),
    listeners: listeners.slice(0, 200),
    loops_digest,
  };

  observatoryCache = {
    expiresAt: now + ttlMs,
    payload,
  };
  return payload;
}
