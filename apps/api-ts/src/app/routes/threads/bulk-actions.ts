import type { FastifyInstance } from "fastify";
import {
  BulkThreadActionResult,
  type BulkThreadActionRequest,
} from "@threadlens/shared-contracts";
import {
  archiveThreadsLocalTs,
  getThreadResumeCommandsTs,
  setThreadPinnedTs,
  unarchiveThreadsLocalTs,
} from "../../../domains/threads/state.js";
import { envelope } from "../../../lib/utils.js";
import { bulkThreadActionPayloadSchema } from "./schemas.js";
import type { ThreadRouteDeps } from "./types.js";

export function registerBulkThreadActionRoutes(
  app: FastifyInstance,
  deps: ThreadRouteDeps,
): void {
  app.post<{ Body: BulkThreadActionRequest }>(
    "/api/bulk-thread-action",
    async (req, reply) => {
      const parsed = bulkThreadActionPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(envelope(null, parsed.error.message));
      }

      const { action, thread_ids: threadIds } = parsed.data;
      const results = await Promise.all(
        threadIds.map(async (threadId) => {
          switch (action) {
            case "pin": {
              const data = await setThreadPinnedTs([threadId], true);
              return {
                thread_id: threadId,
                ok: Boolean(data.ok),
                status: data.ok ? 200 : 400,
                error: data.ok ? null : String(data.error ?? "pin failed"),
                data,
              };
            }
            case "unpin": {
              const data = await setThreadPinnedTs([threadId], false);
              return {
                thread_id: threadId,
                ok: Boolean(data.ok),
                status: data.ok ? 200 : 400,
                error: data.ok ? null : String(data.error ?? "unpin failed"),
                data,
              };
            }
            case "archive_local": {
              const data = await archiveThreadsLocalTs([threadId]);
              return {
                thread_id: threadId,
                ok: Boolean(data.ok),
                status: data.ok ? 200 : 400,
                error: data.ok ? null : String(data.error ?? "archive failed"),
                data,
              };
            }
            case "unarchive_local": {
              const data = await unarchiveThreadsLocalTs([threadId]);
              return {
                thread_id: threadId,
                ok: Boolean(data.ok),
                status: data.ok ? 200 : 400,
                error: data.ok ? null : String(data.error ?? "unarchive failed"),
                data,
              };
            }
            case "resume_command": {
              const data = getThreadResumeCommandsTs([threadId]);
              return {
                thread_id: threadId,
                ok: Boolean(data.ok),
                status: data.ok ? 200 : 400,
                error: data.ok ? null : String(data.error ?? "resume command failed"),
                data,
              };
            }
          }
        }),
      );
      const success = results.filter((r) => r.ok).length;

      const payload: BulkThreadActionResult = {
        action,
        total: threadIds.length,
        success,
        failed: threadIds.length - success,
        results,
      };
      if (success > 0) {
        deps.invalidateOverviewCache();
      }

      return envelope(payload, null);
    },
  );
}
