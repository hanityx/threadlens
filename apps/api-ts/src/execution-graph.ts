import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExecutionGraphData, ExecutionGraphEdge, ExecutionGraphNode } from "@threadlens/shared-contracts";
import { getProviderMatrixTs } from "./lib/providers.js";
import { getDataSourceInventoryTs } from "./domains/recovery/inventory.js";

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

  const [configRaw, stateRaw, providerMatrix, dataSourceInventory] = await Promise.all([
    readFile(codexConfigPath, "utf-8").catch(() => ""),
    readFile(globalStatePath, "utf-8").catch(() => "{}"),
    getProviderMatrixTs(),
    getDataSourceInventoryTs(),
  ]);
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
    { id: "entry", label: "Prompt entry", kind: "entry", detail: "GUI or CLI user input" },
    {
      id: "config",
      label: "~/.codex/config.toml",
      kind: "config",
      detail: redactPathForUi(codexConfigPath),
    },
    {
      id: "instructions",
      label: "Instruction interpreter",
      kind: "instruction",
      detail: "system > developer > user > AGENTS.md scope",
    },
    { id: "agents", label: "AGENTS.md chain", kind: "instruction", detail: "workspace/root plus nested overrides" },
    {
      id: "runtime",
      label: "Execution runtime",
      kind: "runtime",
      detail: "Tool calls plus local file reads and writes",
    },
    {
      id: "global",
      label: ".codex-global-state",
      kind: "runtime",
      detail: redactPathForUi(globalStatePath),
    },
  ];

  const edges: ExecutionGraphEdge[] = [
    { from: "entry", to: "instructions", reason: "Receive prompt" },
    { from: "config", to: "instructions", reason: "developer_instructions / features / hooks" },
    { from: "instructions", to: "agents", reason: "Resolve AGENTS.md scope" },
    { from: "agents", to: "runtime", reason: "Apply execution constraints" },
    { from: "runtime", to: "global", reason: "Read and write thread/session metadata" },
  ];

  const findings: string[] = [];
  const providerEvidence = (providerMatrix.providers ?? []).map((provider) => ({
    provider: provider.provider,
    name: provider.name,
    status: provider.status,
    capability_level: provider.capability_level,
    session_log_count: Number(provider.evidence?.session_log_count ?? 0),
    roots: Array.isArray(provider.evidence?.roots)
      ? provider.evidence.roots.map((item) => redactPathForUi(String(item)))
      : [],
    notes: String(provider.evidence?.notes ?? "").trim(),
    capabilities: {
      read_sessions: Boolean(provider.capabilities.read_sessions),
      analyze_context: Boolean(provider.capabilities.analyze_context),
      safe_cleanup: Boolean(provider.capabilities.safe_cleanup),
      hard_delete: Boolean(provider.capabilities.hard_delete),
    },
  }));
  const dataSourceEvidence = Object.entries(dataSourceInventory.sources ?? {})
    .map(([sourceKey, raw]) => {
      const pathValue = isRecord(raw) ? String(raw.path ?? "") : "";
      const presentValue = isRecord(raw)
        ? Boolean(raw.present ?? raw.exists)
        : false;
      return {
        source_key: sourceKey,
        path: redactPathForUi(pathValue),
        present: presentValue,
        file_count: isRecord(raw) ? Number(raw.file_count ?? 0) : 0,
        dir_count: isRecord(raw) ? Number(raw.dir_count ?? 0) : 0,
        total_bytes: isRecord(raw) ? Number(raw.total_bytes ?? raw.size_bytes ?? 0) : 0,
        latest_mtime: isRecord(raw) ? String(raw.latest_mtime ?? raw.mtime ?? "") || null : null,
      };
    })
    .sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      return a.source_key.localeCompare(b.source_key);
    });

  for (const provider of providerEvidence) {
    const providerId = `provider-${provider.provider}`;
    const capabilitySummary =
      provider.capability_level === "full"
        ? "Full capability"
        : provider.capability_level === "read-only"
          ? "Read only"
          : "Unavailable";
    const statusSummary =
      provider.status === "active"
        ? "Active"
        : provider.status === "detected"
          ? "Detected"
          : "Missing";
    nodes.push({
      id: providerId,
      label: provider.name,
      kind: "provider",
      detail: `${statusSummary} · ${capabilitySummary} · ${provider.session_log_count} logs${
        provider.notes ? ` · ${shortenText(provider.notes, 96)}` : ""
      }`,
    });
    edges.push({ from: "runtime", to: providerId, reason: "Scan local sessions and logs" });
  }

  if (notify.includes("oh-my-codex")) {
    findings.push("The oh-my-codex notify hook is wired into config, so it participates in runtime and notification flow.");
    nodes.push({
      id: "omx",
      label: "oh-my-codex hook",
      kind: "runtime",
      detail: redactSensitiveText(notify),
    });
    edges.push({ from: "config", to: "omx", reason: "notify hook" });
    edges.push({ from: "omx", to: "runtime", reason: "Hook-based integration" });
  }

  if (developerInstructions.toLowerCase().includes("agents.md")) {
    findings.push("The config developer instructions strongly steer AGENTS.md-based orchestration.");
    edges.push({ from: "config", to: "agents", reason: "developer_instructions references AGENTS.md" });
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
    edges.push({ from: "config", to: projId, reason: "Trusted project entry" });
  }
  if (trustedProjects.length > 0) {
    findings.push(`${trustedProjects.length} trusted projects are registered, so they appear as thread-reference candidates.`);
  }

  if (providerEvidence.length > 0) {
    const activeProviders = providerEvidence.filter((item) => item.status === "active").length;
    const detectedProviders = providerEvidence.filter((item) => item.status !== "missing").length;
    findings.push(
      `${detectedProviders} providers were detected, and ${activeProviders} of them can read sessions right now.`,
    );
    const cleanupReadyProviders = providerEvidence.filter(
      (item) => item.capabilities.safe_cleanup,
    ).length;
    findings.push(
      `${cleanupReadyProviders} providers support safe-cleanup dry-runs, while the rest stay read-first or diagnostic-only.`,
    );
  }

  const presentSources = dataSourceEvidence.filter((item) => item.present);
  if (presentSources.length > 0) {
    findings.push(
      `${presentSources.length} local data paths were confirmed and linked as provider-detection evidence.`,
    );
  }

  if (isRecord(stateObj)) {
    const activeRoots = Array.isArray(stateObj["active-workspace-roots"])
      ? (stateObj["active-workspace-roots"] as unknown[]).map((x) => String(x))
      : [];
    if (activeRoots.length > 0) {
      nodes.push({
        id: "active-roots",
        label: "Active workspace roots",
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
      providers: providerEvidence,
      data_sources: dataSourceEvidence,
    },
  };
}
