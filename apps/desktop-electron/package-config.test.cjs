const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync } = require("node:fs");
const path = require("node:path");

const pkg = require("./package.json");

test("desktop package defines cross-platform artifact scripts and targets", () => {
  assert.equal(pkg.scripts["icon:build"], "node scripts/build-app-icon.cjs");
  assert.equal(
    pkg.scripts.test,
    "node --test main-menu.test.cjs ipc-validation.test.cjs package-config.test.cjs main/api-lifecycle.test.cjs main/window-runtime.test.cjs main/smoke-runtime.test.cjs",
  );
  assert.equal(pkg.scripts["smoke:packaged"], "node scripts/smoke-packaged.cjs");
  assert.equal(pkg.scripts["dist:win"], "pnpm run build && electron-builder --win portable");
  assert.equal(pkg.scripts["dist:linux"], "pnpm run build && electron-builder --linux AppImage");

  assert.equal(pkg.build.win.icon, "build/icon.ico");
  assert.deepEqual(pkg.build.win.target, ["portable"]);

  assert.equal(pkg.build.linux.icon, "build/icon.png");
  assert.deepEqual(pkg.build.linux.target, ["AppImage"]);
  assert(pkg.build.files.includes("main/**/*"));
  assert(pkg.build.files.includes("ipc-validation.cjs"));
  assert(
    existsSync(path.join(__dirname, "scripts", "smoke-packaged.cjs")),
    "smoke-packaged.cjs should exist for CI packaged smoke",
  );
});
