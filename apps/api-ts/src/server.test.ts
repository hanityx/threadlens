import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FastifyInstance } from "fastify";
import { PROJECT_ROOT } from "./lib/constants";
import { createServer } from "./server";

vi.mock("./domains/threads/state.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./domains/threads/state.js")>();
  return {
    ...actual,
    setThreadPinnedTs: vi.fn().mockResolvedValue({ ok: true, results: [{ thread_id: "thread-1", ok: true }] }),
  };
});

describe("api-ts direct endpoints", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/healthz returns ts-only mode", async () => {
    const res = await app.inject({ method: "GET", url: "/api/healthz" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.mode).toBe("ts-only");
    expect(payload.schema_version).toBeTypeOf("string");
  });

  it("GET /api/version returns runtime metadata", async () => {
    const res = await app.inject({ method: "GET", url: "/api/version" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.runtime).toBe("fastify");
    expect(payload.data.desktop).toBe("electron");
  });

  it("GET /api/update-check returns release metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: "v0.1.1",
          name: "ThreadLens v0.1.1",
          body: "Codex rename sync now reflects immediately.",
          html_url: "https://github.com/hanityx/threadlens/releases/tag/v0.1.1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({ method: "GET", url: "/api/update-check" });
      expect(res.statusCode).toBe(200);
      const payload = res.json();
      expect(payload.ok).toBe(true);
      expect(payload.data.status).toBe("available");
      expect(payload.data.latest_version).toBe("0.1.1");
      expect(payload.data.release_summary).toBe("Codex rename sync now reflects immediately.");
      expect(payload.data.has_update).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("POST /api/bulk-thread-action runs TS-native pin action", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/bulk-thread-action",
      payload: { action: "pin", thread_ids: ["thread-1"] },
    });

    const payload = res.json();
    expect(res.statusCode).toBe(200);
    expect(payload.data.success).toBe(1);
    expect(payload.data.failed).toBe(0);
    expect(payload.data.results[0]).toMatchObject({
      thread_id: "thread-1",
      ok: true,
      status: 200,
    });
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

  it("GET /api/threads responds from TS composition", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({
        method: "GET",
        url: "/api/threads?offset=0&limit=20&q=&sort=updated_desc",
      });
      expect(res.statusCode).toBe(200);
      const payload = res.json();
      const root = payload.data ?? payload;
      expect(Array.isArray(root.rows)).toBe(true);
      expect(typeof root.total).toBe("number");
      expect(root.source).toBe("ts-overview-read-model");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("POST /api/thread-resume-command responds from TS route", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/thread-resume-command",
        payload: { ids: ["thread-1"] },
      });
      expect(res.statusCode).toBe(200);
      const payload = res.json();
      const root = payload.data ?? payload;
      expect(root.commands).toEqual(["codex resume thread-1"]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("POST /api/analyze-delete responds from TS route", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/analyze-delete",
        payload: { ids: ["thread-1"] },
      });
      expect(res.statusCode).toBe(200);
      const payload = res.json();
      const root = payload.data ?? payload;
      expect(Array.isArray(root.reports)).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("GET /api/recovery-backup-export/download streams an exported archive", async () => {
    const exportRoot = path.join(PROJECT_ROOT, ".run", "recovery-exports");
    const archivePath = path.join(exportRoot, `vitest-export-${Date.now()}.zip`);
    await mkdir(exportRoot, { recursive: true });
    await writeFile(archivePath, "fake-zip", "utf-8");

    try {
      const downloadRes = await app.inject({
        method: "GET",
        url: `/api/recovery-backup-export/download?archive_path=${encodeURIComponent(archivePath)}`,
      });

      expect(downloadRes.statusCode).toBe(200);
      expect(String(downloadRes.headers["content-type"] ?? "")).toContain("application/zip");
      expect(String(downloadRes.headers["content-disposition"] ?? "")).toContain("attachment;");
      expect(downloadRes.body.length).toBeGreaterThan(0);
    } finally {
      await rm(archivePath, { force: true });
    }
  }, 15000);

  it("GET /api/recovery-backup-export/download rejects paths outside the export root", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/recovery-backup-export/download?archive_path=${encodeURIComponent("/tmp/not-allowed.zip")}`,
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
  });

  it("GET /api/related-tools returns tool summary", async () => {
    const res = await app.inject({ method: "GET", url: "/api/related-tools" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.summary).toBeTruthy();
    expect(Array.isArray(root.apps)).toBe(true);
  });

  it("GET /api/compare-apps remains available as compatibility alias", async () => {
    const res = await app.inject({ method: "GET", url: "/api/compare-apps" });
    expect(res.statusCode).toBe(200);
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

  it("GET /api/smoke-status returns latest smoke status keys", async () => {
    const res = await app.inject({ method: "GET", url: "/api/smoke-status?limit=4" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.generated_at).toBeTypeOf("string");
    expect(root.summary_dir).toBeTypeOf("string");
    expect(root.latest).toBeTruthy();
    expect(["pass", "fail", "missing", "invalid"]).toContain(root.latest.status);
    expect(["PASS", "FAIL", "MISSING", "INVALID"]).toContain(root.latest.result);
    expect(Array.isArray(root.history)).toBe(true);
  });

  it("GET /api/smoke-status accepts refresh=1 for forced rescan", async () => {
    const res = await app.inject({ method: "GET", url: "/api/smoke-status?limit=4&refresh=1" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.latest).toBeTruthy();
    expect(Array.isArray(root.history)).toBe(true);
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

  it("GET /api/provider-matrix accepts refresh=1 for forced rescan", async () => {
    const res = await app.inject({ method: "GET", url: "/api/provider-matrix?refresh=1" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(Array.isArray(root.providers)).toBe(true);
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

  it("GET /api/provider-sessions accepts refresh=1 for forced rescan", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/provider-sessions?limit=20&refresh=1",
    });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(Array.isArray(root.rows)).toBe(true);
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

  it("GET /api/provider-parser-health accepts refresh=1 for forced rescan", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/provider-parser-health?limit=10&refresh=1",
    });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
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

  it("GET /api/provider-sessions supports chatgpt provider filter", async () => {
    const res = await app.inject({ method: "GET", url: "/api/provider-sessions?provider=chatgpt&limit=10" });
    expect(res.statusCode).toBe(200);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(Array.isArray(root.providers)).toBe(true);
    expect(root.providers.length).toBeLessThanOrEqual(1);
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

  it("POST /api/provider-session-action blocks cleanup on read-only providers", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/provider-session-action",
      payload: {
        provider: "chatgpt",
        action: "delete_local",
        file_paths: ["/tmp/not-allowed.data"],
        dry_run: true,
      },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    const root = payload.data ?? payload;
    expect(root.ok).toBe(false);
    expect(root.error).toBe("cleanup-disabled-provider");
  });

  it("POST /api/provider-session-action rejects invalid provider id", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/provider-session-action",
      payload: {
        provider: "invalid-provider",
        action: "archive_local",
        file_paths: ["/tmp/anything.jsonl"],
        dry_run: true,
      },
    });
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.ok).toBe(false);
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

  it("GET /api/agent-loops responds from TS route", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({ method: "GET", url: "/api/agent-loops" });
      expect(res.statusCode).toBe(200);
      const payload = res.json();
      const root = payload.data ?? payload;
      expect(Array.isArray(root.rows)).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("GET /api/alert-hooks responds from TS route", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({ method: "GET", url: "/api/alert-hooks" });
      expect(res.statusCode).toBe(200);
      const payload = res.json();
      const root = payload.data ?? payload;
      expect(Array.isArray(root.active_alerts)).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
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

  it("GET /api/overview responds from TS composition", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({ method: "GET", url: "/api/overview?include_threads=0&refresh=1" });
      expect(res.statusCode).toBe(200);
      const payload = res.json();
      const root = payload.data ?? payload;
      expect(root.summary).toBeTruthy();
      expect(typeof root.summary.thread_total).toBe("number");
      expect(typeof root.summary.project_dir_total).toBe("number");
      expect(root.risk_summary).toBeTruthy();
      expect(Array.isArray(root.project_dirs)).toBe(true);
      expect(root.paths?.projects_root).toBeDefined();
      expect(root.summary?.labs_project_total).toBeUndefined();
      expect(root.labs_projects).toBeUndefined();
      expect(root.paths?.labs_root).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("GET /api/codex-observatory responds through TS route", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({ method: "GET", url: "/api/codex-observatory?refresh=1" });
      expect(res.statusCode).toBe(200);
      const payload = res.json();
      const root = payload.data ?? payload;
      expect(root.summary).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
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

  it("POST /api/thread-forensics responds from TS composition", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/thread-forensics",
        payload: { ids: [] },
      });
      expect(res.statusCode).toBe(200);
      const payload = res.json();
      const root = payload.data ?? payload;
      expect(Array.isArray(root.reports)).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("POST /api/analyze-delete returns TS-native impact payload", async () => {
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
      const payload = res.json();
      const root = payload.data ?? payload;
      expect(root.count).toBe(1);
      expect(Array.isArray(root.reports)).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("POST /api/local-cleanup normalizes non-object options for TS parity", async () => {
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
      const payload = res.json();
      const root = payload.data ?? payload;
      expect(root.ok).toBe(true);
      expect(root.mode).toBe("dry-run");
      expect(root.requested_ids).toBe(1);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
