import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExecutionGraphData, ExecutionGraphEdge, ExecutionGraphNode } from "@codex/shared-contracts";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseTomlStringValue(raw: string, key: string): string {
  const m = raw.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"([^"]*)"`, "m"));
  return m?.[1]?.trim() ?? "";
}

function parseTomlStringArray(raw: string, key: string): string[] {
  const m = raw.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\\[(.*?)\\]`, "ms"));
  if (!m) return [];
  return m[1]
    .split(",")
    .map((x) => x.trim())
    .map((x) => x.replace(/^"/, "").replace(/"$/, ""))
    .filter(Boolean);
}

function shortenText(text: string, max = 180): string {
  const cleaned = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trim()}…`;
}

function redactSensitiveText(text: string): string {
  const raw = String(text ?? "");
  if (!raw) return "";
  let out = raw
    .replace(/\/Users\/[^\s"'`]+/g, "/user-root/<redacted>")
    .replace(/\/home\/[^\s"'`]+/g, "/user-root/<redacted>");
  out = out
    .replace(
      /\b(sk-[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,})\b/g,
      "<secret:redacted>",
    )
    .replace(
      /\b([A-Z0-9_]{2,}_(TOKEN|KEY|SECRET|PASSWORD))=([^\s"'`]+)/g,
      "$1=<redacted>",
    )
    .replace(
      /https?:\/\/[^\s"'`]*?(token|key|secret|password)=[^\s"'`]+/gi,
      "<redacted-url>",
    );
  const home = process.env.HOME ?? "";
  if (home && out.includes(home)) {
    out = out.split(home).join("$HOME");
  }
  return out;
}

function redactPathForUi(p: string): string {
  const raw = String(p ?? "");
  if (!raw) return "";
  const home = process.env.HOME ?? "";
  if (home && raw.startsWith(home)) {
    return `~${raw.slice(home.length)}`;
  }
  return redactSensitiveText(raw);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function getExecutionGraphData(codexHome: string): Promise<ExecutionGraphData> {
  const codexConfigPath = path.join(codexHome, "config.toml");
  const globalStatePath = path.join(codexHome, ".codex-global-state.json");

  const configRaw = await readFile(codexConfigPath, "utf-8").catch(() => "");
  const stateRaw = await readFile(globalStatePath, "utf-8").catch(() => "{}");
  const stateObj = safeJsonParse(stateRaw);

  const notifyArr = parseTomlStringArray(configRaw, "notify");
  const notify = notifyArr.join(" ");
  const developerInstructions = parseTomlStringValue(configRaw, "developer_instructions");

  const trustedProjects: string[] = [];
  for (const line of configRaw.split("\n")) {
    const m = line.match(/^\s*\[projects\."([^"]+)"\]\s*$/);
    if (m?.[1]) trustedProjects.push(m[1]);
  }

  const nodes: ExecutionGraphNode[] = [
    { id: "entry", label: "Codex Prompt Entry", kind: "entry", detail: "GUI/CLI user prompt" },
    {
      id: "config",
      label: "~/.codex/config.toml",
      kind: "config",
      detail: redactPathForUi(codexConfigPath),
    },
    {
      id: "instructions",
      label: "Instruction Resolver",
      kind: "instruction",
      detail: "system > developer > user > AGENTS.md scope",
    },
    { id: "agents", label: "AGENTS.md Chain", kind: "instruction", detail: "workspace/root + nested overrides" },
    {
      id: "runtime",
      label: "Codex Runtime",
      kind: "runtime",
      detail: "tool calls + local file reads/writes",
    },
    {
      id: "global",
      label: ".codex-global-state",
      kind: "runtime",
      detail: redactPathForUi(globalStatePath),
    },
  ];

  const edges: ExecutionGraphEdge[] = [
    { from: "entry", to: "instructions", reason: "prompt received" },
    { from: "config", to: "instructions", reason: "developer_instructions / features / hooks" },
    { from: "instructions", to: "agents", reason: "AGENTS.md scope resolution" },
    { from: "agents", to: "runtime", reason: "task execution constraints" },
    { from: "runtime", to: "global", reason: "thread/session metadata read/write" },
  ];

  const findings: string[] = [];

  if (notify.includes("oh-my-codex")) {
    findings.push("oh-my-codex notify hook is wired in config — it participates in the runtime/notification path.");
    nodes.push({
      id: "omx",
      label: "oh-my-codex Hook",
      kind: "runtime",
      detail: redactSensitiveText(notify),
    });
    edges.push({ from: "config", to: "omx", reason: "notify hook" });
    edges.push({ from: "omx", to: "runtime", reason: "hook-driven integration" });
  }

  if (developerInstructions.toLowerCase().includes("agents.md")) {
    findings.push("developer_instructions in config strongly guides AGENTS.md-based orchestration.");
    edges.push({ from: "config", to: "agents", reason: "developer_instructions mentions AGENTS.md" });
  }

  for (const proj of trustedProjects) {
    const projId = `proj-${proj.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const shortLabel = proj.split("/").pop() ?? proj;
    nodes.push({
      id: projId,
      label: `Project: ${shortLabel}`,
      kind: "workspace",
      detail: redactPathForUi(proj),
    });
    edges.push({ from: "config", to: projId, reason: "trusted project entry" });
  }
  if (trustedProjects.length > 0) {
    findings.push(`${trustedProjects.length} trusted project(s) registered — exposed as thread reference candidates.`);
  }

  if (isRecord(stateObj)) {
    const activeRoots = Array.isArray(stateObj["active-workspace-roots"])
      ? (stateObj["active-workspace-roots"] as unknown[]).map((x) => String(x))
      : [];
    if (activeRoots.length > 0) {
      nodes.push({
        id: "active-roots",
        label: "Active Workspace Roots",
        kind: "workspace",
        detail: `${activeRoots.length} roots`,
      });
      edges.push({ from: "global", to: "active-roots", reason: "active-workspace-roots" });
    }
  }

  return {
    generated_at: new Date().toISOString(),
    nodes,
    edges,
    findings,
    evidence: {
      codex_config_path: redactPathForUi(codexConfigPath),
      global_state_path: redactPathForUi(globalStatePath),
      notify_hook: notify ? redactSensitiveText(notify) : undefined,
      developer_instructions_excerpt: developerInstructions
        ? shortenText(redactSensitiveText(developerInstructions))
        : undefined,
      trusted_projects: trustedProjects.map((item) => redactPathForUi(item)),
    },
  };
}
