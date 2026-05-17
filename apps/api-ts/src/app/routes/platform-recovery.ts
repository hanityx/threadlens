import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  exportRecoveryBackupsTs,
  getRecoveryCenterDataTs,
  openRecoveryBackupArchiveReadStream,
  runRecoveryDrillTs,
  updateRecoveryChecklistItem,
} from "../../lib/recovery.js";
import {
  envelope,
  pathExists,
  type QueryMap,
  withSchemaVersion,
} from "../../lib/utils.js";

const RECOVERY_BACKUP_DOWNLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;

type RecoveryBackupDownloadTokenRecord = {
  archivePath: string;
  exportRoot?: string;
  expiresAt: number;
};

const recoveryBackupDownloadTokens = new Map<string, RecoveryBackupDownloadTokenRecord>();

function pruneExpiredRecoveryBackupDownloadTokens(now = Date.now()) {
  for (const [token, record] of recoveryBackupDownloadTokens.entries()) {
    if (record.expiresAt <= now) {
      recoveryBackupDownloadTokens.delete(token);
    }
  }
}

function issueRecoveryBackupDownloadToken(archivePath: string, exportRoot?: string) {
  pruneExpiredRecoveryBackupDownloadTokens();
  const token = randomUUID();
  recoveryBackupDownloadTokens.set(token, {
    archivePath,
    exportRoot,
    expiresAt: Date.now() + RECOVERY_BACKUP_DOWNLOAD_TOKEN_TTL_MS,
  });
  return token;
}

export function issueRecoveryBackupDownloadTokenForTests(
  archivePath: string,
  exportRoot?: string,
) {
  return issueRecoveryBackupDownloadToken(archivePath, exportRoot);
}

function consumeRecoveryBackupDownloadToken(token: string) {
  pruneExpiredRecoveryBackupDownloadTokens();
  const record = recoveryBackupDownloadTokens.get(token);
  if (!record) return null;
  recoveryBackupDownloadTokens.delete(token);
  return record;
}

const recoveryChecklistSchema = z.object({
  item_id: z.string().min(1),
  done: z.boolean(),
});

const recoveryBackupExportSchema = z.object({
  backup_ids: z.array(z.string().min(1)).max(200).optional().default([]),
  backup_root: z.string().optional().default(""),
  export_root: z.string().optional().default(""),
});

const recoveryBackupDownloadSchema = z.object({
  archive_path: z.string().min(1),
  export_root: z.string().optional().default(""),
});

const recoveryBackupDownloadTokenSchema = z.object({
  token: z.string().uuid(),
});

const recoveryOpenFolderSchema = z.object({
  folder_path: z.string().min(1),
  root_path: z.string().optional().default(""),
});

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

function resolveScopedFolderPath(folderPath: string, rootPath?: string) {
  const resolvedFolder = path.resolve(folderPath);
  const resolvedRoot = String(rootPath || "").trim()
    ? path.resolve(String(rootPath || "").trim())
    : "";
  if (!resolvedRoot) return resolvedFolder;
  const relative = path.relative(resolvedRoot, resolvedFolder);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolvedFolder;
}

export async function registerRecoveryRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: QueryMap }>("/api/recovery-center", async (req, reply) => {
    try {
      const backupRootRaw = Array.isArray(req.query.backup_root)
        ? req.query.backup_root[0]
        : req.query.backup_root;
      return reply.code(200).send(
        withSchemaVersion(
          await getRecoveryCenterDataTs({
            backupRoot: String(backupRootRaw || "").trim() || undefined,
          }),
        ),
      );
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-center-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/recovery-checklist", async (req, reply) => {
    const parsed = recoveryChecklistSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send(envelope(null, parsed.error.message));
    try {
      const result = await updateRecoveryChecklistItem(parsed.data.item_id, parsed.data.done);
      if (!result.ok) return reply.code(400).send(withSchemaVersion(result));
      const data = await getRecoveryCenterDataTs();
      return reply.code(200).send(withSchemaVersion({ ok: true, data }));
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-checklist-error: ${String(error)}`));
    }
  });

  app.post("/api/recovery-drill", async (_req, reply) => {
    try {
      const drill = await runRecoveryDrillTs();
      const center = await getRecoveryCenterDataTs();
      return reply.code(drill.ok ? 200 : 400).send(
        withSchemaVersion({
          ok: Boolean(drill.ok),
          data: { ...center, drill: drill.drill },
          drill: drill.drill,
          error: drill.error ?? "",
        }),
      );
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-drill-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/recovery-backup-export", async (req, reply) => {
    const parsed = recoveryBackupExportSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send(envelope(null, parsed.error.message));
    try {
      const result = await exportRecoveryBackupsTs({
        backup_ids: parsed.data.backup_ids,
        roots: {
          backup_root: String(parsed.data.backup_root || "").trim() || undefined,
          export_root: String(parsed.data.export_root || "").trim() || undefined,
        },
      });
      if (result.ok && result.archive_path) {
        const archivePath = String(result.archive_path || "").trim();
        const exportRoot = String(result.export_root || "").trim() || undefined;
        return reply.code(200).send(
          withSchemaVersion({
            ...result,
            download_token: issueRecoveryBackupDownloadToken(archivePath, exportRoot),
          }),
        );
      }
      return reply.code(result.ok ? 200 : 400).send(withSchemaVersion(result));
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-backup-export-error: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/recovery-open-folder", async (req, reply) => {
    const parsed = recoveryOpenFolderSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send(envelope(null, parsed.error.message));
    try {
      const safeFolderPath = resolveScopedFolderPath(
        parsed.data.folder_path,
        String(parsed.data.root_path || "").trim() || undefined,
      );
      if (!safeFolderPath) {
        return reply.code(400).send(envelope(null, "recovery-open-folder-outside-root"));
      }
      const exists = await pathExists(safeFolderPath);
      if (!exists) {
        return reply.code(404).send(envelope(null, "recovery-open-folder-not-found"));
      }
      await openDirectoryInOs(safeFolderPath);
      return reply.code(200).send(
        withSchemaVersion({
          ok: true,
          folder_path: safeFolderPath,
        }),
      );
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-open-folder-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/recovery-backup-export/download", async (req, reply) => {
    const tokenRaw = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
    const parsedToken = recoveryBackupDownloadTokenSchema.safeParse({
      token: tokenRaw ?? "",
    });
    if (parsedToken.success) {
      try {
        const tokenRecord = consumeRecoveryBackupDownloadToken(parsedToken.data.token);
        if (!tokenRecord) {
          return reply.code(400).send(envelope(null, "recovery-backup-export-download-not-found"));
        }
        const opened = await openRecoveryBackupArchiveReadStream(
          tokenRecord.archivePath,
          tokenRecord.exportRoot,
        );
        if (!opened) {
          return reply.code(400).send(envelope(null, "recovery-backup-export-download-not-found"));
        }
        reply.header("content-type", "application/zip");
        reply.header("content-disposition", `attachment; filename=\"${path.basename(opened.archivePath)}\"`);
        return reply.send(opened.stream);
      } catch (error) {
        return reply.code(500).send(envelope(null, `recovery-backup-export-download-error: ${String(error)}`));
      }
    }

    const archivePathRaw = Array.isArray(req.query.archive_path) ? req.query.archive_path[0] : req.query.archive_path;
    const exportRootRaw = Array.isArray(req.query.export_root) ? req.query.export_root[0] : req.query.export_root;
    const parsed = recoveryBackupDownloadSchema.safeParse({
      archive_path: archivePathRaw ?? "",
      export_root: exportRootRaw ?? "",
    });
    if (!parsed.success) return reply.code(400).send(envelope(null, parsed.error.message));
    try {
      const opened = await openRecoveryBackupArchiveReadStream(
        parsed.data.archive_path,
        String(parsed.data.export_root || "").trim() || undefined,
      );
      if (!opened) {
        return reply.code(400).send(envelope(null, "recovery-backup-export-download-not-found"));
      }
      reply.header("content-type", "application/zip");
      reply.header("content-disposition", `attachment; filename=\"${path.basename(opened.archivePath)}\"`);
      return reply.send(opened.stream);
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-backup-export-download-error: ${String(error)}`));
    }
  });
}
