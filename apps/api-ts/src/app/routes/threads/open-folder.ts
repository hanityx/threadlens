import { execFile } from "node:child_process";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { resolveCodexSessionPathByThreadId } from "../../../domains/providers/search.js";
import {
  envelope,
  pathExists,
  withSchemaVersion,
} from "../../../lib/utils.js";
import { threadOpenFolderSchema } from "./schemas.js";

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

export function registerThreadOpenFolderRoutes(app: FastifyInstance): void {
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
}
