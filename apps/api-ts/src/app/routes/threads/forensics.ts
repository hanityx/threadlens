import type { FastifyInstance } from "fastify";
import { getThreadForensicsTs } from "../../../domains/threads/forensics.js";
import {
  envelope,
  withSchemaVersion,
} from "../../../lib/utils.js";
import { threadForensicsSchema } from "./schemas.js";

export function registerThreadForensicsRoutes(app: FastifyInstance): void {
  app.post<{ Body: unknown }>("/api/thread-forensics", async (req, reply) => {
    const parsed = threadForensicsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    const ids = parsed.data.ids ?? parsed.data.thread_ids ?? [];
    try {
      const data = await getThreadForensicsTs(ids);
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `thread-forensics-error: ${String(error)}`));
    }
  });
}
