import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkForUpdates,
  compareReleaseVersions,
  resetUpdateCheckCacheForTests,
} from "./update-check.js";

async function createCacheFilePath() {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-update-check-"));
  return path.join(cacheDir, "update-check.json");
}

describe("update check", () => {
  afterEach(() => {
    resetUpdateCheckCacheForTests();
    vi.unstubAllGlobals();
  });

  it("compares semantic versions correctly", () => {
    expect(compareReleaseVersions("0.1.1", "0.1.0")).toBeGreaterThan(0);
    expect(compareReleaseVersions("v0.1.0", "0.1.0")).toBe(0);
    expect(compareReleaseVersions("0.1.0", "0.1.2")).toBeLessThan(0);
  });

  it("reports a newer GitHub release when one exists", async () => {
    const cacheFilePath = await createCacheFilePath();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: "v0.1.1",
          name: "ThreadLens v0.1.1",
          body: "Codex rename sync now reflects immediately.\n\n- TUI fetch window is wider during filtering.",
          html_url: "https://github.com/hanityx/threadlens/releases/tag/v0.1.1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkForUpdates({
      currentVersion: "0.1.0",
      now: () => 1234,
      cacheFilePath,
    });

    expect(result.status).toBe("available");
    expect(result.has_update).toBe(true);
    expect(result.latest_version).toBe("0.1.1");
    expect(result.release_title).toBe("ThreadLens v0.1.1");
    expect(result.release_summary).toBe("Codex rename sync now reflects immediately.");
    expect(result.release_url).toContain("/releases/tag/v0.1.1");
  });

  it("returns unavailable when the GitHub check fails", async () => {
    const cacheFilePath = await createCacheFilePath();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const result = await checkForUpdates({
      currentVersion: "0.1.0",
      now: () => 1234,
      cacheFilePath,
    });

    expect(result.status).toBe("unavailable");
    expect(result.has_update).toBe(false);
    expect(result.latest_version).toBeNull();
    expect(result.release_title).toBeNull();
    expect(result.release_summary).toBeNull();
    expect(result.release_url).toContain("/releases/latest");
  });

  it("reuses the persisted cache within the ttl without refetching GitHub", async () => {
    const cacheFilePath = await createCacheFilePath();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: "v0.1.1",
          name: "ThreadLens v0.1.1",
          body: "Cached release notes.",
          html_url: "https://github.com/hanityx/threadlens/releases/tag/v0.1.1",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const first = await checkForUpdates({
      currentVersion: "0.1.0",
      now: () => 1_000,
      fetchImpl: fetchMock,
      cacheFilePath,
    });
    const second = await checkForUpdates({
      currentVersion: "0.1.0",
      now: () => 2_000,
      fetchImpl: vi.fn().mockRejectedValue(new Error("should-not-run")),
      cacheFilePath,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(JSON.parse(await readFile(cacheFilePath, "utf-8"))).toMatchObject({
      latest_version: "0.1.1",
      has_update: true,
    });
  });

  it("reinterprets the persisted latest version for a newer local app version", async () => {
    const cacheFilePath = await createCacheFilePath();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: "v0.2.0",
          name: "ThreadLens v0.2.0",
          body: "Latest stable release.",
          html_url: "https://github.com/hanityx/threadlens/releases/tag/v0.2.0",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await checkForUpdates({
      currentVersion: "0.1.0",
      now: () => 1_000,
      fetchImpl: fetchMock,
      cacheFilePath,
    });
    const result = await checkForUpdates({
      currentVersion: "0.2.0",
      now: () => 2_000,
      fetchImpl: vi.fn().mockRejectedValue(new Error("should-not-run")),
      cacheFilePath,
    });

    expect(result.current_version).toBe("0.2.0");
    expect(result.latest_version).toBe("0.2.0");
    expect(result.has_update).toBe(false);
    expect(result.status).toBe("up-to-date");
  });
});
