import type { FastifyInstance } from "fastify";
import { getThreadsTs } from "../../../domains/threads/query.js";
import {
  envelope,
  type QueryMap,
  withSchemaVersion,
} from "../../../lib/utils.js";

export function registerThreadQueryRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: QueryMap }>("/api/threads", async (req, reply) => {
    try {
      const data = await getThreadsTs(req.query);
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `threads-error: ${String(error)}`));
    }
  });
}
