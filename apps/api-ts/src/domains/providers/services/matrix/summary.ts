import type {
  ProviderMatrixData,
  ProviderStatus,
} from "../../types.js";

type ProviderMatrixProvider = ProviderMatrixData["providers"][number];

export function providerStatus(
  rootExists: boolean,
  sessionLogs: number,
): ProviderStatus {
  if (sessionLogs > 0) return "active";
  if (rootExists) return "detected";
  return "missing";
}

export function capabilityLevel(
  status: ProviderStatus,
  safeCleanup: boolean,
): "full" | "read-only" | "unavailable" {
  if (safeCleanup) return "full";
  if (status !== "missing") return "read-only";
  return "unavailable";
}

export function buildProviderMatrixSummary(
  providers: ProviderMatrixProvider[],
): ProviderMatrixData["summary"] {
  return {
    total: providers.length,
    active: providers.filter((x) => x.status === "active").length,
    detected: providers.filter((x) => x.status !== "missing").length,
    read_analyze_ready: providers.filter(
      (x) => x.capabilities.read_sessions && x.capabilities.analyze_context,
    ).length,
    safe_cleanup_ready: providers.filter((x) => x.capabilities.safe_cleanup)
      .length,
    hard_delete_ready: providers.filter((x) => x.capabilities.hard_delete)
      .length,
  };
}
