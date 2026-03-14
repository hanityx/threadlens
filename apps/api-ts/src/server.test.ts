import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FastifyInstance } from "fastify";
import { createServer } from "./server";

describe("api-ts direct endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/healthz returns hybrid mode", async () => {
    const res = await app.inject({ method: "GET", url: "/api/healthz" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.mode).toBe("hybrid");
    expect(payload.schema_version).toBeTypeOf("string");
  });

  it("GET /api/version returns runtime metadata", async () => {
    const res = await app.inject({ method: "GET", url: "/api/version" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.runtime).toBe("fastify");
    expect(payload.data.desktop).toBe("tauri");
  });

  it("GET /api/roadmap-status returns roadmap keys", async () => {
    const res = await app.inject({ method: "GET", url: "/api/roadmap-status" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.weeks || payload.data?.weeks).toBeTruthy();
    expect(payload.checkins || payload.data?.checkins).toBeTruthy();
  });

  it("POST /api/bulk-thread-action validates body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/bulk-thread-action",
      payload: { action: "invalid", thread_ids: [] },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("POST /api/bulk-thread-action uses python-compatible ids payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await app.inject({
      method: "POST",
      url: "/api/bulk-thread-action",
      payload: { action: "pin", thread_ids: ["thread-1"] },
    });

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const sent = JSON.parse(String(init.body));
    expect(sent).toEqual({ ids: ["thread-1"], pinned: true });
    vi.unstubAllGlobals();
  });

  it("POST /api/thread-pin validates ids schema at TS layer", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/thread-pin",
      payload: { ids: [] },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("POST /api/thread-resume-command validates ids schema at TS layer", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/thread-resume-command",
      payload: { ids: [] },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("POST /api/roadmap-checkin returns ok with entry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await app.inject({
      method: "POST",
      url: "/api/roadmap-checkin",
      payload: { note: "test checkin from api-ts", actor: "vitest" },
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.ok).toBe(true);
    expect(payload.entry).toBeTruthy();
    vi.unstubAllGlobals();
  });

  it("GET /api/recovery-center returns recovery keys", async () => {
    const res = await app.inject({ method: "GET", url: "/api/recovery-center" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.backup_root).toBeTypeOf("string");
    expect(Array.isArray(root.checklist)).toBe(true);
  });

  it("GET /api/compare-apps returns app summary", async () => {
    const res = await app.inject({ method: "GET", url: "/api/compare-apps" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.summary).toBeTruthy();
    expect(Array.isArray(root.apps)).toBe(true);
  });

  it("GET /api/runtime-health returns runtime keys", async () => {
    const res = await app.inject({ method: "GET", url: "/api/runtime-health" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.uptime_sec).toBeTypeOf("number");
    expect(root.roots).toBeTruthy();
    expect(root.quick_counts).toBeTruthy();
  });

  it("GET /api/data-sources returns sources object", async () => {
    const res = await app.inject({ method: "GET", url: "/api/data-sources" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.sources).toBeTruthy();
    expect(root.sources.codex_root).toBeTruthy();
    expect(root.sources.sessions).toBeTruthy();
  });

  it("GET /api/provider-matrix returns provider capability matrix", async () => {
    const res = await app.inject({ method: "GET", url: "/api/provider-matrix" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.summary).toBeTruthy();
    expect(Array.isArray(root.providers)).toBe(true);
    const codex = root.providers.find((p: { provider: string }) => p.provider === "codex");
    expect(codex).toBeTruthy();
    expect(codex.capabilities.safe_cleanup).toBe(true);
  });

  it("GET /api/provider-sessions returns rows and summary", async () => {
    const res = await app.inject({ method: "GET", url: "/api/provider-sessions?limit=20" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.summary).toBeTruthy();
    expect(Array.isArray(root.rows)).toBe(true);
    expect(Array.isArray(root.providers)).toBe(true);
  });

  it("GET /api/provider-sessions rejects invalid provider", async () => {
    const res = await app.inject({ method: "GET", url: "/api/provider-sessions?provider=invalid" });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("GET /api/provider-parser-health returns parser reports", async () => {
    const res = await app.inject({ method: "GET", url: "/api/provider-parser-health?limit=10" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.summary).toBeTruthy();
    expect(Array.isArray(root.reports)).toBe(true);
  });

  it("GET /api/provider-parser-health supports provider filter", async () => {
    const res = await app.inject({ method: "GET", url: "/api/provider-parser-health?provider=codex&limit=10" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(Array.isArray(root.reports)).toBe(true);
    expect(root.reports.length).toBeLessThanOrEqual(1);
  });

  it("GET /api/provider-parser-health rejects invalid provider", async () => {
    const res = await app.inject({ method: "GET", url: "/api/provider-parser-health?provider=invalid" });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("POST /api/provider-session-action supports dry-run preview", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/provider-session-action",
      payload: {
        provider: "codex",
        action: "archive_local",
        file_paths: ["/tmp/not-allowed.jsonl"],
        dry_run: true,
      },
    });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.ok).toBe(true);
    expect(root.dry_run).toBe(true);
    expect(typeof root.confirm_token_expected).toBe("string");
  });

  it("POST /api/provider-session-action blocks execute without token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/provider-session-action",
      payload: {
        provider: "codex",
        action: "delete_local",
        file_paths: ["/tmp/not-allowed.jsonl"],
        dry_run: false,
        confirm_token: "",
      },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.ok).toBe(false);
    expect(
      ["no-valid-targets", "missing-confirm-token", "invalid-confirm-token"].includes(
        String(root.error || ""),
      ),
    ).toBe(true);
  });

  it("GET /api/agent-loops responds through TS route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 0, rows: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({ method: "GET", url: "/api/agent-loops" });
      expect(res.statusCode).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("POST /api/agent-loops/action validates body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/agent-loops/action",
      payload: { loop_id: "", action: "invalid" },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("GET /api/alert-hooks responds through TS route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ generated_at: new Date().toISOString(), active_alerts: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({ method: "GET", url: "/api/alert-hooks" });
      expect(res.statusCode).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("POST /api/alert-hooks/config validates body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/alert-hooks/config",
      payload: { desktop_notify: "yes" },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("POST /api/alert-hooks/rule validates body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/alert-hooks/rule",
      payload: { rule_id: "", cooldown_min: 0 },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("GET /api/overview responds through TS route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ summary: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({ method: "GET", url: "/api/overview?include_threads=0&refresh=1" });
      expect(res.statusCode).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("GET /api/codex-observatory responds through TS route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ summary: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({ method: "GET", url: "/api/codex-observatory?refresh=1" });
      expect(res.statusCode).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("POST /api/rename-thread validates body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/rename-thread",
      payload: { id: "", title: "" },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("POST /api/thread-forensics validates body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/thread-forensics",
      payload: { ids: [123] },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("GET /api/thread-transcript validates required thread_id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/thread-transcript",
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("GET /api/session-transcript validates provider", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/session-transcript?provider=invalid&file_path=/tmp/a.jsonl",
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("POST /api/recovery-checklist validates body", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/recovery-checklist",
      payload: { item_id: "", done: "yes" },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("POST /api/recovery-checklist returns 400 for unknown checklist item", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/recovery-checklist",
      payload: { item_id: "not-found-item", done: true },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("POST /api/analyze-delete validates ids schema", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/analyze-delete",
      payload: { ids: [] },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("POST /api/analyze-delete forwards valid ids to python", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: 1, reports: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/analyze-delete",
        payload: { ids: ["thread-1"] },
      });
      expect(res.statusCode).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const sent = JSON.parse(String(init.body));
      expect(sent).toEqual({ ids: ["thread-1"] });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("POST /api/local-cleanup normalizes non-object options for python parity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, mode: "dry-run" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/local-cleanup",
        payload: { ids: ["thread-1"], dry_run: true, options: ["x"] },
      });
      expect(res.statusCode).toBe(200);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const sent = JSON.parse(String(init.body));
      expect(sent.options).toEqual({});
      expect(sent.ids).toEqual(["thread-1"]);
      expect(sent.dry_run).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
