import { createReadStream } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { CHAT_DIR } from "../../lib/constants.js";
import { isRecord, pathExists } from "../../lib/utils.js";
import { resolveCodexSessionPathByThreadId } from "../providers/search.js";
import { normalizeSafeThreadIds, resolveThreadCacheFile } from "./thread-id.js";

export type ThreadSessionMeta = {
  has_session_log: boolean;
  cwd: string;
};

export type LocalRefData = {
  has_local_data: boolean;
  project_buckets: Set<string>;
};

async function countProjectBucketFiles(bucketPath: string): Promise<number> {
  try {
    const children = await readdir(bucketPath, { withFileTypes: true });
    let total = 0;
    for (const child of children) {
      if (!child.isDirectory() || !child.name.startsWith("conversations-v3-")) continue;
      const convPath = path.join(bucketPath, child.name);
      const convFiles = await readdir(convPath, { withFileTypes: true }).catch(() => []);
      total += convFiles.filter((entry) => entry.isFile() && entry.name.endsWith(".data")).length;
    }
    return total;
  } catch {
    return 0;
  }
}

function extractSessionCwdFromLine(line: string): string {
  const parsed = JSON.parse(line);
  if (!isRecord(parsed)) return "";
  const type = String(parsed.type ?? "");
  if (type !== "session_meta" && type !== "turn_context") return "";
  const payload = isRecord(parsed.payload) ? parsed.payload : parsed;
  const cwd = String(
    payload.cwd ??
      payload.workspace_root ??
      payload.project_root ??
      payload["current-working-directory"] ??
      "",
  ).trim();
  return cwd;
}

async function readSessionMetaHeadLines(filePath: string, maxLines = 40): Promise<string[]> {
  const stream = createReadStream(filePath, { encoding: "utf-8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  const lines: string[] = [];
  try {
    for await (const line of reader) {
      const normalized = line.trimEnd();
      if (normalized) {
        lines.push(normalized);
      }
      if (lines.length >= maxLines) break;
    }
  } finally {
    reader.close();
    stream.destroy();
  }
  return lines;
}

export async function readCodexSessionMeta(filePath: string | null): Promise<ThreadSessionMeta> {
  const resolvedPath = String(filePath ?? "").trim();
  if (!resolvedPath) {
    return { has_session_log: false, cwd: "" };
  }
  if (!(await pathExists(resolvedPath))) {
    return { has_session_log: false, cwd: "" };
  }

  const lines = await readSessionMetaHeadLines(resolvedPath, 40);
  for (const line of lines) {
    try {
      const cwd = extractSessionCwdFromLine(line);
      if (cwd) {
        return { has_session_log: true, cwd };
      }
    } catch {
      // ignore malformed line and keep scanning
    }
  }

  return { has_session_log: true, cwd: "" };
}

export async function readCodexSessionMetaForThreadIdWithResolver(
  threadId: string,
  resolveSessionPath: (threadId: string) => Promise<string | null>,
): Promise<ThreadSessionMeta> {
  const filePath = await resolveSessionPath(threadId);
  return readCodexSessionMeta(filePath);
}

export async function readCodexSessionMetaForThreadId(
  threadId: string,
): Promise<ThreadSessionMeta> {
  return readCodexSessionMetaForThreadIdWithResolver(
    threadId,
    resolveCodexSessionPathByThreadId,
  );
}

export async function collectCodexLocalRefs(
  threadIds: string[],
  chatDir = CHAT_DIR,
): Promise<{
  refs: Map<string, LocalRefData>;
  bucketCounts: Map<string, number>;
}> {
  const { ids } = normalizeSafeThreadIds(threadIds);
  const refs = new Map<string, LocalRefData>();
  const bucketCounts = new Map<string, number>();
  for (const id of ids) {
    refs.set(id, { has_local_data: false, project_buckets: new Set<string>() });
  }

  try {
    const entries = await readdir(chatDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(chatDir, entry.name);
      if (entry.name.startsWith("conversations-v3-")) {
        for (const threadId of ids) {
          const hitPath = resolveThreadCacheFile(full, threadId);
          if (!hitPath) continue;
          if (await pathExists(hitPath)) {
            if (refs.get(threadId)) refs.get(threadId)!.has_local_data = true;
          }
        }
        continue;
      }
      if (!entry.name.startsWith("project-g-p-")) continue;
      const children = await readdir(full, { withFileTypes: true }).catch(() => []);
      let bucketTouched = false;
      for (const child of children) {
        if (!child.isDirectory() || !child.name.startsWith("conversations-v3-")) continue;
        for (const threadId of ids) {
          const hitPath = resolveThreadCacheFile(path.join(full, child.name), threadId);
          if (!hitPath) continue;
          if (await pathExists(hitPath)) {
            refs.get(threadId)!.has_local_data = true;
            refs.get(threadId)!.project_buckets.add(entry.name);
            bucketTouched = true;
          }
        }
      }
      if (bucketTouched && !bucketCounts.has(entry.name)) {
        bucketCounts.set(entry.name, await countProjectBucketFiles(full));
      }
    }
  } catch {
    return { refs, bucketCounts };
  }

  return { refs, bucketCounts };
}
