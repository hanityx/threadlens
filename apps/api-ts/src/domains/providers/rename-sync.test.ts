import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const THREAD_ID = "11111111-1111-1111-1111-111111111111";

describe("codex rename reflection on forced provider refresh", () => {
  const originalHome = process.env.HOME;
  const originalCodexHome = process.env.CODEX_HOME;
  const originalProjectRoot = process.env.THREADLENS_PROJECT_ROOT;
  const originalSearchCacheDir = process.env.THREADLENS_SEARCH_CACHE_DIR;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "threadlens-rename-sync-"));
    const codexHome = path.join(tempRoot, ".codex");
    const sessionsDir = path.join(codexHome, "sessions");
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(
      path.join(sessionsDir, `${THREAD_ID}.jsonl`),
      [
        "{\"type\":\"message\",\"role\":\"user\",\"content\":\"Can you help audit the release queue before the morning handoff?\"}",
        "{\"type\":\"message\",\"role\":\"assistant\",\"content\":\"Yes. I would start by checking the current queue, recent regressions, and any blocked deploy notes before deciding what should ship.\"}",
      ].join("\n"),
      "utf-8",
    );
    await writeFile(
      path.join(codexHome, ".codex-global-state.json"),
      JSON.stringify(
        {
          "thread-titles": {
            titles: {
              [THREAD_ID]: "Old renamed title",
            },
            order: [],
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    process.env.HOME = tempRoot;
    process.env.CODEX_HOME = codexHome;
    process.env.THREADLENS_PROJECT_ROOT = path.join(tempRoot, "project-root");
    process.env.THREADLENS_SEARCH_CACHE_DIR = path.join(tempRoot, "search-cache");
    vi.resetModules();
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
    if (originalProjectRoot === undefined) {
      delete process.env.THREADLENS_PROJECT_ROOT;
    } else {
      process.env.THREADLENS_PROJECT_ROOT = originalProjectRoot;
    }
    if (originalSearchCacheDir === undefined) {
      delete process.env.THREADLENS_SEARCH_CACHE_DIR;
    } else {
      process.env.THREADLENS_SEARCH_CACHE_DIR = originalSearchCacheDir;
    }
    vi.resetModules();
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("picks up renamed codex titles on forceRefresh", async () => {
    const { getProviderSessionsTs } = await import("./search.js");
    const { renameThreadTitleTs } = await import("../threads/state.js");

    const before = await getProviderSessionsTs("codex", 20);
    expect(before.rows[0]?.display_title).toBe("Old renamed title");

    await renameThreadTitleTs(THREAD_ID, "New renamed title");

    const refreshed = await getProviderSessionsTs("codex", 20, {
      forceRefresh: true,
    });
    expect(refreshed.rows[0]?.display_title).toBe("New renamed title");
  });

  it("keeps the cached old codex title until forceRefresh or cache expiry", async () => {
    const { getProviderSessionsTs } = await import("./search.js");
    const { renameThreadTitleTs } = await import("../threads/state.js");

    const before = await getProviderSessionsTs("codex", 20);
    expect(before.rows[0]?.display_title).toBe("Old renamed title");

    await renameThreadTitleTs(THREAD_ID, "New renamed title");

    const withoutRefresh = await getProviderSessionsTs("codex", 20);
    expect(withoutRefresh.rows[0]?.display_title).toBe("Old renamed title");

    const refreshed = await getProviderSessionsTs("codex", 20, {
      forceRefresh: true,
    });
    expect(refreshed.rows[0]?.display_title).toBe("New renamed title");
  });

  it("uses session_index thread_name when global-state titles are empty", async () => {
    const codexHome = process.env.CODEX_HOME!;
    await writeFile(
      path.join(codexHome, ".codex-global-state.json"),
      JSON.stringify({ "thread-titles": { titles: {}, order: [] } }, null, 2),
      "utf-8",
    );
    await writeFile(
      path.join(codexHome, "session_index.jsonl"),
      `${JSON.stringify({
        id: THREAD_ID,
        thread_name: "Renamed from session index",
        updated_at: "2026-04-01T01:23:45.000Z",
      })}\n`,
      "utf-8",
    );

    vi.resetModules();
    const { getProviderSessionsTs } = await import("./search.js");

    const refreshed = await getProviderSessionsTs("codex", 20, {
      forceRefresh: true,
    });

    expect(refreshed.rows[0]?.display_title).toBe("Renamed from session index");
  });

  it("prefers global-state titles over session_index thread_name for the same thread", async () => {
    const codexHome = process.env.CODEX_HOME!;
    await writeFile(
      path.join(codexHome, ".codex-global-state.json"),
      JSON.stringify(
        {
          "thread-titles": {
            titles: {
              [THREAD_ID]: "Global-state title wins",
            },
            order: [],
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    await writeFile(
      path.join(codexHome, "session_index.jsonl"),
      `${JSON.stringify({
        id: THREAD_ID,
        thread_name: "Session index title loses",
        updated_at: "2026-04-01T01:23:45.000Z",
      })}\n`,
      "utf-8",
    );

    vi.resetModules();
    const { getProviderSessionsTs } = await import("./search.js");

    const refreshed = await getProviderSessionsTs("codex", 20, {
      forceRefresh: true,
    });

    expect(refreshed.rows[0]?.display_title).toBe("Global-state title wins");
  });

  it("uses the latest session_index thread_name when duplicate entries exist", async () => {
    const codexHome = process.env.CODEX_HOME!;
    await writeFile(
      path.join(codexHome, ".codex-global-state.json"),
      JSON.stringify({ "thread-titles": { titles: {}, order: [] } }, null, 2),
      "utf-8",
    );
    await writeFile(
      path.join(codexHome, "session_index.jsonl"),
      [
        JSON.stringify({
          id: THREAD_ID,
          thread_name: "Older session index title",
          updated_at: "2026-04-01T01:23:45.000Z",
        }),
        JSON.stringify({
          id: THREAD_ID,
          thread_name: "Latest session index title",
          updated_at: "2026-04-01T01:25:45.000Z",
        }),
      ].join("\n") + "\n",
      "utf-8",
    );

    vi.resetModules();
    const { getProviderSessionsTs } = await import("./search.js");

    const refreshed = await getProviderSessionsTs("codex", 20, {
      forceRefresh: true,
    });

    expect(refreshed.rows[0]?.display_title).toBe("Latest session index title");
  });
});
