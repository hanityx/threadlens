import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("claude rename reflection", () => {
  const originalHome = process.env.HOME;
  const originalProjectRoot = process.env.THREADLENS_PROJECT_ROOT;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "threadlens-claude-rename-"),
    );
    const claudeProjectsDir = path.join(tempRoot, ".claude", "projects", "-Users-hwan");
    await mkdir(claudeProjectsDir, { recursive: true });
    await writeFile(
      path.join(claudeProjectsDir, "test-session.jsonl"),
      [
        JSON.stringify({
          type: "user",
          message: { role: "user", content: "old fallback title" },
          sessionId: "test-session",
          timestamp: "2026-04-01T00:00:00.000Z",
        }),
        JSON.stringify({
          type: "custom-title",
          customTitle: "Claude renamed title from tail",
          sessionId: "test-session",
        }),
      ].join("\n") + "\n",
      "utf-8",
    );
    process.env.HOME = tempRoot;
    process.env.THREADLENS_PROJECT_ROOT = path.join(tempRoot, "project-root");
    vi.resetModules();
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalProjectRoot === undefined) {
      delete process.env.THREADLENS_PROJECT_ROOT;
    } else {
      process.env.THREADLENS_PROJECT_ROOT = originalProjectRoot;
    }
    vi.resetModules();
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("prefers claude custom-title metadata over fallback title", async () => {
    const { getProviderSessionsTs } = await import("./search.js");
    const refreshed = await getProviderSessionsTs("claude", 20, {
      forceRefresh: true,
    });

    expect(refreshed.rows[0]?.display_title).toBe(
      "Claude renamed title from tail",
    );
    expect(refreshed.rows[0]?.probe.title_source).toBe("claude-custom-title");
  });
});
