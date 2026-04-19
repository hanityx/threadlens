import { describe, expect, it } from "vitest";

import { createApiClient, parseApiPayload } from "./api-client.js";

describe("shared api client helpers", () => {
  it("unwraps API envelopes for CLI-style consumers", async () => {
    const response = new Response(
      JSON.stringify({
        ok: true,
        data: { rows: [1, 2, 3] },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

    await expect(parseApiPayload<{ rows: number[] }>(response, "/api/provider-sessions", { unwrapEnvelope: true })).resolves.toEqual({
      rows: [1, 2, 3],
    });
  });

  it("keeps envelope payloads intact for web-style consumers", async () => {
    const response = new Response(
      JSON.stringify({
        ok: true,
        data: { latest_version: "0.2.2" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

    await expect(parseApiPayload<{ ok: boolean; data: { latest_version: string } }>(response, "/api/update-check")).resolves.toEqual({
      ok: true,
      data: { latest_version: "0.2.2" },
    });
  });

  it("supports simple error formatting for TUI consumers", async () => {
    const response = new Response(
      JSON.stringify({
        error: "confirm token required",
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );

    await expect(
      parseApiPayload(response, "/api/local-cleanup", { unwrapEnvelope: true, errorMode: "simple" }),
    ).rejects.toThrow("confirm token required");
  });

  it("supports detailed error formatting for web consumers", async () => {
    const response = new Response(
      JSON.stringify({
        error: "upstream offline",
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );

    await expect(parseApiPayload(response, "/api/update-check")).rejects.toThrow(
      "/api/update-check status 503: upstream offline",
    );
  });

  it("keeps plain-text HTTP errors readable for detailed consumers", async () => {
    const response = new Response("gateway timeout", {
      status: 504,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });

    await expect(parseApiPayload(response, "/api/update-check")).rejects.toThrow(
      "/api/update-check status 504: gateway timeout",
    );
  });

  it("builds request URLs and parses JSON allow-error responses", async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return new Response(JSON.stringify({ ok: false, error: "dry run only" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    try {
      const client = createApiClient({
        resolveBaseUrl: () => "http://127.0.0.1:8788",
      });

      await expect(client.buildApiUrl("/api/update-check")).resolves.toBe(
        "http://127.0.0.1:8788/api/update-check",
      );
      await expect(client.apiPostJsonAllowError("/api/local-cleanup", { ids: ["a"] })).resolves.toEqual({
        ok: false,
        status: 409,
        data: { ok: false, error: "dry run only" },
      });
      expect(calls[0]?.input).toBe("http://127.0.0.1:8788/api/local-cleanup");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
