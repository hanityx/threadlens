import { z } from "zod";
import type { ProviderId } from "../../../domains/providers/types.js";
import {
  listProviderActionProviderIds,
  listSessionReadableProviderIds,
} from "../../../domains/providers/capabilities.js";

const providerActionIdTuple = listProviderActionProviderIds() as [
  ProviderId,
  ...ProviderId[],
];
const sessionReadableProviderIdTuple = listSessionReadableProviderIds() as [
  ProviderId,
  ...ProviderId[],
];

export const providerSessionActionSchema = z.object({
  provider: z.enum(providerActionIdTuple),
  action: z.enum(["backup_local", "archive_local", "unarchive_local", "delete_local"]),
  file_paths: z.array(z.string().min(1)).min(1).max(500),
  dry_run: z.boolean().optional().default(true),
  confirm_token: z.string().optional().default(""),
  backup_before_delete: z.boolean().optional().default(false),
  backup_root: z.string().optional().default(""),
});

export const providerOpenFolderSchema = z.object({
  provider: z.enum(sessionReadableProviderIdTuple),
  file_path: z.string().min(1),
});
