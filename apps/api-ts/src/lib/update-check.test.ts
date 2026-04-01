import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkForUpdates,
  compareReleaseVersions,
  resetUpdateCheckCacheForTests,
} from "./update-check.js";

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
    });

    expect(result.status).toBe("available");
    expect(result.has_update).toBe(true);
    expect(result.latest_version).toBe("0.1.1");
    expect(result.release_title).toBe("ThreadLens v0.1.1");
    expect(result.release_summary).toBe("Codex rename sync now reflects immediately.");
    expect(result.release_url).toContain("/releases/tag/v0.1.1");
  });

  it("returns unavailable when the GitHub check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const result = await checkForUpdates({
      currentVersion: "0.1.0",
      now: () => 1234,
    });

    expect(result.status).toBe("unavailable");
    expect(result.has_update).toBe(false);
    expect(result.latest_version).toBeNull();
    expect(result.release_title).toBeNull();
    expect(result.release_summary).toBeNull();
    expect(result.release_url).toContain("/releases/latest");
  });
});
