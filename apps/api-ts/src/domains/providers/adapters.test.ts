import {
  getProviderCapability,
  PROVIDER_IDS,
} from "@threadlens/shared-contracts";
import { describe, expect, it } from "vitest";
import {
  type ProviderAdapter,
  type ProviderSessionLocator,
  getProviderAdapter,
  listProviderAdapters,
  PROVIDER_ADAPTERS,
} from "./adapters.js";
import { providerRootSpecs } from "./path-safety.js";

describe("provider adapters", () => {
  it("registers one internal adapter for each provider contract id", () => {
    expect(listProviderAdapters().map((adapter) => adapter.id)).toEqual(PROVIDER_IDS);
    expect(Object.keys(PROVIDER_ADAPTERS)).toEqual([...PROVIDER_IDS]);
  });

  it("keeps adapter roots equivalent to current provider root specs", () => {
    for (const provider of PROVIDER_IDS) {
      const adapter = getProviderAdapter(provider);
      expect(adapter).toBeDefined();
      expect(adapter?.roots()).toEqual(providerRootSpecs(provider));
    }
  });

  it("fails closed for unknown provider ids passed through internal casts", () => {
    expect(getProviderAdapter("unknown" as ProviderAdapter["id"])).toBeUndefined();
  });

  it("does not duplicate provider capabilities inside adapters", () => {
    for (const provider of PROVIDER_IDS) {
      const adapter = getProviderAdapter(provider);
      expect(adapter).toBeDefined();
      if (!adapter) throw new Error(`missing adapter for ${provider}`);
      expect("capabilities" in adapter).toBe(false);
      expect(getProviderCapability(adapter.id).label).toBe(adapter.label);
    }
  });

  it("defines session locators without forcing DB-backed providers into fake paths", () => {
    const fileLocator: ProviderSessionLocator = {
      kind: "file",
      file_path: "/tmp/session.jsonl",
    };
    const sqliteLocator: ProviderSessionLocator = {
      kind: "sqlite",
      db_path: "/tmp/provider.db",
      session_id: "session-1",
    };

    expect(fileLocator.kind).toBe("file");
    expect(sqliteLocator).toMatchObject({
      kind: "sqlite",
      session_id: "session-1",
    });
  });
});
