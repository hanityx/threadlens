import { beforeAll, describe, expect, it } from "vitest";

const TS_BASE = process.env.CONTRACT_TS_BASE ?? "http://127.0.0.1:8788";
const LEGACY_BASE = process.env.CONTRACT_PY_BASE ?? "http://127.0.0.1:8787";
const REQUIRE_PARITY = process.env.REQUIRE_PARITY === "1";

let tsReachable = false;
let legacyReachable = false;

async function isReachable(url: string, timeoutMs = 5000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url: string, timeoutMs = 15000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url, { signal: controller.signal });
  clearTimeout(timer);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function postJson(url: string, body: unknown, timeoutMs = 15000): Promise<{ status: number; data: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    const data = safeJson(text);
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function topKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

function hasKeys(value: unknown, keys: string[]) {
  const set = new Set(topKeys(value));
  return keys.every((k) => set.has(k));
}

function normalizeTsKeys(keys: string[]): string[] {
  return keys.filter((k) => k !== "schema_version").sort();
}

function unwrapGatewayPayload(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const rec = value as Record<string, unknown>;
  if (typeof rec.ok === "boolean" && Object.prototype.hasOwnProperty.call(rec, "data")) {
    return rec.data;
  }
  return value;
}

beforeAll(async () => {
  tsReachable = await isReachable(`${TS_BASE}/api/healthz`, 5000);
  legacyReachable = await isReachable(`${LEGACY_BASE}/api/runtime-health`, 5000);
}, 20000);

describe("api contract parity (legacy vs ts)", () => {
  it("services are reachable for parity test", () => {
    if (!tsReachable || !legacyReachable) {
      console.warn("Skipping strict parity checks because services are not both reachable", {
        tsReachable,
        legacyReachable,
        TS_BASE,
        LEGACY_BASE,
      });
    }
    if (REQUIRE_PARITY) {
      expect(tsReachable).toBe(true);
      expect(legacyReachable).toBe(true);
      return;
    }
    expect(tsReachable || legacyReachable).toBe(true);
  });

  it("/api/threads preserves top-level response keys", async () => {
    if (!tsReachable || !legacyReachable) return;

    const query = "offset=0&limit=20&sort=updated_desc";
    const tsDataRaw = await getJson(`${TS_BASE}/api/threads?${query}`, 25000);
    const pyData = await getJson(`${LEGACY_BASE}/api/threads?${query}`, 25000);
    const tsData = unwrapGatewayPayload(tsDataRaw);

    expect(hasKeys(tsData, ["total", "offset", "limit", "rows"])).toBe(true);
    const tsKeys = normalizeTsKeys(topKeys(tsData));
    const pyKeys = topKeys(pyData);
    expect(tsKeys).toEqual(pyKeys);
  }, 30000);

  it("/api/roadmap-status keeps core shape", async () => {
    if (!tsReachable || !legacyReachable) return;

    const tsDataRaw = await getJson(`${TS_BASE}/api/roadmap-status`, 15000);
    const pyData = await getJson(`${LEGACY_BASE}/api/roadmap-status`, 15000);
    const tsData = unwrapGatewayPayload(tsDataRaw);

    expect(hasKeys(tsData, ["weeks", "generated_at", "checkins", "status_counts", "remaining_tracks"])).toBe(true);
    const tsKeys = normalizeTsKeys(topKeys(tsData));
    const pyKeys = topKeys(pyData);
    expect(tsKeys).toEqual(pyKeys);
  }, 20000);

  it("/api/thread-pin invalid payload status parity", async () => {
    if (!tsReachable || !legacyReachable) return;
    const payload = { ids: [] };
    const tsRes = await postJson(`${TS_BASE}/api/thread-pin`, payload, 10000);
    const pyRes = await postJson(`${LEGACY_BASE}/api/thread-pin`, payload, 10000);
    expect(tsRes.status).toBe(pyRes.status);
    expect(tsRes.status).toBeGreaterThanOrEqual(400);
  }, 15000);

  it("/api/local-cleanup invalid payload status parity", async () => {
    if (!tsReachable || !legacyReachable) return;
    const payload = { ids: ["sample-thread"], dry_run: true, options: [] };
    const tsRes = await postJson(`${TS_BASE}/api/local-cleanup`, payload, 12000);
    const pyRes = await postJson(`${LEGACY_BASE}/api/local-cleanup`, payload, 12000);
    expect(tsRes.status).toBe(pyRes.status);
    expect([200, 400]).toContain(tsRes.status);
  }, 18000);

  it("/api/recovery-drill returns operational payload shape", async () => {
    if (!tsReachable) return;
    const tsRes = await postJson(`${TS_BASE}/api/recovery-drill`, {}, 30000);
    expect([200, 400]).toContain(tsRes.status);
    const body = tsRes.data;
    expect(body && typeof body === "object").toBe(true);
    const rec = body as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(rec, "ok")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(rec, "drill")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(rec, "error")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(rec, "data")).toBe(true);
  }, 35000);
});
