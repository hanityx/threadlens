const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const webDistDir = path.join(repoRoot, "apps", "web", "dist");
const apiBundlePath = path.join(repoRoot, "apps", "api-ts", "dist-electron", "server.cjs");
const stageRoot = path.join(desktopRoot, "app");
const stageWebRoot = path.join(stageRoot, "web");
const stageApiRoot = path.join(stageRoot, "api");

function requirePath(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} missing: ${targetPath}`);
  }
}

function resetDir(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
  fs.mkdirSync(targetPath, { recursive: true });
}

requirePath(webDistDir, "web dist");
requirePath(apiBundlePath, "desktop api bundle");

resetDir(stageRoot);
fs.cpSync(webDistDir, stageWebRoot, { recursive: true });
fs.mkdirSync(stageApiRoot, { recursive: true });
fs.copyFileSync(apiBundlePath, path.join(stageApiRoot, "server.cjs"));

console.log(`[stage-desktop-assets] staged web -> ${stageWebRoot}`);
console.log(`[stage-desktop-assets] staged api -> ${path.join(stageApiRoot, "server.cjs")}`);
