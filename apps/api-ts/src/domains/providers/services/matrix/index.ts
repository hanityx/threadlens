import {
  nowIsoUtc,
} from "../../../../lib/utils.js";
import {
  buildProviderMatrixProviders,
} from "./provider-entries.js";
import { readProviderMatrixSignals } from "./signals.js";
import {
  buildProviderMatrixSummary,
} from "./summary.js";
import type { ProviderMatrixData } from "../../types.js";

type ProviderMatrixCacheEntry = {
  expires_at: number;
  data: ProviderMatrixData;
};

const PROVIDER_MATRIX_CACHE_TTL_MS = 30_000;
let providerMatrixCache: ProviderMatrixCacheEntry | null = null;
let providerMatrixInflight: Promise<ProviderMatrixData> | null = null;

export { capabilityLevel, providerStatus } from "./summary.js";

export function invalidateProviderMatrixCache() {
  providerMatrixCache = null;
}

async function buildProviderMatrixData(): Promise<ProviderMatrixData> {
  const signals = await readProviderMatrixSignals();
  const providers = buildProviderMatrixProviders(signals);

  const summary = buildProviderMatrixSummary(providers);

  return {
    generated_at: nowIsoUtc(),
    mode: "multi-provider-phase-1",
    summary,
    providers,
    policy: {
      cleanup_gate: "provider capability matrix controls destructive actions",
      default_non_codex: "all detected providers are visible for local analysis",
    },
  };
}

export async function getProviderMatrixTs(options?: { forceRefresh?: boolean }) {
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();
  if (!forceRefresh && providerMatrixCache && providerMatrixCache.expires_at > now) {
    return providerMatrixCache.data;
  }
  if (forceRefresh) {
    providerMatrixCache = null;
  }
  if (providerMatrixInflight) {
    return providerMatrixInflight;
  }

  providerMatrixInflight = buildProviderMatrixData()
    .then((data) => {
      providerMatrixCache = {
        expires_at: Date.now() + PROVIDER_MATRIX_CACHE_TTL_MS,
        data,
      };
      return data;
    })
    .finally(() => {
      providerMatrixInflight = null;
    });

  return providerMatrixInflight;
}
