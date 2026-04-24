const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const pngToIcoModule = require("png-to-ico");
const pngToIco = pngToIcoModule.default || pngToIcoModule;

const DESKTOP_ROOT = path.resolve(__dirname, "..");
const SOURCE_SVG = process.env.THREADLENS_ICON_SOURCE || path.join(DESKTOP_ROOT, "..", "web", "public", "favicon.svg");
const OUTPUT_DIR = path.join(DESKTOP_ROOT, "build");
const OUTPUT_ICNS = path.join(OUTPUT_DIR, "icon.icns");
const OUTPUT_ICO = path.join(OUTPUT_DIR, "icon.ico");
const OUTPUT_PNG = path.join(OUTPUT_DIR, "icon.png");
const FALLBACK_PNG = path.join(OUTPUT_DIR, "favicon.svg.png");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "pipe",
    ...options,
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    const stdout = String(result.stdout || "").trim();
    throw new Error(`${command} ${args.join(" ")} failed${stderr ? `: ${stderr}` : stdout ? `: ${stdout}` : ""}`);
  }
}

async function ensurePngSource(tmpDir) {
  let sourcePng = "";

  if (process.platform === "darwin" && fs.existsSync(SOURCE_SVG)) {
    await fsp.mkdir(tmpDir, { recursive: true });
    try {
      run("qlmanage", ["-t", "-s", "1024", "-o", tmpDir, SOURCE_SVG]);
      const rendered = path.join(tmpDir, `${path.basename(SOURCE_SVG)}.png`);
      if (fs.existsSync(rendered)) {
        sourcePng = rendered;
      }
    } catch {
      // fall through to committed PNG assets
    }
  }

  if (!sourcePng && fs.existsSync(OUTPUT_PNG)) sourcePng = OUTPUT_PNG;
  if (!sourcePng && fs.existsSync(FALLBACK_PNG)) sourcePng = FALLBACK_PNG;
  if (!sourcePng) {
    throw new Error("failed to resolve a source png");
  }

  await fsp.mkdir(OUTPUT_DIR, { recursive: true });
  if (path.resolve(sourcePng) !== path.resolve(OUTPUT_PNG)) {
    await fsp.copyFile(sourcePng, OUTPUT_PNG);
  }

  return OUTPUT_PNG;
}

async function writeIco(inputPng) {
  const icoBuffer = await pngToIco(inputPng);
  await fsp.writeFile(OUTPUT_ICO, icoBuffer);
}

function writeIcns(inputPng, iconsetDir) {
  if (process.platform !== "darwin") return;
  fs.mkdirSync(iconsetDir, { recursive: true });

  for (const size of [16, 32, 128, 256, 512]) {
    run("sips", [
      "-z",
      String(size),
      String(size),
      inputPng,
      "--out",
      path.join(iconsetDir, `icon_${size}x${size}.png`),
    ]);
    const retina = size * 2;
    run("sips", [
      "-z",
      String(retina),
      String(retina),
      inputPng,
      "--out",
      path.join(iconsetDir, `icon_${size}x${size}@2x.png`),
    ]);
  }
  run("iconutil", ["-c", "icns", iconsetDir, "-o", OUTPUT_ICNS]);
}

async function main() {
  if (!fs.existsSync(SOURCE_SVG)) {
    throw new Error(`source svg missing: ${SOURCE_SVG}`);
  }

  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "threadlens-icon-"));
  const iconsetDir = path.join(tmpDir, "icon.iconset");
  try {
    const inputPng = await ensurePngSource(tmpDir);
    await writeIco(inputPng);
    writeIcns(inputPng, iconsetDir);
    if (fs.existsSync(OUTPUT_ICNS)) {
      console.log(`[build-app-icon] wrote ${OUTPUT_ICNS}`);
    }
    console.log(`[build-app-icon] wrote ${OUTPUT_PNG}`);
    console.log(`[build-app-icon] wrote ${OUTPUT_ICO}`);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("[build-app-icon]", error.message || error);
  process.exitCode = 1;
});
