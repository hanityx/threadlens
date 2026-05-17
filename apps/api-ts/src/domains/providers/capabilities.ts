import {
  findProviderCapability,
  getProviderCapability,
  type ProviderCapability,
  type ProviderId,
} from "@threadlens/shared-contracts";

import type { ProviderSessionAction } from "./types.js";

export const IMPLEMENTED_PROVIDER_IDS = [
  "codex",
  "chatgpt",
  "claude",
  "gemini",
  "copilot",
] as const satisfies readonly ProviderId[];

function isImplementedProviderId(value: string): value is ProviderId {
  return (IMPLEMENTED_PROVIDER_IDS as readonly string[]).includes(value);
}

function implementedCapabilities(): ProviderCapability[] {
  return IMPLEMENTED_PROVIDER_IDS.map((provider) => getProviderCapability(provider));
}

export function listProviderIds(): ProviderId[] {
  return [...IMPLEMENTED_PROVIDER_IDS];
}

export function parseProviderId(raw: unknown): ProviderId | undefined {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return isImplementedProviderId(value) ? value : undefined;
}

export function listSearchableProviderIds(): ProviderId[] {
  return implementedCapabilities()
    .filter(
      (capability) =>
        capability.search_scope_visibility === "public" &&
        capability.read_sessions &&
        capability.analyze_context,
    )
    .map((capability) => capability.id);
}

export function parseSearchableProviderId(raw: unknown): ProviderId | undefined {
  const provider = parseProviderId(raw);
  if (!provider) return undefined;
  return listSearchableProviderIds().includes(provider) ? provider : undefined;
}

export function listSessionReadableProviderIds(): ProviderId[] {
  return implementedCapabilities()
    .filter((capability) => capability.read_sessions)
    .map((capability) => capability.id);
}

export function parseSessionReadableProviderId(raw: unknown): ProviderId | undefined {
  const provider = parseProviderId(raw);
  if (!provider) return undefined;
  return listSessionReadableProviderIds().includes(provider) ? provider : undefined;
}

export function listTranscriptReadableProviderIds(): ProviderId[] {
  return implementedCapabilities()
    .filter((capability) => capability.read_transcript)
    .map((capability) => capability.id);
}

export function parseTranscriptReadableProviderId(raw: unknown): ProviderId | undefined {
  const provider = parseProviderId(raw);
  if (!provider) return undefined;
  return listTranscriptReadableProviderIds().includes(provider) ? provider : undefined;
}

export function listProviderActionProviderIds(): ProviderId[] {
  return implementedCapabilities()
    .filter(
      (capability) =>
        capability.read_sessions || capability.safe_cleanup || capability.hard_delete,
    )
    .map((capability) => capability.id);
}

export function supportsProviderAction(
  provider: ProviderId,
  action: ProviderSessionAction,
): boolean {
  const capability = findProviderCapability(provider);
  if (!capability) return false;
  if (action === "backup_local") {
    return capability.read_sessions === true;
  }
  if (action === "delete_local") {
    return capability.safe_cleanup === true && capability.hard_delete === true;
  }
  return capability.safe_cleanup === true;
}
