import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanupApply,
  cleanupDryRun,
  listProviderSessions,
  listThreads,
  loadSessionTranscript,
  runProviderAction,
  searchConversations,
} from "../src/api.js";

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

test("listProviderSessions allows a caller-specified fetch window", async () => {
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
    await listProviderSessions("codex", true, 120);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(requestedUrl, /\/api\/provider-sessions\?limit=120&provider=codex&refresh=1$/);
});

test("searchConversations forwards the session cursor when requesting the next page", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          sessions: [],
          has_more: false,
          next_cursor: null,
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
    await searchConversations("token", "codex", "40");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(
    requestedUrl,
    /\/api\/conversation-search\?q=token&page_size=40&preview_hits_per_session=3&provider=codex&cursor=40$/,
  );
});

test("loadSessionTranscript URL-encodes provider session file paths", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          provider: "claude",
          file_path: "/tmp/a session+one.jsonl",
          message_count: 0,
          truncated: false,
          messages: [],
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
    await loadSessionTranscript("claude", "/tmp/a session+one.jsonl", 7);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.match(
    requestedUrl,
    /\/api\/session-transcript\?provider=claude&file_path=%2Ftmp%2Fa%20session%2Bone\.jsonl&limit=7$/,
  );
});

test("runProviderAction accepts versioned direct action payloads", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        provider: "codex",
        action: "archive_local",
        dry_run: true,
        target_count: 1,
        valid_count: 1,
        applied_count: 0,
        confirm_token_expected: "PROVIDER-123",
        confirm_token_accepted: false,
        selection_fingerprint: "abc",
        failure_summary: {
          skipped_count: 0,
          failed_count: 0,
          partial_failure: false,
        },
        schema_version: "2026-02-27",
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
    const result = await runProviderAction("codex", "archive_local", ["/tmp/a.jsonl"], {
      dryRun: true,
    });
    assert.equal(result.provider, "codex");
    assert.equal(result.confirm_token_expected, "PROVIDER-123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cleanupDryRun accepts versioned direct cleanup payloads", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        mode: "dry_run",
        confirm_token_expected: "cleanup-token",
        target_file_count: 1,
        requested_ids: 1,
        schema_version: "2026-02-27",
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
    const result = await cleanupDryRun(["thread-1"]);
    assert.equal(result.mode, "dry_run");
    assert.equal(result.confirm_token_expected, "cleanup-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cleanupApply accepts versioned direct cleanup payloads", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        mode: "execute",
        deleted_file_count: 1,
        requested_ids: 1,
        schema_version: "2026-02-27",
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
    const result = await cleanupApply(["thread-1"], "cleanup-token");
    assert.equal(result.mode, "execute");
    assert.equal(result.deleted_file_count, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
