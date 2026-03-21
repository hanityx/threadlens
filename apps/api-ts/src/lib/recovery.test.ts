import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { exportRecoveryBackupsTs, getLatestSmokeStatusTs } from "./recovery";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "po-smoke-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("getLatestSmokeStatusTs", () => {
  it("falls back to raw perf/forensics reports when summary is missing", async () => {
    await withTempDir(async (rootDir) => {
      const perfDir = path.join(rootDir, ".run", "perf");
      const forensicsDir = path.join(rootDir, ".run", "forensics");
      const summaryDir = path.join(rootDir, ".run", "smoke-missing");
      await mkdir(perfDir, { recursive: true });
      await mkdir(forensicsDir, { recursive: true });

      await writeFile(
        path.join(perfDir, "perf-smoke-20260304T224500Z.json"),
        JSON.stringify({
          ok: true,
          metrics: [
            { key: "agent_runtime", time_total: 0.12 },
            { key: "provider_sessions_30", time_total: 0.33 },
            { key: "threads_60", time_total: 0.01 },
            { key: "threads_160", time_total: 0.02 },
          ],
        }),
      );
      await writeFile(
        path.join(forensicsDir, "forensics-smoke-20260304T224500Z.json"),
        JSON.stringify({
          result: "PASS",
          metrics: {
            analyze_delete: { status: 200 },
            local_cleanup: { status: 200, confirm_token_valid: true },
          },
        }),
      );

      const data = await getLatestSmokeStatusTs({
        roots: {
          summary_dir_abs: summaryDir,
          summary_dir_rel: ".run/smoke",
          perf_dir_abs: perfDir,
          perf_dir_rel: ".run/perf",
          forensics_dir_abs: forensicsDir,
          forensics_dir_rel: ".run/forensics",
        },
      });

      expect(data.latest.status).toBe("pass");
      expect(data.latest.result).toBe("PASS");
      expect(data.latest.sources.perf_report).toBe(
        ".run/perf/perf-smoke-20260304T224500Z.json",
      );
      expect(data.latest.sources.forensics_report).toBe(
        ".run/forensics/forensics-smoke-20260304T224500Z.json",
      );
      expect(data.latest.perf.agent_runtime_sec).toBe(0.12);
      expect(data.latest.forensics.analyze_status).toBe(200);
      expect(data.latest.forensics.cleanup_token_valid).toBe(true);
      expect(Array.isArray(data.history)).toBe(true);
      expect(data.history.length).toBe(0);
    });
  });

  it("uses smoke-summary when summary artifact exists", async () => {
    await withTempDir(async (rootDir) => {
      const summaryDir = path.join(rootDir, ".run", "smoke");
      const perfDir = path.join(rootDir, ".run", "perf");
      const forensicsDir = path.join(rootDir, ".run", "forensics");
      await mkdir(summaryDir, { recursive: true });
      await mkdir(perfDir, { recursive: true });
      await mkdir(forensicsDir, { recursive: true });

      await writeFile(
        path.join(summaryDir, "smoke-summary-20260304T230000Z.json"),
        JSON.stringify({
          timestamp_utc: "20260304T230000Z",
          result: "FAIL",
          ok: false,
          sources: {
            perf_report: ".run/perf/perf-smoke-20260304T230000Z.json",
            forensics_report: ".run/forensics/forensics-smoke-20260304T230000Z.json",
          },
          perf: {
            ok: false,
            agent_runtime_sec: 0.2,
          },
          forensics: {
            result: "FAIL",
            analyze_status: 500,
            cleanup_status: 500,
            cleanup_token_valid: false,
          },
        }),
      );

      const data = await getLatestSmokeStatusTs({
        roots: {
          summary_dir_abs: summaryDir,
          summary_dir_rel: ".run/smoke",
          perf_dir_abs: perfDir,
          perf_dir_rel: ".run/perf",
          forensics_dir_abs: forensicsDir,
          forensics_dir_rel: ".run/forensics",
        },
      });

      expect(data.latest.status).toBe("fail");
      expect(data.latest.result).toBe("FAIL");
      expect(data.latest.path).toBe(".run/smoke/smoke-summary-20260304T230000Z.json");
      expect(data.latest.sources.perf_report).toBe(
        ".run/perf/perf-smoke-20260304T230000Z.json",
      );
      expect(data.history.length).toBe(1);
    });
  });

  it("returns missing when no smoke artifacts exist", async () => {
    await withTempDir(async (rootDir) => {
      const data = await getLatestSmokeStatusTs({
        roots: {
          summary_dir_abs: path.join(rootDir, ".run", "smoke"),
          summary_dir_rel: ".run/smoke",
          perf_dir_abs: path.join(rootDir, ".run", "perf"),
          perf_dir_rel: ".run/perf",
          forensics_dir_abs: path.join(rootDir, ".run", "forensics"),
          forensics_dir_rel: ".run/forensics",
        },
      });
      expect(data.latest.status).toBe("missing");
      expect(data.latest.result).toBe("MISSING");
      expect(data.history.length).toBe(0);
    });
  });
});

describe("exportRecoveryBackupsTs", () => {
  it("exports all backup sets when no ids are provided", async () => {
    await withTempDir(async (rootDir) => {
      const backupRoot = path.join(rootDir, "backups");
      const exportRoot = path.join(rootDir, "exports");
      const cleanupBackup = path.join(backupRoot, "20260304T224500Z");
      const providerBackup = path.join(
        backupRoot,
        "provider_actions",
        "codex",
        "20260305T010101Z",
      );
      await mkdir(cleanupBackup, { recursive: true });
      await mkdir(providerBackup, { recursive: true });
      await mkdir(path.join(cleanupBackup, "Users", "developer"), { recursive: true });
      await mkdir(path.join(providerBackup, "Users", "developer"), { recursive: true });
      await writeFile(path.join(cleanupBackup, "Users", "developer", "a.txt"), "alpha", "utf-8");
      await writeFile(path.join(providerBackup, "Users", "developer", "b.txt"), "beta", "utf-8");

      const result = await exportRecoveryBackupsTs({
        roots: { backup_root: backupRoot, export_root: exportRoot },
        archiveWriter: async (_sourceDir, archivePath) => {
          await writeFile(archivePath, "fake-zip", "utf-8");
        },
      });

      expect(result.ok).toBe(true);
      expect(result.exported_count).toBe(2);
      expect(result.selected_backup_ids).toContain("20260304T224500Z");
      expect(result.selected_backup_ids).toContain(
        "provider_actions/codex/20260305T010101Z",
      );
      const archiveStat = await stat(String(result.archive_path));
      expect(archiveStat.isFile()).toBe(true);
      const manifest = JSON.parse(
        await readFile(String(result.manifest_path), "utf-8"),
      ) as { exported_count: number };
      expect(manifest.exported_count).toBe(2);
    });
  });

  it("exports only selected backup ids and reports missing ids", async () => {
    await withTempDir(async (rootDir) => {
      const backupRoot = path.join(rootDir, "backups");
      const exportRoot = path.join(rootDir, "exports");
      const cleanupBackup = path.join(backupRoot, "20260304T224500Z");
      const providerBackup = path.join(
        backupRoot,
        "provider_actions",
        "claude",
        "20260305T020202Z",
      );
      await mkdir(cleanupBackup, { recursive: true });
      await mkdir(providerBackup, { recursive: true });
      await mkdir(path.join(cleanupBackup, "Users", "developer"), { recursive: true });
      await mkdir(path.join(providerBackup, "Users", "developer"), { recursive: true });
      await writeFile(path.join(cleanupBackup, "Users", "developer", "one.txt"), "one", "utf-8");
      await writeFile(path.join(providerBackup, "Users", "developer", "two.txt"), "two", "utf-8");

      const result = await exportRecoveryBackupsTs({
        backup_ids: [
          "provider_actions/claude/20260305T020202Z",
          "missing-backup-id",
        ],
        roots: { backup_root: backupRoot, export_root: exportRoot },
        archiveWriter: async (_sourceDir, archivePath) => {
          await writeFile(archivePath, "fake-zip", "utf-8");
        },
      });

      expect(result.ok).toBe(true);
      expect(result.exported_count).toBe(1);
      expect(result.selected_backup_ids).toEqual([
        "provider_actions/claude/20260305T020202Z",
      ]);
      expect(result.missing_backup_ids).toEqual(["missing-backup-id"]);
    });
  });
});
