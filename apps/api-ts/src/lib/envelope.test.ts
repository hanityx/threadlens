import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "@threadlens/shared-contracts";
import { envelope, withSchemaVersion } from "./envelope.js";

describe("envelope", () => {
  it("wraps data with the current schema version", () => {
    expect(envelope({ ok: true })).toEqual({
      ok: true,
      schema_version: SCHEMA_VERSION,
      data: { ok: true },
      error: null,
    });
  });

  it("marks error envelopes as not ok", () => {
    expect(envelope(null, "boom")).toEqual({
      ok: false,
      schema_version: SCHEMA_VERSION,
      data: null,
      error: "boom",
    });
  });
});

describe("withSchemaVersion", () => {
  it("adds schema_version to object payloads without one", () => {
    expect(withSchemaVersion({ ok: true })).toEqual({
      ok: true,
      schema_version: SCHEMA_VERSION,
    });
  });

  it("keeps object payloads that already have a schema_version unchanged", () => {
    const payload = { ok: true, schema_version: "custom" };
    expect(withSchemaVersion(payload)).toBe(payload);
  });

  it("wraps primitive payloads in an envelope", () => {
    expect(withSchemaVersion("value")).toEqual({
      ok: true,
      schema_version: SCHEMA_VERSION,
      data: "value",
      error: null,
    });
  });
});
