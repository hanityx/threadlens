import { z } from "zod";

export const bulkRequestSchema = z.object({
  action: z.enum(["pin", "unpin", "archive_local", "unarchive_local", "resume_command"]),
  thread_ids: z.array(z.string().min(1)).min(1).max(500),
});
