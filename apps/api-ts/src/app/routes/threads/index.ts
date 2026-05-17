import type { FastifyInstance } from "fastify";
import { registerBulkThreadActionRoutes } from "./bulk-actions.js";
import { registerThreadCleanupRoutes } from "./cleanup.js";
import { registerThreadForensicsRoutes } from "./forensics.js";
import { registerThreadOpenFolderRoutes } from "./open-folder.js";
import { registerThreadQueryRoutes } from "./query.js";
import { registerThreadStateActionRoutes } from "./state-actions.js";
import { registerThreadTranscriptRoutes } from "./transcript.js";
import type { ThreadRouteDeps } from "./types.js";

export async function registerThreadRoutes(
  app: FastifyInstance,
  deps: ThreadRouteDeps,
): Promise<void> {
  registerBulkThreadActionRoutes(app, deps);
  registerThreadQueryRoutes(app);
  registerThreadStateActionRoutes(app, deps);
  registerThreadCleanupRoutes(app, deps);
  registerThreadForensicsRoutes(app);
  registerThreadOpenFolderRoutes(app);
  registerThreadTranscriptRoutes(app);
}
