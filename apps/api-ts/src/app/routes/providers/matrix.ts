import type { FastifyInstance } from "fastify";
import { getProviderMatrixTs } from "../../../domains/providers/matrix.js";
import {
  envelope,
  type QueryMap,
  withSchemaVersion,
} from "../../../lib/utils.js";

export function registerProviderMatrixRoutes(app: FastifyInstance): void {
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
}
