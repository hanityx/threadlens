const test = require("node:test");
const assert = require("node:assert/strict");

const { createSvg, shouldRenderDmgBackground } = require("./build-dmg-background.cjs");

test("DMG background rendering is limited to macOS", () => {
  assert.equal(shouldRenderDmgBackground("darwin"), true);
  assert.equal(shouldRenderDmgBackground("linux"), false);
  assert.equal(shouldRenderDmgBackground("win32"), false);
});

test("DMG background SVG keeps the expected install copy", () => {
  const svg = createSvg(660, 440);
  assert.match(svg, /Install ThreadLens/);
  assert.match(svg, /Drag to Applications/);
});

test("DMG background fills the full window without rounded cards", () => {
  const svg = createSvg(660, 440);
  assert.match(svg, /<rect width="660" height="440" fill="#0F141C"\/>/);
  assert.doesNotMatch(svg, /rx="/);
  assert.doesNotMatch(svg, /stroke="#F8FAFC"/);
});
