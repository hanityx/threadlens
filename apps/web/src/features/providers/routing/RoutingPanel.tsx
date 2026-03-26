import { useMemo } from "react";
import { PanelHeader } from "../../../design-system/PanelHeader";
import type { ExecutionGraphData } from "@threadlens/shared-contracts";
import type { Messages } from "../../../i18n";
import { compactPath, formatDateTime } from "../../../lib/helpers";
import type {
  ProviderParserHealthReport,
  ProviderSessionRow,
  ProviderView,
} from "../../../types";

type Props = {
  messages: Messages;
  data: ExecutionGraphData | null | undefined;
  loading: boolean;
  providerView: ProviderView;
  providerSessionRows: ProviderSessionRow[];
  parserReports: ProviderParserHealthReport[];
  visibleProviderIds?: string[];
};

function providerFromSourceKey(sourceKey: string): string | null {
  if (
    sourceKey === "codex_root" ||
    sourceKey === "sessions" ||
    sourceKey === "archived_sessions" ||
    sourceKey === "history" ||
    sourceKey === "global_state"
  ) {
    return "codex";
  }
  if (sourceKey === "chat_root") return "chatgpt";
  if (sourceKey === "claude_root" || sourceKey === "claude_projects") return "claude";
  if (sourceKey === "gemini_root" || sourceKey === "gemini_tmp") return "gemini";
  if (sourceKey === "copilot_vscode" || sourceKey === "copilot_cursor") return "copilot";
  return null;
}

function sessionSourceLabel(source: string): string {
  if (source === "sessions") return "Codex session logs";
  if (source === "projects") return "Claude project logs";
  if (source === "transcripts") return "Claude transcript store";
  if (source === "tmp") return "Gemini temp sessions";
  if (source === "antigravity_conversations") return "Gemini conversation store";
  if (source === "conversations") return "ChatGPT conversation cache";
  if (source === "project-conversations") return "ChatGPT project conversations";
  if (source === "vscode_global") return "VS Code global traces";
  if (source === "cursor_workspace_chats") return "Cursor workspace chats";
  if (source === "vscode_workspace_chats") return "VS Code workspace chats";
  return source;
}

function formatLabel(format: "jsonl" | "json" | "unknown"): string {
  if (format === "jsonl") return "JSONL";
  if (format === "json") return "JSON";
  return "Unknown";
}

function providerManagementProfile(provider: string): Array<{
  label: string;
  value: string;
  hint: string;
}> {
  if (provider === "codex") {
    return [
      {
        label: "Session model",
        value: "thread_id + session logs + global state",
        hint: "Thread-first model.",
      },
      {
        label: "Resume / identify",
        value: "thread_id · pinned · global state",
        hint: "Includes pinned and state.",
      },
      {
        label: "Cleanup scope",
        value: "impact + dry-run + state references",
        hint: "Impact comes first.",
      },
      {
        label: "Primary surface",
        value: "review + transcript",
        hint: "Review rail first.",
      },
    ];
  }
  if (provider === "claude") {
    return [
      {
        label: "Session model",
        value: "session_id + raw project/transcript sessions",
        hint: "Session-first model.",
      },
      {
        label: "Resume / identify",
        value: "session id / transcript file",
        hint: "Session id and transcript first.",
      },
      {
        label: "Cleanup scope",
        value: "raw session file dry-run / archive / delete",
        hint: "Raw-file cleanup first.",
      },
      {
        label: "Primary surface",
        value: "session archive",
        hint: "Transcript first.",
      },
    ];
  }
  if (provider === "gemini") {
    return [
      {
        label: "Session model",
        value: "history / temp / checkpoint stores",
        hint: "Store bundle first.",
      },
      {
        label: "Resume / identify",
        value: "history / temp / conversation stores",
        hint: "Distribution and format first.",
      },
      {
        label: "Cleanup scope",
        value: "raw session file dry-run / archive / delete",
        hint: "Dry-run before cleanup.",
      },
      {
        label: "Primary surface",
        value: "session archive",
        hint: "Inventory first.",
      },
    ];
  }
  if (provider === "copilot") {
    return [
      {
        label: "Session model",
        value: "workspace/global chat artifacts",
        hint: "Diagnostics only.",
      },
      {
        label: "Resume / identify",
        value: "workspace chat JSON",
        hint: "Workspace files first.",
      },
      {
        label: "Cleanup scope",
        value: "raw file dry-run",
        hint: "Dry-run only.",
      },
      {
        label: "Primary surface",
        value: "session archive > optional ai",
        hint: "Open only when needed.",
      },
    ];
  }
  return [
    {
      label: "Session model",
      value: "mixed cache / raw session stores",
      hint: "Read first.",
    },
    {
      label: "Resume / identify",
      value: "session files / cache paths",
      hint: "Cache and files first.",
    },
    {
      label: "Cleanup scope",
      value: "read first",
      hint: "Destructive actions limited.",
    },
    {
      label: "Primary surface",
      value: "session archive",
      hint: "Raw verification only.",
    },
  ];
}

function providerWorkbenchNote(provider: string): string {
  if (provider === "codex") {
    return "thread / state";
  }
  if (provider === "claude") {
    return "session / transcript";
  }
  if (provider === "gemini") {
    return "history / tmp";
  }
  if (provider === "copilot") {
    return "support only";
  }
  if (provider === "chatgpt") {
    return "cache first";
  }
  return "read first";
}

function flowReasonLabel(reason: string): string {
  if (reason === "GUI or CLI user input") return "entry";
  if (reason === "Receive prompt") return "prompt";
  if (reason === "workspace/root plus nested overrides") return "agents scope";
  if (reason === "Resolve AGENTS.md scope") return "agents scope";
  if (reason === "system > developer > user > AGENTS.md scope") return "priority";
  if (reason === "Priority chain applied.") return "priority";
  if (reason === "Tool calls plus local file reads and writes") return "tool io";
  if (reason === "developer_instructions / features / hooks") return "config";
  if (reason === "Read and write thread/session metadata") return "thread meta";
  if (reason === "Thread and session metadata.") return "thread meta";
  if (reason === "Scan local sessions and logs") return "session scan";
  if (reason === "Local session scan.") return "session scan";
  if (reason === "Trusted project entry") return "trusted root";
  if (reason === "Trusted project.") return "trusted root";
  if (reason === "active-workspace-roots") return "active roots";
  if (reason === "Active workspace roots.") return "active roots";
  if (reason === "Apply execution constraints") return "runtime";
  if (reason.includes("Read-first cache model")) return providerWorkbenchNote("chatgpt");
  if (reason.includes("Managed around session_id")) return providerWorkbenchNote("claude");
  if (reason.includes("operations-grade model built around thread_id")) return providerWorkbenchNote("codex");
  if (reason.includes("Auxiliary diagnostics only")) return providerWorkbenchNote("copilot");
  if (reason.includes("Managed across history, tmp")) return providerWorkbenchNote("gemini");
  if (reason.includes("Collect candidate session files")) return "candidate scan";
  if (reason.includes("User focused the view")) return "scope focus";
  if (reason.includes("Start scanning from this provider")) return "provider scan";
  if (reason.includes("Classify file formats")) return "formats";
  if (reason.includes("Summarize capability coverage")) return "coverage";
  if (reason.includes("Determine what can open transcripts")) return "transcript";
  if (reason.includes("Pass transcript, search, and summary")) return "parser handoff";
  if (reason.includes("Flow into session detail")) return "detail rail";
  if (reason.includes("Read Codex-specific global state")) return "global state";
  if (reason.includes("Recent workspace and global state")) return "workspace state";
  if (reason.includes("Decide whether dry-run")) return "dry-run";
  if (reason.includes("limited to reading and analysis")) return "read only";
  return reason;
}

function summarizeRoots(roots: string[]): string {
  if (roots.length === 0) return "No paths";
  const preview = roots.slice(0, 2).map((root) => compactPath(root, 24)).join(" · ");
  if (roots.length <= 2) return preview;
  return `${preview} · +${roots.length - 2}`;
}

function compactFootprint(fileCount?: number | null, dirCount?: number | null): string {
  const files = fileCount ?? 0;
  const dirs = dirCount ?? 0;
  if (!files && !dirs) return "";
  return `${files}f / ${dirs}d`;
}

export function RoutingPanel({
  messages,
  data,
  loading,
  providerView,
  providerSessionRows,
  parserReports,
  visibleProviderIds = [],
}: Props) {
  const visibleProviderIdSet = useMemo(
    () => new Set(visibleProviderIds.filter(Boolean)),
    [visibleProviderIds],
  );
  const orderedNodes = useMemo(() => {
    const order: Record<string, number> = {
      entry: 0,
      config: 1,
      instruction: 2,
      workspace: 3,
      provider: 4,
      runtime: 5,
    };
    return [...(data?.nodes ?? [])].sort((a, b) => {
      const ao = order[a.kind] ?? 99;
      const bo = order[b.kind] ?? 99;
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label);
    });
  }, [data?.nodes]);

  const kindLabel = (kind: string) => {
    if (kind === "entry") return messages.routing.kindEntry;
    if (kind === "config") return messages.routing.kindConfig;
    if (kind === "instruction") return messages.routing.kindInstruction;
    if (kind === "workspace") return messages.routing.kindWorkspace;
    if (kind === "provider") return messages.routing.kindProvider;
    return messages.routing.kindRuntime;
  };

  const providerStatusLabel = (status: string) => {
    if (status === "active") return messages.providers.statusActive;
    if (status === "detected") return messages.providers.statusDetected;
    return messages.providers.statusMissing;
  };

  const providerCapabilityLabel = (level: string) => {
    if (level === "full") return messages.routing.capabilityFull;
    if (level === "read-only") return messages.routing.capabilityReadonly;
    return messages.routing.capabilityUnavailable;
  };

  const providerEvidence = (data?.evidence?.providers ?? []).filter(
    (provider) =>
      visibleProviderIdSet.size === 0 || visibleProviderIdSet.has(provider.provider),
  );
  const dataSources = (data?.evidence?.data_sources ?? []).filter((item) => {
    const providerId = providerFromSourceKey(item.source_key);
    return providerId ? visibleProviderIdSet.size === 0 || visibleProviderIdSet.has(providerId) : true;
  });
  const focusedProvider =
    providerView === "all"
      ? null
      : providerEvidence.find((provider) => provider.provider === providerView) ?? null;
  const visibleProviders = focusedProvider ? [focusedProvider] : providerEvidence;
  const presentDataSources = dataSources.filter((item) => item.present);
  const scopedDataSources = focusedProvider
    ? presentDataSources.filter(
        (item) => providerFromSourceKey(item.source_key) === focusedProvider.provider,
      )
    : presentDataSources;
  const focusedSessionRows = useMemo(() => {
    if (!focusedProvider) return [];
    return providerSessionRows.filter((row) => row.provider === focusedProvider.provider);
  }, [focusedProvider, providerSessionRows]);
  const focusedParserReport = useMemo(() => {
    if (!focusedProvider) return null;
    return parserReports.find((report) => report.provider === focusedProvider.provider) ?? null;
  }, [focusedProvider, parserReports]);
  const sourceBreakdown = useMemo(() => {
    if (!focusedProvider) return [];
    const counts = new Map<string, number>();
    for (const row of focusedSessionRows) {
      counts.set(row.source, (counts.get(row.source) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([source, count]) => ({
        source,
        count,
        label: sessionSourceLabel(source),
      }))
      .sort((a, b) => b.count - a.count);
  }, [focusedProvider, focusedSessionRows]);
  const formatBreakdown = useMemo(() => {
    if (!focusedProvider) return [];
    const counts = new Map<"jsonl" | "json" | "unknown", number>();
    for (const row of focusedSessionRows) {
      counts.set(row.probe.format, (counts.get(row.probe.format) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([format, count]) => ({
        format,
        count,
        label: formatLabel(format),
      }))
      .sort((a, b) => b.count - a.count);
  }, [focusedProvider, focusedSessionRows]);
  const transcriptCapableCount = useMemo(
    () =>
      focusedSessionRows.filter(
        (row) => row.probe.format === "jsonl" || row.probe.format === "json",
      ).length,
    [focusedSessionRows],
  );
  const transcriptBlockedCount = focusedSessionRows.length - transcriptCapableCount;
  const sourceSummary = sourceBreakdown
    .slice(0, 3)
    .map((item) => `${item.label} ${item.count}`)
    .join(" · ");
  const formatSummary = formatBreakdown
    .map((item) => `${item.label} ${item.count}`)
    .join(" · ");

  const focusedSourceNodes = useMemo(() => {
    if (!focusedProvider) return [];
    if (sourceBreakdown.length > 0) {
      return sourceBreakdown.slice(0, 4).map((item) => ({
        id: `source-${focusedProvider.provider}-${item.source}`,
        label: item.label,
        kind: "workspace" as const,
        detail: `${item.count} sessions · ${item.source}`,
      }));
    }
    return focusedProvider.roots.map((root, index) => ({
      id: `root-${focusedProvider.provider}-${index}`,
      label: `${focusedProvider.name} root`,
      kind: "workspace" as const,
      detail: root,
    }));
  }, [focusedProvider, sourceBreakdown]);

  const scopedNodes = useMemo(() => {
    if (!focusedProvider) return orderedNodes;
    const entryNode =
      orderedNodes.find((node) => node.id === "entry") ?? {
        id: "entry",
        label: messages.routing.kindEntry,
        kind: "entry" as const,
      };
    const providerNodeId = `provider-${focusedProvider.provider}`;
    const contextNode = {
      id: `context-${focusedProvider.provider}`,
      label: `${focusedProvider.name} context`,
      kind: "config" as const,
      detail:
        focusedProvider.provider === "codex"
          ? data?.evidence?.codex_config_path ?? focusedProvider.notes ?? "-"
          : providerWorkbenchNote(focusedProvider.provider),
    };
    const providerNode = {
      id: providerNodeId,
      label: focusedProvider.name,
      kind: "provider" as const,
      detail: `${providerStatusLabel(focusedProvider.status)} · ${providerCapabilityLabel(
        focusedProvider.capability_level,
      )}`,
    };
    const inventoryNode = {
      id: `inventory-${focusedProvider.provider}`,
      label: `${focusedProvider.name} session inventory`,
      kind: "workspace" as const,
      detail:
        focusedSessionRows.length > 0
          ? `${focusedSessionRows.length} logs · ${sourceSummary || "storage map"}`
          : "No session logs yet",
    };
    const formatNode = {
      id: `format-${focusedProvider.provider}`,
      label: `${focusedProvider.name} storage formats`,
      kind: "config" as const,
      detail: formatSummary || "No format summary yet",
    };
    const transcriptNode = {
      id: `transcript-${focusedProvider.provider}`,
      label: `${focusedProvider.name} transcript access`,
      kind: "instruction" as const,
      detail:
        transcriptCapableCount > 0
          ? `${transcriptCapableCount} transcript-ready${
              transcriptBlockedCount > 0 ? ` · ${transcriptBlockedCount} blocked` : ""
            }`
          : "No transcript-ready format yet",
    };
    const parserNode = {
      id: `parser-${focusedProvider.provider}`,
      label: `${focusedProvider.name} parsing`,
      kind: "instruction" as const,
      detail: focusedParserReport
        ? `OK ${focusedParserReport.parse_ok}/${focusedParserReport.scanned} · score ${focusedParserReport.parse_score ?? "-"}`
        : focusedProvider.capabilities.read_sessions && focusedProvider.capabilities.analyze_context
          ? "Transcript, search, and risk are ready"
          : "More readable data required",
    };
    const reviewNode = {
      id: `review-${focusedProvider.provider}`,
      label: `${focusedProvider.name} review path`,
      kind: "runtime" as const,
      detail: focusedProvider.capabilities.analyze_context
        ? "Session rail, transcript, and review rail"
        : "Detect and session list only",
    };
    const cleanupNode = {
      id: `cleanup-${focusedProvider.provider}`,
      label: `${focusedProvider.name} cleanup stage`,
      kind: "runtime" as const,
      detail: focusedProvider.capabilities.safe_cleanup
        ? "Dry-run and apply ready"
        : focusedProvider.capability_level === "read-only"
          ? "Read-only, cleanup locked"
          : "Safe cleanup not ready",
    };

    const nodes = [
      entryNode,
      contextNode,
      ...focusedSourceNodes,
      inventoryNode,
      formatNode,
      providerNode,
      transcriptNode,
      parserNode,
      reviewNode,
    ];

    if (focusedProvider.provider === "codex" && data?.evidence?.global_state_path) {
      nodes.push({
        id: "global",
        label: "Codex global state",
        kind: "runtime" as const,
        detail: data.evidence.global_state_path,
      });
    }

    nodes.push(cleanupNode);
    return nodes;
  }, [
    focusedProvider,
    orderedNodes,
    messages.routing.kindEntry,
    focusedSourceNodes,
    sourceSummary,
    formatSummary,
    transcriptCapableCount,
    transcriptBlockedCount,
    focusedParserReport,
    providerStatusLabel,
    providerCapabilityLabel,
    data?.evidence?.codex_config_path,
    data?.evidence?.global_state_path,
  ]);

  const scopedEdges = useMemo(() => {
    if (!focusedProvider) return data?.edges ?? [];
    const providerNodeId = `provider-${focusedProvider.provider}`;
    const inventoryNodeId = `inventory-${focusedProvider.provider}`;
    const formatNodeId = `format-${focusedProvider.provider}`;
    const transcriptNodeId = `transcript-${focusedProvider.provider}`;
    const parserNodeId = `parser-${focusedProvider.provider}`;
    const reviewNodeId = `review-${focusedProvider.provider}`;
    const cleanupNodeId = `cleanup-${focusedProvider.provider}`;
    const contextNodeId = `context-${focusedProvider.provider}`;
    const sourceNodeIds = focusedSourceNodes.map((node) => node.id);
    const sourceEdges = sourceNodeIds.map((sourceId) => ({
      from: sourceId,
      to: inventoryNodeId,
      reason: "Collect candidate session files from this store or cache into the inventory",
    }));

    return [
      {
        from: "entry",
        to: contextNodeId,
        reason: "User focused the view on this provider",
      },
      {
        from: contextNodeId,
        to: sourceNodeIds[0] ?? inventoryNodeId,
        reason: "Start scanning from this provider's roots and local paths",
      },
      ...sourceEdges,
      {
        from: inventoryNodeId,
        to: formatNodeId,
        reason: "Classify file formats and storage locations",
      },
      {
        from: formatNodeId,
        to: providerNodeId,
        reason: "Summarize capability coverage for this provider by format",
      },
      {
        from: providerNodeId,
        to: transcriptNodeId,
        reason: "Determine what can open transcripts directly and what stays metadata-only",
      },
      {
        from: transcriptNodeId,
        to: parserNodeId,
        reason: "Pass transcript, search, and summary work into the parser layer",
      },
      {
        from: parserNodeId,
        to: reviewNodeId,
        reason: "Flow into session detail, cleanup review, and filtered inspection",
      },
      ...(focusedProvider.provider === "codex" && data?.evidence?.global_state_path
        ? [
            {
              from: contextNodeId,
              to: "global",
              reason: "Read Codex-specific global state together with workspace metadata",
            },
            {
              from: "global",
              to: reviewNodeId,
              reason: "Recent workspace and global state enrich the review surface",
            },
          ]
        : []),
      {
        from: reviewNodeId,
        to: cleanupNodeId,
        reason: focusedProvider.capabilities.safe_cleanup
          ? "Decide whether dry-run and real cleanup are available at the final step"
          : "This path is currently limited to reading and analysis",
      },
    ];
  }, [focusedProvider, data?.edges, data?.evidence?.global_state_path, focusedSourceNodes]);

  const scopedFindings = useMemo(() => {
    if (!focusedProvider) {
      const findings: string[] = [];
      findings.push(`trusted projects ${data?.evidence?.trusted_projects.length ?? 0}`);
      findings.push(`active providers ${visibleProviders.length}`);
      findings.push(`cleanup ready ${visibleProviders.filter((provider) => provider.capabilities.safe_cleanup).length}`);
      findings.push(`local paths ${scopedDataSources.length}`);
      return findings;
    }
    const findings: string[] = [];
    if (focusedProvider.status === "missing") {
      findings.push(`${focusedProvider.name} local traces not found yet.`);
    } else {
      findings.push(
        `${focusedProvider.name} · ${providerStatusLabel(focusedProvider.status)} · ${providerCapabilityLabel(
          focusedProvider.capability_level,
        )}`,
      );
      findings.push(
        `session logs ${focusedSessionRows.length || focusedProvider.session_log_count}`,
      );
    }
    if (scopedDataSources.length > 0) {
      findings.push(`paths ${scopedDataSources.length}`);
    }
    if (sourceBreakdown.length > 0) {
      findings.push(sourceBreakdown
        .slice(0, 3)
        .map((item) => `${item.label} ${item.count}`)
        .join(" · "));
    }
    if (formatBreakdown.length > 0) {
      findings.push(formatBreakdown
        .map((item) => `${item.label} ${item.count}`)
        .join(" · "));
    }
    if (transcriptBlockedCount > 0) {
      findings.push(`transcript blocked ${transcriptBlockedCount}`);
    }
    if (focusedParserReport) {
      findings.push(`parser ${focusedParserReport.parse_ok}/${focusedParserReport.scanned} · fail ${focusedParserReport.parse_fail}`);
    }
    if (focusedProvider.capabilities.safe_cleanup) {
      findings.push("dry-run + apply ready");
    } else if (focusedProvider.capabilities.read_sessions) {
      findings.push("read/analyze only");
    } else {
      findings.push("readable data still thin");
    }
    return findings;
  }, [
    focusedProvider,
    focusedSessionRows.length,
    scopedDataSources.length,
    sourceBreakdown,
    formatBreakdown,
    transcriptBlockedCount,
    focusedParserReport,
    providerCapabilityLabel,
    providerStatusLabel,
    data?.evidence?.trusted_projects.length,
    visibleProviders,
  ]);

  const contextCards = useMemo(() => {
    if (!focusedProvider) return [];
    const cards = [
      {
        label: messages.routing.contextSources,
        value: sourceSummary || "No storage summary",
        hint:
          sourceSummary.length > 0
            ? "Current storage scope."
            : "Storage summary is still thin.",
      },
      {
        label: messages.routing.contextFormats,
        value: formatSummary || "No format summary",
        hint:
          transcriptBlockedCount > 0
            ? `Transcript ${transcriptCapableCount} · blocked ${transcriptBlockedCount}`
            : transcriptCapableCount > 0
              ? "Transcript-first format."
              : "No direct transcript yet.",
      },
      {
        label: messages.routing.contextParser,
        value: focusedParserReport
          ? `${focusedParserReport.parse_ok}/${focusedParserReport.scanned} (score ${focusedParserReport.parse_score ?? "-"})`
          : "No parser report",
        hint: focusedParserReport
          ? focusedParserReport.parse_fail > 0
            ? `${focusedParserReport.parse_fail} fails remain`
            : "Current range is stable."
          : "Parser report pending.",
      },
      {
        label: messages.routing.contextLimits,
        value: focusedProvider.capabilities.safe_cleanup
          ? "Dry-run + apply"
          : focusedProvider.capabilities.read_sessions
            ? "Read + analyze first"
            : "Detect first",
        hint:
          providerWorkbenchNote(focusedProvider.provider),
      },
    ];
    if (focusedProvider.provider === "codex") {
      cards.unshift({
        label: messages.routing.contextConfig,
        value: data?.evidence?.codex_config_path ?? "-",
        hint: data?.evidence?.global_state_path
          ? `Global state: ${data.evidence.global_state_path}`
          : "No global-state file has been detected yet.",
      });
    }
    return cards;
  }, [
    focusedProvider,
    sourceSummary,
    formatSummary,
    transcriptBlockedCount,
    transcriptCapableCount,
    focusedParserReport,
    messages.routing.contextConfig,
    messages.routing.contextFormats,
    messages.routing.contextLimits,
    messages.routing.contextParser,
    messages.routing.contextSources,
    data?.evidence?.codex_config_path,
    data?.evidence?.global_state_path,
  ]);

  const providerDetailRows = useMemo(() => {
    if (!focusedProvider) return [];
    const nextStep = focusedProvider.capabilities.safe_cleanup
      ? "Run dry-run from the session rail."
      : focusedProvider.capabilities.read_sessions
        ? "Read transcript first. Cleanup stays locked."
        : "Collect more traces or session logs.";
    return [
      {
        label: "Session logs",
        value:
          focusedSessionRows.length > 0
            ? `${focusedSessionRows.length}`
            : focusedProvider.session_log_count > 0
              ? `${focusedProvider.session_log_count}`
              : "None",
        hint:
          focusedSessionRows.length > 0
            ? "Open in the rail."
            : "The rail may stay empty.",
      },
      {
        label: "Local evidence",
        value: scopedDataSources.length > 0 ? `${scopedDataSources.length} detected` : "Not enough source paths",
        hint:
          scopedDataSources.length > 0
            ? "Current flow and scan evidence."
            : "More evidence paths required.",
      },
      {
        label: "Read / analyze",
        value: focusedProvider.capabilities.analyze_context ? "Ready" : "Limited",
        hint: focusedProvider.capabilities.analyze_context
          ? "Search and analysis ready."
          : "Read or analysis scope is limited.",
      },
      {
        label: "Recommended next step",
        value: focusedProvider.capabilities.safe_cleanup ? "Dry-run available" : "Read-first path",
        hint: nextStep,
      },
    ];
  }, [focusedProvider, focusedSessionRows.length, scopedDataSources.length]);

  const scopedNodeLabel = useMemo(() => {
    const label = new Map<string, string>();
    for (const node of scopedNodes ?? []) {
      label.set(node.id, node.label);
    }
    return label;
  }, [scopedNodes]);

  const providerFlowStages = useMemo(() => {
    if (!focusedProvider) return [];
    const detectReady = scopedDataSources.length > 0 || focusedProvider.roots.length > 0;
    const sessionsReady = focusedSessionRows.length > 0 || focusedProvider.session_log_count > 0;
    const parserReady =
      (focusedProvider.capabilities.read_sessions && focusedProvider.capabilities.analyze_context) ||
      Boolean(focusedParserReport?.parse_ok);
    const cleanupReady = focusedProvider.capabilities.safe_cleanup;
    const stageStatus = (ready: boolean, blocked = false) =>
      blocked ? "blocked" : ready ? "done" : "pending";
    return [
      {
        key: "detect",
        label: messages.providers.flowStageDetect,
        status: stageStatus(detectReady),
        detail: detectReady
          ? `${scopedDataSources.length || focusedProvider.roots.length} paths ready`
          : "Traces still thin",
      },
      {
        key: "sessions",
        label: messages.providers.flowStageSessions,
        status: stageStatus(sessionsReady, !detectReady),
        detail: sessionsReady
          ? `${focusedSessionRows.length || focusedProvider.session_log_count} logs ready`
          : "No session logs",
      },
      {
        key: "parser",
        label: messages.providers.flowStageParser,
        status: stageStatus(parserReady, !sessionsReady),
        detail: parserReady
          ? focusedParserReport
            ? `OK ${focusedParserReport.parse_ok}/${focusedParserReport.scanned}`
            : "Transcript and analysis ready"
          : "More readable data needed",
      },
      {
        key: "cleanup",
        label: messages.providers.flowStageSafeCleanup,
        status: stageStatus(
          cleanupReady,
          focusedProvider.capability_level === "read-only" ||
            focusedProvider.status === "missing",
        ),
        detail: cleanupReady
          ? "dry-run + apply ready"
          : focusedProvider.capability_level === "read-only"
            ? "Read-only, locked"
            : "Cleanup not ready",
      },
    ];
  }, [
    focusedProvider,
    focusedParserReport,
    focusedSessionRows.length,
    messages.providers.flowStageDetect,
    messages.providers.flowStageParser,
    messages.providers.flowStageSafeCleanup,
    messages.providers.flowStageSessions,
    scopedDataSources.length,
  ]);

  const showCodexContext = !focusedProvider || focusedProvider.provider === "codex";
  const managementProfileRows = useMemo(
    () => (focusedProvider ? providerManagementProfile(focusedProvider.provider) : []),
    [focusedProvider],
  );

  return (
    <section className="panel routing-workbench-panel">
      <PanelHeader title="Diagnostics map" subtitle={formatDateTime(data?.generated_at)} />
      <div className="impact-body">
        <section className="routing-stage-shell">
          <div className="routing-stage-copy">
            <span className="overview-note-label">Routing stage</span>
            <strong>Current map</strong>
            <p>Paths, readiness, and findings at a glance.</p>
          </div>
          <div className="routing-stage-summary">
            <article className="routing-stage-summary-card">
              <span>Providers</span>
              <strong>{visibleProviders.length}</strong>
              <p>in scope</p>
            </article>
            <article className="routing-stage-summary-card">
              <span>Paths</span>
              <strong>{scopedDataSources.length}</strong>
              <p>detected</p>
            </article>
            <article className="routing-stage-summary-card">
              <span>Flow</span>
              <strong>{(scopedNodes ?? []).length}</strong>
              <p>nodes</p>
            </article>
            <article className="routing-stage-summary-card">
              <span>Findings</span>
              <strong>{(scopedFindings ?? []).length}</strong>
              <p>open</p>
            </article>
          </div>
        </section>
        {loading ? <div className="skeleton-line" /> : null}

        {!focusedProvider ? (
          <div className="info-box compact info-box-utility info-box-inline">
            <strong>{messages.routing.pickProviderTitle}</strong>
            <p>
              {visibleProviders.length > 0
                ? visibleProviders.map((provider) => provider.name).join(" · ")
                : "pick one"}
            </p>
          </div>
        ) : null}

        <div className="impact-list">
          <h3>Providers</h3>
          {visibleProviders.length === 0 ? (
            <p className="sub-hint">{messages.routing.noProviders}</p>
          ) : (
            <div className="routing-node-grid routing-node-grid-provider">
              {visibleProviders.map((provider) => (
                <article
                  key={provider.provider}
                  className={`routing-node-card kind-provider status-${provider.status}`}
                >
                  <div className="routing-node-top">
                    <strong>{provider.name}</strong>
                    <span className="routing-kind-chip">
                      {providerStatusLabel(provider.status)}
                    </span>
                  </div>
                  <div className="routing-provider-meta-grid">
                    <div className="routing-provider-meta">
                      <span>{messages.routing.capability}</span>
                      <strong>{providerCapabilityLabel(provider.capability_level)}</strong>
                    </div>
                    <div className="routing-provider-meta">
                      <span>{messages.routing.logs}</span>
                      <strong>{provider.session_log_count}</strong>
                    </div>
                    <div className="routing-provider-meta">
                      <span>{messages.routing.readiness}</span>
                      <strong>
                        {provider.capabilities.safe_cleanup
                          ? messages.routing.readinessCleanup
                          : provider.capabilities.read_sessions
                            ? messages.routing.readinessRead
                            : messages.routing.readinessUnavailable}
                      </strong>
                    </div>
                    <div className="routing-provider-meta">
                      <span>{messages.routing.roots}</span>
                      <strong>{provider.roots.length || 0}</strong>
                    </div>
                  </div>
                  <p className="sub-hint">{providerWorkbenchNote(provider.provider)}</p>
                  <div className="routing-source-summary mono-sub">
                    {provider.roots.length === 0
                      ? messages.providers.rootsNone
                      : summarizeRoots(provider.roots)}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        {focusedProvider ? (
          <div className="impact-list">
            <h3>{messages.routing.profileTitle}</h3>
            <div className="routing-stage-grid">
              {managementProfileRows.map((item) => (
                <article key={item.label} className="routing-stage-card">
                  <div className="routing-node-top">
                    <strong>{item.label}</strong>
                    <span className="routing-kind-chip">{item.value}</span>
                  </div>
                  <p className="sub-hint">{item.hint}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {focusedProvider ? (
          <div className="impact-list">
            <h3>{messages.routing.providerSpecificFlow}</h3>
            <div className="routing-stage-grid">
              {providerFlowStages.map((stage) => (
                <article
                  key={stage.key}
                  className={`routing-stage-card status-${stage.status}`}
                >
                  <div className="routing-node-top">
                    <strong>{stage.label}</strong>
                    <span className="routing-kind-chip">
                      {stage.status === "done"
                        ? messages.providers.flowStatusDone
                        : stage.status === "blocked"
                          ? messages.providers.flowStatusBlocked
                          : messages.providers.flowStatusPending}
                    </span>
                  </div>
                  <p className="sub-hint">{stage.detail}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {focusedProvider ? (
          <div className="impact-list">
            <h3>{messages.routing.contextTitle}</h3>
            <div className="routing-stage-grid">
              {contextCards.map((item) => (
                <article key={item.label} className="routing-stage-card">
                  <div className="routing-node-top">
                    <strong>{item.label}</strong>
                    <span className="routing-kind-chip">{item.value}</span>
                  </div>
                  <p className="sub-hint">{item.hint}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {focusedProvider ? (
          <div className="impact-list">
            <h3>{messages.routing.actionScopeTitle}</h3>
            <div className="routing-stage-grid">
              {providerDetailRows.map((item) => (
                <article key={item.label} className="routing-stage-card">
                  <div className="routing-node-top">
                    <strong>{item.label}</strong>
                    <span className="routing-kind-chip">{item.value}</span>
                  </div>
                  <p className="sub-hint">{item.hint}</p>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {focusedProvider ? (
          <div className="impact-list compact-list">
            <h3>{messages.routing.sourceBreakdownTitle}</h3>
            {sourceBreakdown.length === 0 ? (
              <p className="sub-hint">{messages.routing.noSources}</p>
            ) : (
              <ul>
                {sourceBreakdown.map((item) => (
                  <li key={item.source}>
                    <div className="routing-edge-flow">
                      <strong>{item.label}</strong>
                      <span className="routing-arrow">·</span>
                      <strong>
                        {item.count}
                        {messages.routing.sessionSuffix}
                      </strong>
                    </div>
                    <span className="mono-sub">{item.source}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {focusedProvider ? (
          <div className="impact-list compact-list">
            <h3>{messages.routing.formatBreakdownTitle}</h3>
            {formatBreakdown.length === 0 ? (
              <p className="sub-hint">{messages.routing.noFormats}</p>
            ) : (
              <ul>
                {formatBreakdown.map((item) => (
                  <li key={item.format}>
                    <div className="routing-edge-flow">
                      <strong>{item.label}</strong>
                      <span className="routing-arrow">·</span>
                      <strong>
                        {item.count}
                        {messages.routing.sessionSuffix}
                      </strong>
                    </div>
                    <span>
                      {item.format === "unknown"
                        ? messages.routing.formatUnknownHint
                        : messages.routing.formatSupportedHint}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className="routing-signal-grid">
          <section className="routing-list-card is-primary">
            <div className="routing-list-card-head">
              <span>Storage map</span>
              <strong>Paths / storage</strong>
            </div>
            <div className="impact-list impact-list-grid compact-list">
              <h3>Paths</h3>
              {scopedDataSources.length === 0 ? (
                <p className="sub-hint">{messages.routing.noSources}</p>
              ) : (
                <ul>
                  {scopedDataSources.map((source) => (
                    <li key={source.source_key}>
                      <div className="routing-edge-flow">
                        <strong>{source.source_key}</strong>
                        <span className="routing-arrow">·</span>
                        <strong>{messages.common.ok}</strong>
                      </div>
                      <span className="mono-sub">
                        {compactPath(source.path, 30)}
                        {compactFootprint(source.file_count, source.dir_count)
                          ? ` · ${compactFootprint(source.file_count, source.dir_count)}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="routing-list-card is-primary">
            <div className="routing-list-card-head">
              <span>What stands out</span>
              <strong>Findings / state</strong>
            </div>
            <div className="impact-list impact-list-grid compact-list plain-note-list">
              <h3>Findings</h3>
              {(scopedFindings ?? []).length === 0 ? (
                <p className="sub-hint">{messages.routing.noFindings}</p>
              ) : (
                <ul>
                  {scopedFindings.map((finding) => (
                    <li key={finding}>
                      <strong>•</strong>
                      <span>{finding}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {showCodexContext ? (
          <>
            <div className="impact-kv">
              <span>{messages.routing.config}</span>
              <strong className="mono-sub">{compactPath(data?.evidence?.codex_config_path, 30)}</strong>
            </div>
            <div className="impact-kv">
              <span>{messages.routing.globalState}</span>
              <strong className="mono-sub">{compactPath(data?.evidence?.global_state_path, 30)}</strong>
            </div>
            {data?.evidence?.notify_hook ? (
              <div className="impact-kv">
                <span>{messages.routing.notifyHook}</span>
                <strong className="mono-sub">{compactPath(data.evidence.notify_hook, 30)}</strong>
              </div>
            ) : null}
            {focusedProvider?.provider === "codex" && data?.evidence?.developer_instructions_excerpt ? (
              <p className="sub-hint">{data.evidence.developer_instructions_excerpt}</p>
            ) : null}
          </>
        ) : focusedProvider ? (
          <div className="info-box">
            <strong>{messages.routing.nonCodexContextTitle}</strong>
            <p>{messages.routing.nonCodexContextBody}</p>
          </div>
        ) : null}

        <div className="routing-signal-grid">
          <section className="routing-list-card">
            <div className="routing-list-card-head">
              <span>Execution path</span>
              <strong>Flow / nodes</strong>
            </div>
            <div className="impact-list compact-list">
              <h3>Flow</h3>
              {(scopedNodes ?? []).length === 0 ? (
                <p className="sub-hint">{messages.routing.noNodes}</p>
              ) : (
                <div className="routing-node-grid routing-node-grid-flow">
                  {scopedNodes.map((node) => (
                    <article key={node.id} className={`routing-node-card kind-${node.kind}`}>
                      <div className="routing-node-top">
                        <strong>{node.label}</strong>
                        <span className="routing-kind-chip">{kindLabel(node.kind)}</span>
                      </div>
                      {node.detail ? (
                        <p className="sub-hint">{flowReasonLabel(node.detail)}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="routing-list-card">
            <div className="routing-list-card-head">
              <span>Transitions</span>
              <strong>Edges / handoff</strong>
            </div>
            <div className="impact-list impact-list-grid compact-list plain-note-list">
              <h3>Edges</h3>
              {(scopedEdges ?? []).length === 0 ? (
                <p className="sub-hint">{messages.routing.noEdges}</p>
              ) : (
                <ul>
                  {scopedEdges.map((edge) => (
                    <li key={`${edge.from}-${edge.to}-${edge.reason}`}>
                      <div className="routing-edge-flow">
                        <strong>{scopedNodeLabel.get(edge.from) ?? edge.from}</strong>
                        <span className="routing-arrow">→</span>
                        <strong>{scopedNodeLabel.get(edge.to) ?? edge.to}</strong>
                      </div>
                      <span>{flowReasonLabel(edge.reason)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
