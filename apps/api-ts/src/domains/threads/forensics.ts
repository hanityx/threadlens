import { readdir } from "node:fs/promises";
import path from "node:path";
import { CHAT_DIR, CODEX_HOME } from "../../lib/constants.js";
import { pathExists, readHeadLines } from "../../lib/utils.js";
import { getOverviewTs } from "./overview.js";
import { analyzeDeleteImpactTs } from "./impact.js";

type ThreadArtifact = {
  kind: string;
  thread_id: string;
  path: string;
};

export async function findThreadArtifactsTs(
  threadIds: string[],
  options?: { chatDir?: string; codexHome?: string },
): Promise<ThreadArtifact[]> {
  const ids = Array.from(
    new Set(threadIds.map((item) => String(item || "").trim()).filter(Boolean)),
  );
  if (ids.length === 0) return [];
  const artifacts: ThreadArtifact[] = [];

  const chatDir = options?.chatDir ?? CHAT_DIR;
  const codexHome = options?.codexHome ?? CODEX_HOME;
  try {
    const entries = await readdir(chatDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(chatDir, entry.name);
      if (entry.name.startsWith("conversations-v3-")) {
        for (const threadId of ids) {
          const filePath = path.join(full, `${threadId}.data`);
          if (await pathExists(filePath)) {
            artifacts.push({ kind: "chat-cache", thread_id: threadId, path: filePath });
          }
        }
        continue;
      }
      if (!entry.name.startsWith("project-g-p-")) continue;
      const children = await readdir(full, { withFileTypes: true }).catch(() => []);
      for (const child of children) {
        if (!child.isDirectory() || !child.name.startsWith("conversations-v3-")) continue;
        const convPath = path.join(full, child.name);
        for (const threadId of ids) {
          const filePath = path.join(convPath, `${threadId}.data`);
          if (await pathExists(filePath)) {
            artifacts.push({ kind: "project-cache", thread_id: threadId, path: filePath });
          }
        }
      }
    }
  } catch {
    // ignore local cache scan errors
  }

  for (const root of [path.join(codexHome, "sessions"), path.join(codexHome, "archived_sessions")]) {
    let files: string[] = [];
    try {
      files = await collectJsonlFiles(root);
    } catch {
      files = [];
    }
    for (const filePath of files) {
      const base = path.basename(filePath);
      for (const threadId of ids) {
        if (!base.includes(threadId)) continue;
        artifacts.push({
          kind: root.endsWith("archived_sessions") ? "archived-session-log" : "session-log",
          thread_id: threadId,
          path: filePath,
        });
      }
    }
  }

  return artifacts;
}

async function collectJsonlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        out.push(full);
      }
    }
  };
  await walk(root);
  return out;
}

export async function getThreadForensicsTs(threadIds: string[]) {
  const ids = Array.from(
    new Set(threadIds.map((item) => String(item || "").trim()).filter(Boolean)),
  );
  if (ids.length === 0) {
    return {
      generated_at: new Date().toISOString(),
      count: 0,
      reports: [],
    };
  }

  const overview = await getOverviewTs({ includeThreads: true });
  const threads = Array.isArray((overview as Record<string, unknown>).threads)
    ? ((overview as Record<string, unknown>).threads as Array<Record<string, unknown>>)
    : [];
  const threadEntries: Array<[string, Record<string, unknown>]> = threads
    .map((row) => [String(row.id ?? row.thread_id ?? ""), row] as [string, Record<string, unknown>])
    .filter(([id]) => Boolean(id));
  const threadsById = new Map<string, Record<string, unknown>>(threadEntries);
  const impactData = await analyzeDeleteImpactTs(ids);
  const impactById = new Map(
    impactData.reports.map((row) => [row.id, row]),
  );
  const artifacts = await findThreadArtifactsTs(ids);
  const artifactsById = new Map<string, ThreadArtifact[]>();
  for (const artifact of artifacts) {
    const bucket = artifactsById.get(artifact.thread_id) ?? [];
    bucket.push(artifact);
    artifactsById.set(artifact.thread_id, bucket);
  }

  const reports = await Promise.all(
    ids.map(async (threadId) => {
      const overviewRow = threadsById.get(threadId);
      const impact = impactById.get(threadId);
      const threadArtifacts = artifactsById.get(threadId) ?? [];
      const artifact_count_by_kind: Record<string, number> = {};
      for (const artifact of threadArtifacts) {
        artifact_count_by_kind[artifact.kind] =
          (artifact_count_by_kind[artifact.kind] ?? 0) + 1;
      }
      let evidence_preview = { kind: "", path: "", lines: [] as string[] };
      for (const preferredKind of ["session-log", "archived-session-log"]) {
        const hit = threadArtifacts.find((artifact) => artifact.kind === preferredKind);
        if (!hit) continue;
        evidence_preview = {
          kind: hit.kind,
          path: hit.path,
          lines: await readHeadLines(hit.path, 5),
        };
        break;
      }
      return {
        id: threadId,
        overview_found: Boolean(overviewRow && Object.keys(overviewRow).length),
        title: String(overviewRow?.title ?? impact?.title ?? ""),
        title_source: String(overviewRow?.title_source ?? ""),
        cwd: String(overviewRow?.cwd ?? ""),
        impact,
        artifact_count: threadArtifacts.length,
        artifact_count_by_kind,
        artifact_paths_preview: threadArtifacts.slice(0, 8).map((artifact) => artifact.path),
        evidence_preview,
        summary: String(impact?.summary ?? "No analysis summary"),
      };
    }),
  );

  return {
    generated_at: new Date().toISOString(),
    count: ids.length,
    artifacts_total: artifacts.length,
    reports,
  };
}
