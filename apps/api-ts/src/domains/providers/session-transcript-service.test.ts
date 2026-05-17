import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tmpDirs: string[] = [];
const originalCodexHome = process.env.CODEX_HOME;

afterEach(async () => {
  process.env.CODEX_HOME = originalCodexHome;
  vi.resetModules();
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function setupCodexSessionFixture() {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "threadlens-codex-home-"));
  tmpDirs.push(codexHome);
  process.env.CODEX_HOME = codexHome;
  vi.resetModules();
  const sessionsDir = path.join(codexHome, "sessions");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(sessionsDir, { recursive: true }));
  const filePath = path.join(sessionsDir, "session.jsonl");
  await writeFile(
    filePath,
    JSON.stringify({
      timestamp: "2026-05-01T00:00:00.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "hello transcript" }],
      },
    }),
    "utf8",
  );
  const service = await import("./session-transcript-service.js");
  return { filePath, service };
}

describe("getProviderSessionTranscript", () => {
  it("loads an allowed provider transcript", async () => {
    const { filePath, service } = await setupCodexSessionFixture();

    const result = await service.getProviderSessionTranscript("codex", filePath, 50);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.file_path).toBe(await realpath(filePath));
    expect(result.data.messages[0]?.text).toBe("hello transcript");
  });

  it("fails closed for a path outside provider roots", async () => {
    const { service } = await setupCodexSessionFixture();
    const outsideDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-outside-"));
    tmpDirs.push(outsideDir);
    const outsideFile = path.join(outsideDir, "session.jsonl");
    await writeFile(outsideFile, "{}", "utf8");

    const result = await service.getProviderSessionTranscript("codex", outsideFile, 50);

    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      message: "file_path outside provider roots",
    });
  });

  it("fails closed for unknown provider ids at the capability gate", async () => {
    const { filePath, service } = await setupCodexSessionFixture();

    const result = await service.getProviderSessionTranscript(
      "unknown" as Parameters<typeof service.getProviderSessionTranscript>[0],
      filePath,
      50,
    );

    expect(result).toEqual({
      ok: false,
      statusCode: 400,
      message: "provider does not support transcript reads",
    });
  });
});
