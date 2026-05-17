import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  matchesPattern,
  pathExists,
  readFileHead,
  readFileTail,
  readHeadLines,
  scanPathStatsTs,
  walkFiles,
  walkFilesByExt,
} from "./fs.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function makeTempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "threadlens-fs-test-"));
  tempDirs.push(dir);
  return dir;
}

describe("filesystem helpers", () => {
  it("checks paths using stat semantics", async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, "file.txt");
    await writeFile(filePath, "hello", "utf8");

    await expect(pathExists(filePath)).resolves.toBe(true);
    await expect(pathExists(path.join(dir, "missing.txt"))).resolves.toBe(false);
  });

  it("reads file heads, tails, and head lines", async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, "file.txt");
    await writeFile(filePath, "one\ntwo\nthree\n", "utf8");

    await expect(readFileHead(filePath, 3)).resolves.toBe("one");
    await expect(readHeadLines(filePath, 2)).resolves.toEqual(["one", "two"]);
    await expect(readFileTail(filePath, 5)).resolves.toEqual({
      text: "hree\n",
      truncated: true,
    });
  });

  it("walks files and filters by extension", async () => {
    const dir = await makeTempDir();
    await mkdir(path.join(dir, "nested"));
    await writeFile(path.join(dir, "a.jsonl"), "{}", "utf8");
    await writeFile(path.join(dir, "nested", "b.txt"), "text", "utf8");

    const allFiles = await walkFiles(dir);
    expect(allFiles.map((filePath) => path.basename(filePath)).sort()).toEqual([
      "a.jsonl",
      "b.txt",
    ]);
    await expect(walkFilesByExt(dir, [".jsonl"])).resolves.toEqual([
      path.join(dir, "a.jsonl"),
    ]);
  });

  it("scans path stats with simple glob patterns", async () => {
    const dir = await makeTempDir();
    await mkdir(path.join(dir, "nested"));
    await writeFile(path.join(dir, "a.jsonl"), "1234", "utf8");
    await writeFile(path.join(dir, "nested", "b.txt"), "text", "utf8");

    expect(matchesPattern("a.jsonl", "*.jsonl")).toBe(true);
    const stats = await scanPathStatsTs(dir, true, "*.jsonl");
    expect(stats).toMatchObject({
      exists: true,
      file_count: 1,
      dir_count: 1,
      total_bytes: 4,
    });
    expect(stats.latest_mtime).toBeTruthy();
  });
});
