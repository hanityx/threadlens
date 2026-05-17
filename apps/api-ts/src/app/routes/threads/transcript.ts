import type { FastifyInstance } from "fastify";
import { buildSessionTranscript } from "../../../domains/providers/transcript.js";
import { resolveCodexSessionPathByThreadId } from "../../../domains/providers/search.js";
import {
  envelope,
  type QueryMap,
  withSchemaVersion,
} from "../../../lib/utils.js";
import { threadIdSchema } from "./schemas.js";

function firstQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}

function clampTranscriptLimit(value: string | string[] | undefined): number {
  const parsed = Number(firstQueryValue(value).trim());
  if (!Number.isFinite(parsed)) return 300;
  return Math.max(1, Math.min(1000, Math.floor(parsed)));
}

export function registerThreadTranscriptRoutes(app: FastifyInstance): void {
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
        const parsedThreadId = threadIdSchema.safeParse(String(threadRaw ?? "").trim());
        if (!parsedThreadId.success) {
          return reply.code(400).send(envelope(null, parsedThreadId.error.message));
        }
        const threadId = parsedThreadId.data;
        const filePath = await resolveCodexSessionPathByThreadId(threadId);
        if (!filePath) {
          return reply
            .code(404)
            .send(envelope(null, "thread session file not found"));
        }
        const data = await buildSessionTranscript(
          "codex",
          filePath,
          clampTranscriptLimit(limitRaw),
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
