import {
  PROVIDER_LABELS,
  type ProviderId,
} from "@threadlens/shared-contracts";
import {
  IMPLEMENTED_PROVIDER_IDS,
} from "./capabilities.js";
import { getGeminiProviderHealth } from "./adapters/gemini/health.js";
import { providerRootSpecs, providerScanRootSpecs } from "./provider-roots.js";
import type {
  ProviderHealthEvidence,
  ProviderRootSpec,
  ProviderSessionCandidate,
  ProviderSessionRow,
} from "./types.js";

export type ProviderSessionLocator =
  | { kind: "file"; file_path: string }
  | { kind: "sqlite"; db_path: string; session_id: string };

export type ProviderAdapter = {
  id: ProviderId;
  label: string;
  roots(): ProviderRootSpec[];
  scanRoots?(): Promise<ProviderRootSpec[]>;
  scanSessions?(): Promise<ProviderSessionCandidate[] | ProviderSessionRow[]>;
  health?(): Promise<ProviderHealthEvidence>;
};

function buildProviderAdapter(provider: ProviderId): ProviderAdapter {
  const health = providerHealth(provider);
  return Object.freeze({
    id: provider,
    label: PROVIDER_LABELS[provider],
    roots: () => providerRootSpecs(provider),
    scanRoots: () => providerScanRootSpecs(provider),
    ...(health ? { health } : {}),
  } satisfies ProviderAdapter);
}

function providerHealth(provider: ProviderId): ProviderAdapter["health"] {
  if (provider === "gemini") return getGeminiProviderHealth;
  return undefined;
}

export const PROVIDER_ADAPTERS = Object.freeze({
  codex: buildProviderAdapter("codex"),
  chatgpt: buildProviderAdapter("chatgpt"),
  claude: buildProviderAdapter("claude"),
  gemini: buildProviderAdapter("gemini"),
  copilot: buildProviderAdapter("copilot"),
} satisfies Partial<Record<ProviderId, ProviderAdapter>>);

const PROVIDER_ADAPTERS_BY_ID: Readonly<
  Partial<Record<string, ProviderAdapter>>
> = PROVIDER_ADAPTERS;

export function getProviderAdapter(
  provider: ProviderId,
): ProviderAdapter | undefined {
  return PROVIDER_ADAPTERS_BY_ID[provider];
}

export function listProviderAdapters(): ProviderAdapter[] {
  return IMPLEMENTED_PROVIDER_IDS.flatMap((id) => {
    const adapter = PROVIDER_ADAPTERS[id];
    return adapter ? [adapter] : [];
  });
}
