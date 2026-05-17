import type { FastifyInstance } from "fastify";
import {
  archiveThreadsLocalTs,
  getThreadResumeCommandsTs,
  renameThreadTitleTs,
  setThreadPinnedTs,
} from "../../../domains/threads/state.js";
import { invalidateCodexThreadTitleMapCache } from "../../../domains/providers/title-detection.js";
import {
  envelope,
  withSchemaVersion,
} from "../../../lib/utils.js";
import {
  idsPayloadSchema,
  pinPayloadSchema,
  renameThreadSchema,
} from "./schemas.js";
import type { ThreadRouteDeps } from "./types.js";

export function registerThreadStateActionRoutes(
  app: FastifyInstance,
  deps: ThreadRouteDeps,
): void {
  app.post<{ Body: unknown }>("/api/thread-pin", async (req, reply) => {
    const parsed = pinPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const data = await setThreadPinnedTs(parsed.data.ids, parsed.data.pinned);
      if (!data.ok) {
        return reply.code(400).send(withSchemaVersion(data));
      }
      deps.invalidateOverviewCache();
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply.code(500).send(envelope(null, `thread-pin-error: ${String(error)}`));
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
        const data = await archiveThreadsLocalTs(parsed.data.ids);
        if (!data.ok) {
          return reply.code(400).send(withSchemaVersion(data));
        }
        deps.invalidateOverviewCache();
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        return reply
          .code(500)
          .send(envelope(null, `thread-archive-local-error: ${String(error)}`));
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
        const data = getThreadResumeCommandsTs(parsed.data.ids);
        if (!data.ok) {
          return reply.code(400).send(withSchemaVersion(data));
        }
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        return reply
          .code(500)
          .send(envelope(null, `thread-resume-command-error: ${String(error)}`));
      }
    },
  );

  app.post<{ Body: unknown }>("/api/rename-thread", async (req, reply) => {
    const parsed = renameThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const data = await renameThreadTitleTs(parsed.data.id, parsed.data.title);
      if (!data.ok) {
        return reply.code(400).send(withSchemaVersion(data));
      }
      deps.invalidateOverviewCache();
      deps.invalidateProviderSessionCache("codex");
      invalidateCodexThreadTitleMapCache();
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply.code(500).send(envelope(null, `rename-thread-error: ${String(error)}`));
    }
  });
}
