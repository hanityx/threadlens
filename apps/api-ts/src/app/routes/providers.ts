import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ProviderId } from "../../lib/providers.js";
import {
  buildSessionTranscript,
  getProviderMatrixTs,
  listProviderIds,
  parseProviderId,
  resolveAllowedProviderFilePath,
  runProviderSessionAction,
} from "../../lib/providers.js";
import {
  getProviderParserHealthTs,
  getProviderSessionsTs,
  searchLocalConversationsTs,
} from "../../domains/providers/search.js";
import {
  envelope,
  parseQueryNumber,
  pathExists,
  type QueryMap,
  withSchemaVersion,
} from "../../lib/utils.js";

export async function registerProviderRoutes(
  app: FastifyInstance,
  deps: {
    parseConversationSearchProviders: (
      raw: string | string[] | undefined,
    ) => { providers?: ProviderId[]; invalid: string[] };
  },
): Promise<void> {
  const providerIds = listProviderIds();
  const providerIdTuple = providerIds as [ProviderId, ...ProviderId[]];

  const providerSessionActionSchema = z.object({
    provider: z.enum(providerIdTuple),
    action: z.enum(["backup_local", "archive_local", "delete_local"]),
    file_paths: z.array(z.string().min(1)).min(1).max(500),
    dry_run: z.boolean().optional().default(true),
    confirm_token: z.string().optional().default(""),
    backup_before_delete: z.boolean().optional().default(false),
  });

  app.post<{ Body: unknown }>(
    "/api/provider-session-action",
    async (req, reply) => {
      const parsed = providerSessionActionSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(envelope(null, parsed.error.message));
      }
      try {
        const result = await runProviderSessionAction(
          parsed.data.provider,
          parsed.data.action,
          parsed.data.file_paths,
          parsed.data.dry_run,
          parsed.data.confirm_token,
          { backup_before_delete: parsed.data.backup_before_delete },
        );
        const status = result.ok ? 200 : 400;
        return reply.code(status).send(withSchemaVersion(result));
      } catch (error) {
        return reply
          .code(500)
          .send(
            envelope(null, `provider-session-action-error: ${String(error)}`),
          );
      }
    },
  );

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

  app.get<{ Querystring: QueryMap }>(
    "/api/provider-sessions",
    async (req, reply) => {
      try {
        const providerRaw = Array.isArray(req.query.provider)
          ? req.query.provider[0]
          : req.query.provider;
        const limitRaw = Array.isArray(req.query.limit)
          ? req.query.limit[0]
          : req.query.limit;
        const provider = parseProviderId(providerRaw);
        if (providerRaw && !provider) {
          return reply.code(400).send(envelope(null, "invalid provider"));
        }
        const limit = Math.max(1, Math.min(240, Number(limitRaw) || 80));
        const refreshRaw = Array.isArray(req.query.refresh)
          ? req.query.refresh[0]
          : req.query.refresh;
        const forceRefresh = Number(refreshRaw) > 0;
        const data = await getProviderSessionsTs(provider, limit, {
          forceRefresh,
        });
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        return reply
          .code(500)
          .send(envelope(null, `provider-sessions-error: ${String(error)}`));
      }
    },
  );

  app.get<{ Querystring: QueryMap }>(
    "/api/provider-parser-health",
    async (req, reply) => {
      try {
        const providerRaw = Array.isArray(req.query.provider)
          ? req.query.provider[0]
          : req.query.provider;
        const limitRaw = Array.isArray(req.query.limit)
          ? req.query.limit[0]
          : req.query.limit;
        const provider = parseProviderId(providerRaw);
        if (providerRaw && !provider) {
          return reply.code(400).send(envelope(null, "invalid provider"));
        }
        const limit = Math.max(1, Math.min(120, Number(limitRaw) || 80));
        const refreshRaw = Array.isArray(req.query.refresh)
          ? req.query.refresh[0]
          : req.query.refresh;
        const forceRefresh = Number(refreshRaw) > 0;
        const data = await getProviderParserHealthTs(provider, limit, {
          forceRefresh,
        });
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        return reply
          .code(500)
          .send(
            envelope(null, `provider-parser-health-error: ${String(error)}`),
          );
      }
    },
  );

  app.get<{ Querystring: QueryMap }>(
    "/api/conversation-search",
    async (req, reply) => {
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
        const refreshRaw = Array.isArray(req.query.refresh)
          ? req.query.refresh[0]
          : req.query.refresh;
        const forceRefresh = Number(refreshRaw) > 0;
        const data = await searchLocalConversationsTs(q, {
          providers,
          limit,
          forceRefresh,
        });
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        return reply
          .code(500)
          .send(envelope(null, `conversation-search-error: ${String(error)}`));
      }
    },
  );

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
        const provider = parseProviderId(providerRaw);
        if (!provider) {
          return reply.code(400).send(envelope(null, "invalid provider"));
        }
        const filePath = String(fileRaw ?? "").trim();
        if (!filePath) {
          return reply.code(400).send(envelope(null, "file_path required"));
        }
        const safeFilePath = await resolveAllowedProviderFilePath(provider, filePath);
        if (!safeFilePath) {
          return reply
            .code(400)
            .send(envelope(null, "file_path outside provider roots"));
        }
        const exists = await pathExists(safeFilePath);
        if (!exists) {
          return reply.code(404).send(envelope(null, "session file not found"));
        }
        const data = await buildSessionTranscript(
          provider,
          safeFilePath,
          Number(limitRaw) || 300,
        );
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        return reply
          .code(500)
          .send(envelope(null, `session-transcript-error: ${String(error)}`));
      }
    },
  );
}
