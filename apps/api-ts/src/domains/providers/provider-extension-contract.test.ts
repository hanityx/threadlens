import {
  getProviderCapability,
  PROVIDER_IDS,
} from "@threadlens/shared-contracts";
import { describe, expect, it } from "vitest";
import {
  IMPLEMENTED_PROVIDER_IDS,
  listProviderActionProviderIds,
  listProviderIds,
  listSearchableProviderIds,
  listTranscriptReadableProviderIds,
} from "./capabilities.js";
import {
  getProviderAdapter,
  listProviderAdapters,
  PROVIDER_ADAPTERS,
} from "./registry.js";
import { providerRootSpecs } from "./path-safety.js";

describe("provider extension contract", () => {
  it("keeps shared contracts, implemented ids, and adapters in lockstep", () => {
    expect(IMPLEMENTED_PROVIDER_IDS).toEqual(PROVIDER_IDS);
    expect(listProviderIds()).toEqual([...IMPLEMENTED_PROVIDER_IDS]);
    expect(Object.keys(PROVIDER_ADAPTERS)).toEqual([...IMPLEMENTED_PROVIDER_IDS]);
    expect(listProviderAdapters().map((adapter) => adapter.id)).toEqual([
      ...IMPLEMENTED_PROVIDER_IDS,
    ]);
  });

  it("wires every implemented provider to a labeled adapter and root specs", () => {
    for (const provider of IMPLEMENTED_PROVIDER_IDS) {
      const capability = getProviderCapability(provider);
      const adapter = getProviderAdapter(provider);

      expect(adapter, `missing adapter for ${provider}`).toBeDefined();
      if (!adapter) continue;

      expect(adapter.id).toBe(provider);
      expect(adapter.label).toBe(capability.label);
      expect(adapter.roots()).toEqual(providerRootSpecs(provider));
      if (!adapter.scanSessions) {
        expect(adapter.roots().length, `${provider} root specs`).toBeGreaterThan(0);
      }
      for (const spec of adapter.roots()) {
        expect(spec.source, `${provider} root source`).toBeTruthy();
        expect(spec.root, `${provider} root path`).toBeTruthy();
        expect(Array.isArray(spec.exts), `${provider} root extensions`).toBe(true);
      }
    }
  });

  it("derives route policy lists from shared provider capabilities", () => {
    const expectedSearchable = IMPLEMENTED_PROVIDER_IDS.filter((provider) => {
      const capability = getProviderCapability(provider);
      return (
        capability.search_scope_visibility === "public" &&
        capability.read_sessions &&
        capability.analyze_context
      );
    });
    const expectedTranscriptReadable = IMPLEMENTED_PROVIDER_IDS.filter(
      (provider) => getProviderCapability(provider).read_transcript,
    );
    const expectedActionable = IMPLEMENTED_PROVIDER_IDS.filter((provider) => {
      const capability = getProviderCapability(provider);
      return capability.safe_cleanup || capability.hard_delete;
    });

    expect(listSearchableProviderIds()).toEqual(expectedSearchable);
    expect(listTranscriptReadableProviderIds()).toEqual(expectedTranscriptReadable);
    expect(listProviderActionProviderIds()).toEqual(expectedActionable);
  });

  it("keeps destructive action capabilities fail-closed", () => {
    for (const provider of IMPLEMENTED_PROVIDER_IDS) {
      const capability = getProviderCapability(provider);
      if (capability.hard_delete) {
        expect(capability.safe_cleanup, `${provider} hard_delete requires safe_cleanup`).toBe(true);
      }
    }
  });
});
