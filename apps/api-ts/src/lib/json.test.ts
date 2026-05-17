import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonFile, safeJsonParse } from "./json.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("json helpers", () => {
  it("returns null for invalid JSON strings", () => {
    expect(safeJsonParse("{")).toBeNull();
    expect(safeJsonParse("{\"ok\":true}")).toEqual({ ok: true });
  });

  it("reads JSON files and falls back to an empty object on failure", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "threadlens-json-test-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "data.json");
    await writeFile(filePath, JSON.stringify({ ok: true }), "utf8");

    await expect(readJsonFile(filePath)).resolves.toEqual({ ok: true });
    await expect(readJsonFile(path.join(dir, "missing.json"))).resolves.toEqual({});
  });
});
