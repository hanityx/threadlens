import type {
  DataSourceInventoryRow,
  ProviderMatrixProvider,
  ProviderParserHealthReport,
  ProviderSessionRow,
  ProviderView,
} from "@/shared/types";
import type { ProviderFlowCard, SlowHotspotCard } from "@/features/providers/components/AiManagementMatrix";
import { providerFromDataSource } from "@/features/providers/lib/helpers";

type ProviderFlowState = "done" | "pending" | "blocked";

type ProviderTab = {
  id: ProviderView;
  name: string;
  status: "active" | "detected" | "missing";
  scanned: number;
  scan_ms: number | null;
  is_slow: boolean;
};

type ProviderFlowMessages = {
  flowNextCollect: string;
  flowNextCollectSessions: string;
  flowNextParse: string;
  flowNextReadonly: string;
  flowNextExecute: string;
  flowNextDryRun: string;
  flowStageDetect: string;
  flowStageSessions: string;
  flowStageParser: string;
  flowStageSafeCleanup: string;
  flowStageApply: string;
};

export function buildProviderFlowModel(options: {
  providers: ProviderMatrixProvider[];
  providerTabs: ProviderTab[];
  parserReports: ProviderParserHealthReport[];
  allParserReports: ProviderParserHealthReport[];
  allProviderSessionRows: ProviderSessionRow[];
  dataSourceRows: DataSourceInventoryRow[];
  slowProviderIds: string[];
  providerView: ProviderView;
  providerMessages: ProviderFlowMessages;
}) {
  const providerTabById = new Map(options.providerTabs.map((tab) => [tab.id, tab]));

  const parseFailByProvider: Record<string, number> = {};
  const parseScoreByProvider: Record<string, number | null> = {};
  options.parserReports.forEach((report) => {
    parseFailByProvider[report.provider] = Number(report.parse_fail);
    parseScoreByProvider[report.provider] = report.parse_score;
  });

  const parserReportByProvider = new Map<string, ProviderParserHealthReport>();
  options.allParserReports.forEach((report) => {
    parserReportByProvider.set(report.provider, report);
  });

  const providerMatrixById = new Map<string, ProviderMatrixProvider>();
  options.providers.forEach((provider) => {
    providerMatrixById.set(provider.provider, provider);
  });

  const providerSessionCountById = new Map<string, number>();
  options.allProviderSessionRows.forEach((row) => {
    providerSessionCountById.set(row.provider, (providerSessionCountById.get(row.provider) ?? 0) + 1);
  });

  const dataSourcesByProvider = new Map<string, DataSourceInventoryRow[]>();
  options.dataSourceRows.forEach((row) => {
    const providerId = providerFromDataSource(row.source_key);
    if (!providerId || providerId === "all") return;
    const current = dataSourcesByProvider.get(providerId) ?? [];
    current.push(row);
    dataSourcesByProvider.set(providerId, current);
  });

  const transcriptReadyCountByProvider = new Map<string, number>();
  options.allProviderSessionRows.forEach((row) => {
    const ready = row.probe.format === "jsonl" || row.probe.format === "json";
    if (!ready) return;
    transcriptReadyCountByProvider.set(
      row.provider,
      (transcriptReadyCountByProvider.get(row.provider) ?? 0) + 1,
    );
  });
  const slowProviderIdSet = new Set(options.slowProviderIds);

  const providerFlowCards: ProviderFlowCard[] = options.providerTabs
    .filter((tab) => tab.id !== "all")
    .map((tab) => {
      const providerId = tab.id;
      const providerInfo = providerMatrixById.get(providerId);
      const parserInfo = parserReportByProvider.get(providerId);
      const sources = dataSourcesByProvider.get(providerId) ?? [];
      const presentSources = sources.filter((row) => row.present);
      const roots = providerInfo?.evidence?.roots ?? [];
      const sessionCount = providerSessionCountById.get(providerId) ?? 0;
      const parseFail = Number(parserInfo?.parse_fail ?? 0);
      const parseOk = Number(parserInfo?.parse_ok ?? 0);
      const parseScore = parserInfo?.parse_score ?? null;
      const canAnalyze = Boolean(providerInfo?.capabilities.analyze_context);
      const canRead = Boolean(providerInfo?.capabilities.read_sessions);
      const canSafeCleanup = Boolean(providerInfo?.capabilities.safe_cleanup);
      const parserStageState: ProviderFlowState =
        sessionCount === 0
          ? "pending"
          : parseFail > 0
            ? "blocked"
            : parseOk > 0 || parseScore !== null
              ? "done"
              : "pending";
      const applyStageState: ProviderFlowState =
        canSafeCleanup && sessionCount > 0 && parseFail === 0
          ? "done"
          : canSafeCleanup && sessionCount > 0
            ? "pending"
            : "blocked";

      let nextStep = options.providerMessages.flowNextCollect;
      if (presentSources.length > 0 && sessionCount === 0) {
        nextStep = options.providerMessages.flowNextCollectSessions;
      } else if (sessionCount > 0 && parseFail > 0) {
        nextStep = options.providerMessages.flowNextParse;
      } else if (!canSafeCleanup) {
        nextStep = options.providerMessages.flowNextReadonly;
      } else if (canSafeCleanup && sessionCount > 0 && parseFail === 0) {
        nextStep = options.providerMessages.flowNextExecute;
      } else if (sessionCount > 0) {
        nextStep = options.providerMessages.flowNextDryRun;
      }

      return {
        providerId,
        name: tab.name,
        status: tab.status,
        scanMs: tab.scan_ms,
        isSlow: slowProviderIdSet.has(providerId),
        parseFail,
        parseScore,
        canRead,
        canAnalyze,
        canSafeCleanup,
        roots,
        sources,
        presentSourceCount: presentSources.length,
        sessionCount,
        nextStep,
        flow: [
          {
            key: "source",
            label: options.providerMessages.flowStageDetect,
            state: presentSources.length > 0 ? "done" : "pending",
          },
          {
            key: "sessions",
            label: options.providerMessages.flowStageSessions,
            state: sessionCount > 0 ? "done" : "pending",
          },
          {
            key: "parser",
            label: options.providerMessages.flowStageParser,
            state: parserStageState,
          },
          {
            key: "cleanup",
            label: options.providerMessages.flowStageSafeCleanup,
            state: canSafeCleanup ? "done" : "blocked",
          },
          {
            key: "apply",
            label: options.providerMessages.flowStageApply,
            state: applyStageState,
          },
        ],
      };
    });
  const rankVisibleFlowCards = (cards: ProviderFlowCard[]) =>
    [...cards].sort((a, b) => {
      const aAttention =
        (a.parseFail > 0 ? 4 : 0) +
        (a.status !== "active" ? 2 : 0) +
        (slowProviderIdSet.has(a.providerId) ? 1 : 0);
      const bAttention =
        (b.parseFail > 0 ? 4 : 0) +
        (b.status !== "active" ? 2 : 0) +
        (slowProviderIdSet.has(b.providerId) ? 1 : 0);
      if (aAttention !== bAttention) return bAttention - aAttention;
      if (a.parseFail !== b.parseFail) return b.parseFail - a.parseFail;
      const aMs = a.scanMs ?? -1;
      const bMs = b.scanMs ?? -1;
      if (aMs !== bMs) return bMs - aMs;
      if (a.sessionCount !== b.sessionCount) return b.sessionCount - a.sessionCount;
      return a.name.localeCompare(b.name);
    });

  const providerFlowCardById = new Map(providerFlowCards.map((card) => [card.providerId, card]));
  const slowHotspotCards: SlowHotspotCard[] = options.slowProviderIds
    .map((providerId) => {
      const tab = providerTabById.get(providerId as ProviderView);
      if (!tab || tab.id === "all") return null;
      return {
        provider: providerId,
        name: tab.name,
        scanMs: tab.scan_ms,
        scanned: tab.scanned,
        parseFail: parseFailByProvider[providerId] ?? 0,
        parseScore: parseScoreByProvider[providerId] ?? null,
      };
    })
    .filter((item): item is SlowHotspotCard => item !== null)
    .sort((a, b) => {
      const aMs = a.scanMs ?? -1;
      const bMs = b.scanMs ?? -1;
      if (aMs !== bMs) return bMs - aMs;
      if (a.parseFail !== b.parseFail) return b.parseFail - a.parseFail;
      return b.scanned - a.scanned;
    })
    .slice(0, 6);

  const selectedManagementCard = providerFlowCardById.get(options.providerView) ?? null;
  const selectedProviderTranscriptReady =
    options.providerView === "all" ? 0 : transcriptReadyCountByProvider.get(options.providerView) ?? 0;
  const selectedProviderPresentSources =
    options.providerView === "all"
      ? 0
      : (dataSourcesByProvider.get(options.providerView) ?? []).filter((row) => row.present).length;
  const selectedProviderSessionCount =
    options.providerView === "all" ? 0 : providerSessionCountById.get(options.providerView) ?? 0;
  const visibleFlowCards =
    options.providerView === "all"
      ? rankVisibleFlowCards(providerFlowCards)
      : providerFlowCards.filter((card) => card.providerId === options.providerView);
  const allViewHiddenCount =
    options.providerView === "all" ? Math.max(providerFlowCards.length - visibleFlowCards.length, 0) : 0;

  return {
    parseFailByProvider,
    parseScoreByProvider,
    providerFlowCards,
    slowHotspotCards,
    selectedManagementCard,
    selectedProviderTranscriptReady,
    selectedProviderPresentSources,
    selectedProviderSessionCount,
    visibleFlowCards,
    allViewHiddenCount,
  };
}
