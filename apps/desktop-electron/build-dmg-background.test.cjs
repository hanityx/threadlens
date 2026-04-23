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
