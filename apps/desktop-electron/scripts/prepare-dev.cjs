const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const webDistIndex = path.join(repoRoot, "apps", "web", "dist", "index.html");
const apiBundlePath = path.join(repoRoot, "apps", "api-ts", "dist-electron", "server.cjs");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.env.ELECTRON_RENDERER_URL) {
  process.exit(0);
}

if (!fs.existsSync(webDistIndex)) {
  run("pnpm", ["--filter", "@threadlens/web", "build"]);
}

if (!fs.existsSync(apiBundlePath)) {
  run("pnpm", ["--filter", "@threadlens/api", "bundle:desktop"]);
}

run("node", [path.join(desktopRoot, "scripts", "stage-desktop-assets.cjs")]);
