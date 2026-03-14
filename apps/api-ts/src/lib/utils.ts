/**
 * Shared utility functions used across multiple server modules.
 *
 * Pure/stateless helpers only — no module-level caches live here.
 * Depends on `./constants.js` only.
 */

import { execSync } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  open,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ApiEnvelope,
  SCHEMA_VERSION,
} from "@codex/shared-contracts";
import { PYTHON_BACKEND_URL } from "./constants.js";

/* ── Types ────────────────────────────────────────────────────────── */

export type QueryMap = Record<string, string | string[] | undefined>;

/* ── Zod schemas ──────────────────────────────────────────────────── */

export const bulkRequestSchema = z.object({
  action: z.enum(["pin", "unpin", "archive_local", "resume_command"]),
  thread_ids: z.array(z.string().min(1)).min(1).max(500),
});

/* ── API envelope ─────────────────────────────────────────────────── */

export function envelope<T>(
  data: T | null,
  error: string | null = null,
): ApiEnvelope<T> {
  return {
    ok: !error,
    schema_version: SCHEMA_VERSION,
    data,
    error,
  };
}

export function withSchemaVersion(payload: unknown): unknown {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (!record.schema_version) {
      return { ...record, schema_version: SCHEMA_VERSION };
    }
    return payload;
  }
  return envelope(payload, null);
}

/* ── HTTP / fetch ─────────────────────────────────────────────────── */

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 2500,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function buildProxyUrl(
  pathname: string,
  query?: Record<string, string | string[] | undefined>,
): string {
  const url = new URL(pathname, PYTHON_BACKEND_URL);
  if (!query) return url.toString();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, v));
    } else if (value !== undefined) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

export async function requestPythonJson(
  pathname: string,
  method: "GET" | "POST",
  options: {
    query?: QueryMap;
    body?: unknown;
    timeoutMs?: number;
  } = {},
): Promise<{ status: number; payload: unknown }> {
  const url = buildProxyUrl(pathname, options.query);
  const headers: Record<string, string> = { accept: "application/json" };
  let body: string | undefined;
  if (method === "POST") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body ?? {});
  }

  const res = await fetchWithTimeout(
    url,
    {
      method,
      headers,
      body,
    },
    options.timeoutMs ?? 12000,
  );
  const text = await res.text();
  const parsed = safeJsonParse(text);
  return {
    status: res.status,
    payload: withSchemaVersion(parsed ?? text),
  };
}

/* ── JSON ─────────────────────────────────────────────────────────── */

export function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/* ── Primitives / guards ──────────────────────────────────────────── */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function nowIsoUtc(): string {
  return new Date().toISOString();
}

export function cleanTitleText(text: string, maxLen = 280): string {
  const t = String(text || "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

export function parseNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseQueryString(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}

export function parseQueryNumber(
  value: string | string[] | undefined,
  fallback: number,
): number {
  const n = Number(parseQueryString(value));
  return Number.isFinite(n) ? n : fallback;
}

export function canonicalizeQuery(query?: QueryMap): string {
  if (!query) return "";
  const keys = Object.keys(query).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const value = query[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      [...value].sort().forEach((item) => {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
      });
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.join("&");
}

/* ── Shell / process ──────────────────────────────────────────────── */

export function runCmdText(command: string, timeout = 4000): string {
  try {
    const out = execSync(command, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout,
      shell: "/bin/zsh",
    });
    return String(out || "").trim();
  } catch {
    return "";
  }
}

export function getTmuxSessions(): string[] {
  const out = runCmdText("tmux ls -F '#S'", 700);
  if (!out) return [];
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/* ── Filesystem ───────────────────────────────────────────────────── */

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

/* ── Counting / stats ─────────────────────────────────────────────── */

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
