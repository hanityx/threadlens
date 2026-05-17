import type { FastifyInstance } from "fastify";
import { parseTranscriptReadableProviderId } from "../../../domains/providers/capabilities.js";
import { getProviderSessionTranscript } from "../../../domains/providers/session-transcript-service.js";
import {
  envelope,
  type QueryMap,
  withSchemaVersion,
} from "../../../lib/utils.js";

export function registerProviderTranscriptRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: QueryMap }>(
    "/api/session-transcript",
    async (req, reply) => {
      try {
        const providerRaw = Array.isArray(req.query.provider)
          ? req.query.provider[0]
          : req.query.provider;
        const fileRaw = Array.isArray(req.query.file_path)
          ? req.query.file_path[0]
          : req.query.file_path;
        const limitRaw = Array.isArray(req.query.limit)
          ? req.query.limit[0]
          : req.query.limit;
        const provider = parseTranscriptReadableProviderId(providerRaw);
        if (!provider) {
          return reply.code(400).send(envelope(null, "invalid provider"));
        }
        const filePath = String(fileRaw ?? "").trim();
        if (!filePath) {
          return reply.code(400).send(envelope(null, "file_path required"));
        }
        const result = await getProviderSessionTranscript(
          provider,
          filePath,
          Number(limitRaw) || 300,
        );
        if (!result.ok) {
          return reply
            .code(result.statusCode)
            .send(envelope(null, result.message));
        }
        return reply.code(200).send(withSchemaVersion(result.data));
      } catch (error) {
        return reply
          .code(500)
          .send(envelope(null, `session-transcript-error: ${String(error)}`));
      }
    },
  );
}
