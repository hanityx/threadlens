import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  SCHEMA_VERSION,
  type AgentRuntimeState,
} from "@threadlens/shared-contracts";
import { getExecutionGraphData } from "../../../execution-graph.js";
import {
  APP_VERSION,
  START_TS,
} from "../../../platform/paths.js";
import { CODEX_HOME } from "../../../domains/providers/constants.js";
import { checkForUpdates } from "../../../domains/ops/update-check.js";
import {
  cleanTitleText,
  envelope,
  parseQueryString,
  type QueryMap,
  withSchemaVersion,
} from "../../../lib/utils.js";
import {
  getCompareAppsStatusTs,
  getLatestSmokeStatusTs,
  getRelatedToolsStatusTs,
  getRuntimeHealthTs,
} from "../../../domains/recovery/index.js";
import { getDataSourceInventoryTs } from "../../../domains/recovery/inventory.js";
import {
  appendRoadmapCheckinTs,
  getRoadmapStatusTs,
} from "../../../domains/recovery/roadmap.js";
import { getOverviewTs } from "../../../domains/threads/overview.js";
import { getCodexObservatoryTs } from "../../../domains/ops/observatory.js";
import {
  evaluateAlertHooksTs,
  updateAlertHooksConfigTs,
  updateAlertRuleTs,
} from "../../../domains/ops/alert-hooks.js";
import {
  getAgentLoopsStatusTs,
  runAgentLoopActionTs,
} from "../../../domains/ops/agent-loops.js";
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
    getAgentRuntimeState: () => Promise<AgentRuntimeState>;
    getCachedDataSources: (forceRefresh: boolean) => Promise<unknown>;
  },
): Promise<void> {
  const alertConfigSchema = z.object({
    desktop_notify: z.boolean(),
  });

  const alertRuleSchema = z.object({
    rule_id: z.string().min(1),
    enabled: z.boolean().optional(),
    threshold: z.number().optional(),
    cooldown_min: z.number().int().positive().optional(),
  });

  const alertEvaluateSchema = z.object({
    force_refresh: z.boolean().optional().default(false),
  });

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

  app.get("/api/agent-runtime", async () => envelope(await deps.getAgentRuntimeState()));

  app.get("/api/roadmap-status", async (_req, reply) => {
    try {
      return reply.code(200).send(withSchemaVersion(await getRoadmapStatusTs()));
    } catch (error) {
      return reply.code(500).send(envelope(null, `roadmap-status-error: ${String(error)}`));
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
        return reply.code(200).send(withSchemaVersion({ ok: true, entry, status }));
      } catch (error) {
        return reply.code(500).send(envelope(null, `roadmap-checkin-error: ${String(error)}`));
      }
    },
  );

  await registerRecoveryRoutes(app);

  app.get("/api/related-tools", async (_req, reply) => {
    try {
      return reply.code(200).send(withSchemaVersion(await getRelatedToolsStatusTs()));
    } catch (error) {
      return reply.code(500).send(envelope(null, `related-tools-error: ${String(error)}`));
    }
  });

  app.get("/api/compare-apps", async (_req, reply) => {
    try {
      return reply.code(200).send(withSchemaVersion(await getCompareAppsStatusTs()));
    } catch (error) {
      return reply.code(500).send(envelope(null, `compare-apps-error: ${String(error)}`));
    }
  });

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

  app.get("/api/agent-loops", async (_req, reply) => {
    try {
      return reply.code(200).send(withSchemaVersion(await getAgentLoopsStatusTs()));
    } catch (error) {
      return reply.code(500).send(envelope(null, `agent-loops-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/alert-hooks", async (req, reply) => {
    try {
      const refreshRaw = Array.isArray(req.query.refresh) ? req.query.refresh[0] : req.query.refresh;
      const data = await evaluateAlertHooksTs({
        forceRefresh: Number(refreshRaw) > 0,
        emitEvents: false,
      });
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply.code(500).send(envelope(null, `alert-hooks-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/alert-hooks/config", async (req, reply) => {
    const parsed = alertConfigSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(envelope(null, parsed.error.message));
    try {
      const config = await updateAlertHooksConfigTs(parsed.data);
      const data = await evaluateAlertHooksTs({ forceRefresh: false, emitEvents: false });
      return reply.code(200).send(withSchemaVersion({ ok: true, config, data }));
    } catch (error) {
      return reply.code(500).send(envelope(null, `alert-hooks-config-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/alert-hooks/rule", async (req, reply) => {
    const parsed = alertRuleSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(envelope(null, parsed.error.message));
    try {
      const result = await updateAlertRuleTs(parsed.data);
      if (!result.ok) return reply.code(400).send(withSchemaVersion(result));
      const data = await evaluateAlertHooksTs({ forceRefresh: false, emitEvents: false });
      return reply.code(200).send(withSchemaVersion({ ok: true, data }));
    } catch (error) {
      return reply.code(500).send(envelope(null, `alert-hooks-rule-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/alert-hooks/evaluate", async (req, reply) => {
    const parsed = alertEvaluateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send(envelope(null, parsed.error.message));
    try {
      const data = await evaluateAlertHooksTs({
        forceRefresh: parsed.data.force_refresh,
        emitEvents: true,
      });
      return reply.code(200).send(withSchemaVersion({ ok: true, data }));
    } catch (error) {
      return reply.code(500).send(envelope(null, `alert-hooks-evaluate-error: ${String(error)}`));
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

  app.get<{ Querystring: QueryMap }>("/api/codex-observatory", async (req, reply) => {
    try {
      const forceRefresh = parseQueryString(req.query.refresh) === "1";
      return reply.code(200).send(withSchemaVersion(await getCodexObservatoryTs({ forceRefresh })));
    } catch (error) {
      return reply.code(500).send(envelope(null, `codex-observatory-error: ${String(error)}`));
    }
  });

  app.get("/api/execution-graph", async (_req, reply) => {
    try {
      return reply.code(200).send(withSchemaVersion(await getExecutionGraphData(CODEX_HOME)));
    } catch (error) {
      return reply.code(500).send(envelope(null, `execution-graph-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/agent-loops/action", async (req, reply) => {
    const parsed = agentLoopActionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(envelope(null, parsed.error.message));
    try {
      const data = await runAgentLoopActionTs(parsed.data.loop_id, parsed.data.action);
      return reply.code(data.ok ? 200 : 400).send(withSchemaVersion(data));
    } catch (error) {
      return reply.code(500).send(envelope(null, `agent-loop-action-error: ${String(error)}`));
    }
  });
}
