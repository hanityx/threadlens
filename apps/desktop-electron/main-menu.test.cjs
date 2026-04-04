const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildMenuTemplate,
  getDefaultIconCandidates,
  resolveAppIconPath,
} = require("./main-menu.cjs");

test("buildMenuTemplate exposes native app menus for ThreadLens", () => {
  const template = buildMenuTemplate({
    appName: "ThreadLens",
    isMac: true,
    isDev: false,
    hasFocusedWindow: true,
  });

  assert.deepEqual(
    template.map((item) => item.label),
    ["ThreadLens", "Workspace", "Actions", "View", "Window", "Help"],
  );

  const workspaceMenu = template.find((item) => item.label === "Workspace");
  assert.ok(workspaceMenu);
  assert.deepEqual(
    workspaceMenu.submenu
      .filter((item) => item.label)
      .map((item) => item.label),
    ["Open Overview Window", "Open Search Window", "Open Cleanup Window", "Open Sessions Window"],
  );

  const actionsMenu = template.find((item) => item.label === "Actions");
  assert.ok(actionsMenu);
  assert.ok(actionsMenu.submenu.some((item) => item.label === "Refresh Current Window"));
  assert.ok(actionsMenu.submenu.some((item) => item.label === "Open App Data Folder"));
  assert.ok(actionsMenu.submenu.some((item) => item.label === "Open Logs Folder"));
});

test("resolveAppIconPath prefers generated icons and falls back to staged assets", () => {
  const found = resolveAppIconPath({
    candidates: ["/tmp/missing.icns", "/tmp/threadlens.icns", "/tmp/fallback.svg"],
    existsSync: (candidate) => candidate === "/tmp/threadlens.icns",
  });
  assert.equal(found, "/tmp/threadlens.icns");

  const fallback = resolveAppIconPath({
    candidates: ["/tmp/missing.icns", "/tmp/fallback.svg"],
    existsSync: (candidate) => candidate === "/tmp/fallback.svg",
  });
  assert.equal(fallback, "/tmp/fallback.svg");
});

test("getDefaultIconCandidates includes platform-specific packaged icons", () => {
  assert.deepEqual(
    getDefaultIconCandidates("/tmp/desktop", true, "/tmp/resources", "win32"),
    ["/tmp/resources/icon.ico", "/tmp/resources/icon.png"],
  );

  assert.deepEqual(
    getDefaultIconCandidates("/tmp/desktop", true, "/tmp/resources", "linux"),
    ["/tmp/resources/icon.png", "/tmp/resources/icon.ico"],
  );
});
