import type { ProviderSessionRow, ProviderView } from "@/shared/types";
import type { ProviderProbeFilter } from "@/features/providers/model/sessionTableModel";

export type PendingSessionJump = {
  provider: string;
  sessionId: string;
};

export type ParserJumpStatus = "idle" | "found" | "not_found";

export function buildJumpToProviderSessionsState(options: {
  currentProviderView: ProviderView;
  providerId: string;
  parseFail?: number;
  fromHotspot?: boolean;
}) {
  return {
    hotspotScopeOrigin: options.fromHotspot ? options.currentProviderView : null,
    providerView: options.providerId as ProviderView,
    probeFilter: (options.parseFail ?? 0) > 0 ? ("fail" as ProviderProbeFilter) : ("all" as ProviderProbeFilter),
    parserDetailProvider: options.providerId,
    sessionFilter: "",
  };
}

export function buildJumpToParserProviderState(providerId: string) {
  if (!providerId) return null;
  return {
    advancedOpen: true,
    parserFailOnly: false,
    parserDetailProvider: providerId,
    pendingParserFocusProvider: providerId,
  };
}

export function buildJumpToSessionFromParserErrorState(options: {
  providerId: string;
  sessionId: string;
}) {
  return {
    hotspotScopeOrigin: null,
    providerView: options.providerId as ProviderView,
    probeFilter: "all" as ProviderProbeFilter,
    sessionFilter: "",
    parserDetailProvider: options.providerId,
    pendingSessionJump: {
      provider: options.providerId,
      sessionId: options.sessionId,
    },
    parserJumpStatus: "idle" as ParserJumpStatus,
  };
}

export function resolvePendingSessionJump(options: {
  pendingSessionJump: PendingSessionJump | null;
  providerView: string;
  providerSessionsLoading: boolean;
  providerSessionRows: ProviderSessionRow[];
}) {
  if (!options.pendingSessionJump) return null;
  if (options.providerView !== options.pendingSessionJump.provider) return null;
  if (options.providerSessionsLoading) return null;
  const hit = options.providerSessionRows.find(
    (row) =>
      row.provider === options.pendingSessionJump?.provider &&
      row.session_id === options.pendingSessionJump?.sessionId,
  );
  return {
    selectedSessionPath: hit?.file_path ?? null,
    parserJumpStatus: (hit ? "found" : "not_found") as ParserJumpStatus,
  };
}

export function canFocusPendingParserProvider(
  pendingParserFocusProvider: string,
  sortedParserReports: Array<{ provider: string }>,
) {
  if (!pendingParserFocusProvider) return false;
  return sortedParserReports.some((report) => report.provider === pendingParserFocusProvider);
}

export function buildHotspotOriginLabel(options: {
  hotspotScopeOrigin: ProviderView | null;
  providerTabById: ReadonlyMap<ProviderView, { name: string }>;
  allAiLabel: string;
}) {
  if (!options.hotspotScopeOrigin) return "";
  if (options.hotspotScopeOrigin === "all") return options.allAiLabel;
  return options.providerTabById.get(options.hotspotScopeOrigin)?.name ?? options.hotspotScopeOrigin;
}
