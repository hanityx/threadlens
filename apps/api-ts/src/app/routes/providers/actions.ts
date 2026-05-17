import type { FastifyInstance } from "fastify";
import { runProviderSessionAction } from "../../../domains/providers/index.js";
import {
  envelope,
  withSchemaVersion,
} from "../../../lib/utils.js";
import { providerSessionActionSchema } from "./schemas.js";

export function registerProviderActionRoutes(app: FastifyInstance): void {
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
}
