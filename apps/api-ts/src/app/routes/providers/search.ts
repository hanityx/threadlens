import type { FastifyInstance } from "fastify";
import type { ProviderId } from "../../../domains/providers/types.js";
import { parseSearchableProviderId } from "../../../domains/providers/capabilities.js";
import {
  searchConversationSessionHitsTs,
  searchLocalConversationsTs,
} from "../../../domains/providers/search.js";
import {
  envelope,
  parseQueryNumber,
  type QueryMap,
  withSchemaVersion,
} from "../../../lib/utils.js";

export type ProviderSearchRouteDeps = {
  parseConversationSearchProviders: (
    raw: string | string[] | undefined,
  ) => { providers?: ProviderId[]; invalid: string[] };
};

export function registerProviderSearchRoutes(
  app: FastifyInstance,
  deps: ProviderSearchRouteDeps,
): void {
  app.get<{ Querystring: QueryMap }>(
    "/api/conversation-search",
    async (req, reply) => {
      const abortController = new AbortController();
      const abort = () => abortController.abort();
      req.raw.once("close", abort);
      try {
        const q = String(
          Array.isArray(req.query.q) ? req.query.q[0] : req.query.q ?? "",
        ).trim();
        if (!q) return reply.code(400).send(envelope(null, "q required"));

        const { providers, invalid } = deps.parseConversationSearchProviders(
          req.query.provider,
        );
        if (invalid.length > 0) {
          return reply
            .code(400)
            .send(envelope(null, `invalid provider: ${invalid.join(", ")}`));
        }

        const limit = Math.max(1, Math.min(200, parseQueryNumber(req.query.limit, 40)));
        const pageSize = Math.max(
          1,
          Math.min(200, parseQueryNumber(req.query.page_size, limit)),
        );
        const cursor = String(
          Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor ?? "",
        ).trim();
        const previewHitsPerSession = Math.max(
          1,
          Math.min(20, parseQueryNumber(req.query.preview_hits_per_session, 3)),
        );
        const refreshRaw = Array.isArray(req.query.refresh)
          ? req.query.refresh[0]
          : req.query.refresh;
        const forceRefresh = Number(refreshRaw) > 0;
        const data = await searchLocalConversationsTs(q, {
          providers,
          limit: pageSize,
          pageSize,
          ...(cursor ? { cursor } : {}),
          forceRefresh,
          previewHitsPerSession,
          signal: abortController.signal,
        });
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        if (abortController.signal.aborted) return;
        return reply
          .code(500)
          .send(envelope(null, `conversation-search-error: ${String(error)}`));
      } finally {
        req.raw.off("close", abort);
      }
    },
  );

  app.get<{ Querystring: QueryMap }>(
    "/api/conversation-search/session-hits",
    async (req, reply) => {
      const abortController = new AbortController();
      const abort = () => abortController.abort();
      req.raw.once("close", abort);
      try {
        const q = String(
          Array.isArray(req.query.q) ? req.query.q[0] : req.query.q ?? "",
        ).trim();
        if (!q) return reply.code(400).send(envelope(null, "q required"));

        const providerRaw = Array.isArray(req.query.provider)
          ? req.query.provider[0]
          : req.query.provider;
        const provider = parseSearchableProviderId(providerRaw);
        if (!provider) {
          return reply.code(400).send(envelope(null, "invalid provider"));
        }
        const sessionId = String(
          Array.isArray(req.query.session_id)
            ? req.query.session_id[0]
            : req.query.session_id ?? "",
        ).trim();
        if (!sessionId) {
          return reply.code(400).send(envelope(null, "session_id required"));
        }
        const pageSize = Math.max(
          1,
          Math.min(200, parseQueryNumber(req.query.page_size, 40)),
        );
        const filePath = String(
          Array.isArray(req.query.file_path)
            ? req.query.file_path[0]
            : req.query.file_path ?? "",
        ).trim();
        const cursor = String(
          Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor ?? "",
        ).trim();
        const refreshRaw = Array.isArray(req.query.refresh)
          ? req.query.refresh[0]
          : req.query.refresh;
        const forceRefresh = Number(refreshRaw) > 0;
        const data = await searchConversationSessionHitsTs(q, {
          provider,
          sessionId,
          ...(filePath ? { filePath } : {}),
          pageSize,
          ...(cursor ? { cursor } : {}),
          forceRefresh,
          signal: abortController.signal,
        });
        if (!data) {
          return reply.code(404).send(envelope(null, "session not found"));
        }
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        if (abortController.signal.aborted) return;
        return reply
          .code(500)
          .send(
            envelope(null, `conversation-search-session-hits-error: ${String(error)}`),
          );
      } finally {
        req.raw.off("close", abort);
      }
    },
  );
}
