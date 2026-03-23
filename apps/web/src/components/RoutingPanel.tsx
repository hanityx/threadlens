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
  if (source === "sessions") return "Codex 세션 로그";
  if (source === "projects") return "Claude 프로젝트 로그";
  if (source === "transcripts") return "Claude transcript 저장소";
  if (source === "tmp") return "Gemini tmp 세션";
  if (source === "antigravity_conversations") return "Gemini 대화 저장소";
  if (source === "conversations") return "ChatGPT 대화 캐시";
  if (source === "project-conversations") return "ChatGPT 프로젝트 대화";
  if (source === "vscode_global") return "VS Code 전역 흔적";
  if (source === "cursor_workspace_chats") return "Cursor 워크스페이스 채팅";
  if (source === "vscode_workspace_chats") return "VS Code 워크스페이스 채팅";
  return source;
}

function formatLabel(format: "jsonl" | "json" | "unknown"): string {
  if (format === "jsonl") return "JSONL";
  if (format === "json") return "JSON";
  return "알 수 없음";
}

function providerManagementProfile(provider: string): Array<{
  label: string;
  value: string;
  hint: string;
}> {
  if (provider === "codex") {
    return [
      {
        label: "세션 모델",
        value: "thread_id + 세션 로그 + global state",
        hint: "thread 중심 모델.",
      },
      {
        label: "재개 / 식별",
        value: "thread_id · pinned · global state",
        hint: "pinned와 state까지 같이 본다.",
      },
      {
        label: "정리 범위",
        value: "영향 분석 + 정리 드라이런 + state 참조 정리",
        hint: "영향 분석이 먼저 붙는다.",
      },
      {
        label: "주요 화면",
        value: "정리 + 전사",
        hint: "정리 rail 우선.",
      },
    ];
  }
  if (provider === "claude") {
    return [
      {
        label: "세션 모델",
        value: "session_id + 원본 project/transcript 세션",
        hint: "session 중심 모델.",
      },
      {
        label: "재개 / 식별",
        value: "세션 ID / transcript 파일",
        hint: "session id와 transcript 우선.",
      },
      {
        label: "정리 범위",
        value: "원본 세션 파일 드라이런 / 보관 / 삭제",
        hint: "원본 파일 정리 중심.",
      },
      {
        label: "주요 화면",
        value: "원본 세션",
        hint: "전사 확인 우선.",
      },
    ];
  }
  if (provider === "gemini") {
    return [
      {
        label: "세션 모델",
        value: "history / tmp / checkpoint 세션 저장소",
        hint: "저장소 묶음 중심.",
      },
      {
        label: "재개 / 식별",
        value: "history / tmp / conversation 저장소",
        hint: "분포와 형식 우선.",
      },
      {
        label: "정리 범위",
        value: "원본 세션 파일 드라이런 / 보관 / 삭제",
        hint: "드라이런 뒤 개별 정리.",
      },
      {
        label: "주요 화면",
        value: "원본 세션",
        hint: "inventory 우선.",
      },
    ];
  }
  if (provider === "copilot") {
    return [
      {
        label: "세션 모델",
        value: "workspace/global 채팅 아티팩트",
        hint: "보조 진단 모델.",
      },
      {
        label: "재개 / 식별",
        value: "workspace 채팅 JSON",
        hint: "workspace 파일 위주.",
      },
      {
        label: "정리 범위",
        value: "원본 파일 드라이런",
        hint: "드라이런 위주.",
      },
      {
        label: "주요 화면",
        value: "원본 세션 > 보조 AI",
        hint: "필요할 때만 연다.",
      },
    ];
  }
  return [
    {
      label: "세션 모델",
      value: "혼합 캐시 / 원본 세션 저장소",
      hint: "읽기 우선.",
    },
    {
      label: "재개 / 식별",
      value: "세션 파일 / 캐시 경로",
      hint: "캐시와 파일 우선.",
    },
    {
      label: "정리 범위",
      value: "읽기 우선",
      hint: "파괴적 액션은 제한됨.",
    },
    {
      label: "주요 화면",
      value: "원본 세션",
      hint: "원본 확인용.",
    },
  ];
}

function providerWorkbenchNote(provider: string): string {
  if (provider === "codex") {
    return "thread · pinned · state 중심.";
  }
  if (provider === "claude") {
    return "session · transcript 중심.";
  }
  if (provider === "gemini") {
    return "history · tmp · conversation 중심.";
  }
  if (provider === "copilot") {
    return "보조 진단 위주.";
  }
  if (provider === "chatgpt") {
    return "desktop cache 우선.";
  }
  return "읽기 우선 상태.";
}

function flowReasonLabel(reason: string): string {
  if (reason === "GUI or CLI user input") return "입력 진입점.";
  if (reason === "workspace/root plus nested overrides") return "AGENTS 범위 확인.";
  if (reason === "system > developer > user > AGENTS.md scope") return "우선순위 지시 적용.";
  if (reason === "Tool calls plus local file reads and writes") return "도구와 파일 IO.";
  if (reason === "Read and write thread/session metadata") return "thread/session 메타데이터.";
  if (reason === "Scan local sessions and logs") return "로컬 세션 스캔.";
  if (reason === "Trusted project entry") return "신뢰된 프로젝트.";
  if (reason === "active-workspace-roots") return "활성 workspace roots.";
  if (reason.includes("Read-first cache model")) return providerWorkbenchNote("chatgpt");
  if (reason.includes("Managed around session_id")) return providerWorkbenchNote("claude");
  if (reason.includes("operations-grade model built around thread_id")) return providerWorkbenchNote("codex");
  if (reason.includes("Auxiliary diagnostics only")) return providerWorkbenchNote("copilot");
  if (reason.includes("Managed across history, tmp")) return providerWorkbenchNote("gemini");
  if (reason.includes("Collect candidate session files")) return "세션 후보 수집.";
  if (reason.includes("User focused the view")) return "scope 집중.";
  if (reason.includes("Start scanning from this provider")) return "이 AI부터 스캔.";
  if (reason.includes("Classify file formats")) return "형식 분류.";
  if (reason.includes("Summarize capability coverage")) return "capability 요약.";
  if (reason.includes("Determine what can open transcripts")) return "전사 가능 범위.";
  if (reason.includes("Pass transcript, search, and summary")) return "parser 단계로 전달.";
  if (reason.includes("Flow into session detail")) return "detail rail로 연결.";
  if (reason.includes("Read Codex-specific global state")) return "global state 읽기.";
  if (reason.includes("Recent workspace and global state")) return "workspace state 보강.";
  if (reason.includes("Decide whether dry-run")) return "dry-run 가능 여부.";
  if (reason.includes("limited to reading and analysis")) return "읽기/분석까지만.";
  return reason;
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
          ? `${focusedSessionRows.length}개 세션 · ${sourceSummary || "저장소 분포 확인"}`
          : "세션 로그가 아직 없다",
    };
    const formatNode = {
      id: `format-${focusedProvider.provider}`,
      label: `${focusedProvider.name} storage formats`,
      kind: "config" as const,
      detail: formatSummary || "형식 요약이 아직 없다",
    };
    const transcriptNode = {
      id: `transcript-${focusedProvider.provider}`,
      label: `${focusedProvider.name} transcript access`,
      kind: "instruction" as const,
      detail:
        transcriptCapableCount > 0
          ? `${transcriptCapableCount}개 전사 직접 열기 가능${
              transcriptBlockedCount > 0 ? ` · ${transcriptBlockedCount}개는 메타데이터/바이너리 비중 높음` : ""
            }`
          : "전사를 바로 열 수 있는 형식이 아직 없다",
    };
    const parserNode = {
      id: `parser-${focusedProvider.provider}`,
      label: `${focusedProvider.name} parsing`,
      kind: "instruction" as const,
      detail: focusedParserReport
        ? `OK ${focusedParserReport.parse_ok}/${focusedParserReport.scanned} · score ${focusedParserReport.parse_score ?? "-"}`
        : focusedProvider.capabilities.read_sessions && focusedProvider.capabilities.analyze_context
          ? "전사, 검색, 위험 분석 가능"
          : "더 읽을 데이터나 분석 지원이 필요하다",
    };
    const reviewNode = {
      id: `review-${focusedProvider.provider}`,
      label: `${focusedProvider.name} review path`,
      kind: "runtime" as const,
      detail: focusedProvider.capabilities.analyze_context
        ? "session detail, transcript review, cleanup review로 이어진다"
        : "지금은 감지와 기본 세션 목록까지만 열린다",
    };
    const cleanupNode = {
      id: `cleanup-${focusedProvider.provider}`,
      label: `${focusedProvider.name} cleanup stage`,
      kind: "runtime" as const,
      detail: focusedProvider.capabilities.safe_cleanup
        ? "드라이런과 실제 정리 가능"
        : focusedProvider.capability_level === "read-only"
          ? "읽기 전용이라 정리와 삭제가 잠겨 있다"
          : "안전 정리가 아직 준비되지 않았다",
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
      findings.push(`${focusedProvider.name} 로컬 흔적이 아직 안 잡혔다.`);
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
        value: sourceSummary || "세션 저장소 요약 없음",
        hint:
          sourceSummary.length > 0
            ? "지금 읽는 저장소 범위."
            : "저장소 요약이 아직 얇다.",
      },
      {
        label: messages.routing.contextFormats,
        value: formatSummary || "형식 요약 없음",
        hint:
          transcriptBlockedCount > 0
            ? `전사 ${transcriptCapableCount} · 제한 ${transcriptBlockedCount}`
            : transcriptCapableCount > 0
              ? "전사 우선 형식."
              : "직접 읽을 전사가 아직 없다.",
      },
      {
        label: messages.routing.contextParser,
        value: focusedParserReport
          ? `${focusedParserReport.parse_ok}/${focusedParserReport.scanned} (score ${focusedParserReport.parse_score ?? "-"})`
          : "파서 보고 없음",
        hint: focusedParserReport
          ? focusedParserReport.parse_fail > 0
            ? `실패 ${focusedParserReport.parse_fail}개 남음`
            : "지금 구간은 안정적."
          : "파서 보고 대기.",
      },
      {
        label: messages.routing.contextLimits,
        value: focusedProvider.capabilities.safe_cleanup
          ? "드라이런 + 정리 가능"
          : focusedProvider.capabilities.read_sessions
            ? "읽기와 분석 우선"
            : "감지 우선",
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
      ? "세션 rail에서 dry-run부터 본다."
      : focusedProvider.capabilities.read_sessions
        ? "전사 확인 우선. 정리는 잠겨 있다."
        : "흔적이나 세션 로그를 더 찾는다.";
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
            ? "바로 rail로 연다."
            : "아직 rail이 비어 있을 수 있다.",
      },
      {
        label: "Local evidence",
        value: scopedDataSources.length > 0 ? `${scopedDataSources.length} detected` : "Not enough source paths",
        hint:
          scopedDataSources.length > 0
            ? "현재 flow와 스캔 근거."
            : "근거 경로가 더 필요하다.",
      },
      {
        label: "Read / analyze",
        value: focusedProvider.capabilities.analyze_context ? "Ready" : "Limited",
        hint: focusedProvider.capabilities.analyze_context
          ? "검색과 분석 가능."
          : "읽기나 분석 범위가 좁다.",
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
          : "흔적이 아직 얇다",
      },
      {
        key: "sessions",
        label: messages.providers.flowStageSessions,
        status: stageStatus(sessionsReady, !detectReady),
        detail: sessionsReady
          ? `${focusedSessionRows.length || focusedProvider.session_log_count} logs ready`
          : "세션 로그 없음",
      },
      {
        key: "parser",
        label: messages.providers.flowStageParser,
        status: stageStatus(parserReady, !sessionsReady),
        detail: parserReady
          ? focusedParserReport
            ? `OK ${focusedParserReport.parse_ok}/${focusedParserReport.scanned}`
            : "전사와 분석 준비"
          : "더 읽을 데이터 필요",
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
            ? "read-only라 잠김"
            : "정리 준비 전",
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
      <header>
        <h2>{messages.routing.title}</h2>
        <span>{formatDateTime(data?.generated_at)}</span>
      </header>
      <div className="impact-body">
        <section className="routing-stage-shell">
          <div className="routing-stage-copy">
            <span className="overview-note-label">history and provenance workbench</span>
            <strong>{messages.routing.title}</strong>
            <p>paths / flow / findings</p>
          </div>
          <div className="routing-stage-pills">
            <span className="routing-stage-pill">
              scope · {focusedProvider?.name ?? messages.common.allAi}
            </span>
            <span className="routing-stage-pill">
              providers · {visibleProviders.length}
            </span>
            <span className="routing-stage-pill">
              paths · {scopedDataSources.length}
            </span>
            <span className="routing-stage-pill">
              findings · {(scopedFindings ?? []).length}
            </span>
          </div>
          <div className="routing-stage-summary">
            <article className="routing-stage-summary-card">
              <span>{messages.routing.providerSummary}</span>
              <strong>{visibleProviders.length}</strong>
              <p>providers</p>
            </article>
            <article className="routing-stage-summary-card">
              <span>{messages.routing.dataSources}</span>
              <strong>{scopedDataSources.length}</strong>
              <p>paths</p>
            </article>
            <article className="routing-stage-summary-card">
              <span>{messages.routing.flowMap}</span>
              <strong>{(scopedNodes ?? []).length}</strong>
              <p>nodes</p>
            </article>
            <article className="routing-stage-summary-card">
              <span>{messages.routing.findings}</span>
              <strong>{(scopedFindings ?? []).length}</strong>
              <p>open</p>
            </article>
          </div>
        </section>
        {loading ? <div className="skeleton-line" /> : null}

        <div className="impact-kv">
          <span>{messages.routing.scope}</span>
          <strong>{focusedProvider?.name ?? messages.common.allAi}</strong>
        </div>

        {!focusedProvider ? (
          <div className="info-box">
            <strong>{messages.routing.pickProviderTitle}</strong>
            <p>하나 고르면 rail이 좁혀진다.</p>
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
                  <p className="sub-hint">{providerWorkbenchNote(provider.provider)}</p>
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
                  {node.detail ? <p className="sub-hint">{flowReasonLabel(node.detail)}</p> : null}
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
                  <span>{flowReasonLabel(edge.reason)}</span>
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
