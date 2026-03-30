import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(TEST_DIR, "../../../..");

type EnvValue = string | undefined;

async function loadConstants(env: Record<string, EnvValue>) {
  const previous: Record<string, EnvValue> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  vi.resetModules();
  try {
    return await import("./constants.js");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  }
}

afterEach(() => {
  delete process.env.THREADLENS_PROJECT_ROOT;
  delete process.env.THREADLENS_STATE_DIR;
  vi.resetModules();
});

describe("runtime state paths", () => {
  it("defaults runtime state under .run/state at the project root", async () => {
    const mod = await loadConstants({
      THREADLENS_PROJECT_ROOT: undefined,
      THREADLENS_STATE_DIR: undefined,
    });

    const expectedStateDir = path.join(DEFAULT_PROJECT_ROOT, ".run", "state");
    expect(mod.PROJECT_ROOT).toBe(DEFAULT_PROJECT_ROOT);
    expect(mod.STATE_DIR).toBe(expectedStateDir);
    expect(mod.ROADMAP_STATE_FILE).toBe(path.join(expectedStateDir, "roadmap_state.json"));
    expect(mod.ROADMAP_LOG_FILE).toBe(path.join(expectedStateDir, "roadmap_checkins.jsonl"));
    expect(mod.RECOVERY_CHECKLIST_FILE).toBe(path.join(expectedStateDir, "w4_checklist.json"));
    expect(mod.RECOVERY_PLAN_DIR).toBe(path.join(expectedStateDir, "recovery_plans"));
  });

  it("resolves relative THREADLENS_STATE_DIR against THREADLENS_PROJECT_ROOT", async () => {
    const customRoot = path.join(os.tmpdir(), "threadlens-root");
    const mod = await loadConstants({
      THREADLENS_PROJECT_ROOT: customRoot,
      THREADLENS_STATE_DIR: path.join("var", "state"),
    });

    expect(mod.PROJECT_ROOT).toBe(customRoot);
    expect(mod.STATE_DIR).toBe(path.join(customRoot, "var", "state"));
  });

  it("accepts absolute THREADLENS_STATE_DIR overrides as-is", async () => {
    const customRoot = path.join(os.tmpdir(), "threadlens-root");
    const absoluteStateDir = path.join(os.tmpdir(), "threadlens-state");
    const mod = await loadConstants({
      THREADLENS_PROJECT_ROOT: customRoot,
      THREADLENS_STATE_DIR: absoluteStateDir,
    });

    expect(mod.PROJECT_ROOT).toBe(customRoot);
    expect(mod.STATE_DIR).toBe(absoluteStateDir);
    expect(mod.RECOVERY_PLAN_DIR).toBe(path.join(absoluteStateDir, "recovery_plans"));
  });

  it("resolves platform app-data roots for Copilot storage", async () => {
    const mod = await loadConstants({});

    expect(
      mod.resolvePlatformAppDataDir("darwin", {
        HOME: "/Users/example",
      }),
    ).toBe("/Users/example/Library/Application Support");
    expect(
      mod.resolvePlatformAppDataDir("win32", {
        HOME: "C:/Users/example",
        APPDATA: "C:/Users/example/AppData/Roaming",
      }),
    ).toBe("C:/Users/example/AppData/Roaming");
    expect(
      mod.resolvePlatformAppDataDir("linux", {
        HOME: "/home/example",
        XDG_CONFIG_HOME: "/home/example/.config",
      }),
    ).toBe("/home/example/.config");
  });
});
