import { stat } from "node:fs/promises";
import type {
  ProviderId,
} from "../types.js";

export type ProviderActionSkippedTarget = {
  file_path: string;
  reason: string;
};

export type ProviderActionPathResolver = (
  provider: ProviderId,
  filePath: string,
) => Promise<string | null>;

export function normalizeProviderActionTargetPaths(filePaths: string[]): string[] {
  return Array.from(
    new Set(filePaths.map((item) => String(item || "").trim()).filter(Boolean)),
  );
}

export async function resolveProviderActionTargets(
  provider: ProviderId,
  uniquePaths: string[],
  resolveAllowedProviderFilePath: ProviderActionPathResolver,
): Promise<{
  skipped: ProviderActionSkippedTarget[];
  valid: string[];
}> {
  const skipped: ProviderActionSkippedTarget[] = [];
  const valid: string[] = [];

  for (const candidate of uniquePaths) {
    const safePath = await resolveAllowedProviderFilePath(provider, candidate);
    if (!safePath) {
      skipped.push({
        file_path: candidate,
        reason: "outside-provider-root-extension-or-realpath",
      });
      continue;
    }
    try {
      const st = await stat(safePath);
      if (!st.isFile()) {
        skipped.push({ file_path: candidate, reason: "not-a-file" });
        continue;
      }
      valid.push(safePath);
    } catch {
      skipped.push({ file_path: candidate, reason: "not-found" });
    }
  }

  return { skipped, valid };
}
