import {
  open,
  readdir,
  stat,
} from "node:fs/promises";
import path from "node:path";

export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function readFileHead(
  filePath: string,
  maxBytes = 8192,
): Promise<string> {
  let fh: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fh = await open(filePath, "r");
    const buf = Buffer.alloc(maxBytes);
    const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
    return buf.subarray(0, bytesRead).toString("utf-8");
  } catch {
    return "";
  } finally {
    if (fh) await fh.close();
  }
}

export async function readHeadLines(
  filePath: string,
  maxLines = 5,
): Promise<string[]> {
  const text = await readFileHead(filePath, 8192);
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .slice(0, Math.max(0, maxLines));
}

export async function readFileTail(
  filePath: string,
  maxBytes = 2_097_152,
): Promise<{ text: string; truncated: boolean }> {
  let fh: Awaited<ReturnType<typeof open>> | null = null;
  try {
    const st = await stat(filePath);
    const size = Number(st.size);
    if (!Number.isFinite(size) || size <= 0)
      return { text: "", truncated: false };
    const readBytes = Math.max(1, Math.min(maxBytes, size));
    const start = Math.max(0, size - readBytes);
    fh = await open(filePath, "r");
    const buf = Buffer.alloc(readBytes);
    const { bytesRead } = await fh.read(buf, 0, readBytes, start);
    return {
      text: buf.subarray(0, bytesRead).toString("utf-8"),
      truncated: start > 0,
    };
  } catch {
    return { text: "", truncated: false };
  } finally {
    if (fh) await fh.close();
  }
}

export async function walkFiles(
  root: string,
  maxItems = Number.MAX_SAFE_INTEGER,
): Promise<string[]> {
  const out: string[] = [];
  let stop = false;
  async function walk(dir: string): Promise<void> {
    if (stop) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (stop) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        out.push(full);
        if (out.length >= maxItems) {
          stop = true;
          return;
        }
      }
    }
  }
  await walk(root);
  return out;
}

export async function walkFilesByExt(
  root: string,
  exts: string[],
  maxItems = 1000,
): Promise<string[]> {
  const out: string[] = [];
  const extSet = new Set(exts.map((x) => x.toLowerCase()));
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        if (extSet.has(path.extname(entry.name).toLowerCase())) {
          out.push(full);
          if (out.length >= maxItems) return;
        }
      }
      if (out.length >= maxItems) return;
    }
  }
  try {
    await walk(root);
  } catch {
    return out;
  }
  return out;
}

export async function countDirsWithPrefix(
  root: string,
  prefix: string,
): Promise<number> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter(
      (entry) => entry.isDirectory() && entry.name.startsWith(prefix),
    ).length;
  } catch {
    return 0;
  }
}

export async function quickFileCount(root: string): Promise<number> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.length;
  } catch {
    return 0;
  }
}

export async function countJsonlFilesRecursive(
  root: string,
  limit = 5000,
): Promise<number> {
  let count = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        count += 1;
      }
      if (count >= limit) return;
    }
  }
  try {
    await walk(root);
  } catch {
    return count;
  }
  return count;
}

export async function countFilesRecursiveByExt(
  root: string,
  exts: string[],
  limit = 5000,
): Promise<number> {
  let count = 0;
  const extSet = new Set(exts.map((ext) => String(ext || "").toLowerCase()));
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extSet.has(ext)) count += 1;
      }
      if (count >= limit) return;
    }
  }
  try {
    await walk(root);
  } catch {
    return count;
  }
  return count;
}

export function matchesPattern(fileName: string, pattern: string): boolean {
  if (!pattern || pattern === "*") return true;
  if (pattern.startsWith("*.")) {
    return fileName.endsWith(pattern.slice(1));
  }
  return fileName === pattern;
}

export async function scanPathStatsTs(
  targetPath: string,
  recursive = true,
  filePattern = "*",
) {
  const out = {
    path: targetPath,
    exists: false,
    file_count: 0,
    dir_count: 0,
    total_bytes: 0,
    latest_mtime: "",
  };

  if (!(await pathExists(targetPath))) return out;
  out.exists = true;

  const st = await stat(targetPath);
  if (st.isFile()) {
    out.file_count = 1;
    out.total_bytes = Number(st.size);
    out.latest_mtime = new Date(Number(st.mtimeMs)).toISOString();
    return out;
  }

  let latestMtime = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.dir_count += 1;
        if (recursive) await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!matchesPattern(entry.name, filePattern)) continue;
      try {
        const fs = await stat(full);
        out.file_count += 1;
        out.total_bytes += Number(fs.size);
        latestMtime = Math.max(latestMtime, Number(fs.mtimeMs));
      } catch {
        // no-op
      }
    }
  }
  await walk(targetPath);
  out.latest_mtime = latestMtime ? new Date(latestMtime).toISOString() : "";
  return out;
}
