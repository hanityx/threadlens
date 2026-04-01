import test from "node:test";
import assert from "node:assert/strict";
import { listProviderSessions, listThreads } from "../src/api.js";

test("listThreads requests a 240 row window by default", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          rows: [],
          total: 0,
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    await listThreads();
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requestedUrl, /\/api\/threads\?offset=0&limit=240&q=&sort=updated_desc$/);
});

test("listProviderSessions requests a 240 row window by default", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          rows: [],
          summary: {
            rows: 0,
            parse_ok: 0,
            parse_fail: 0,
          },
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    await listProviderSessions("codex");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requestedUrl, /\/api\/provider-sessions\?limit=240&provider=codex$/);
});

test("listProviderSessions allows an expanded fetch window", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          rows: [],
          summary: {
            rows: 0,
            parse_ok: 0,
            parse_fail: 0,
          },
        },
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    await listProviderSessions("codex", true, 1000);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requestedUrl, /\/api\/provider-sessions\?limit=1000&provider=codex&refresh=1$/);
});
