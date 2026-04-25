const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const path = require("node:path");

const pkg = require("./package.json");

test("desktop package defines cross-platform artifact scripts and targets", () => {
  assert.equal(pkg.scripts["icon:build"], "node scripts/build-app-icon.cjs");
  assert.equal(
    pkg.scripts.test,
    "node --test build-dmg-background.test.cjs main-menu.test.cjs ipc-validation.test.cjs package-config.test.cjs main/api-lifecycle.test.cjs main/ipc-handlers.test.cjs main/window-runtime.test.cjs main/smoke-runtime.test.cjs",
  );
  assert.equal(pkg.scripts["smoke:packaged"], "node scripts/smoke-packaged.cjs");
  assert.equal(pkg.scripts["dist:mac"], "pnpm run build && electron-builder --mac dmg");
  assert.equal(pkg.scripts["dist:win"], "pnpm run build && electron-builder --win portable");
  assert.equal(pkg.scripts["dist:linux"], "pnpm run build && electron-builder --linux AppImage");

  assert.equal(pkg.build.mac.icon, "build/icon.icns");
  assert.equal(pkg.build.mac.identity, null);
  assert.deepEqual(pkg.build.mac.target, ["dmg"]);

  assert.equal(pkg.build.win.icon, "build/icon.ico");
  assert.deepEqual(pkg.build.win.target, ["portable"]);

  assert.equal(pkg.build.linux.icon, "build/icon.png");
  assert.deepEqual(pkg.build.linux.target, ["AppImage"]);
  assert.equal(pkg.build.dmg.background, "build/background.png");
  assert.equal(pkg.build.dmg.icon, "build/icon.icns");
  assert.equal(pkg.build.dmg.title, "Install ThreadLens");
  assert.equal(pkg.build.dmg.iconSize, 84);
  assert.equal(pkg.build.dmg.iconTextSize, 12);
  assert.equal(pkg.build.dmg.window.width, 660);
  assert.equal(pkg.build.dmg.window.height, 440);
  assert.deepEqual(pkg.build.dmg.contents, [
    { x: 180, y: 148, type: "file" },
    { x: 480, y: 148, type: "link", path: "/Applications" },
  ]);
  assert(pkg.build.files.includes("main/**/*"));
  assert(pkg.build.files.includes("ipc-validation.cjs"));
  assert(
    existsSync(path.join(__dirname, "scripts", "smoke-packaged.cjs")),
    "smoke-packaged.cjs should exist for CI packaged smoke",
  );
  assert(
    existsSync(path.join(__dirname, "build-dmg-background.cjs")),
    "build-dmg-background.cjs should exist so DMG assets can be regenerated",
  );
});
