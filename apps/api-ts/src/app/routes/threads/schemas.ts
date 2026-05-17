import { z } from "zod";
import { parseSafeThreadId } from "../../../domains/threads/thread-id.js";
import { isRecord } from "../../../lib/utils.js";

export const threadIdSchema = z.string().min(1).refine((value) => parseSafeThreadId(value) !== null, {
  message: "invalid thread id",
});

export const bulkThreadActionPayloadSchema = z.object({
  action: z.enum(["pin", "unpin", "archive_local", "unarchive_local", "resume_command"]),
  thread_ids: z.array(threadIdSchema).min(1).max(500),
});

export const idsPayloadSchema = z.object({
  ids: z.array(threadIdSchema).min(1).max(500),
});

export const analyzeDeletePayloadSchema = z.object({
  ids: z.array(threadIdSchema).min(1).max(500),
  session_scan_limit: z.number().int().min(1).max(240).optional(),
});

export const pinPayloadSchema = z.object({
  ids: z.array(threadIdSchema).min(1).max(500),
  pinned: z.boolean().optional().default(true),
});

export const cleanupPayloadSchema = z
  .object({
    ids: z.array(threadIdSchema).min(1).max(500),
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

export const renameThreadSchema = z.object({
  id: threadIdSchema,
  title: z.string().min(1),
});

export const threadOpenFolderSchema = z.object({
  thread_id: threadIdSchema,
});

export const threadForensicsSchema = z.object({
  ids: z.array(threadIdSchema).optional(),
  thread_ids: z.array(threadIdSchema).optional(),
});
