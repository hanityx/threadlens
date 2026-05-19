import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  SCHEMA_VERSION,
  type RuntimeState,
} from "@threadlens/shared-contracts";
import { getExecutionGraphData } from "../../../execution-graph.js";
import {
  APP_VERSION,
  START_TS,
} from "../../../platform/paths.js";
import { CODEX_HOME } from "../../../domains/providers/constants.js";
import { checkForUpdates } from "../../../domains/ops/update-check.js";
import {
  envelope,
  parseQueryString,
  type QueryMap,
  withSchemaVersion,
} from "../../../lib/utils.js";
import {
  getLatestSmokeStatusTs,
  getRuntimeHealthTs,
} from "../../../domains/recovery/index.js";
import { getDataSourceInventoryTs } from "../../../domains/recovery/inventory.js";
import { getOverviewTs } from "../../../domains/threads/overview.js";
import { registerRecoveryRoutes } from "./recovery.js";

export { issueRecoveryBackupDownloadTokenForTests } from "./recovery.js";

export type ProxyRequest = FastifyRequest<{
  Params: { "*": string };
  Querystring: Record<string, string | string[] | undefined>;
  Body: unknown;
}>;

export async function registerSystemRoutes(
  app: FastifyInstance,
  deps: {
    getRuntimeState: () => Promise<RuntimeState>;
    getCachedDataSources: (forceRefresh: boolean) => Promise<unknown>;
  },
): Promise<void> {
  app.get("/api/healthz", async () =>
    envelope({
      service: "api-ts",
      status: "ok",
      mode: "ts-only",
      runtime_backend_url: "ts-native",
      uptime_sec: Math.round((Date.now() - START_TS) / 1000),
    }),
  );

  app.get("/api/version", async () =>
    envelope({
      app_version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      node: process.version,
      runtime: "fastify",
      desktop: "electron",
      migration_mode: "incremental-ts",
    }),
  );

  app.get("/api/update-check", async () => envelope(await checkForUpdates()));

  app.get("/api/runtime-state", async () => envelope(await deps.getRuntimeState()));

  await registerRecoveryRoutes(app);

  app.get("/api/runtime-health", async (_req, reply) => {
    try {
      return reply.code(200).send(withSchemaVersion(await getRuntimeHealthTs()));
    } catch (error) {
      return reply.code(500).send(envelope(null, `runtime-health-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/smoke-status", async (req, reply) => {
    try {
      const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const refreshRaw = Array.isArray(req.query.refresh) ? req.query.refresh[0] : req.query.refresh;
      const forceRefresh = Number(refreshRaw) > 0;
      const historyLimit = Math.max(1, Math.min(20, Number(limitRaw) || 6));
      return reply.code(200).send(withSchemaVersion(await getLatestSmokeStatusTs({ historyLimit, forceRefresh })));
    } catch (error) {
      return reply.code(500).send(envelope(null, `smoke-status-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/data-sources", async (req, reply) => {
    try {
      const refreshRaw = Array.isArray(req.query.refresh) ? req.query.refresh[0] : req.query.refresh;
      const forceRefresh = Number(refreshRaw) > 0;
      return reply.code(200).send(withSchemaVersion(await deps.getCachedDataSources(forceRefresh)));
    } catch (error) {
      return reply.code(500).send(envelope(null, `data-sources-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/overview", async (req, reply) => {
    try {
      const includeThreads = parseQueryString(req.query.include_threads) === "1";
      const forceRefresh = parseQueryString(req.query.refresh) === "1";
      return reply.code(200).send(
        withSchemaVersion(await getOverviewTs({ includeThreads, forceRefresh })),
      );
    } catch (error) {
      return reply.code(500).send(envelope(null, `overview-error: ${String(error)}`));
    }
  });

  app.get("/api/execution-graph", async (_req, reply) => {
    try {
      return reply.code(200).send(withSchemaVersion(await getExecutionGraphData(CODEX_HOME)));
    } catch (error) {
      return reply.code(500).send(envelope(null, `execution-graph-error: ${String(error)}`));
    }
  });

}
