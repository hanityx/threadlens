import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(TEST_DIR, "../../../..");
const ROOT_PACKAGE_VERSION = (
  JSON.parse(fs.readFileSync(path.join(DEFAULT_PROJECT_ROOT, "package.json"), "utf8")) as {
    version: string;
  }
).version;

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
  delete process.env.THREADLENS_PROJECTS_DIR;
  delete process.env.PROJECTS_DIR;
  vi.resetModules();
});

describe("runtime state paths", () => {
  it("defaults APP_VERSION to the repository package version when env is unset", async () => {
    const mod = await loadConstants({
      APP_VERSION: undefined,
      THREADLENS_PROJECT_ROOT: undefined,
    });

    expect(mod.APP_VERSION).toBe(ROOT_PACKAGE_VERSION);
  });

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
      mod.resolvePlatformHomeDir("darwin", {
        HOME: "/mock_dir",
      }),
    ).toBe("/mock_dir");
    expect(
      mod.resolvePlatformHomeDir("win32", {
        USERPROFILE: "C:/mock_dir",
      }),
    ).toBe("C:/mock_dir");
    expect(
      mod.resolvePlatformAppDataDir("darwin", {
        HOME: "/mock_dir",
      }),
    ).toBe("/mock_dir/Library/Application Support");
    expect(
      mod.resolvePlatformAppDataDir("win32", {
        USERPROFILE: "C:/mock_dir",
        APPDATA: "C:/mock_dir/AppData/Roaming",
      }),
    ).toBe("C:/mock_dir/AppData/Roaming");
    expect(
      mod.resolvePlatformAppDataDir("win32", {
        USERPROFILE: "C:/mock_dir",
      }),
    ).toBe("C:/mock_dir/AppData/Roaming");
    expect(
      mod.resolvePlatformAppDataDir("linux", {
        HOME: "/mock_linux",
        XDG_CONFIG_HOME: "/mock_linux/.config",
      }),
    ).toBe("/mock_linux/.config");
    expect(
      mod.resolvePlatformChatDir("darwin", {
        HOME: "/mock_dir",
      }),
    ).toBe("/mock_dir/Library/Application Support/com.openai.chat");
    expect(
      mod.resolvePlatformChatDir("win32", {
        USERPROFILE: "C:/mock_dir",
        APPDATA: "C:/mock_dir/AppData/Roaming",
      }),
    ).toBe("C:/mock_dir/AppData/Roaming/com.openai.chat");
  });

  it("defaults project discovery to an empty optional directory", async () => {
    const mod = await loadConstants({
      THREADLENS_PROJECTS_DIR: undefined,
      PROJECTS_DIR: undefined,
    });

    expect(mod.PROJECTS_DIR).toBe("");
  });

  it("accepts THREADLENS_PROJECTS_DIR overrides for overview project discovery", async () => {
    const customProjectsDir = path.join(os.tmpdir(), "threadlens-projects");
    const mod = await loadConstants({
      THREADLENS_PROJECTS_DIR: customProjectsDir,
    });

    expect(mod.PROJECTS_DIR).toBe(customProjectsDir);
  });

  it("falls back to PROJECTS_DIR when the threadlens-specific override is missing", async () => {
    const customProjectsDir = path.join(os.tmpdir(), "threadlens-projects-fallback");
    const mod = await loadConstants({
      THREADLENS_PROJECTS_DIR: undefined,
      PROJECTS_DIR: customProjectsDir,
    });

    expect(mod.PROJECTS_DIR).toBe(customProjectsDir);
  });
});
