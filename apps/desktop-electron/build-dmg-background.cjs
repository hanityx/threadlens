const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DESKTOP_ROOT = __dirname;
const OUTPUT_DIR = path.join(DESKTOP_ROOT, "build");
const OUTPUT_BG = path.join(OUTPUT_DIR, "background.png");
const OUTPUT_BG_2X = path.join(OUTPUT_DIR, "background@2x.png");
const BASE_WIDTH = 660;
const BASE_HEIGHT = 440;

function createSvg(width, height) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${BASE_WIDTH} ${BASE_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${BASE_WIDTH}" height="${BASE_HEIGHT}" rx="24" fill="#0F141C"/>

  <text x="34" y="46" fill="#F8FAFC" font-size="24" font-weight="700" font-family="SF Pro Display, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif">Install ThreadLens</text>
  <text x="34" y="68" fill="#CBD5E1" font-size="12.5" font-weight="500" font-family="SF Pro Text, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif">Drag to Applications.</text>

  <text x="330" y="166" text-anchor="middle" fill="#F8FAFC" font-size="40" font-weight="700" font-family="SF Pro Display, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif">&#8594;</text>

  <rect x="26" y="262" width="608" height="54" rx="16" fill="#151C27"/>
  <rect x="26.5" y="262.5" width="607" height="53" rx="15.5" stroke="#F8FAFC" stroke-opacity="0.10"/>

  <text x="42" y="288" fill="#F8FAFC" font-size="14" font-weight="650" font-family="SF Pro Text, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif">If blocked: Right-click &gt; Open</text>
  <text x="42" y="308" fill="#CBD5E1" font-size="12.5" font-weight="550" font-family="SF Pro Text, -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif">Or Privacy &amp; Security &gt; Open Anyway</text>
</svg>
`;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "pipe" });
  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    const stdout = String(result.stdout || "").trim();
    throw new Error(`${command} ${args.join(" ")} failed${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : ""}`);
  }
}

async function renderPng(svgPath, targetPath) {
  run("sips", ["-s", "format", "png", svgPath, "--out", targetPath]);
  if (!fs.existsSync(targetPath)) {
    throw new Error(`sips did not produce ${targetPath}`);
  }
}

function shouldRenderDmgBackground(platform = process.platform) {
  return platform === "darwin";
}

async function main({ platform = process.platform } = {}) {
  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  if (!shouldRenderDmgBackground(platform)) {
    console.log(`[build-dmg-background] skipped on ${platform}; DMG background is macOS-only`);
    return;
  }

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "threadlens-dmg-bg-"));
  const svgPath = path.join(tmpDir, "background.svg");
  const svgPath2x = path.join(tmpDir, "background@2x.svg");

  try {
    await fsp.writeFile(svgPath, createSvg(BASE_WIDTH, BASE_HEIGHT), "utf8");
    await fsp.writeFile(svgPath2x, createSvg(BASE_WIDTH * 2, BASE_HEIGHT * 2), "utf8");
    await renderPng(svgPath, OUTPUT_BG);
    await renderPng(svgPath2x, OUTPUT_BG_2X);
    console.log(`[build-dmg-background] wrote ${OUTPUT_BG}`);
    console.log(`[build-dmg-background] wrote ${OUTPUT_BG_2X}`);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("[build-dmg-background]", error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  createSvg,
  shouldRenderDmgBackground,
};
