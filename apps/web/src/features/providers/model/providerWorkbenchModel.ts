import type { DataSourceInventoryRow, ProviderSessionRow, ProviderView } from "@/shared/types";
import {
  CORE_PROVIDER_IDS,
  OPTIONAL_PROVIDER_IDS,
  SLOW_THRESHOLD_OPTIONS_MS,
  providerFromDataSource,
} from "@/features/providers/lib/helpers";

type ProviderTab = {
  id: ProviderView;
  name: string;
  status: "active" | "detected" | "missing";
  scanned: number;
  scan_ms: number | null;
  is_slow: boolean;
};

export function buildProviderWorkbenchModel(options: {
  providerTabs: ProviderTab[];
  slowProviderIds: string[];
  slowProviderThresholdMs: number;
  providerView: ProviderView;
  dataSourceRows: DataSourceInventoryRow[];
  providerSessionsLoading: boolean;
  providerSessionRows: ProviderSessionRow[];
  providerFetchMetrics: {
    data_sources: number | null;
    matrix: number | null;
    sessions: number | null;
    parser: number | null;
  };
}) {
  const slowProviderSet = new Set(options.slowProviderIds);
  const providerTabById = new Map(options.providerTabs.map((tab) => [tab.id, tab]));
  const managedProviderTabs = options.providerTabs.filter((tab) => tab.id !== "all");
  const coreProviderTabs = managedProviderTabs.filter((tab) =>
    CORE_PROVIDER_IDS.includes(tab.id as (typeof CORE_PROVIDER_IDS)[number]),
  );
  const optionalProviderTabs = managedProviderTabs.filter((tab) =>
    OPTIONAL_PROVIDER_IDS.includes(tab.id as (typeof OPTIONAL_PROVIDER_IDS)[number]),
  );
  const slowThresholdOptions = SLOW_THRESHOLD_OPTIONS_MS.includes(options.slowProviderThresholdMs)
    ? SLOW_THRESHOLD_OPTIONS_MS
    : [...SLOW_THRESHOLD_OPTIONS_MS, options.slowProviderThresholdMs].sort((a, b) => a - b);
  const slowProviderSummary = options.slowProviderIds
    .map((providerId) => providerTabById.get(providerId as ProviderView)?.name ?? providerId)
    .slice(0, 3)
    .join(", ");
  const providerTabCount = managedProviderTabs.length;
  const detectedDataSourceCount = options.dataSourceRows.filter((row) => row.present).length;
  const selectedProviderDataSources =
    options.providerView === "all"
      ? []
      : options.dataSourceRows.filter((row) => providerFromDataSource(row.source_key) === options.providerView);
  const selectedProviderHasPresentSource = selectedProviderDataSources.some((row) => row.present);
  const showProviderSessionsZeroState =
    options.providerView !== "all" &&
    !options.providerSessionsLoading &&
    options.providerSessionRows.length === 0;
  const hasSlowProviderFetch =
    (options.providerFetchMetrics.data_sources !== null &&
      options.providerFetchMetrics.data_sources >= options.slowProviderThresholdMs) ||
    (options.providerFetchMetrics.matrix !== null &&
      options.providerFetchMetrics.matrix >= options.slowProviderThresholdMs) ||
    (options.providerFetchMetrics.sessions !== null &&
      options.providerFetchMetrics.sessions >= options.slowProviderThresholdMs) ||
    (options.providerFetchMetrics.parser !== null &&
      options.providerFetchMetrics.parser >= options.slowProviderThresholdMs);

  return {
    slowProviderSet,
    providerTabById,
    managedProviderTabs,
    coreProviderTabs,
    optionalProviderTabs,
    slowThresholdOptions,
    slowProviderSummary,
    providerTabCount,
    detectedDataSourceCount,
    selectedProviderDataSources,
    selectedProviderHasPresentSource,
    showProviderSessionsZeroState,
    hasSlowProviderFetch,
  };
}
