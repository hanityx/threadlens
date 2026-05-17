import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { BACKUP_ROOT } from "./constants.js";
import { walkFiles } from "../../lib/utils.js";

export type RecoveryBackupSet = {
  backup_id: string;
  path: string;
  file_count: number;
  total_bytes: number;
  latest_mtime: string;
  sample_files: string[];
};

type RecoveryBackupCandidate = {
  backup_id: string;
  path: string;
  rank: number;
  mtime_ms: number;
};

export function isCleanupBackupId(name: string): boolean {
  return /^\d{8}T\d{6}Z$/.test(String(name || "").trim());
}

async function listBackupCandidates(
  options?: { backupRoot?: string },
): Promise<RecoveryBackupCandidate[]> {
  const backupRoot = options?.backupRoot ?? BACKUP_ROOT;
  const entries = await readdir(backupRoot, { withFileTypes: true }).catch(
    () => [],
  );
  const out: RecoveryBackupCandidate[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const backupId = entry.name;
    const fullPath = path.join(backupRoot, backupId);
    const dirStat = await stat(fullPath).catch(() => null);
    const dirMtimeMs = Number(dirStat?.mtimeMs ?? 0);

    if (isCleanupBackupId(backupId)) {
      out.push({
        backup_id: backupId,
        path: fullPath,
        rank: 0,
        mtime_ms: dirMtimeMs,
      });
      continue;
    }

    if (backupId !== "provider_actions") {
      out.push({
        backup_id: backupId,
        path: fullPath,
        rank: 2,
        mtime_ms: dirMtimeMs,
      });
      continue;
    }

    // Provider action archives are nested: provider_actions/<provider>/<timestamp>.
    const providers = await readdir(fullPath, { withFileTypes: true }).catch(
      () => [],
    );
    for (const providerEntry of providers) {
      if (!providerEntry.isDirectory()) continue;
      const providerDir = path.join(fullPath, providerEntry.name);
      const runs = await readdir(providerDir, { withFileTypes: true }).catch(
        () => [],
      );
      for (const runEntry of runs) {
        if (!runEntry.isDirectory()) continue;
        const runDir = path.join(providerDir, runEntry.name);
        const runStat = await stat(runDir).catch(() => null);
        out.push({
          backup_id: `provider_actions/${providerEntry.name}/${runEntry.name}`,
          path: runDir,
          rank: 1,
          mtime_ms: Number(runStat?.mtimeMs ?? dirMtimeMs),
        });
      }
    }
  }

  return out;
}

export async function scanBackupSets(
  limit = 20,
  options?: { backupRoot?: string },
): Promise<RecoveryBackupSet[]> {
  try {
    const candidates = await listBackupCandidates(options);
    const dirs = candidates
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.mtime_ms !== b.mtime_ms) return b.mtime_ms - a.mtime_ms;
        return b.backup_id.localeCompare(a.backup_id);
      })
      .slice(0, Math.max(1, limit));

    const result: RecoveryBackupSet[] = [];
    for (const candidate of dirs) {
      const root = candidate.path;
      const files = await walkFiles(root, 20_000);
      let totalBytes = 0;
      let latestMtime = 0;
      for (const file of files) {
        try {
          const st = await stat(file);
          totalBytes += Number(st.size);
          latestMtime = Math.max(latestMtime, Number(st.mtimeMs));
        } catch {
          // no-op
        }
      }
      result.push({
        backup_id: candidate.backup_id,
        path: root,
        file_count: files.length,
        total_bytes: totalBytes,
        latest_mtime: latestMtime ? new Date(latestMtime).toISOString() : "",
        sample_files: files.slice(0, 20),
      });
    }
    return result;
  } catch {
    return [];
  }
}
