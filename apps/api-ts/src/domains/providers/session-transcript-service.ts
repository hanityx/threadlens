import { findProviderCapability } from "@threadlens/shared-contracts";
import type { ProviderId, TranscriptPayload } from "./types.js";
import { resolveAllowedProviderFilePath } from "./path-safety.js";
import { buildSessionTranscript } from "./transcript.js";
import { pathExists } from "../../lib/utils.js";

export type ProviderSessionTranscriptServiceResult =
  | {
      ok: true;
      data: TranscriptPayload;
    }
  | {
      ok: false;
      statusCode: 400 | 404;
      message: string;
    };

export async function getProviderSessionTranscript(
  provider: ProviderId,
  filePath: string,
  limit?: number,
): Promise<ProviderSessionTranscriptServiceResult> {
  if (findProviderCapability(provider)?.read_transcript !== true) {
    return {
      ok: false,
      statusCode: 400,
      message: "provider does not support transcript reads",
    };
  }

  const safeFilePath = await resolveAllowedProviderFilePath(provider, filePath);
  if (!safeFilePath) {
    return {
      ok: false,
      statusCode: 400,
      message: "file_path outside provider roots",
    };
  }

  const exists = await pathExists(safeFilePath);
  if (!exists) {
    return {
      ok: false,
      statusCode: 404,
      message: "session file not found",
    };
  }

  return {
    ok: true,
    data: await buildSessionTranscript(provider, safeFilePath, Number(limit) || 300),
  };
}
