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

function formatRoutingMessage(
  template: string,
  replacements: Record<string, string | number>,
): string {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

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

function sessionSourceLabel(messages: Messages, source: string): string {
  if (source === "sessions") return messages.routing.sourceCodexSessionLogs;
  if (source === "projects") return messages.routing.sourceClaudeProjectLogs;
  if (source === "transcripts") return messages.routing.sourceClaudeTranscriptStore;
  if (source === "tmp") return messages.routing.sourceGeminiTempSessions;
  if (source === "antigravity_conversations") return messages.routing.sourceGeminiConversationStore;
  if (source === "conversations") return messages.routing.sourceChatgptConversationCache;
  if (source === "project-conversations") return messages.routing.sourceChatgptProjectConversations;
  if (source === "vscode_global") return messages.routing.sourceVsCodeGlobalTraces;
  if (source === "cursor_workspace_chats") return messages.routing.sourceCursorWorkspaceChats;
  if (source === "vscode_workspace_chats") return messages.routing.sourceVsCodeWorkspaceChats;
  return source;
}

function formatLabel(messages: Messages, format: "jsonl" | "json" | "unknown"): string {
  if (format === "jsonl") return "JSONL";
  if (format === "json") return "JSON";
  return messages.common.unknown;
}

function providerManagementProfile(provider: string, messages: Messages): Array<{
  label: string;
  value: string;
  hint: string;
}> {
  if (provider === "codex") {
    return [
      {
        label: messages.routing.profileSessionModel,
        value: messages.routing.profileCodexSessionValue,
        hint: messages.routing.profileCodexSessionHint,
      },
      {
        label: messages.routing.profileResumeModel,
        value: messages.routing.profileCodexResumeValue,
        hint: messages.routing.profileCodexResumeHint,
      },
      {
        label: messages.routing.profileCleanupModel,
        value: messages.routing.profileCodexCleanupValue,
        hint: messages.routing.profileCodexCleanupHint,
      },
      {
        label: messages.routing.profilePrimarySurface,
        value: messages.routing.profileCodexSurfaceValue,
        hint: messages.routing.profileCodexSurfaceHint,
      },
    ];
  }
  if (provider === "claude") {
    return [
      {
        label: messages.routing.profileSessionModel,
        value: messages.routing.profileClaudeSessionValue,
        hint: messages.routing.profileClaudeSessionHint,
      },
      {
        label: messages.routing.profileResumeModel,
        value: messages.routing.profileClaudeResumeValue,
        hint: messages.routing.profileClaudeResumeHint,
      },
      {
        label: messages.routing.profileCleanupModel,
        value: messages.routing.profileClaudeCleanupValue,
        hint: messages.routing.profileClaudeCleanupHint,
      },
      {
        label: messages.routing.profilePrimarySurface,
        value: messages.routing.profileClaudeSurfaceValue,
        hint: messages.routing.profileClaudeSurfaceHint,
      },
    ];
  }
  if (provider === "gemini") {
    return [
      {
        label: messages.routing.profileSessionModel,
        value: messages.routing.profileGeminiSessionValue,
        hint: messages.routing.profileGeminiSessionHint,
      },
      {
        label: messages.routing.profileResumeModel,
        value: messages.routing.profileGeminiResumeValue,
        hint: messages.routing.profileGeminiResumeHint,
      },
      {
        label: messages.routing.profileCleanupModel,
        value: messages.routing.profileGeminiCleanupValue,
        hint: messages.routing.profileGeminiCleanupHint,
      },
      {
        label: messages.routing.profilePrimarySurface,
        value: messages.routing.profileGeminiSurfaceValue,
        hint: messages.routing.profileGeminiSurfaceHint,
      },
    ];
  }
  if (provider === "copilot") {
    return [
      {
        label: messages.routing.profileSessionModel,
        value: messages.routing.profileCopilotSessionValue,
        hint: messages.routing.profileCopilotSessionHint,
      },
      {
        label: messages.routing.profileResumeModel,
        value: messages.routing.profileCopilotResumeValue,
        hint: messages.routing.profileCopilotResumeHint,
      },
      {
        label: messages.routing.profileCleanupModel,
        value: messages.routing.profileCopilotCleanupValue,
        hint: messages.routing.profileCopilotCleanupHint,
      },
      {
        label: messages.routing.profilePrimarySurface,
        value: messages.routing.profileCopilotSurfaceValue,
        hint: messages.routing.profileCopilotSurfaceHint,
      },
    ];
  }
  return [
    {
      label: messages.routing.profileSessionModel,
      value: messages.routing.profileDefaultSessionValue,
      hint: messages.routing.profileDefaultSessionHint,
    },
    {
      label: messages.routing.profileResumeModel,
      value: messages.routing.profileDefaultResumeValue,
      hint: messages.routing.profileDefaultResumeHint,
    },
    {
      label: messages.routing.profileCleanupModel,
      value: messages.routing.profileDefaultCleanupValue,
      hint: messages.routing.profileDefaultCleanupHint,
    },
    {
      label: messages.routing.profilePrimarySurface,
      value: messages.routing.profileDefaultSurfaceValue,
      hint: messages.routing.profileDefaultSurfaceHint,
    },
  ];
}

function providerWorkbenchNote(messages: Messages, provider: string): string {
  if (provider === "codex") {
    return messages.routing.workbenchNoteCodex;
  }
  if (provider === "claude") {
    return messages.routing.workbenchNoteClaude;
  }
  if (provider === "gemini") {
    return messages.routing.workbenchNoteGemini;
  }
  if (provider === "copilot") {
    return messages.routing.workbenchNoteCopilot;
  }
  if (provider === "chatgpt") {
    return messages.routing.workbenchNoteChatgpt;
  }
  return messages.routing.workbenchNoteDefault;
}

function flowReasonLabel(messages: Messages, reason: string): string {
  const lower = reason.toLowerCase();
  if (reason === "GUI or CLI user input") return messages.routing.reasonEntry;
  if (reason === "Receive prompt") return messages.routing.reasonPrompt;
  if (reason === "workspace/root plus nested overrides") return messages.routing.reasonAgentsScope;
  if (lower.includes("scope") && (lower.includes("agent") || lower.includes("override"))) return messages.routing.reasonAgentsScope;
  if (lower.includes("system > developer > user") || lower.includes("priority chain")) return messages.routing.reasonPriority;
  if (reason === "Priority chain applied.") return messages.routing.reasonPriority;
  if (reason === "Tool calls plus local file reads and writes") return messages.routing.reasonToolIo;
  if (reason === "developer_instructions / features / hooks") return messages.routing.reasonConfig;
  if (reason === "Read and write thread/session metadata") return messages.routing.reasonThreadMeta;
  if (reason === "Thread and session metadata.") return messages.routing.reasonThreadMeta;
  if (reason === "Scan local sessions and logs") return messages.routing.reasonSessionScan;
  if (reason === "Local session scan.") return messages.routing.reasonSessionScan;
  if (reason === "Trusted project entry") return messages.routing.reasonTrustedRoot;
  if (reason === "Trusted project.") return messages.routing.reasonTrustedRoot;
  if (reason === "active-workspace-roots") return messages.routing.reasonActiveRoots;
  if (reason === "Active workspace roots.") return messages.routing.reasonActiveRoots;
  if (reason === "Apply execution constraints") return messages.routing.reasonRuntime;
  if (reason.includes("Read-first cache model")) return providerWorkbenchNote(messages, "chatgpt");
  if (reason.includes("Managed around session_id")) return providerWorkbenchNote(messages, "claude");
  if (reason.includes("operations-grade model built around thread_id")) return providerWorkbenchNote(messages, "codex");
  if (reason.includes("Auxiliary diagnostics only")) return providerWorkbenchNote(messages, "copilot");
  if (reason.includes("Managed across history, tmp")) return providerWorkbenchNote(messages, "gemini");
  if (reason.includes("Collect candidate session files")) return messages.routing.reasonCandidateScan;
  if (reason.includes("User focused the view")) return messages.routing.reasonScopeFocus;
  if (reason.includes("Start scanning from this provider")) return messages.routing.reasonProviderScan;
  if (reason.includes("Classify file formats")) return messages.routing.reasonFormats;
  if (reason.includes("Summarize capability coverage")) return messages.routing.reasonCoverage;
  if (reason.includes("Determine what can open transcripts")) return messages.routing.reasonTranscript;
  if (reason.includes("Pass transcript, search, and summary")) return messages.routing.reasonParserHandoff;
  if (reason.includes("Flow into session detail")) return messages.routing.reasonDetailRail;
  if (reason.includes("Read Codex-specific global state")) return messages.routing.reasonGlobalState;
  if (reason.includes("Recent workspace and global state")) return messages.routing.reasonWorkspaceState;
  if (reason.includes("Decide whether dry-run")) return messages.routing.reasonDryRun;
  if (reason.includes("limited to reading and analysis")) return messages.routing.reasonReadOnly;
  return reason;
}

function summarizeRoots(messages: Messages, roots: string[]): string {
  if (roots.length === 0) return messages.providers.rootsNone;
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
        label: sessionSourceLabel(messages, source),
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
        label: formatLabel(messages, format),
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
        detail: formatRoutingMessage(messages.routing.nodeSourceDetail, {
          count: item.count,
          source: item.source,
        }),
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
      label: `${focusedProvider.name} ${messages.routing.nodeContextSuffix}`,
      kind: "config" as const,
      detail:
        focusedProvider.provider === "codex"
          ? data?.evidence?.codex_config_path ?? focusedProvider.notes ?? "-"
          : providerWorkbenchNote(messages, focusedProvider.provider),
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
      label: `${focusedProvider.name} ${messages.routing.nodeSessionInventorySuffix}`,
      kind: "workspace" as const,
      detail:
        focusedSessionRows.length > 0
          ? `${formatRoutingMessage(messages.routing.flowDetailLogsReady, {
              count: focusedSessionRows.length,
            })} · ${sourceSummary || messages.routing.storageMapEyebrow}`
          : messages.routing.nodeNoSessionLogsYet,
    };
    const formatNode = {
      id: `format-${focusedProvider.provider}`,
      label: `${focusedProvider.name} ${messages.routing.nodeStorageFormatsSuffix}`,
      kind: "config" as const,
      detail: formatSummary || messages.routing.nodeFormatSummaryEmpty,
    };
    const transcriptNode = {
      id: `transcript-${focusedProvider.provider}`,
      label: `${focusedProvider.name} ${messages.routing.nodeTranscriptAccessSuffix}`,
      kind: "instruction" as const,
      detail:
        transcriptCapableCount > 0
          ? transcriptBlockedCount > 0
            ? formatRoutingMessage(messages.routing.nodeTranscriptReadyBlocked, {
                ready: transcriptCapableCount,
                blocked: transcriptBlockedCount,
              })
            : formatRoutingMessage(messages.routing.nodeTranscriptReady, {
                count: transcriptCapableCount,
              })
          : messages.routing.nodeNoTranscriptReady,
    };
    const parserNode = {
      id: `parser-${focusedProvider.provider}`,
      label: `${focusedProvider.name} ${messages.routing.nodeParsingSuffix}`,
      kind: "instruction" as const,
      detail: focusedParserReport
        ? formatRoutingMessage(messages.routing.nodeParserScore, {
            ok: focusedParserReport.parse_ok,
            scanned: focusedParserReport.scanned,
            score: focusedParserReport.parse_score ?? "-",
          })
        : focusedProvider.capabilities.read_sessions && focusedProvider.capabilities.analyze_context
          ? messages.routing.nodeParserReady
          : messages.routing.nodeMoreReadableDataRequired,
    };
    const reviewNode = {
      id: `review-${focusedProvider.provider}`,
      label: `${focusedProvider.name} ${messages.routing.nodeReviewPathSuffix}`,
      kind: "runtime" as const,
      detail: focusedProvider.capabilities.analyze_context
        ? messages.routing.nodeReviewReady
        : messages.routing.nodeReviewDetectOnly,
    };
    const cleanupNode = {
      id: `cleanup-${focusedProvider.provider}`,
      label: `${focusedProvider.name} ${messages.routing.nodeCleanupStageSuffix}`,
      kind: "runtime" as const,
      detail: focusedProvider.capabilities.safe_cleanup
        ? messages.routing.nodeCleanupReady
        : focusedProvider.capability_level === "read-only"
          ? messages.routing.nodeCleanupLocked
          : messages.routing.nodeCleanupUnavailable,
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
        label: `Codex ${messages.routing.globalState}`,
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
        formatRoutingMessage(messages.routing.findingSessionLogs, {
          count: focusedSessionRows.length || focusedProvider.session_log_count,
        }),
      );
    }
    if (scopedDataSources.length > 0) {
      findings.push(
        formatRoutingMessage(messages.routing.findingPaths, {
          count: scopedDataSources.length,
        }),
      );
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
      findings.push(
        formatRoutingMessage(messages.routing.findingTranscriptBlocked, {
          count: transcriptBlockedCount,
        }),
      );
    }
    if (focusedParserReport) {
      findings.push(
        formatRoutingMessage(messages.routing.findingParserSummary, {
          ok: focusedParserReport.parse_ok,
          scanned: focusedParserReport.scanned,
          fail: focusedParserReport.parse_fail,
        }),
      );
    }
    if (focusedProvider.capabilities.safe_cleanup) {
      findings.push(messages.routing.findingCleanupReady);
    } else if (focusedProvider.capabilities.read_sessions) {
      findings.push(messages.routing.findingReadAnalyzeOnly);
    } else {
      findings.push(messages.routing.findingReadableDataThin);
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
        value: sourceSummary || messages.routing.contextNoStorageSummary,
        hint:
          sourceSummary.length > 0
            ? messages.routing.contextStorageScopeCurrent
            : messages.routing.contextStorageSummaryThin,
      },
      {
        label: messages.routing.contextFormats,
        value: formatSummary || messages.routing.contextNoFormatSummary,
        hint:
          transcriptBlockedCount > 0
            ? formatRoutingMessage(messages.routing.contextTranscriptBlockedSummary, {
                ready: transcriptCapableCount,
                blocked: transcriptBlockedCount,
              })
            : transcriptCapableCount > 0
              ? messages.routing.contextTranscriptFirstFormat
              : messages.routing.contextNoDirectTranscript,
      },
      {
        label: messages.routing.contextParser,
        value: focusedParserReport
          ? `${focusedParserReport.parse_ok}/${focusedParserReport.scanned} (score ${focusedParserReport.parse_score ?? "-"})`
          : messages.routing.contextNoParserReport,
        hint: focusedParserReport
          ? focusedParserReport.parse_fail > 0
            ? formatRoutingMessage(messages.routing.contextParserFailsRemain, {
                count: focusedParserReport.parse_fail,
              })
            : messages.routing.contextParserStable
          : messages.routing.contextParserPending,
      },
      {
        label: messages.routing.contextLimits,
        value: focusedProvider.capabilities.safe_cleanup
          ? messages.routing.contextLimitsDryRunApply
          : focusedProvider.capabilities.read_sessions
            ? messages.routing.contextLimitsReadAnalyze
            : messages.routing.contextLimitsDetectFirst,
        hint:
          providerWorkbenchNote(messages, focusedProvider.provider),
      },
    ];
    if (focusedProvider.provider === "codex") {
      cards.unshift({
        label: messages.routing.contextConfig,
        value: data?.evidence?.codex_config_path ?? "-",
        hint: data?.evidence?.global_state_path
          ? formatRoutingMessage(messages.routing.contextGlobalStateHint, {
              path: data.evidence.global_state_path,
            })
          : messages.routing.contextNoGlobalStateYet,
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
    messages.routing.contextLimitsDetectFirst,
    messages.routing.contextLimitsDryRunApply,
    messages.routing.contextLimitsReadAnalyze,
    messages.routing.contextNoDirectTranscript,
    messages.routing.contextNoFormatSummary,
    messages.routing.contextNoGlobalStateYet,
    messages.routing.contextNoParserReport,
    messages.routing.contextNoStorageSummary,
    messages.routing.contextParserFailsRemain,
    messages.routing.contextParserPending,
    messages.routing.contextParserStable,
    messages.routing.contextParser,
    messages.routing.contextSources,
    messages.routing.contextStorageScopeCurrent,
    messages.routing.contextStorageSummaryThin,
    messages.routing.contextTranscriptBlockedSummary,
    messages.routing.contextTranscriptFirstFormat,
    data?.evidence?.codex_config_path,
    data?.evidence?.global_state_path,
  ]);

  const providerDetailRows = useMemo(() => {
    if (!focusedProvider) return [];
    const nextStep = focusedProvider.capabilities.safe_cleanup
      ? messages.routing.detailNextRunDryRun
      : focusedProvider.capabilities.read_sessions
        ? messages.routing.detailNextReadTranscript
        : messages.routing.detailNextCollectTraces;
    return [
      {
        label: messages.routing.detailSessionLogsLabel,
        value:
          focusedSessionRows.length > 0
            ? `${focusedSessionRows.length}`
            : focusedProvider.session_log_count > 0
              ? `${focusedProvider.session_log_count}`
              : messages.routing.detailNone,
        hint:
          focusedSessionRows.length > 0
            ? messages.routing.detailOpenInRail
            : messages.routing.detailRailMayStayEmpty,
      },
      {
        label: messages.routing.detailLocalEvidenceLabel,
        value: scopedDataSources.length > 0
          ? formatRoutingMessage(messages.routing.detailDetectedCount, {
              count: scopedDataSources.length,
            })
          : messages.routing.detailNotEnoughSourcePaths,
        hint:
          scopedDataSources.length > 0
            ? messages.routing.detailCurrentFlowEvidence
            : messages.routing.detailMoreEvidencePaths,
      },
      {
        label: messages.routing.detailReadAnalyzeLabel,
        value: focusedProvider.capabilities.analyze_context
          ? messages.routing.detailReady
          : messages.routing.detailLimited,
        hint: focusedProvider.capabilities.analyze_context
          ? messages.routing.detailSearchAnalysisReady
          : messages.routing.detailReadAnalyzeLimited,
      },
      {
        label: messages.routing.detailRecommendedNextLabel,
        value: focusedProvider.capabilities.safe_cleanup
          ? messages.routing.detailDryRunAvailable
          : messages.routing.detailReadFirstPath,
        hint: nextStep,
      },
    ];
  }, [focusedProvider, focusedSessionRows.length, scopedDataSources.length, messages.routing]);

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
          ? formatRoutingMessage(messages.routing.flowDetailPathsReady, {
              count: scopedDataSources.length || focusedProvider.roots.length,
            })
          : messages.routing.flowDetailTracesThin,
      },
      {
        key: "sessions",
        label: messages.providers.flowStageSessions,
        status: stageStatus(sessionsReady, !detectReady),
        detail: sessionsReady
          ? formatRoutingMessage(messages.routing.flowDetailLogsReady, {
              count: focusedSessionRows.length || focusedProvider.session_log_count,
            })
          : messages.routing.flowDetailNoSessionLogs,
      },
      {
        key: "parser",
        label: messages.providers.flowStageParser,
        status: stageStatus(parserReady, !sessionsReady),
        detail: parserReady
          ? focusedParserReport
            ? formatRoutingMessage(messages.routing.flowDetailParserOk, {
                ok: focusedParserReport.parse_ok,
                scanned: focusedParserReport.scanned,
              })
            : messages.routing.flowDetailTranscriptReady
          : messages.routing.flowDetailReadableDataNeeded,
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
          ? messages.routing.flowDetailCleanupReady
          : focusedProvider.capability_level === "read-only"
            ? messages.routing.flowDetailCleanupLocked
            : messages.routing.flowDetailCleanupNotReady,
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
    messages.routing.flowDetailCleanupLocked,
    messages.routing.flowDetailCleanupNotReady,
    messages.routing.flowDetailCleanupReady,
    messages.routing.flowDetailLogsReady,
    messages.routing.flowDetailNoSessionLogs,
    messages.routing.flowDetailParserOk,
    messages.routing.flowDetailPathsReady,
    messages.routing.flowDetailReadableDataNeeded,
    messages.routing.flowDetailTranscriptReady,
    messages.routing.flowDetailTracesThin,
    scopedDataSources.length,
  ]);

  const showCodexContext = !focusedProvider || focusedProvider.provider === "codex";
  const managementProfileRows = useMemo(
    () => (focusedProvider ? providerManagementProfile(focusedProvider.provider, messages) : []),
    [focusedProvider, messages],
  );

  return (
    <section className="panel routing-workbench-panel">
      <PanelHeader title={messages.routing.mapTitle} subtitle={formatDateTime(data?.generated_at)} />
      <div className="impact-body">
        <section className="routing-stage-shell">
          <div className="routing-stage-copy">
            <span className="overview-note-label">{messages.routing.stageEyebrow}</span>
            <strong>{messages.routing.stageTitle}</strong>
            <p>{messages.routing.stageBody}</p>
          </div>
          <div className="routing-stage-summary">
            <article className="routing-stage-summary-card">
              <span>{messages.routing.stageSummaryProvidersLabel}</span>
              <strong>{visibleProviders.length}</strong>
              <p>{messages.routing.stageSummaryProvidersHint}</p>
            </article>
            <article className="routing-stage-summary-card">
              <span>{messages.routing.stageSummaryPathsLabel}</span>
              <strong>{scopedDataSources.length}</strong>
              <p>{messages.routing.stageSummaryPathsHint}</p>
            </article>
            <article className="routing-stage-summary-card">
              <span>{messages.routing.stageSummaryFlowLabel}</span>
              <strong>{(scopedNodes ?? []).length}</strong>
              <p>{messages.routing.stageSummaryFlowHint}</p>
            </article>
            <article className="routing-stage-summary-card">
              <span>{messages.routing.stageSummaryFindingsLabel}</span>
              <strong>{(scopedFindings ?? []).length}</strong>
              <p>{messages.routing.stageSummaryFindingsHint}</p>
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
                : messages.routing.pickProviderFallback}
            </p>
          </div>
        ) : null}

        <div className="impact-list">
          <h3>{messages.routing.providersTitle}</h3>
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
                  <p className="sub-hint">{providerWorkbenchNote(messages, provider.provider)}</p>
                  <div className="routing-source-summary mono-sub">
                    {provider.roots.length === 0
                      ? messages.providers.rootsNone
                      : summarizeRoots(messages, provider.roots)}
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
              <span>{messages.routing.storageMapEyebrow}</span>
              <strong>{messages.routing.storageMapTitle}</strong>
            </div>
            <div className="impact-list impact-list-grid compact-list">
              <h3>{messages.routing.pathsTitle}</h3>
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
              <span>{messages.routing.findingsEyebrow}</span>
              <strong>{messages.routing.findingsTitle}</strong>
            </div>
            <div className="impact-list impact-list-grid compact-list plain-note-list">
              <h3>{messages.routing.findingsListTitle}</h3>
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
              <span>{messages.routing.executionPathEyebrow}</span>
              <strong>{messages.routing.executionPathTitle}</strong>
            </div>
            <div className="impact-list compact-list">
              <h3>{messages.routing.flowTitle}</h3>
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
                        <p className="sub-hint">{flowReasonLabel(messages, node.detail)}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="routing-list-card">
            <div className="routing-list-card-head">
              <span>{messages.routing.transitionsEyebrow}</span>
              <strong>{messages.routing.transitionsTitle}</strong>
            </div>
            <div className="impact-list impact-list-grid compact-list plain-note-list">
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
                      <span>{flowReasonLabel(messages, edge.reason)}</span>
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
