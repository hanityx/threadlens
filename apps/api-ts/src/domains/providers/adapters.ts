import {
  PROVIDER_IDS,
  PROVIDER_LABELS,
  type ProviderId,
} from "@threadlens/shared-contracts";
import { providerRootSpecs, providerScanRootSpecs } from "./path-safety.js";
import type { ProviderRootSpec } from "./types.js";

export type ProviderSessionLocator =
  | { kind: "file"; file_path: string }
  | { kind: "sqlite"; db_path: string; session_id: string };

export type ProviderAdapter = {
  id: ProviderId;
  label: string;
  roots(): ProviderRootSpec[];
  scanRoots?(): Promise<ProviderRootSpec[]>;
};

export const PROVIDER_ADAPTERS = Object.freeze(
  Object.fromEntries(
    PROVIDER_IDS.map((id) => [
      id,
      Object.freeze({
        id,
        label: PROVIDER_LABELS[id],
        roots: () => providerRootSpecs(id),
        scanRoots: () => providerScanRootSpecs(id),
      } satisfies ProviderAdapter),
    ]),
  ),
) as Readonly<Record<ProviderId, ProviderAdapter>>;

const PROVIDER_ADAPTERS_BY_ID: Readonly<
  Partial<Record<string, ProviderAdapter>>
> = PROVIDER_ADAPTERS;

export function getProviderAdapter(
  provider: ProviderId,
): ProviderAdapter | undefined {
  return PROVIDER_ADAPTERS_BY_ID[provider];
}

export function listProviderAdapters(): ProviderAdapter[] {
  return PROVIDER_IDS.map((id) => PROVIDER_ADAPTERS[id]);
}
