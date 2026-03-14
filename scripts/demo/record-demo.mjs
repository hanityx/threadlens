#!/usr/bin/env node
/**
 * ───────────────────────────────────────────────────────────
 *  Codex Mission Control — Animated Demo GIF Recorder
 * ───────────────────────────────────────────────────────────
 *
 *  Records the live dashboard (with mock API data) as an
 *  animated GIF with view navigation, zoom effects, and
 *  interactive motions.
 *
 *  Prerequisites:
 *    cd scripts/demo && npm install   (or pnpm install)
 *    Ensure apps/web dev server is running on :5174
 *      → pnpm --filter @codex/web dev
 *
 *  Usage:
 *    node record-demo.mjs              # → docs/assets/demo.gif
 *    HEADLESS=false node record-demo.mjs  # watch the recording live
 *
 * ───────────────────────────────────────────────────────────
 */

import puppeteer from "puppeteer-core";
import GIFEncoder from "gifencoder";
import { PNG } from "pngjs";
import { createWriteStream, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "../../docs/assets");
const OUTPUT_PATH = resolve(OUTPUT_DIR, "demo.gif");

// ── Config ────────────────────────────────────────────────
const WIDTH = 1280;
const HEIGHT = 800;
const FPS = 8;
const FRAME_DELAY = Math.round(1000 / FPS); // ms between frames
const QUALITY = 10; // GIF quality (1=best, 20=worst)
const APP_URL = process.env.APP_URL ?? "http://localhost:5174";
const HEADLESS = process.env.HEADLESS !== "false";

// ── Mock API setup ────────────────────────────────────────
import { MOCK_RESPONSES } from "./mock-data.mjs";

function findMockResponse(url) {
  const u = new URL(url);
  const path = u.pathname;

  // Exact match first
  if (MOCK_RESPONSES[path]) return MOCK_RESPONSES[path];

  // Prefix match for parameterised routes (e.g. /api/ts/threads/:id)
  for (const [key, val] of Object.entries(MOCK_RESPONSES)) {
    if (path.startsWith(key)) return val;
  }
  return null;
}

// ── Frame capture helper ──────────────────────────────────
async function captureFrame(page, encoder) {
  const buf = await page.screenshot({ type: "png", encoding: "binary" });
  const png = PNG.sync.read(buf);
  encoder.addFrame(png.data);
}

async function captureFrames(page, encoder, count = 1) {
  for (let i = 0; i < count; i++) {
    await captureFrame(page, encoder);
  }
}

// ── Wait + hold (capture multiple frames to create a pause) ──
async function hold(page, encoder, seconds = 1.5) {
  const frames = Math.round(seconds * FPS);
  await captureFrames(page, encoder, frames);
}

// ── Smooth scroll animation ───────────────────────────────
async function smoothScroll(page, encoder, distance, duration = 800) {
  const steps = Math.round((duration / 1000) * FPS);
  const stepPx = distance / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((px) => window.scrollBy(0, px), stepPx);
    await captureFrame(page, encoder);
  }
}

// ── Zoom effect (CSS transform) ───────────────────────────
async function zoomTo(page, encoder, selector, scale = 1.3, duration = 600) {
  const steps = Math.round((duration / 1000) * FPS);
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const currentScale = 1 + (scale - 1) * progress;
    await page.evaluate(
      (sel, s) => {
        const el = document.querySelector(sel);
        if (el) {
          el.style.transition = "none";
          el.style.transform = `scale(${s})`;
          el.style.transformOrigin = "center center";
          el.style.zIndex = "9999";
          el.style.position = "relative";
        }
      },
      selector,
      currentScale
    );
    await captureFrame(page, encoder);
  }
}

async function zoomReset(page, encoder, selector, duration = 400) {
  const steps = Math.round((duration / 1000) * FPS);
  const el = await page.$(selector);
  if (!el) return;
  const currentTransform = await page.evaluate(
    (sel) => {
      const e = document.querySelector(sel);
      return e ? getComputedStyle(e).transform : "none";
    },
    selector
  );
  // Animate back
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const scale = 1 + (0.3) * (1 - progress); // assume we zoomed 1.3x
    await page.evaluate(
      (sel, s) => {
        const e = document.querySelector(sel);
        if (e) e.style.transform = `scale(${s})`;
      },
      selector,
      scale
    );
    await captureFrame(page, encoder);
  }
  await page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (e) {
      e.style.transform = "";
      e.style.zIndex = "";
      e.style.position = "";
    }
  }, selector);
}

// ── Highlight effect (pulsing border) ─────────────────────
async function highlightElement(page, encoder, selector, duration = 800) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.style.boxShadow = "0 0 0 3px rgba(110, 231, 183, 0.6), 0 0 20px rgba(110, 231, 183, 0.3)";
      el.style.transition = "box-shadow 200ms ease";
    }
  }, selector);
  await hold(page, encoder, duration / 1000);
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.style.boxShadow = "";
  }, selector);
}

// ── Cursor indicator (fake mouse dot) ─────────────────────
async function showCursor(page, x, y) {
  await page.evaluate(
    (cx, cy) => {
      let dot = document.getElementById("__demo_cursor__");
      if (!dot) {
        dot = document.createElement("div");
        dot.id = "__demo_cursor__";
        dot.style.cssText = `
          position: fixed; z-index: 99999; pointer-events: none;
          width: 18px; height: 18px; border-radius: 50%;
          background: rgba(110,231,183,0.7);
          box-shadow: 0 0 12px rgba(110,231,183,0.5);
          transition: left 300ms cubic-bezier(0.4,0,0.2,1),
                      top 300ms cubic-bezier(0.4,0,0.2,1);
          transform: translate(-50%, -50%);
        `;
        document.body.appendChild(dot);
      }
      dot.style.left = cx + "px";
      dot.style.top = cy + "px";
      dot.style.display = "block";
    },
    x,
    y
  );
}

async function hideCursor(page) {
  await page.evaluate(() => {
    const dot = document.getElementById("__demo_cursor__");
    if (dot) dot.style.display = "none";
  });
}

async function moveCursorTo(page, encoder, selector, frames = 4) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, selector);
  if (!box) return;
  for (let i = 1; i <= frames; i++) {
    await showCursor(page, box.x, box.y);
    await captureFrame(page, encoder);
  }
}

// ── Click with cursor animation ───────────────────────────
async function animatedClick(page, encoder, selector) {
  await moveCursorTo(page, encoder, selector, 3);
  await page.click(selector);
  await new Promise((r) => setTimeout(r, 300));
  await captureFrames(page, encoder, 2);
}

// ═══════════════════════════════════════════════════════════
//  MAIN RECORDING SEQUENCE
// ═══════════════════════════════════════════════════════════
async function main() {
  console.log("🎬 Starting demo recording...");
  console.log(`   Resolution: ${WIDTH}×${HEIGHT} @ ${FPS}fps`);
  console.log(`   Output: ${OUTPUT_PATH}`);
  console.log(`   App URL: ${APP_URL}`);
  console.log(`   Headless: ${HEADLESS}`);
  console.log("");

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // ── Find system Chrome ─────────────────────────────────
  const CHROME_PATHS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ];
  let chromePath = process.env.CHROME_PATH;
  if (!chromePath) {
    const { existsSync } = await import("node:fs");
    chromePath = CHROME_PATHS.find((p) => existsSync(p));
  }
  if (!chromePath) {
    console.error("❌ No Chrome/Chromium found. Set CHROME_PATH env or install Chrome.");
    process.exit(1);
  }
  console.log(`   Chrome: ${chromePath}`);

  // ── Launch browser ────────────────────────────────────
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: HEADLESS ? "new" : false,
    defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 },
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // ── Intercept API calls with mock data ────────────────
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/")) {
      const mock = findMockResponse(url);
      if (mock) {
        req.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(mock),
        });
        return;
      }
    }
    req.continue();
  });

  // ── GIF encoder setup ────────────────────────────────
  const encoder = new GIFEncoder(WIDTH, HEIGHT);
  const fileStream = createWriteStream(OUTPUT_PATH);
  encoder.createReadStream().pipe(fileStream);

  encoder.start();
  encoder.setRepeat(0);       // loop forever
  encoder.setDelay(FRAME_DELAY);
  encoder.setQuality(QUALITY);

  // ── Navigate to app ──────────────────────────────────
  console.log("📄 Loading dashboard...");
  await page.goto(APP_URL, { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1000));

  // ═════════════════════════════════════════════════════
  //  SCENE 1: Overview — KPI cards + hero
  // ═════════════════════════════════════════════════════
  console.log("🎬 Scene 1: Overview");
  await hold(page, encoder, 2);

  // Zoom into KPI cards
  await zoomTo(page, encoder, ".kpi-grid", 1.25, 600);
  await hold(page, encoder, 1.5);
  await zoomReset(page, encoder, ".kpi-grid", 400);
  await hold(page, encoder, 0.5);

  // Highlight hero section
  await highlightElement(page, encoder, ".hero", 800);
  await hold(page, encoder, 1);

  // ═════════════════════════════════════════════════════
  //  SCENE 2: Threads view — search, filter, select
  // ═════════════════════════════════════════════════════
  console.log("🎬 Scene 2: Threads");
  await animatedClick(page, encoder, '.view-btn:nth-child(2)');
  await new Promise((r) => setTimeout(r, 500));
  await hold(page, encoder, 1.5);

  // Scroll down to see threads
  await smoothScroll(page, encoder, 300, 800);
  await hold(page, encoder, 1);

  // Click a thread row (the high-risk one)
  const threadRow = 'tr:nth-child(2)';
  try {
    await animatedClick(page, encoder, threadRow);
    await hold(page, encoder, 1.5);
  } catch { /* row may not exist in mock */ }

  // Filter to high-risk
  try {
    await animatedClick(page, encoder, ".filter-select");
    await hold(page, encoder, 0.5);
    await page.select(".filter-select", "high-risk");
    await captureFrames(page, encoder, 4);
    await hold(page, encoder, 1.5);

    // Reset filter
    await page.select(".filter-select", "all");
    await captureFrames(page, encoder, 3);
  } catch { /* filter may not exist in this view */ }

  await hold(page, encoder, 1);

  // ═════════════════════════════════════════════════════
  //  SCENE 3: Providers view — matrix + sessions
  // ═════════════════════════════════════════════════════
  console.log("🎬 Scene 3: Providers");
  await page.evaluate(() => window.scrollTo(0, 0));
  await animatedClick(page, encoder, '.view-btn:nth-child(3)');
  await new Promise((r) => setTimeout(r, 500));
  await hold(page, encoder, 1.5);

  // Zoom into provider matrix
  try {
    await zoomTo(page, encoder, ".provider-matrix", 1.2, 500);
    await hold(page, encoder, 1.5);
    await zoomReset(page, encoder, ".provider-matrix", 400);
  } catch { /* selector may differ */ }

  // Scroll to see session table
  await smoothScroll(page, encoder, 250, 600);
  await hold(page, encoder, 1.5);

  // ═════════════════════════════════════════════════════
  //  SCENE 4: Forensics view
  // ═════════════════════════════════════════════════════
  console.log("🎬 Scene 4: Forensics");
  await page.evaluate(() => window.scrollTo(0, 0));
  await animatedClick(page, encoder, '.view-btn:nth-child(4)');
  await new Promise((r) => setTimeout(r, 500));
  await hold(page, encoder, 2);

  // ═════════════════════════════════════════════════════
  //  SCENE 5: Routing / Execution graph
  // ═════════════════════════════════════════════════════
  console.log("🎬 Scene 5: Routing");
  await page.evaluate(() => window.scrollTo(0, 0));
  await animatedClick(page, encoder, '.view-btn:nth-child(5)');
  await new Promise((r) => setTimeout(r, 500));
  await hold(page, encoder, 2);

  // ═════════════════════════════════════════════════════
  //  SCENE 6: Theme toggle — dark → light → dark
  // ═════════════════════════════════════════════════════
  console.log("🎬 Scene 6: Theme toggle");
  await page.evaluate(() => window.scrollTo(0, 0));

  // Switch to Overview for best visual
  await animatedClick(page, encoder, '.view-btn:nth-child(1)');
  await new Promise((r) => setTimeout(r, 300));
  await hold(page, encoder, 1);

  // Toggle to light
  await animatedClick(page, encoder, ".btn-outline");
  await new Promise((r) => setTimeout(r, 300));
  await hold(page, encoder, 2);

  // Toggle back to dark
  await animatedClick(page, encoder, ".btn-outline");
  await new Promise((r) => setTimeout(r, 300));
  await hold(page, encoder, 2);

  // ═════════════════════════════════════════════════════
  //  SCENE 7: Final hold on Overview
  // ═════════════════════════════════════════════════════
  console.log("🎬 Scene 7: Final hold");
  await hideCursor(page);
  await hold(page, encoder, 2);

  // ── Finalize ──────────────────────────────────────────
  encoder.finish();
  await browser.close();

  await new Promise((resolve) => fileStream.on("finish", resolve));
  console.log("");
  console.log(`✅ Demo GIF saved to: ${OUTPUT_PATH}`);
  console.log(`   File size: check with 'ls -lh ${OUTPUT_PATH}'`);
  console.log("");
  console.log("💡 To optimize size, run:");
  console.log(`   gifsicle -O3 --lossy=80 --colors 128 ${OUTPUT_PATH} -o ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("❌ Recording failed:", err);
  process.exit(1);
});
