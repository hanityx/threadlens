import { readStorageValue, SETUP_SELECTION_STORAGE_KEY } from "@/shared/lib/appState";
import { formatBytesCompact } from "@/shared/lib/format";
import type { DataSourceInventoryRow, ProviderMatrixProvider, ProviderSessionRow, ProviderView } from "@/shared/types";

export type OverviewMessageMap = {
  sourceLocalArchive: string;
  sourceProjectTrace: string;
  sourceWorkspaceTemp: string;
  sourceSessionTrace: string;
  reviewMetaFallbackSource: string;
  reviewMetaFallbackRisk: string;
  reviewSourceSessions: string;
  reviewSourceProjects: string;
  reviewSourceTmp: string;
  reviewRiskHigh: string;
  reviewRiskMedium: string;
  reviewRiskLow: string;
  dotReadableSession: string;
  dotProbeIssue: string;
  dotProbeIssueWithError: string;
  dotUnknownRecency: string;
  dotFreshLast24Hours: string;
  dotStaleMoreThan7Days: string;
  dotRecentWithinWeek: string;
  dotHeavySessionFootprint: string;
  dotLightSessionFootprint: string;
  dotMediumSessionFootprint: string;
  commandShellLabel: string;
  commandPathSessions: string;
  commandPathActive: string;
  commandStatusLabel: string;
  today: string;
  updatedAt: string;
  rowsValue: string;
  primarySummary: string;
  backupsRuntimeSummary: string;
};

export function formatOverviewMessage(
  template: string,
  replacements: Record<string, string | number>,
): string {
  return Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function describeOverviewSessionSource(
  source: string,
  overviewMessages: OverviewMessageMap,
): string {
  if (source === "sessions") return overviewMessages.sourceLocalArchive;
  if (source === "projects") return overviewMessages.sourceProjectTrace;
  if (source === "tmp") return overviewMessages.sourceWorkspaceTemp;
  return overviewMessages.sourceSessionTrace;
}

export function formatOverviewReviewSource(
  source: string | null | undefined,
  overviewMessages: OverviewMessageMap,
): string {
  if (source === "sessions") return overviewMessages.reviewSourceSessions;
  if (source === "projects") return overviewMessages.reviewSourceProjects;
  if (source === "tmp") return overviewMessages.reviewSourceTmp;
  return source || overviewMessages.reviewMetaFallbackSource;
}

export function formatOverviewReviewRisk(
  risk: string | null | undefined,
  overviewMessages: OverviewMessageMap,
): string {
  if (risk === "high") return overviewMessages.reviewRiskHigh;
  if (risk === "medium") return overviewMessages.reviewRiskMedium;
  if (risk === "low") return overviewMessages.reviewRiskLow;
  return risk || overviewMessages.reviewMetaFallbackRisk;
}

export function providerFromDataSource(sourceKey: string): string | null {
  const key = sourceKey.toLowerCase();
  if (key.startsWith("claude")) return "claude";
  if (key.startsWith("gemini")) return "gemini";
  if (key.startsWith("copilot")) return "copilot";
  if (key.startsWith("chat_")) return "chatgpt";
  if (
    key.startsWith("codex_") ||
    key === "sessions" ||
    key === "archived_sessions" ||
    key === "history" ||
    key === "global_state"
  ) {
    return "codex";
  }
  return null;
}

export function buildProviderBytesById(options: {
  dataSourceRows: DataSourceInventoryRow[];
  providerSessionProviders?: Array<{ provider: string; total_bytes?: number }>;
  providerSessionRows: ProviderSessionRow[];
  providers?: Array<Pick<ProviderMatrixProvider, "provider">>;
}) {
  const inventoryBytesByProvider = new Map<string, number>();
  options.dataSourceRows.forEach((row) => {
    const providerId = providerFromDataSource(row.source_key);
    if (!providerId || !row.present) return;
    inventoryBytesByProvider.set(
      providerId,
      (inventoryBytesByProvider.get(providerId) ?? 0) + Number(row.total_bytes || 0),
    );
  });
  const sessionBytesByProvider = new Map<string, number>();
  options.providerSessionRows.forEach((row) => {
    sessionBytesByProvider.set(
      row.provider,
      (sessionBytesByProvider.get(row.provider) ?? 0) + Number(row.size_bytes || 0),
    );
  });
  const summaryBytesByProvider = new Map<string, number>();
  (options.providerSessionProviders ?? []).forEach((provider) => {
    summaryBytesByProvider.set(provider.provider, Number(provider.total_bytes || 0));
  });
  const providerIds = new Set([
    ...inventoryBytesByProvider.keys(),
    ...summaryBytesByProvider.keys(),
    ...sessionBytesByProvider.keys(),
    ...(options.providers ?? []).map((provider) => provider.provider),
  ]);
  return new Map(
    Array.from(providerIds, (providerId) => [
      providerId,
      Math.max(
        inventoryBytesByProvider.get(providerId) ?? 0,
        summaryBytesByProvider.get(providerId) ?? 0,
        sessionBytesByProvider.get(providerId) ?? 0,
      ),
    ]),
  );
}

export function readStoredSetupSelectionIds(allProviderIdSet: Set<string>): string[] {
  const raw = readStorageValue([SETUP_SELECTION_STORAGE_KEY]);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((item) => String(item || "").trim())
          .filter((item) => Boolean(item) && item !== "chatgpt" && allProviderIdSet.has(item)),
      ),
    );
  } catch {
    return [];
  }
}

export function resolveOverviewProvidersEntry(options: {
  selectedProviderIds: string[];
  primaryProviderId: string;
  currentProviderView: ProviderView;
}): ProviderView {
  if (options.selectedProviderIds.length > 1) {
    return "all";
  }
  if (options.currentProviderView && options.currentProviderView !== "all") {
    return options.currentProviderView;
  }
  if (options.selectedProviderIds.length === 1) {
    return options.selectedProviderIds[0] as ProviderView;
  }
  if (options.primaryProviderId && options.selectedProviderIds.length === 0) {
    return options.primaryProviderId as ProviderView;
  }
  return "all";
}

export function describeSessionHealthDot(
  row: ProviderSessionRow,
  overviewMessages: OverviewMessageMap,
) {
  if (row.probe.ok) {
    return { label: overviewMessages.dotReadableSession, className: "is-active" };
  }
  return {
    label: row.probe.error
      ? formatOverviewMessage(overviewMessages.dotProbeIssueWithError, {
          error: row.probe.error,
        })
      : overviewMessages.dotProbeIssue,
    className: "is-warn",
  };
}

export function describeSessionFreshnessDot(
  row: ProviderSessionRow,
  overviewMessages: OverviewMessageMap,
) {
  const timestamp = Date.parse(row.mtime || "");
  if (Number.isNaN(timestamp)) {
    return { label: overviewMessages.dotUnknownRecency, className: "" };
  }
  const ageMs = Date.now() - timestamp;
  if (ageMs <= 24 * 60 * 60 * 1000) {
    return { label: overviewMessages.dotFreshLast24Hours, className: "is-active" };
  }
  if (ageMs >= 7 * 24 * 60 * 60 * 1000) {
    return { label: overviewMessages.dotStaleMoreThan7Days, className: "is-warn" };
  }
  return { label: overviewMessages.dotRecentWithinWeek, className: "" };
}

export function describeSessionWeightDot(
  row: ProviderSessionRow,
  overviewMessages: OverviewMessageMap,
) {
  const bytes = Number(row.size_bytes || 0);
  if (bytes >= 25 * 1024 * 1024) {
    return {
      label: formatOverviewMessage(overviewMessages.dotHeavySessionFootprint, {
        size: formatBytesCompact(bytes),
      }),
      className: "is-active",
    };
  }
  if (bytes <= 512 * 1024) {
    return {
      label: formatOverviewMessage(overviewMessages.dotLightSessionFootprint, {
        size: formatBytesCompact(bytes),
      }),
      className: "",
    };
  }
  return {
    label: formatOverviewMessage(overviewMessages.dotMediumSessionFootprint, {
      size: formatBytesCompact(bytes),
    }),
    className: "",
  };
}

export function buildInterleavedSessionPreview(
  rows: ProviderSessionRow[],
  preferredProviderId: string,
  limit: number,
): ProviderSessionRow[] {
  const grouped = new Map<string, ProviderSessionRow[]>();
  rows.forEach((row) => {
    const existing = grouped.get(row.provider);
    if (existing) {
      existing.push(row);
    } else {
      grouped.set(row.provider, [row]);
    }
  });
  grouped.forEach((group) =>
    group.sort((left, right) => Date.parse(right.mtime || "") - Date.parse(left.mtime || "")),
  );
  const providerOrder = Array.from(grouped.keys()).sort((left, right) => {
    if (left === preferredProviderId) return -1;
    if (right === preferredProviderId) return 1;
    return left.localeCompare(right);
  });
  const result: ProviderSessionRow[] = [];
  let index = 0;
  while (result.length < limit) {
    let added = false;
    for (const providerId of providerOrder) {
      const group = grouped.get(providerId) ?? [];
      const row = group[index];
      if (!row) continue;
      result.push(row);
      added = true;
      if (result.length >= limit) break;
    }
    if (!added) break;
    index += 1;
  }
  return result;
}
