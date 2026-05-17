import { execFile } from "node:child_process";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { parseSessionReadableProviderId } from "../../../domains/providers/capabilities.js";
import { resolveAllowedProviderFilePath } from "../../../domains/providers/path-safety.js";
import {
  getProviderParserHealthTs,
  getProviderSessionsTs,
} from "../../../domains/providers/search.js";
import {
  envelope,
  pathExists,
  type QueryMap,
  withSchemaVersion,
} from "../../../lib/utils.js";
import { providerOpenFolderSchema } from "./schemas.js";

async function openDirectoryInOs(directoryPath: string): Promise<void> {
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
}

export function registerProviderSessionRoutes(app: FastifyInstance): void {
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
        const provider = parseSessionReadableProviderId(providerRaw);
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
        const provider = parseSessionReadableProviderId(providerRaw);
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
}
