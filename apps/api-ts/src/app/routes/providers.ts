import { execFile } from "node:child_process";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ProviderId } from "../../domains/providers/types.js";
import {
  listProviderIds,
  parseProviderId,
  resolveAllowedProviderFilePath,
} from "../../domains/providers/path-safety.js";
import { getProviderMatrixTs } from "../../domains/providers/matrix.js";
import { buildSessionTranscript } from "../../domains/providers/transcript.js";
import { runProviderSessionAction } from "../../lib/providers.js";
import {
  getProviderParserHealthTs,
  getProviderSessionsTs,
  searchConversationSessionHitsTs,
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
    action: z.enum(["backup_local", "archive_local", "unarchive_local", "delete_local"]),
    file_paths: z.array(z.string().min(1)).min(1).max(500),
    dry_run: z.boolean().optional().default(true),
    confirm_token: z.string().optional().default(""),
    backup_before_delete: z.boolean().optional().default(false),
    backup_root: z.string().optional().default(""),
  });
  const providerOpenFolderSchema = z.object({
    provider: z.enum(providerIdTuple),
    file_path: z.string().min(1),
  });

  const openDirectoryInOs = async (directoryPath: string): Promise<void> => {
    const [command, args] =
      process.platform === "darwin"
        ? ["open", [directoryPath]]
        : process.platform === "win32"
          ? ["explorer", [directoryPath]]
          : ["xdg-open", [directoryPath]];

    await new Promise<void>((resolve, reject) => {
      execFile(command, args, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  };

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
          {
            backup_before_delete: parsed.data.backup_before_delete,
            backup_root: parsed.data.backup_root,
          },
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

  app.post<{ Body: unknown }>(
    "/api/provider-open-folder",
    async (req, reply) => {
      const parsed = providerOpenFolderSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(envelope(null, parsed.error.message));
      }

      try {
        const safeFilePath = await resolveAllowedProviderFilePath(
          parsed.data.provider,
          parsed.data.file_path,
        );
        if (!safeFilePath) {
          return reply
            .code(400)
            .send(envelope(null, "file_path outside provider roots"));
        }

        const exists = await pathExists(safeFilePath);
        if (!exists) {
          return reply.code(404).send(envelope(null, "session file not found"));
        }

        const directoryPath = path.dirname(safeFilePath);
        const directoryExists = await pathExists(directoryPath);
        if (!directoryExists) {
          return reply.code(404).send(envelope(null, "session folder not found"));
        }

        await openDirectoryInOs(directoryPath);
        return reply.code(200).send(
          withSchemaVersion({
            ok: true,
            directory_path: directoryPath,
          }),
        );
      } catch (error) {
        return reply
          .code(500)
          .send(envelope(null, `provider-open-folder-error: ${String(error)}`));
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
        const provider = parseProviderId(providerRaw);
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
