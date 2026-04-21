import { execFile } from "node:child_process";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  BulkThreadActionResult,
  type BulkThreadActionRequest,
} from "@threadlens/shared-contracts";
import {
  archiveThreadsLocalTs,
  getThreadResumeCommandsTs,
  renameThreadTitleTs,
  setThreadPinnedTs,
  unarchiveThreadsLocalTs,
} from "../../domains/threads/state.js";
import {
  analyzeDeleteTs,
  executeBackupCleanupTs,
  executeLocalCleanupTs,
} from "../../domains/threads/cleanup.js";
import { getThreadForensicsTs } from "../../domains/threads/forensics.js";
import { getThreadsTs } from "../../domains/threads/query.js";
import {
  buildSessionTranscript,
} from "../../domains/providers/transcript.js";
import { invalidateCodexThreadTitleMapCache } from "../../domains/providers/title-detection.js";
import { resolveCodexSessionPathByThreadId } from "../../domains/providers/search.js";
import {
  bulkRequestSchema,
  envelope,
  isRecord,
  pathExists,
  type QueryMap,
  withSchemaVersion,
} from "../../lib/utils.js";

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

export async function registerThreadRoutes(
  app: FastifyInstance,
  deps: {
    invalidateOverviewCache: () => void;
    invalidateProviderSessionCache: (provider: "codex") => void;
  },
): Promise<void> {
  const idsPayloadSchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(500),
  });
  const analyzeDeletePayloadSchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(500),
    session_scan_limit: z.number().int().min(1).max(240).optional(),
  });

  const pinPayloadSchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(500),
    pinned: z.boolean().optional().default(true),
  });

  const cleanupPayloadSchema = z
    .object({
      ids: z.array(z.string().min(1)).min(1).max(500),
      dry_run: z.boolean().optional().default(true),
      options: z.unknown().optional(),
      confirm_token: z.string().optional().default(""),
    })
    .transform((value) => ({
      ids: value.ids,
      dry_run: value.dry_run,
      options: isRecord(value.options) ? value.options : {},
      confirm_token: value.confirm_token,
    }));

  const renameThreadSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
  });

  const threadOpenFolderSchema = z.object({
    thread_id: z.string().min(1),
  });

  const threadForensicsSchema = z.object({
    ids: z.array(z.string().min(1)).optional(),
    thread_ids: z.array(z.string().min(1)).optional(),
  });

  app.post<{ Body: BulkThreadActionRequest }>(
    "/api/bulk-thread-action",
    async (req, reply) => {
      const parsed = bulkRequestSchema.safeParse(req.body);
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

  app.post<{ Body: unknown }>("/api/analyze-delete", async (req, reply) => {
    const parsed = analyzeDeletePayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const data = await analyzeDeleteTs(parsed.data.ids, {
        sessionScanLimit: parsed.data.session_scan_limit,
      });
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `analyze-delete-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/local-cleanup", async (req, reply) => {
    const parsed = cleanupPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const data = await executeLocalCleanupTs(parsed.data.ids, {
        dryRun: parsed.data.dry_run,
        confirmToken: parsed.data.confirm_token,
        options: parsed.data.options as {
          delete_cache?: boolean;
          delete_session_logs?: boolean;
          clean_state_refs?: boolean;
        },
      });
      if (data.ok && parsed.data.dry_run === false) {
        deps.invalidateOverviewCache();
        deps.invalidateProviderSessionCache("codex");
      }
      const status = data.ok ? 200 : 400;
      return reply.code(status).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `local-cleanup-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/local-cleanup-backups", async (req, reply) => {
    const parsed = idsPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const data = await executeBackupCleanupTs(parsed.data.ids);
      deps.invalidateOverviewCache();
      deps.invalidateProviderSessionCache("codex");
      return reply.code(data.ok ? 200 : 400).send(withSchemaVersion(data));
    } catch (error) {
      return reply
        .code(500)
        .send(envelope(null, `local-cleanup-backups-error: ${String(error)}`));
    }
  });

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

  app.post<{ Body: unknown }>("/api/thread-open-folder", async (req, reply) => {
    const parsed = threadOpenFolderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const filePath = await resolveCodexSessionPathByThreadId(parsed.data.thread_id);
      if (!filePath) {
        return reply
          .code(404)
          .send(envelope(null, "thread session file not found"));
      }
      if (!(await pathExists(filePath))) {
        return reply.code(404).send(envelope(null, "thread session file not found"));
      }
      const directoryPath = path.dirname(filePath);
      if (!(await pathExists(directoryPath))) {
        return reply.code(404).send(envelope(null, "thread session folder not found"));
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
        .send(envelope(null, `thread-open-folder-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>(
    "/api/thread-transcript",
    async (req, reply) => {
      try {
        const threadRaw = Array.isArray(req.query.thread_id)
          ? req.query.thread_id[0]
          : req.query.thread_id;
        const limitRaw = Array.isArray(req.query.limit)
          ? req.query.limit[0]
          : req.query.limit;
        const threadId = String(threadRaw ?? "").trim();
        if (!threadId) {
          return reply.code(400).send(envelope(null, "thread_id required"));
        }
        const filePath = await resolveCodexSessionPathByThreadId(threadId);
        if (!filePath) {
          return reply
            .code(404)
            .send(envelope(null, "thread session file not found"));
        }
        const data = await buildSessionTranscript(
          "codex",
          filePath,
          Number(limitRaw) || 300,
        );
        return reply.code(200).send(withSchemaVersion(data));
      } catch (error) {
        return reply
          .code(500)
          .send(envelope(null, `thread-transcript-error: ${String(error)}`));
      }
    },
  );
}
