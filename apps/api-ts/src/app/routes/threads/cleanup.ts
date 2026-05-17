import type { FastifyInstance } from "fastify";
import {
  analyzeDeleteTs,
  executeBackupCleanupTs,
  executeLocalCleanupTs,
} from "../../../domains/threads/cleanup.js";
import {
  envelope,
  withSchemaVersion,
} from "../../../lib/utils.js";
import {
  analyzeDeletePayloadSchema,
  cleanupPayloadSchema,
  idsPayloadSchema,
} from "./schemas.js";
import type { ThreadRouteDeps } from "./types.js";

export function registerThreadCleanupRoutes(
  app: FastifyInstance,
  deps: ThreadRouteDeps,
): void {
  app.post<{ Body: unknown }>("/api/analyze-delete", async (req, reply) => {
    const parsed = analyzeDeletePayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const data = await analyzeDeleteTs(parsed.data.ids, {
        sessionScanLimit: parsed.data.session_scan_limit,
      });
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `analyze-delete-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/local-cleanup", async (req, reply) => {
    const parsed = cleanupPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const data = await executeLocalCleanupTs(parsed.data.ids, {
        dryRun: parsed.data.dry_run,
        confirmToken: parsed.data.confirm_token,
        options: parsed.data.options as {
          delete_cache?: boolean;
          delete_session_logs?: boolean;
          clean_state_refs?: boolean;
        },
      });
      const changed =
        parsed.data.dry_run === false &&
        (Number((data as { deleted_file_count?: unknown }).deleted_file_count ?? 0) > 0 ||
          String((data as { mode?: unknown }).mode ?? "") === "partial" ||
          String((data as { mode?: unknown }).mode ?? "") === "applied");
      if (changed) {
        deps.invalidateOverviewCache();
        deps.invalidateProviderSessionCache("codex");
      }
      const status = data.ok ? 200 : String((data as { mode?: unknown }).mode ?? "") === "partial" ? 207 : 400;
      return reply.code(status).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `local-cleanup-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/local-cleanup-backups", async (req, reply) => {
    const parsed = idsPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const data = await executeBackupCleanupTs(parsed.data.ids);
      deps.invalidateOverviewCache();
      deps.invalidateProviderSessionCache("codex");
      const status = data.ok ? 200 : String((data as { mode?: unknown }).mode ?? "") === "partial" ? 207 : 400;
      return reply.code(status).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `local-cleanup-backups-error: ${String(error)}`));
    }
  });
}
