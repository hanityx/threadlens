import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const THIS_DIR = process.env.THREADLENS_PROJECT_ROOT
  ? path.join(process.env.THREADLENS_PROJECT_ROOT, ".api-root")
  : path.dirname(fileURLToPath(import.meta.url));

// platform/ -> src/ -> api-ts/ -> apps/ -> project root
export const PROJECT_ROOT =
  process.env.THREADLENS_PROJECT_ROOT ??
  path.resolve(THIS_DIR, "../../../..");

export function resolveAppVersion(projectRoot = PROJECT_ROOT) {
  const envVersion = process.env.APP_VERSION?.trim();
  if (envVersion) return envVersion;

  try {
    const packageJsonPath = path.join(projectRoot, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
      version?: unknown;
    };
    const packageVersion = typeof packageJson.version === "string"
      ? packageJson.version.trim()
      : "";
    if (packageVersion) return packageVersion;
  } catch {
    // Fall back to a stable placeholder when package metadata is unavailable.
  }

  return "0.1.0";
}

export const DEFAULT_PORT = Number(process.env.API_TS_PORT ?? 8788);
export const APP_VERSION = resolveAppVersion();
export const START_TS = Date.now();

const STATE_DIR_OVERRIDE = String(
  process.env.THREADLENS_STATE_DIR ?? "",
).trim();

export const STATE_DIR = path.resolve(
  PROJECT_ROOT,
  STATE_DIR_OVERRIDE || path.join(".run", "state"),
);

export function resolvePlatformHomeDir(
  platform = process.platform,
  env: Record<string, string | undefined> = process.env,
) {
  if (platform === "win32") {
    const userProfile = env.USERPROFILE?.trim();
    if (userProfile) return userProfile;
    const homeDrive = env.HOMEDRIVE?.trim() ?? "";
    const homePath = env.HOMEPATH?.trim() ?? "";
    if (homeDrive && homePath) return `${homeDrive}${homePath}`;
  }
  return env.HOME ?? "";
}

export const HOME_DIR = resolvePlatformHomeDir();

export function resolvePlatformAppDataDir(
  platform = process.platform,
  env: Record<string, string | undefined> = process.env,
) {
  const homeDir = resolvePlatformHomeDir(platform, env);
  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support");
  }
  if (platform === "win32") {
    return env.APPDATA ?? path.join(homeDir, "AppData", "Roaming");
  }
  return env.XDG_CONFIG_HOME ?? path.join(homeDir, ".config");
}

export const PROJECTS_DIR = String(
  process.env.THREADLENS_PROJECTS_DIR ?? process.env.PROJECTS_DIR ?? "",
).trim();

export function resolvePlatformChatDir(
  platform = process.platform,
  env: Record<string, string | undefined> = process.env,
) {
  if (platform === "darwin") {
    return path.join(
      resolvePlatformHomeDir(platform, env),
      "Library",
      "Application Support",
      "com.openai.chat",
    );
  }
  return path.join(resolvePlatformAppDataDir(platform, env), "com.openai.chat");
}

export function resolvePlatformDocumentsDir(
  platform = process.platform,
  env: Record<string, string | undefined> = process.env,
) {
  return path.join(resolvePlatformHomeDir(platform, env), "Documents");
}

export function resolvePlatformDownloadsDir(
  platform = process.platform,
  env: Record<string, string | undefined> = process.env,
) {
  return path.join(resolvePlatformHomeDir(platform, env), "Downloads");
}

export const APP_DATA_DIR = resolvePlatformAppDataDir();
export const DOCUMENTS_DIR = resolvePlatformDocumentsDir();
export const DOWNLOADS_DIR = resolvePlatformDownloadsDir();
