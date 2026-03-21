import { useMemo } from "react";
import type { ExecutionGraphData } from "@provider-surface/shared-contracts";
import type { Messages } from "../i18n";
import { formatDateTime } from "../lib/helpers";
import type {
  ProviderParserHealthReport,
  ProviderSessionRow,
  ProviderView,
} from "../types";

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
  if (source === "tmp") return "Gemini tmp sessions";
  if (source === "antigravity_conversations") return "Gemini conversation store";
  if (source === "conversations") return "ChatGPT conversation cache";
  if (source === "project-conversations") return "ChatGPT project conversation";
  if (source === "vscode_global") return "VS Code global traces";
  if (source === "cursor_workspace_chats") return "Cursor workspace chats";
  if (source === "vscode_workspace_chats") return "VS Code workspace chats";
  return source;
}

function formatLabel(format: "jsonl" | "json" | "unknown"): string {
  if (format === "jsonl") return "JSONL";
  if (format === "json") return "JSON";
  return "unknown";
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
        hint: "Codex combines raw session files with pinned state and recent workspace metadata.",
      },
      {
        label: "Resume / identity",
        value: "thread_id · pinned · global state",
        hint: "Thread IDs connect to pinned and global state, so Codex gets a dedicated cleanup surface.",
      },
      {
        label: "Cleanup scope",
        value: "impact analysis + cleanup dry-run + state reference cleanup",
        hint: "The cleanup model is wider than raw file actions, so review and impact analysis live alongside it.",
      },
      {
        label: "Primary surface",
        value: "cleanup + transcripts",
        hint: "Codex is cleanup-first, while original-session inspection is secondary.",
      },
    ];
  }
  if (provider === "claude") {
    return [
      {
        label: "Session model",
        value: "session_id + raw project/transcript sessions",
        hint: "Claude is managed around raw project logs and transcript files.",
      },
      {
        label: "Resume / identity",
        value: "session ID / transcript files",
        hint: "Resumable session IDs and transcript files matter more here than a cleanup-thread model.",
      },
      {
        label: "Cleanup scope",
        value: "raw session-file dry-run / archive / delete",
        hint: "Unlike Codex, cleanup here is centered on raw session files rather than pinned/global state.",
      },
      {
        label: "Primary surface",
        value: "Original Sessions",
        hint: "This flow is best for transcript reading, session-file state, and parser/transcript coverage.",
      },
    ];
  }
  if (provider === "gemini") {
    return [
      {
        label: "Session model",
        value: "history / tmp / checkpoint session stores",
        hint: "Gemini builds its original-session inventory by combining history, tmp, and conversation stores.",
      },
      {
        label: "Resume / identity",
        value: "history / tmp / conversation stores",
        hint: "Store distribution and session-file format matter more than a thread ID here.",
      },
      {
        label: "Cleanup scope",
        value: "raw session-file dry-run / archive / delete",
        hint: "Dry-run the original session stores safely, then clean up individual files when needed.",
      },
      {
        label: "Primary surface",
        value: "Original Sessions",
        hint: "Management is mostly about transcript-open coverage and session-store distribution.",
      },
    ];
  }
  if (provider === "copilot") {
    return [
      {
        label: "Session model",
        value: "workspace/global chat artifacts",
        hint: "Copilot is optional and mostly tracked through global traces and workspace chat sessions.",
      },
      {
        label: "Resume / identity",
        value: "workspace chat JSON",
        hint: "The presence of workspace chat files matters more than a standalone thread model.",
      },
      {
        label: "Cleanup scope",
        value: "raw-file dry-run",
        hint: "This is closer to auxiliary diagnostics and raw-file inspection than a core operating path.",
      },
      {
        label: "Primary surface",
        value: "Original Sessions > optional AI",
        hint: "Open it only when needed to inspect raw sessions and parser state.",
      },
    ];
  }
  return [
    {
      label: "Session model",
      value: "mixed cache / raw session store",
      hint: "This is primarily a read-oriented session store, so raw-session inspection comes first.",
    },
    {
      label: "Resume / identity",
      value: "session files / cache paths",
      hint: "Local cache and session-file presence matter before any thread-state concept.",
    },
    {
      label: "Cleanup scope",
      value: "read-first",
      hint: "Destructive actions are often limited or disabled.",
    },
    {
      label: "Primary surface",
      value: "Original Sessions",
      hint: "Use it to verify raw sessions and detection paths.",
    },
  ];
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
          : focusedProvider.notes ||
            "Diagnose this provider from its local paths, session stores, and parser coverage.",
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
          ? `${focusedSessionRows.length} sessions · ${sourceSummary || "store distribution detected"}`
          : "No session logs detected yet",
    };
    const formatNode = {
      id: `format-${focusedProvider.provider}`,
      label: `${focusedProvider.name} storage formats`,
      kind: "config" as const,
      detail: formatSummary || "No format summary collected yet",
    };
    const transcriptNode = {
      id: `transcript-${focusedProvider.provider}`,
      label: `${focusedProvider.name} transcript access`,
      kind: "instruction" as const,
      detail:
        transcriptCapableCount > 0
          ? `${transcriptCapableCount} can open transcripts directly${
              transcriptBlockedCount > 0 ? ` · ${transcriptBlockedCount} are metadata or binary heavy` : ""
            }`
          : "No transcript-ready format is available right now",
    };
    const parserNode = {
      id: `parser-${focusedProvider.provider}`,
      label: `${focusedProvider.name} parsing`,
      kind: "instruction" as const,
      detail: focusedParserReport
        ? `OK ${focusedParserReport.parse_ok}/${focusedParserReport.scanned} · score ${focusedParserReport.parse_score ?? "-"}`
        : focusedProvider.capabilities.read_sessions && focusedProvider.capabilities.analyze_context
          ? "Transcript, search, and risk analysis are available"
          : "More readable data or broader analysis support is needed",
    };
    const reviewNode = {
      id: `review-${focusedProvider.provider}`,
      label: `${focusedProvider.name} review path`,
      kind: "runtime" as const,
      detail: focusedProvider.capabilities.analyze_context
        ? "Connects into session detail, transcript review, and cleanup review panels"
        : "Right now this path only reaches detection and the basic session list",
    };
    const cleanupNode = {
      id: `cleanup-${focusedProvider.provider}`,
      label: `${focusedProvider.name} cleanup stage`,
      kind: "runtime" as const,
      detail: focusedProvider.capabilities.safe_cleanup
        ? "Ready for dry-runs and real cleanup"
        : focusedProvider.capability_level === "read-only"
          ? "Cleanup and delete stay locked because this provider is read-only"
          : "Safe cleanup is not ready yet",
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
    if (!focusedProvider) return data?.findings ?? [];
    const findings: string[] = [];
    if (focusedProvider.status === "missing") {
      findings.push(`No local trace has been detected for ${focusedProvider.name} yet.`);
    } else {
      findings.push(
        `${focusedProvider.name} is ${providerStatusLabel(focusedProvider.status)} and currently classified as ${providerCapabilityLabel(
          focusedProvider.capability_level,
        )}.`,
      );
      findings.push(
        `${focusedSessionRows.length || focusedProvider.session_log_count} session logs are available, so transcripts and session detail can open directly from this surface.`,
      );
    }
    if (scopedDataSources.length > 0) {
      findings.push(
        `This flow is grounded in ${scopedDataSources.length} local data paths tied to ${focusedProvider.name}.`,
      );
    }
    if (sourceBreakdown.length > 0) {
      findings.push(
        `The largest session stores are ${sourceBreakdown
          .slice(0, 3)
          .map((item) => `${item.label} ${item.count}`)
          .join(" · ")}.`,
      );
    }
    if (formatBreakdown.length > 0) {
      findings.push(
        `Storage formats are distributed as ${formatBreakdown
          .map((item) => `${item.label} ${item.count}`)
          .join(" · ")}.`,
      );
    }
    if (transcriptBlockedCount > 0) {
      findings.push(
        `${transcriptBlockedCount} sessions may not open full transcripts immediately because of format or metadata limits.`,
      );
    }
    if (focusedParserReport) {
      findings.push(
        `The parser scanned ${focusedParserReport.scanned} items: ${focusedParserReport.parse_ok} succeeded and ${focusedParserReport.parse_fail} failed.`,
      );
    }
    if (focusedProvider.capabilities.safe_cleanup) {
      findings.push(`${focusedProvider.name} supports safe-cleanup dry-runs and real apply steps.`);
    } else if (focusedProvider.capabilities.read_sessions) {
      findings.push(`${focusedProvider.name} is read-and-analysis first, with destructive actions locked.`);
    } else {
      findings.push(`${focusedProvider.name} does not have enough readable session data yet.`);
    }
    return findings;
  }, [
    focusedProvider,
    data?.findings,
    focusedSessionRows.length,
    scopedDataSources.length,
    sourceBreakdown,
    formatBreakdown,
    transcriptBlockedCount,
    focusedParserReport,
    providerCapabilityLabel,
    providerStatusLabel,
  ]);

  const contextCards = useMemo(() => {
    if (!focusedProvider) return [];
    const cards = [
      {
        label: messages.routing.contextSources,
        value: sourceSummary || "No session-store summary",
        hint:
          sourceSummary.length > 0
            ? "This shows which stores the sessions are being read from."
            : "There are not enough logs yet to build a provider-specific store distribution.",
      },
      {
        label: messages.routing.contextFormats,
        value: formatSummary || "No format summary",
        hint:
          transcriptBlockedCount > 0
            ? `${transcriptCapableCount} can open transcripts directly, while ${transcriptBlockedCount} are mostly metadata or binary.`
            : transcriptCapableCount > 0
              ? "The currently visible sessions use transcript-friendly formats."
              : "There is no directly readable transcript format yet.",
      },
      {
        label: messages.routing.contextParser,
        value: focusedParserReport
          ? `${focusedParserReport.parse_ok}/${focusedParserReport.scanned} (score ${focusedParserReport.parse_score ?? "-"})`
          : "No parser report",
        hint: focusedParserReport
          ? focusedParserReport.parse_fail > 0
            ? `${focusedParserReport.parse_fail} parse failures are still present.`
            : "No parser failures are present in the current sample window."
          : "There is no parser summary report yet.",
      },
      {
        label: messages.routing.contextLimits,
        value: focusedProvider.capabilities.safe_cleanup
          ? "Dry-run + cleanup available"
          : focusedProvider.capabilities.read_sessions
            ? "Read and analysis only"
            : "Detection first",
        hint:
          focusedProvider.notes ||
          "The screen is built from currently detected session formats and capability coverage.",
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
      ? "Start in session detail, confirm the dry-run, then decide whether cleanup should happen."
      : focusedProvider.capabilities.read_sessions
        ? "Transcripts and session state are visible, but cleanup controls stay locked."
        : "More install traces or session logs need to be detected first.";
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
            ? "You can jump straight into session detail and transcript review."
            : "There are no session logs yet, so the detail surface may stay empty.",
      },
      {
        label: "Local evidence",
        value: scopedDataSources.length > 0 ? `${scopedDataSources.length} detected` : "Not enough source paths",
        hint:
          scopedDataSources.length > 0
            ? "These paths are the evidence behind the flow graph and session scan."
            : "More root paths or cache activity are needed before diagnostics become richer.",
      },
      {
        label: "Read / analyze",
        value: focusedProvider.capabilities.analyze_context ? "Ready" : "Limited",
        hint: focusedProvider.capabilities.analyze_context
          ? "Transcript search, risk scoring, and cleanup review are all available."
          : "Readable logs are still limited, or analysis coverage is weak.",
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
          ? `${scopedDataSources.length || focusedProvider.roots.length} evidence paths confirmed`
          : "Local traces are still too thin",
      },
      {
        key: "sessions",
        label: messages.providers.flowStageSessions,
        status: stageStatus(sessionsReady, !detectReady),
        detail: sessionsReady
          ? `${focusedSessionRows.length || focusedProvider.session_log_count} session logs detected`
          : "No session logs detected yet",
      },
      {
        key: "parser",
        label: messages.providers.flowStageParser,
        status: stageStatus(parserReady, !sessionsReady),
        detail: parserReady
          ? focusedParserReport
            ? `OK ${focusedParserReport.parse_ok}/${focusedParserReport.scanned}`
            : "Transcript and analysis ready"
          : "More readable data is needed",
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
          ? "Dry-run + apply available"
          : focusedProvider.capability_level === "read-only"
            ? "Cleanup stays locked because this provider is read-only"
            : "Cleanup is not ready yet",
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
    <section className="panel">
      <header>
        <h2>{messages.routing.title}</h2>
        <span>{formatDateTime(data?.generated_at)}</span>
      </header>
      <div className="impact-body">
        <div className="info-box">
          <strong>{messages.routing.title}</strong>
          <p>{messages.routing.subtitle}</p>
        </div>
        {loading ? <div className="skeleton-line" /> : null}

        <div className="impact-kv">
          <span>{messages.routing.scope}</span>
          <strong>{focusedProvider?.name ?? messages.common.allAi}</strong>
        </div>

        {!focusedProvider ? (
          <div className="info-box">
            <strong>{messages.routing.pickProviderTitle}</strong>
            <p>{messages.routing.pickProviderBody}</p>
          </div>
        ) : null}

        <div className="impact-list">
          <h3>{messages.routing.providerSummary}</h3>
          {visibleProviders.length === 0 ? (
            <p className="sub-hint">{messages.routing.noProviders}</p>
          ) : (
            <div className="routing-node-grid">
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
                  {provider.notes ? <p className="sub-hint">{provider.notes}</p> : null}
                  <div className="routing-source-list">
                    <span>{messages.routing.roots}</span>
                    {provider.roots.length === 0 ? (
                      <p className="sub-hint">{messages.providers.rootsNone}</p>
                    ) : (
                      <ul>
                        {provider.roots.map((root) => (
                          <li key={`${provider.provider}-${root}`} className="mono-sub">
                            {root}
                          </li>
                        ))}
                      </ul>
                    )}
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
          <div className="impact-list">
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
          <div className="impact-list">
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

        <div className="impact-list">
          <h3>{messages.routing.dataSources}</h3>
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
                    {source.path}
                    {source.file_count || source.dir_count
                      ? ` · ${source.file_count ?? 0}${messages.routing.fileSuffix} / ${source.dir_count ?? 0}${messages.routing.dirSuffix}`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {showCodexContext ? (
          <>
            <div className="impact-kv">
              <span>{messages.routing.config}</span>
              <strong className="mono-sub">{data?.evidence?.codex_config_path ?? "-"}</strong>
            </div>
            <div className="impact-kv">
              <span>{messages.routing.globalState}</span>
              <strong className="mono-sub">{data?.evidence?.global_state_path ?? "-"}</strong>
            </div>
            {data?.evidence?.notify_hook ? (
              <div className="impact-kv">
                <span>{messages.routing.notifyHook}</span>
                <strong className="mono-sub">{data.evidence.notify_hook}</strong>
              </div>
            ) : null}
            {data?.evidence?.developer_instructions_excerpt ? (
              <p className="sub-hint">{data.evidence.developer_instructions_excerpt}</p>
            ) : null}
          </>
        ) : focusedProvider ? (
          <div className="info-box">
            <strong>{messages.routing.nonCodexContextTitle}</strong>
            <p>{messages.routing.nonCodexContextBody}</p>
          </div>
        ) : null}

        <div className="impact-list">
          <h3>{messages.routing.flowMap}</h3>
          {(scopedNodes ?? []).length === 0 ? (
            <p className="sub-hint">{messages.routing.noNodes}</p>
          ) : (
            <div className="routing-node-grid">
              {scopedNodes.map((node) => (
                <article key={node.id} className={`routing-node-card kind-${node.kind}`}>
                  <div className="routing-node-top">
                    <strong>{node.label}</strong>
                    <span className="routing-kind-chip">{kindLabel(node.kind)}</span>
                  </div>
                  <div className="routing-node-meta mono-sub">{node.id}</div>
                  {node.detail ? <p className="sub-hint">{node.detail}</p> : null}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="impact-list">
          <h3>{messages.routing.flowEdges}</h3>
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
                  <span>{edge.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="impact-list">
          <h3>{messages.routing.findings}</h3>
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
      </div>
    </section>
  );
}
