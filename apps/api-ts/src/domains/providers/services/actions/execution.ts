import path from "node:path";
import { copyFile, mkdir, stat, unlink } from "node:fs/promises";

import {
  resolveArchivedSessionRestoreTarget,
  resolveArchivedSessionRoot,
  resolveArchivedSessionStoreTarget,
} from "./archives.js";
import type {
  ProviderId,
} from "../../types.js";

export type ProviderActionExecutionFailure = {
  file_path: string;
  step: string;
  error: string;
};

export async function runArchiveProviderAction(
  provider: ProviderId,
  valid: string[],
): Promise<{
  applied: number;
  archivedTo: string | null;
  failed: ProviderActionExecutionFailure[];
}> {
  let applied = 0;
  const failed: ProviderActionExecutionFailure[] = [];
  const archivedTo = resolveArchivedSessionRoot(provider);
  for (const sourcePath of valid) {
    const targetPath = await resolveArchivedSessionStoreTarget(provider, sourcePath);
    if (!targetPath) {
      failed.push({
        file_path: sourcePath,
        step: "archive_local",
        error: "no-archived-session-target",
      });
      continue;
    }
    try {
      await stat(targetPath);
      failed.push({
        file_path: sourcePath,
        step: "archive_local",
        error: "target-already-exists",
      });
      continue;
    } catch {
      // Missing target is expected before archive.
    }
    try {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
      await unlink(sourcePath);
      applied += 1;
    } catch (error) {
      failed.push({
        file_path: sourcePath,
        step: "archive_local",
        error: String(error),
      });
    }
  }
  return { applied, archivedTo, failed };
}

export async function runUnarchiveProviderAction(
  provider: ProviderId,
  valid: string[],
): Promise<{
  applied: number;
  failed: ProviderActionExecutionFailure[];
}> {
  let applied = 0;
  const failed: ProviderActionExecutionFailure[] = [];
  for (const sourcePath of valid) {
    const targetPath = await resolveArchivedSessionRestoreTarget(provider, sourcePath);
    if (!targetPath) {
      failed.push({
        file_path: sourcePath,
        step: "unarchive_local",
        error: "not-an-archived-session",
      });
      continue;
    }
    try {
      await stat(targetPath);
      failed.push({
        file_path: sourcePath,
        step: "unarchive_local",
        error: "target-already-exists",
      });
      continue;
    } catch {
      // Missing target is expected before restore.
    }
    try {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
      await unlink(sourcePath);
      applied += 1;
    } catch (error) {
      failed.push({
        file_path: sourcePath,
        step: "unarchive_local",
        error: String(error),
      });
    }
  }
  return { applied, failed };
}

export async function runDeleteProviderAction(
  deleteTargets: string[],
): Promise<{
  applied: number;
  failed: ProviderActionExecutionFailure[];
}> {
  let applied = 0;
  const failed: ProviderActionExecutionFailure[] = [];
  for (const sourcePath of deleteTargets) {
    try {
      await unlink(sourcePath);
      applied += 1;
    } catch (error) {
      failed.push({
        file_path: sourcePath,
        step: "delete_local",
        error: String(error),
      });
    }
  }
  return { applied, failed };
}
