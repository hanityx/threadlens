const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const DIST_DIR = path.join(__dirname, "..", "dist");
const PRODUCT_NAME = "ThreadLens";
const SMOKE_TIMEOUT_MS = Number(process.env.THREADLENS_SMOKE_TIMEOUT_MS || 25000);

function listEntries(dirPath) {
  return fs.existsSync(dirPath) ? fs.readdirSync(dirPath, { withFileTypes: true }) : [];
}

function findMacExecutable() {
  for (const topLevel of listEntries(DIST_DIR)) {
    if (!topLevel.isDirectory()) continue;
    const topLevelPath = path.join(DIST_DIR, topLevel.name);
    const appDirs = topLevel.name.endsWith(".app")
      ? [topLevelPath]
      : listEntries(topLevelPath)
          .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
          .map((entry) => path.join(topLevelPath, entry.name));
    for (const appDir of appDirs) {
      const macosDir = path.join(appDir, "Contents", "MacOS");
      for (const candidate of listEntries(macosDir)) {
        if (!candidate.isFile()) continue;
        return path.join(macosDir, candidate.name);
      }
    }
  }
  return null;
}

function findLinuxExecutable() {
  for (const entry of listEntries(DIST_DIR)) {
    if (entry.isFile() && entry.name.endsWith(".AppImage")) {
      return path.join(DIST_DIR, entry.name);
    }
  }

  const unpackedDir = path.join(DIST_DIR, "linux-unpacked");
  const preferred = [
    path.join(unpackedDir, PRODUCT_NAME),
    path.join(unpackedDir, PRODUCT_NAME.toLowerCase()),
  ];
  for (const candidate of preferred) {
    if (fs.existsSync(candidate)) return candidate;
  }

  for (const entry of listEntries(unpackedDir)) {
    if (!entry.isFile()) continue;
    const candidate = path.join(unpackedDir, entry.name);
    if (entry.name.endsWith(".so")) continue;
    if (entry.name === "chrome-sandbox") continue;
    return candidate;
  }
  return null;
}

function resolveExecutable() {
  if (process.platform === "darwin") return findMacExecutable();
  if (process.platform === "linux") return findLinuxExecutable();
  throw new Error(`Unsupported smoke platform: ${process.platform}`);
}

function hasCommand(command) {
  const result = spawnSync("bash", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

async function run() {
  const executable = resolveExecutable();
  if (!executable) {
    throw new Error(`Packaged executable not found under ${DIST_DIR}. Run dist:dir first.`);
  }

  const env = {
    ...process.env,
    THREADLENS_SMOKE_TEST: "1",
    THREADLENS_SMOKE_TIMEOUT_MS: String(Math.max(5000, SMOKE_TIMEOUT_MS - 5000)),
    THREADLENS_API_PORT: process.env.THREADLENS_API_PORT || "8788",
  };
  if (process.platform === "linux" && executable.endsWith(".AppImage")) {
    env.APPIMAGE_EXTRACT_AND_RUN = "1";
    fs.chmodSync(executable, 0o755);
  }

  let command = executable;
  let args = [];
  if (process.platform === "linux" && !process.env.DISPLAY) {
    if (!hasCommand("xvfb-run")) {
      throw new Error("xvfb-run is required for packaged smoke on Linux when DISPLAY is absent.");
    }
    command = "xvfb-run";
    args = ["-a", executable, "--no-sandbox"];
  }

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "pipe",
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Packaged smoke timed out after ${SMOKE_TIMEOUT_MS}ms`));
    }, SMOKE_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Packaged smoke failed with code=${code ?? "null"} signal=${signal ?? "null"}`));
    });
  });
}

run().catch((error) => {
  console.error(`[desktop-smoke] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
