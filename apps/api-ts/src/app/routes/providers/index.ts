import type { FastifyInstance } from "fastify";
import { registerProviderActionRoutes } from "./actions.js";
import { registerProviderMatrixRoutes } from "./matrix.js";
import { registerProviderSearchRoutes, type ProviderSearchRouteDeps } from "./search.js";
import { registerProviderSessionRoutes } from "./sessions.js";
import { registerProviderTranscriptRoutes } from "./transcript.js";

export async function registerProviderRoutes(
  app: FastifyInstance,
  deps: ProviderSearchRouteDeps,
): Promise<void> {
  registerProviderActionRoutes(app);
  registerProviderSessionRoutes(app);
  registerProviderMatrixRoutes(app);
  registerProviderSearchRoutes(app, deps);
  registerProviderTranscriptRoutes(app);
}
