import {
  getProviderCapability,
  type ProviderId,
} from "@threadlens/shared-contracts";

import {
  getProviderAdapter,
} from "../../registry.js";

export function supportsProviderCleanup(provider: ProviderId): boolean {
  return getProviderCapability(provider).safe_cleanup;
}

export function supportsProviderHardDelete(provider: ProviderId): boolean {
  return getProviderCapability(provider).hard_delete;
}

export function providerLabel(provider: ProviderId): string {
  return getProviderAdapter(provider)?.label ?? provider;
}

export function providerRoots(provider: ProviderId) {
  return getProviderAdapter(provider)?.roots() ?? [];
}

export async function providerScanRoots(provider: ProviderId) {
  const adapter = getProviderAdapter(provider);
  if (!adapter) return [];
  return adapter.scanRoots ? adapter.scanRoots() : adapter.roots();
}

export async function providerHealth(provider: ProviderId) {
  const adapter = getProviderAdapter(provider);
  return adapter?.health ? adapter.health() : null;
}
