/**
 * Fastify API server — route registration, proxy layer, and caching.
 *
 * Business logic lives in dedicated modules under `./lib/`:
 *   - constants.ts  — path and config constants
 *   - utils.ts      — shared helpers
 *   - providers.ts  — provider matrix / sessions / transcripts
 *   - recovery.ts   — recovery center, runtime health, roadmap
 */

import Fastify, {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  AgentRuntimeState,
  BulkThreadAction,
  BulkThreadActionRequest,
  BulkThreadActionResult,
  SCHEMA_VERSION,
} from "@codex/shared-contracts";
import { z } from "zod";
import { getExecutionGraphData } from "./execution-graph.js";

/* ── lib imports ──────────────────────────────────────────────────── */

import {
  DEFAULT_PORT,
  PYTHON_BACKEND_URL,
  APP_VERSION,
  START_TS,
  CODEX_HOME,
  THREADS_BOOT_CACHE_FILE,
  directApiPaths,
  proxiedApiPaths,
} from "./lib/constants.js";

import {
  envelope,
  fetchWithTimeout,
  safeJsonParse,
  withSchemaVersion,
  getTmuxSessions,
  isRecord,
  cleanTitleText,
  parseQueryNumber,
  parseQueryString,
  canonicalizeQuery,
  buildProxyUrl,
  requestPythonJson,
  pathExists,
  bulkRequestSchema,
  type QueryMap,
} from "./lib/utils.js";

import {
  type ProviderId,
  listProviderIds,
  parseProviderId,
  isAllowedProviderFilePath,
  getProviderMatrixTs,
  getProviderSessionsTs,
  getProviderParserHealthTs,
  getProviderSessionScan,
  runProviderSessionAction,
  resolveCodexSessionPathByThreadId,
  buildSessionTranscript,
} from "./lib/providers.js";

import {
  updateRecoveryChecklistItem,
  getRecoveryCenterDataTs,
  runRecoveryDrillTs,
  getCompareAppsStatusTs,
  getRuntimeHealthTs,
  getLatestSmokeStatusTs,
  getDataSourceInventoryTs,
  getRoadmapStatusTs,
  appendRoadmapCheckinTs,
} from "./lib/recovery.js";

/* ─────────────────────────────────────────────────────────────────── *
 *  Internal types                                                     *
 * ─────────────────────────────────────────────────────────────────── */

type ProxyRequest = FastifyRequest<{
  Params: { "*": string };
  Querystring: Record<string, string | string[] | undefined>;
  Body: unknown;
}>;

type RuntimeCacheEntry = {
  expires_at: number;
  payload: AgentRuntimeState;
};

type ThreadsCacheEntry = {
  expires_at: number;
  status: number;
  payload: unknown;
};

type DataSourcesCacheEntry = {
  expires_at: number;
  payload: unknown;
};

/* ─────────────────────────────────────────────────────────────────── *
 *  Runtime state (cached)                                             *
 * ─────────────────────────────────────────────────────────────────── */

const RUNTIME_CACHE_TTL_MS = 8_000;
let runtimeStateCache: RuntimeCacheEntry | null = null;
let runtimeStateInflight: Promise<AgentRuntimeState> | null = null;

async function getAgentRuntimeState(): Promise<AgentRuntimeState> {
  const nowMs = Date.now();
  if (runtimeStateCache && runtimeStateCache.expires_at > nowMs)
    return runtimeStateCache.payload;
  if (runtimeStateInflight) return runtimeStateInflight;

  runtimeStateInflight = (async () => {
    const now = new Date().toISOString();
    let start = Date.now();
    let reachable = false;
    let latencyMs: number | null = null;

    try {
      const res = await fetchWithTimeout(
        `${PYTHON_BACKEND_URL}/api/runtime-health`,
        {},
        1200,
      );
      reachable = res.ok;
      latencyMs = Date.now() - start;
    } catch {
      try {
        start = Date.now();
        const fallback = await fetchWithTimeout(
          `${PYTHON_BACKEND_URL}/api/overview?include_threads=0`,
          {},
          1800,
        );
        reachable = fallback.ok;
        latencyMs = Date.now() - start;
      } catch {
        reachable = false;
        latencyMs = null;
      }
    }

    const sessions = getTmuxSessions();

    return {
      ts: now,
      python_backend: {
        url: PYTHON_BACKEND_URL,
        reachable,
        latency_ms: latencyMs,
      },
      process: {
        pid: process.pid,
        uptime_sec: Math.round(process.uptime()),
        node: process.version,
      },
      tmux: {
        has_tmux: sessions.length > 0,
        sessions,
      },
    };
  })()
    .then((payload) => {
      runtimeStateCache = {
        expires_at: Date.now() + RUNTIME_CACHE_TTL_MS,
        payload,
      };
      return payload;
    })
    .finally(() => {
      runtimeStateInflight = null;
    });

  return runtimeStateInflight;
}

/* ─────────────────────────────────────────────────────────────────── *
 *  Threads cache                                                      *
 * ─────────────────────────────────────────────────────────────────── */

const THREADS_CACHE_TTL_MS = 12_000;
const THREADS_STALE_TTL_MS = 120_000;
const threadsCache = new Map<string, ThreadsCacheEntry>();
const threadsInflight = new Map<
  string,
  Promise<{ status: number; payload: unknown } | null>
>();
let threadsBootCacheLoaded = false;
const PYTHON_OVERVIEW_WARM_TTL_MS = 5 * 60 * 1000;
const PYTHON_OVERVIEW_WARMUP_ENABLED =
  !process.env.VITEST && process.env.API_DISABLE_PY_WARMUP !== "1";
let pythonOverviewWarmupAt = 0;
let pythonOverviewWarmupInflight: Promise<void> | null = null;

const DATA_SOURCES_CACHE_TTL_MS = 60_000;
let dataSourcesCache: DataSourcesCacheEntry | null = null;
let dataSourcesInflight: Promise<unknown> | null = null;

function isBootThreadsQuery(query: QueryMap): boolean {
  const offset = parseQueryNumber(query.offset, 0);
  const limit = parseQueryNumber(query.limit, 160);
  const q = parseQueryString(query.q);
  const sort = parseQueryString(query.sort);
  return (
    offset === 0 &&
    limit <= 160 &&
    q.trim() === "" &&
    (sort === "" || sort === "updated_desc")
  );
}

async function getCachedThreads(
  query: QueryMap,
): Promise<{ status: number; payload: unknown }> {
  const key = canonicalizeQuery(query);
  const nowMs = Date.now();
  const cached = threadsCache.get(key);
  if (cached && cached.expires_at > nowMs) {
    return { status: cached.status, payload: cached.payload };
  }

  if (!cached && isBootThreadsQuery(query) && !threadsBootCacheLoaded) {
    threadsBootCacheLoaded = true;
    try {
      const raw = await readFile(THREADS_BOOT_CACHE_FILE, "utf-8");
      const parsed = safeJsonParse(raw);
      if (
        isRecord(parsed) &&
        typeof parsed.status === "number" &&
        Object.prototype.hasOwnProperty.call(parsed, "payload")
      ) {
        const status = Number(parsed.status);
        const payload = withSchemaVersion(parsed.payload);
        threadsCache.set(key, {
          expires_at: nowMs + THREADS_CACHE_TTL_MS,
          status,
          payload,
        });
        const warm = threadsCache.get(key);
        if (warm) {
          void getCachedThreadsRefresh(query, key);
          return { status: warm.status, payload: warm.payload };
        }
      }
    } catch {
      // no boot cache file
    }
  }

  if (cached) {
    void getCachedThreadsRefresh(query, key);
    return { status: cached.status, payload: cached.payload };
  }

  const fresh = await getCachedThreadsRefresh(query, key);
  if (fresh) return fresh;

  const fallback = threadsCache.get(key);
  if (fallback) return { status: fallback.status, payload: fallback.payload };
  return buildCodexThreadsFallback(query);
}

async function getCachedDataSources(forceRefresh: boolean): Promise<unknown> {
  const nowMs = Date.now();
  if (
    !forceRefresh &&
    dataSourcesCache &&
    dataSourcesCache.expires_at > nowMs
  ) {
    return dataSourcesCache.payload;
  }
  if (dataSourcesInflight) return dataSourcesInflight;

  dataSourcesInflight = getDataSourceInventoryTs()
    .then((payload) => {
      dataSourcesCache = {
        expires_at: Date.now() + DATA_SOURCES_CACHE_TTL_MS,
        payload,
      };
      return payload;
    })
    .finally(() => {
      dataSourcesInflight = null;
    });
  return dataSourcesInflight;
}

function fallbackThreadRiskScore(row: { probe: { ok: boolean; format: string } }): number {
  if (!row.probe.ok) return 72;
  if (row.probe.format === "unknown") return 44;
  return 18;
}

function fallbackThreadRiskLevel(score: number): "high" | "medium" | "low" {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

async function buildCodexThreadsFallback(
  query: QueryMap,
): Promise<{ status: number; payload: unknown }> {
  const offset = Math.max(0, parseQueryNumber(query.offset, 0));
  const limit = Math.max(1, Math.min(240, parseQueryNumber(query.limit, 160)));
  const q = parseQueryString(query.q).trim().toLowerCase();
  const sort = parseQueryString(query.sort).trim().toLowerCase();
  const scanLimit = Math.max(80, Math.min(240, offset + limit + 40));
  const scan = await getProviderSessionScan("codex", scanLimit, {
    forceRefresh: false,
  });

  const now = Date.now();
  let rows = scan.rows.map((row) => {
    const riskScore = fallbackThreadRiskScore(row);
    const ts = Date.parse(row.mtime);
    const ageMs = Number.isFinite(ts) ? Math.max(0, now - ts) : null;
    const activityStatus =
      ageMs === null
        ? "unknown"
        : ageMs <= 24 * 60 * 60 * 1000
          ? "active"
          : "idle";
    const title = String(
      row.display_title || row.probe.detected_title || row.session_id,
    ).trim();
    return {
      id: row.session_id,
      thread_id: row.session_id,
      title: title || row.session_id,
      title_source: row.probe.title_source ?? "provider_scan",
      risk_score: riskScore,
      risk_level: fallbackThreadRiskLevel(riskScore),
      is_pinned: false,
      source: row.source || "codex_sessions",
      timestamp: row.mtime,
      activity_status: activityStatus,
      risk_tags: row.probe.ok ? [] : ["parse_fail"],
    };
  });

  if (q) {
    rows = rows.filter((row) => {
      const haystack = [row.title, row.thread_id, row.source]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  rows.sort((a, b) => {
    const aTs = Date.parse(a.timestamp || "");
    const bTs = Date.parse(b.timestamp || "");
    const aScore = Number.isFinite(aTs) ? aTs : 0;
    const bScore = Number.isFinite(bTs) ? bTs : 0;
    if (sort === "updated_asc") return aScore - bScore;
    return bScore - aScore;
  });

  return {
    status: 200,
    payload: {
      rows: rows.slice(offset, offset + limit),
      total: rows.length,
      schema_version: SCHEMA_VERSION,
      fallback_mode: "codex-provider-scan",
    },
  };
}

async function getCachedThreadsRefresh(
  query: QueryMap,
  key: string,
): Promise<{ status: number; payload: unknown } | null> {
  const inflight = threadsInflight.get(key);
  if (inflight) return inflight;

  const task = requestPythonJson("/api/threads", "GET", {
    query,
    timeoutMs: 30000,
  })
    .then((result) => {
      threadsCache.set(key, {
        expires_at: Date.now() + THREADS_CACHE_TTL_MS,
        status: result.status,
        payload: result.payload,
      });
      if (isBootThreadsQuery(query)) {
        void mkdir(path.dirname(THREADS_BOOT_CACHE_FILE), { recursive: true })
          .then(() =>
            writeFile(
              THREADS_BOOT_CACHE_FILE,
              JSON.stringify(
                { status: result.status, payload: result.payload },
                null,
                0,
              ),
              "utf-8",
            ),
          )
          .catch(() => {
            // ignore boot cache write failure
          });
      }
      return result;
    })
    .catch(() => {
      const stale = threadsCache.get(key);
      if (stale && stale.expires_at + THREADS_STALE_TTL_MS > Date.now()) {
        return { status: stale.status, payload: stale.payload };
      }
      return null;
    })
    .finally(() => {
      threadsInflight.delete(key);
    });

  threadsInflight.set(key, task);
  return task;
}

async function warmPythonOverviewCache(): Promise<void> {
  if (!PYTHON_OVERVIEW_WARMUP_ENABLED) return;
  const now = Date.now();
  if (pythonOverviewWarmupAt > 0 && now - pythonOverviewWarmupAt < PYTHON_OVERVIEW_WARM_TTL_MS) {
    return;
  }
  if (pythonOverviewWarmupInflight) {
    await pythonOverviewWarmupInflight;
    return;
  }
  pythonOverviewWarmupInflight = (async () => {
    try {
      await requestPythonJson("/api/threads", "GET", {
        query: {
          offset: "0",
          limit: "1",
          q: "",
          sort: "updated_desc",
        },
        timeoutMs: 180_000,
      });
      pythonOverviewWarmupAt = Date.now();
    } catch {
      // ignore warm-up failure; real request path will surface actionable errors
    } finally {
      pythonOverviewWarmupInflight = null;
    }
  })();
  await pythonOverviewWarmupInflight;
}

/* ─────────────────────────────────────────────────────────────────── *
 *  Python proxy helpers                                               *
 * ─────────────────────────────────────────────────────────────────── */

async function proxyToPython(
  req: ProxyRequest,
  reply: FastifyReply,
  pathname: string,
) {
  const method = req.method.toUpperCase();
  const url = buildProxyUrl(
    pathname,
    req.query as Record<string, string | string[] | undefined>,
  );

  const headers: Record<string, string> = {
    accept: "application/json",
  };

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = JSON.stringify(req.body ?? {});
    headers["content-type"] = "application/json";
  }

  try {
    const proxied = await fetchWithTimeout(
      url,
      { method, headers, body },
      30000,
    );
    const text = await proxied.text();
    const parsed = safeJsonParse(text);
    const normalized = withSchemaVersion(parsed ?? text);

    reply.code(proxied.status);
    return reply.send(normalized);
  } catch (error) {
    return reply
      .code(502)
      .send(pythonBackendUnavailable(error));
  }
}

function pythonBackendUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return envelope(null, `python-backend-unreachable: ${message}`);
}

async function runBulkAction(action: BulkThreadAction, threadId: string) {
  const endpointMap: Record<
    BulkThreadAction,
    { path: string; body: Record<string, unknown> }
  > = {
    pin: {
      path: "/api/thread-pin",
      body: { ids: [threadId], pinned: true },
    },
    unpin: {
      path: "/api/thread-pin",
      body: { ids: [threadId], pinned: false },
    },
    archive_local: {
      path: "/api/thread-archive-local",
      body: { ids: [threadId] },
    },
    resume_command: {
      path: "/api/thread-resume-command",
      body: { ids: [threadId] },
    },
  };

  const target = endpointMap[action];

  try {
    const res = await fetchWithTimeout(
      `${PYTHON_BACKEND_URL}${target.path}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(target.body),
      },
      12000,
    );

    const text = await res.text();
    const parsed = safeJsonParse(text);
    const payloadOk =
      isRecord(parsed) && Object.prototype.hasOwnProperty.call(parsed, "ok")
        ? Boolean(parsed.ok)
        : true;

    return {
      thread_id: threadId,
      ok: res.ok && payloadOk,
      status: res.status,
      error: res.ok && payloadOk ? null : `status-${res.status}`,
      data: parsed,
    };
  } catch (error) {
    return {
      thread_id: threadId,
      ok: false,
      status: 0,
      error: String(error),
    };
  }
}

/* ─────────────────────────────────────────────────────────────────── *
 *  createServer — route registration                                  *
 * ─────────────────────────────────────────────────────────────────── */

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      try {
        const parsed = new URL(origin);
        const hostname = parsed.hostname.toLowerCase();
        const protocol = parsed.protocol.toLowerCase();
        const allow =
          hostname === "localhost" ||
          hostname === "127.0.0.1" ||
          hostname === "::1" ||
          protocol === "tauri:";
        cb(null, allow);
      } catch {
        cb(null, false);
      }
    },
  });

  /* ── Meta ─────────────────────────────────────────────────────── */

  app.get("/api/healthz", async () => {
    return envelope({
      service: "api-ts",
      status: "ok",
      mode: "hybrid",
      python_backend_url: PYTHON_BACKEND_URL,
      uptime_sec: Math.round((Date.now() - START_TS) / 1000),
    });
  });

  app.get("/api/version", async () => {
    return envelope({
      app_version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      node: process.version,
      runtime: "fastify",
      desktop: "tauri",
      migration_mode: "incremental-ts",
    });
  });

  app.get("/api/agent-runtime", async () => {
    const runtime = await getAgentRuntimeState();
    return envelope(runtime);
  });

  /* ── Bulk thread actions ──────────────────────────────────────── */

  app.post<{ Body: BulkThreadActionRequest }>(
    "/api/bulk-thread-action",
    async (req, reply) => {
      const parsed = bulkRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(envelope(null, parsed.error.message));
      }

      const { action, thread_ids: threadIds } = parsed.data;
      const results = await Promise.all(
        threadIds.map((threadId) => runBulkAction(action, threadId)),
      );
      const success = results.filter((r) => r.ok).length;

      const payload: BulkThreadActionResult = {
        action,
        total: threadIds.length,
        success,
        failed: threadIds.length - success,
        results,
      };

      return envelope(payload, null);
    },
  );

  /* ── Roadmap ──────────────────────────────────────────────────── */

  app.get("/api/roadmap-status", async (_req, reply) => {
    try {
      const data = await getRoadmapStatusTs();
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `roadmap-status-error: ${String(error)}`));
    }
  });

  app.post<{ Body: { note?: string; actor?: string } }>(
    "/api/roadmap-checkin",
    async (req, reply) => {
      try {
        const note = cleanTitleText(String(req.body?.note ?? ""), 280);
        const actor = cleanTitleText(String(req.body?.actor ?? "codex"), 32);
        const entry = await appendRoadmapCheckinTs(note, actor);
        const status = await getRoadmapStatusTs();
        return reply.code(200).send(
          withSchemaVersion({
            ok: true,
            entry,
            status,
          }),
        );
      } catch (error) {
        return reply
          .code(500)
          .send(envelope(null, `roadmap-checkin-error: ${String(error)}`));
      }
    },
  );

  /* ── Threads (cached proxy) ───────────────────────────────────── */

  app.get<{ Querystring: QueryMap }>("/api/threads", async (req, reply) => {
    try {
      const proxied = await getCachedThreads(req.query);
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply
        .code(502)
        .send(pythonBackendUnavailable(error));
    }
  });

  const idsPayloadSchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(500),
  });

  const pinPayloadSchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(500),
    pinned: z.boolean().optional().default(true),
  });

  app.post<{ Body: unknown }>("/api/thread-pin", async (req, reply) => {
    const parsed = pinPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/thread-pin", "POST", {
        body: parsed.data,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply
        .code(502)
        .send(pythonBackendUnavailable(error));
    }
  });

  app.post<{ Body: unknown }>(
    "/api/thread-archive-local",
    async (req, reply) => {
      const parsed = idsPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(envelope(null, parsed.error.message));
      }
      try {
        const proxied = await requestPythonJson(
          "/api/thread-archive-local",
          "POST",
          { body: parsed.data },
        );
        return reply.code(proxied.status).send(proxied.payload);
      } catch (error) {
        return reply
          .code(502)
          .send(pythonBackendUnavailable(error));
      }
    },
  );

  app.post<{ Body: unknown }>(
    "/api/thread-resume-command",
    async (req, reply) => {
      const parsed = idsPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(envelope(null, parsed.error.message));
      }
      try {
        const proxied = await requestPythonJson(
          "/api/thread-resume-command",
          "POST",
          { body: parsed.data },
        );
        return reply.code(proxied.status).send(proxied.payload);
      } catch (error) {
        return reply
          .code(502)
          .send(pythonBackendUnavailable(error));
      }
    },
  );

  /* ── Forensics (proxy) ────────────────────────────────────────── */

  app.post<{ Body: unknown }>("/api/analyze-delete", async (req, reply) => {
    const parsed = idsPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      void warmPythonOverviewCache();
      const proxied = await requestPythonJson("/api/analyze-delete", "POST", {
        body: parsed.data,
        timeoutMs: 180_000,
        retryCount: 1,
        retryDelayMs: 400,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply
        .code(502)
        .send(pythonBackendUnavailable(error));
    }
  });

  const cleanupPayloadSchema = z
    .object({
      ids: z.array(z.string().min(1)).min(1).max(500),
      dry_run: z.boolean().optional().default(true),
      options: z.unknown().optional(),
      confirm_token: z.string().optional().default(""),
    })
    .transform((value) => ({
      ids: value.ids,
      dry_run: value.dry_run,
      options: isRecord(value.options) ? value.options : {},
      confirm_token: value.confirm_token,
    }));

  app.post<{ Body: unknown }>("/api/local-cleanup", async (req, reply) => {
    const parsed = cleanupPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      void warmPythonOverviewCache();
      const proxied = await requestPythonJson("/api/local-cleanup", "POST", {
        body: parsed.data,
        timeoutMs: 180_000,
        retryCount: 1,
        retryDelayMs: 400,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply
        .code(502)
        .send(pythonBackendUnavailable(error));
    }
  });

  /* ── Provider session action ──────────────────────────────────── */

  const providerIds = listProviderIds();
  const providerIdTuple = providerIds as [ProviderId, ...ProviderId[]];
  const providerSessionActionSchema = z.object({
    provider: z.enum(providerIdTuple),
    action: z.enum(["archive_local", "delete_local"]),
    file_paths: z.array(z.string().min(1)).min(1).max(500),
    dry_run: z.boolean().optional().default(true),
    confirm_token: z.string().optional().default(""),
  });

  app.post<{ Body: unknown }>(
    "/api/provider-session-action",
    async (req, reply) => {
      const parsed = providerSessionActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(envelope(null, parsed.error.message));
      }
      try {
        const result = await runProviderSessionAction(
          parsed.data.provider,
          parsed.data.action,
          parsed.data.file_paths,
          parsed.data.dry_run,
          parsed.data.confirm_token,
        );
        const status = result.ok ? 200 : 400;
        return reply.code(status).send(withSchemaVersion(result));
      } catch (error) {
        return reply
          .code(500)
          .send(
            envelope(null, `provider-session-action-error: ${String(error)}`),
          );
      }
    },
  );

  /* ── Recovery ─────────────────────────────────────────────────── */

  app.get("/api/recovery-center", async (_req, reply) => {
    try {
      const data = await getRecoveryCenterDataTs();
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `recovery-center-error: ${String(error)}`));
    }
  });

  const recoveryChecklistSchema = z.object({
    item_id: z.string().min(1),
    done: z.boolean(),
  });

  app.post<{ Body: unknown }>("/api/recovery-checklist", async (req, reply) => {
    const parsed = recoveryChecklistSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const result = await updateRecoveryChecklistItem(
        parsed.data.item_id,
        parsed.data.done,
      );
      if (!result.ok) {
        return reply.code(400).send(withSchemaVersion(result));
      }
      const data = await getRecoveryCenterDataTs();
      return reply.code(200).send(withSchemaVersion({ ok: true, data }));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `recovery-checklist-error: ${String(error)}`));
    }
  });

  app.post("/api/recovery-drill", async (_req, reply) => {
    try {
      const drill = await runRecoveryDrillTs();
      const status = drill.ok ? 200 : 400;
      const center = await getRecoveryCenterDataTs();
      const data = {
        ...center,
        drill: drill.drill,
      };
      return reply.code(status).send(
        withSchemaVersion({
          ok: Boolean(drill.ok),
          data,
          drill: drill.drill,
          error: drill.error ?? "",
        }),
      );
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `recovery-drill-error: ${String(error)}`));
    }
  });

  /* ── System ───────────────────────────────────────────────────── */

  app.get("/api/compare-apps", async (_req, reply) => {
    try {
      const data = await getCompareAppsStatusTs();
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `compare-apps-error: ${String(error)}`));
    }
  });

  app.get("/api/runtime-health", async (_req, reply) => {
    try {
      const data = await getRuntimeHealthTs();
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `runtime-health-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/smoke-status", async (req, reply) => {
    try {
      const limitRaw = Array.isArray(req.query.limit)
        ? req.query.limit[0]
        : req.query.limit;
      const refreshRaw = Array.isArray(req.query.refresh)
        ? req.query.refresh[0]
        : req.query.refresh;
      const forceRefresh = Number(refreshRaw) > 0;
      const historyLimit = Math.max(1, Math.min(20, Number(limitRaw) || 6));
      const data = await getLatestSmokeStatusTs({ historyLimit, forceRefresh });
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `smoke-status-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/data-sources", async (req, reply) => {
    try {
      const refreshRaw = Array.isArray(req.query.refresh)
        ? req.query.refresh[0]
        : req.query.refresh;
      const forceRefresh = Number(refreshRaw) > 0;
      const data = await getCachedDataSources(forceRefresh);
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `data-sources-error: ${String(error)}`));
    }
  });

  /* ── Providers ────────────────────────────────────────────────── */

  app.get<{ Querystring: QueryMap }>("/api/provider-matrix", async (req, reply) => {
    try {
      const refreshRaw = Array.isArray(req.query.refresh)
        ? req.query.refresh[0]
        : req.query.refresh;
      const forceRefresh = Number(refreshRaw) > 0;
      const data = await getProviderMatrixTs({ forceRefresh });
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `provider-matrix-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>(
    "/api/provider-sessions",
    async (req, reply) => {
      try {
        const providerRaw = Array.isArray(req.query.provider)
          ? req.query.provider[0]
          : req.query.provider;
        const limitRaw = Array.isArray(req.query.limit)
          ? req.query.limit[0]
          : req.query.limit;
        const provider = parseProviderId(providerRaw);
        if (providerRaw && !provider) {
          return reply.code(400).send(envelope(null, "invalid provider"));
        }
        const limit = Math.max(1, Math.min(240, Number(limitRaw) || 80));
        const refreshRaw = Array.isArray(req.query.refresh)
          ? req.query.refresh[0]
          : req.query.refresh;
        const forceRefresh = Number(refreshRaw) > 0;
        const data = await getProviderSessionsTs(provider, limit, {
          forceRefresh,
        });
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        return reply
          .code(500)
          .send(envelope(null, `provider-sessions-error: ${String(error)}`));
      }
    },
  );

  app.get<{ Querystring: QueryMap }>(
    "/api/provider-parser-health",
    async (req, reply) => {
      try {
        const providerRaw = Array.isArray(req.query.provider)
          ? req.query.provider[0]
          : req.query.provider;
        const limitRaw = Array.isArray(req.query.limit)
          ? req.query.limit[0]
          : req.query.limit;
        const provider = parseProviderId(providerRaw);
        if (providerRaw && !provider) {
          return reply.code(400).send(envelope(null, "invalid provider"));
        }
        const limit = Math.max(1, Math.min(120, Number(limitRaw) || 80));
        const refreshRaw = Array.isArray(req.query.refresh)
          ? req.query.refresh[0]
          : req.query.refresh;
        const forceRefresh = Number(refreshRaw) > 0;
        const data = await getProviderParserHealthTs(provider, limit, {
          forceRefresh,
        });
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        return reply
          .code(500)
          .send(
            envelope(null, `provider-parser-health-error: ${String(error)}`),
          );
      }
    },
  );

  /* ── Agent loops / Alerts (proxy) ─────────────────────────────── */

  app.get("/api/agent-loops", async (_req, reply) => {
    try {
      const proxied = await requestPythonJson("/api/agent-loops", "GET", {
        timeoutMs: 15000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply
        .code(502)
        .send(pythonBackendUnavailable(error));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/alert-hooks", async (req, reply) => {
    try {
      const proxied = await requestPythonJson("/api/alert-hooks", "GET", {
        query: req.query,
        timeoutMs: 20000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply
        .code(502)
        .send(pythonBackendUnavailable(error));
    }
  });

  const alertConfigSchema = z.object({
    desktop_notify: z.boolean(),
  });

  app.post<{ Body: unknown }>("/api/alert-hooks/config", async (req, reply) => {
    const parsed = alertConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson(
        "/api/alert-hooks/config",
        "POST",
        {
          body: parsed.data,
          timeoutMs: 20000,
        },
      );
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply
        .code(502)
        .send(pythonBackendUnavailable(error));
    }
  });

  const alertRuleSchema = z.object({
    rule_id: z.string().min(1),
    enabled: z.boolean().optional(),
    threshold: z.number().optional(),
    cooldown_min: z.number().int().positive().optional(),
  });

  app.post<{ Body: unknown }>("/api/alert-hooks/rule", async (req, reply) => {
    const parsed = alertRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/alert-hooks/rule", "POST", {
        body: parsed.data,
        timeoutMs: 20000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply
        .code(502)
        .send(pythonBackendUnavailable(error));
    }
  });

  const alertEvaluateSchema = z.object({
    force_refresh: z.boolean().optional().default(false),
  });

  app.post<{ Body: unknown }>(
    "/api/alert-hooks/evaluate",
    async (req, reply) => {
      const parsed = alertEvaluateSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send(envelope(null, parsed.error.message));
      }
      try {
        const proxied = await requestPythonJson(
          "/api/alert-hooks/evaluate",
          "POST",
          {
            body: parsed.data,
            timeoutMs: 25000,
          },
        );
        return reply.code(proxied.status).send(proxied.payload);
      } catch (error) {
        return reply
          .code(502)
          .send(pythonBackendUnavailable(error));
      }
    },
  );

  /* ── Overview / Observatory (proxy) ───────────────────────────── */

  app.get<{ Querystring: QueryMap }>("/api/overview", async (req, reply) => {
    try {
      const proxied = await requestPythonJson("/api/overview", "GET", {
        query: req.query,
        timeoutMs: 40000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply
        .code(502)
        .send(pythonBackendUnavailable(error));
    }
  });

  app.get<{ Querystring: QueryMap }>(
    "/api/codex-observatory",
    async (req, reply) => {
      try {
        const proxied = await requestPythonJson(
          "/api/codex-observatory",
          "GET",
          {
            query: req.query,
            timeoutMs: 30000,
          },
        );
        return reply.code(proxied.status).send(proxied.payload);
      } catch (error) {
        return reply
          .code(502)
          .send(pythonBackendUnavailable(error));
      }
    },
  );

  /* ── Execution graph ──────────────────────────────────────────── */

  app.get("/api/execution-graph", async (_req, reply) => {
    try {
      const data = await getExecutionGraphData(CODEX_HOME);
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `execution-graph-error: ${String(error)}`));
    }
  });

  /* ── Rename / Forensics (proxy) ───────────────────────────────── */

  const renameThreadSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
  });

  app.post<{ Body: unknown }>("/api/rename-thread", async (req, reply) => {
    const parsed = renameThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/rename-thread", "POST", {
        body: parsed.data,
        timeoutMs: 15000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply
        .code(502)
        .send(pythonBackendUnavailable(error));
    }
  });

  const threadForensicsSchema = z.object({
    ids: z.array(z.string().min(1)).optional(),
    thread_ids: z.array(z.string().min(1)).optional(),
  });

  app.post<{ Body: unknown }>("/api/thread-forensics", async (req, reply) => {
    const parsed = threadForensicsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    const ids = parsed.data.ids ?? parsed.data.thread_ids ?? [];
    try {
      const proxied = await requestPythonJson("/api/thread-forensics", "POST", {
        body: { ids },
        timeoutMs: 20000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply
        .code(502)
        .send(pythonBackendUnavailable(error));
    }
  });

  /* ── Transcripts (local) ──────────────────────────────────────── */

  app.get<{ Querystring: QueryMap }>(
    "/api/thread-transcript",
    async (req, reply) => {
      try {
        const threadRaw = Array.isArray(req.query.thread_id)
          ? req.query.thread_id[0]
          : req.query.thread_id;
        const limitRaw = Array.isArray(req.query.limit)
          ? req.query.limit[0]
          : req.query.limit;
        const threadId = String(threadRaw ?? "").trim();
        if (!threadId)
          return reply.code(400).send(envelope(null, "thread_id required"));
        const filePath = await resolveCodexSessionPathByThreadId(threadId);
        if (!filePath)
          return reply
            .code(404)
            .send(envelope(null, "thread session file not found"));
        const data = await buildSessionTranscript(
          "codex",
          filePath,
          Number(limitRaw) || 300,
        );
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        return reply
          .code(500)
          .send(envelope(null, `thread-transcript-error: ${String(error)}`));
      }
    },
  );

  app.get<{ Querystring: QueryMap }>(
    "/api/session-transcript",
    async (req, reply) => {
      try {
        const providerRaw = Array.isArray(req.query.provider)
          ? req.query.provider[0]
          : req.query.provider;
        const fileRaw = Array.isArray(req.query.file_path)
          ? req.query.file_path[0]
          : req.query.file_path;
        const limitRaw = Array.isArray(req.query.limit)
          ? req.query.limit[0]
          : req.query.limit;
        const provider = parseProviderId(providerRaw);
        if (!provider)
          return reply.code(400).send(envelope(null, "invalid provider"));
        const filePath = String(fileRaw ?? "").trim();
        if (!filePath)
          return reply.code(400).send(envelope(null, "file_path required"));
        if (!isAllowedProviderFilePath(provider, filePath)) {
          return reply
            .code(400)
            .send(envelope(null, "file_path outside provider roots"));
        }
        const exists = await pathExists(filePath);
        if (!exists)
          return reply.code(404).send(envelope(null, "session file not found"));
        const data = await buildSessionTranscript(
          provider,
          filePath,
          Number(limitRaw) || 300,
        );
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        return reply
          .code(500)
          .send(envelope(null, `session-transcript-error: ${String(error)}`));
      }
    },
  );

  /* ── Agent loops action (proxy) ───────────────────────────────── */

  const agentLoopActionSchema = z.object({
    loop_id: z.string().min(1),
    action: z.enum([
      "start",
      "stop",
      "restart",
      "run2",
      "status",
      "watch-start",
      "watch-stop",
      "watch-status",
    ]),
  });

  app.post<{ Body: unknown }>("/api/agent-loops/action", async (req, reply) => {
    const parsed = agentLoopActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson(
        "/api/agent-loops/action",
        "POST",
        { body: parsed.data, timeoutMs: 20000 },
      );
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply
        .code(502)
        .send(pythonBackendUnavailable(error));
    }
  });

  /* ── Catch-all proxy ──────────────────────────────────────────── */

  app.all("/api/*", async (req: ProxyRequest, reply) => {
    const wildcard = req.params["*"] || "";
    const pathname = `/api/${wildcard}`;

    if (directApiPaths.has(pathname)) {
      return reply
        .code(404)
        .send(envelope(null, "direct-path-routing-conflict"));
    }

    if (!proxiedApiPaths.has(pathname)) {
      req.log.warn(
        { pathname },
        "proxying unknown /api path to python backend",
      );
    }

    return proxyToPython(req, reply, pathname);
  });

  /* ── Error handler ────────────────────────────────────────────── */

  app.setErrorHandler((error, _req, reply) => {
    const msg = error instanceof Error ? error.message : String(error);
    reply.code(500).send(envelope(null, msg));
  });

  // Prime the legacy Python overview cache in the background so the first
  // analyze/dry-run action does not pay the full cold-indexing cost.
  void warmPythonOverviewCache();

  return app;
}

/* ── Standalone boot ──────────────────────────────────────────────── */

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer()
    .then((app) => app.listen({ host: "127.0.0.1", port: DEFAULT_PORT }))
    .then(() => {
      // no-op
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
