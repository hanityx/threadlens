/**
 * Fastify API server — route registration, proxy layer, and caching.
 *
 * Business logic lives in dedicated modules under `../lib/` and `../domains/`:
 *   - constants.ts  — path and config constants
 *   - utils.ts      — shared helpers
 *   - providers.ts  — provider matrix / sessions / transcripts
 *   - recovery.ts   — recovery center, runtime health, roadmap
 */

import Fastify, {
  FastifyInstance,
} from "fastify";
import cors from "@fastify/cors";
import { AgentRuntimeState } from "@threadlens/shared-contracts";

import {
  START_TS,
  directApiPaths,
  proxiedApiPaths,
} from "../lib/constants.js";

import {
  envelope,
  getTmuxSessions,
} from "../lib/utils.js";

import {
  type ProviderId,
  parseProviderId,
} from "../lib/providers.js";
import { getDataSourceInventoryTs } from "../domains/recovery/inventory.js";
import { invalidateOverviewTsCache } from "../domains/threads/overview.js";
import { invalidateProviderSearchCaches } from "../domains/providers/search.js";
import {
  registerPlatformRoutes,
  type ProxyRequest,
} from "./routes/platform.js";
import { registerThreadRoutes } from "./routes/threads.js";
import { registerProviderRoutes } from "./routes/providers.js";

type RuntimeCacheEntry = {
  expires_at: number;
  payload: AgentRuntimeState;
};

type DataSourcesCacheEntry = {
  expires_at: number;
  payload: unknown;
};

export function parseConversationSearchProviders(
  raw: string | string[] | undefined,
): { providers?: ProviderId[]; invalid: string[] } {
  const tokens = (Array.isArray(raw) ? raw : [raw])
    .flatMap((value) => String(value ?? "").split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return { providers: undefined, invalid: [] };

  const providers: ProviderId[] = [];
  const invalid: string[] = [];
  for (const token of tokens) {
    const parsed = parseProviderId(token);
    if (!parsed) {
      invalid.push(token);
      continue;
    }
    if (!providers.includes(parsed)) providers.push(parsed);
  }
  return { providers, invalid };
}

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
    const sessions = getTmuxSessions();

    return {
      ts: now,
      runtime_backend: {
        url: "ts-native",
        reachable: true,
        latency_ms: 0,
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

const DATA_SOURCES_CACHE_TTL_MS = 60_000;
let dataSourcesCache: DataSourcesCacheEntry | null = null;
let dataSourcesInflight: Promise<unknown> | null = null;

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
export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.VITEST ? false : process.env.API_TS_LOGGER !== "0",
  });
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
          protocol === "tauri:" ||
          protocol === "file:";
        cb(null, allow);
      } catch {
        cb(null, false);
      }
    },
  });

  await registerPlatformRoutes(app, {
    getAgentRuntimeState,
    getCachedDataSources,
  });
  await registerThreadRoutes(app, {
    invalidateOverviewCache: invalidateOverviewTsCache,
    invalidateProviderSessionCache: invalidateProviderSearchCaches,
  });
  await registerProviderRoutes(app, {
    parseConversationSearchProviders,
  });

  /* ── Catch-all ────────────────────────────────────────────────── */

  app.all("/api/*", async (req: ProxyRequest, reply) => {
    const wildcard = req.params["*"] || "";
    const pathname = `/api/${wildcard}`;

    if (directApiPaths.has(pathname)) {
      return reply
        .code(404)
        .send(envelope(null, "direct-path-routing-conflict"));
    }

    if (!proxiedApiPaths.has(pathname)) {
      req.log.warn({ pathname }, "unknown /api path");
    }
    return reply.code(404).send(envelope(null, "unknown-api-path"));
  });

  /* ── Error handler ────────────────────────────────────────────── */

  app.setErrorHandler((error, _req, reply) => {
    if (error) {
      _req.log.error({ err: error }, "unhandled-api-error");
    }
    reply.code(500).send(envelope(null, "internal-server-error"));
  });

  return app;
}
