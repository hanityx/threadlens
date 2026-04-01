import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  SCHEMA_VERSION,
  type AgentRuntimeState,
} from "@threadlens/shared-contracts";
import { getExecutionGraphData } from "../../execution-graph.js";
import {
  APP_VERSION,
  CODEX_HOME,
  START_TS,
} from "../../lib/constants.js";
import { checkForUpdates } from "../../lib/update-check.js";
import {
  cleanTitleText,
  envelope,
  parseQueryString,
  type QueryMap,
  withSchemaVersion,
} from "../../lib/utils.js";
import {
  exportRecoveryBackupsTs,
  getCompareAppsStatusTs,
  getLatestSmokeStatusTs,
  openRecoveryBackupArchiveReadStream,
  getRecoveryCenterDataTs,
  getRelatedToolsStatusTs,
  getRuntimeHealthTs,
  runRecoveryDrillTs,
  updateRecoveryChecklistItem,
} from "../../lib/recovery.js";
import { getDataSourceInventoryTs } from "../../domains/recovery/inventory.js";
import {
  appendRoadmapCheckinTs,
  getRoadmapStatusTs,
} from "../../domains/recovery/roadmap.js";
import { getSyncLensStatusTs } from "../../lib/sync-lens.js";
import { getOverviewTs } from "../../domains/threads/overview.js";
import { getCodexObservatoryTs } from "../../domains/ops/observatory.js";
import {
  evaluateAlertHooksTs,
  updateAlertHooksConfigTs,
  updateAlertRuleTs,
} from "../../domains/ops/alert-hooks.js";
import {
  getAgentLoopsStatusTs,
  runAgentLoopActionTs,
} from "../../domains/ops/agent-loops.js";

export type ProxyRequest = FastifyRequest<{
  Params: { "*": string };
  Querystring: Record<string, string | string[] | undefined>;
  Body: unknown;
}>;

export async function registerPlatformRoutes(
  app: FastifyInstance,
  deps: {
    getAgentRuntimeState: () => Promise<AgentRuntimeState>;
    getCachedDataSources: (forceRefresh: boolean) => Promise<unknown>;
  },
): Promise<void> {
  const recoveryChecklistSchema = z.object({
    item_id: z.string().min(1),
    done: z.boolean(),
  });

  const recoveryBackupExportSchema = z.object({
    backup_ids: z.array(z.string().min(1)).max(200).optional().default([]),
  });

  const recoveryBackupDownloadSchema = z.object({
    archive_path: z.string().min(1),
  });

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

  app.get("/api/recovery-center", async (_req, reply) => {
    try {
      return reply.code(200).send(withSchemaVersion(await getRecoveryCenterDataTs()));
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-center-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/recovery-checklist", async (req, reply) => {
    const parsed = recoveryChecklistSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(envelope(null, parsed.error.message));
    try {
      const result = await updateRecoveryChecklistItem(parsed.data.item_id, parsed.data.done);
      if (!result.ok) return reply.code(400).send(withSchemaVersion(result));
      const data = await getRecoveryCenterDataTs();
      return reply.code(200).send(withSchemaVersion({ ok: true, data }));
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-checklist-error: ${String(error)}`));
    }
  });

  app.post("/api/recovery-drill", async (_req, reply) => {
    try {
      const drill = await runRecoveryDrillTs();
      const center = await getRecoveryCenterDataTs();
      return reply.code(drill.ok ? 200 : 400).send(
        withSchemaVersion({
          ok: Boolean(drill.ok),
          data: { ...center, drill: drill.drill },
          drill: drill.drill,
          error: drill.error ?? "",
        }),
      );
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-drill-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/recovery-backup-export", async (req, reply) => {
    const parsed = recoveryBackupExportSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send(envelope(null, parsed.error.message));
    try {
      const result = await exportRecoveryBackupsTs({ backup_ids: parsed.data.backup_ids });
      return reply.code(result.ok ? 200 : 400).send(withSchemaVersion(result));
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-backup-export-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/recovery-backup-export/download", async (req, reply) => {
    const archivePathRaw = Array.isArray(req.query.archive_path) ? req.query.archive_path[0] : req.query.archive_path;
    const parsed = recoveryBackupDownloadSchema.safeParse({ archive_path: archivePathRaw ?? "" });
    if (!parsed.success) return reply.code(400).send(envelope(null, parsed.error.message));
    try {
      const opened = await openRecoveryBackupArchiveReadStream(parsed.data.archive_path);
      if (!opened) {
        return reply.code(400).send(envelope(null, "recovery-backup-export-download-not-found"));
      }
      reply.header("content-type", "application/zip");
      reply.header("content-disposition", `attachment; filename=\"${path.basename(opened.archivePath)}\"`);
      return reply.send(opened.stream);
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-backup-export-download-error: ${String(error)}`));
    }
  });

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
      return reply.code(500).send(envelope(null, `related-tools-error: ${String(error)}`));
    }
  });

  app.get("/api/runtime-health", async (_req, reply) => {
    try {
      return reply.code(200).send(withSchemaVersion(await getRuntimeHealthTs()));
    } catch (error) {
      return reply.code(500).send(envelope(null, `runtime-health-error: ${String(error)}`));
    }
  });

  app.get("/api/sync-lens", async (_req, reply) => {
    try {
      return reply.code(200).send(withSchemaVersion(await getSyncLensStatusTs()));
    } catch (error) {
      return reply.code(500).send(envelope(null, `sync-lens-error: ${String(error)}`));
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
