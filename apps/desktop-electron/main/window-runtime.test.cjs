const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildWindowTitle,
  createRouteSearch,
  createMainWindow,
  isAllowedExternalUrl,
  readInitialRoute,
} = require("./window-runtime.cjs");

test("createRouteSearch includes only defined route params", () => {
  assert.equal(
    createRouteSearch({
      view: "providers",
      provider: "codex",
      sessionId: "session-1",
      filePath: "",
      threadId: "",
    }),
    "?view=providers&provider=codex&sessionId=session-1",
  );

  assert.equal(createRouteSearch(null), "");
});

test("readInitialRoute parses valid JSON and rejects invalid payloads", () => {
  assert.deepEqual(
    readInitialRoute(
      JSON.stringify({
        view: "providers",
        provider: "codex",
        sessionId: "session-1",
        filePath: "",
        threadId: "thread-1",
      }),
    ),
    {
      view: "providers",
      provider: "codex",
      sessionId: "session-1",
      filePath: "",
      threadId: "thread-1",
    },
  );

  assert.equal(readInitialRoute("{bad json"), null);
  assert.equal(readInitialRoute(""), null);
});

test("buildWindowTitle appends an optional suffix", () => {
  assert.equal(buildWindowTitle(""), "ThreadLens");
  assert.equal(buildWindowTitle("Review"), "ThreadLens Review");
});

test("createMainWindow uses the release-sized default bounds", () => {
  let windowOptions = null;
  const win = {
    webContents: {
      setWindowOpenHandler() {},
    },
    loadURL() {},
    loadFile() {},
  };
  const BrowserWindow = function BrowserWindow(options) {
    windowOptions = options;
    return win;
  };
  const Menu = {
    setApplicationMenu() {},
  };

  createMainWindow({
    BrowserWindow,
    Menu,
    shell: { openExternal() {} },
    route: null,
    isDev: false,
    rendererUrl: "http://127.0.0.1:5180",
    appDir: "/tmp/desktop",
    preloadPath: "/tmp/preload.cjs",
    windowTitleSuffix: "",
    sandbox: false,
    getAppIconPath: () => null,
    applyAppIcon() {},
    createMenu: () => ({}),
  });

  assert.equal(windowOptions.width, 1750);
  assert.equal(windowOptions.height, 1000);
  assert.equal(windowOptions.minWidth, 1024);
  assert.equal(windowOptions.minHeight, 720);
});

test("isAllowedExternalUrl only allows expected GitHub HTTPS links", () => {
  assert.equal(isAllowedExternalUrl("https://github.com/hanityx/threadlens"), true);
  assert.equal(isAllowedExternalUrl("https://www.github.com/hanityx/threadlens/issues"), true);
  assert.equal(isAllowedExternalUrl("http://github.com/hanityx/threadlens"), false);
  assert.equal(isAllowedExternalUrl("https://evil.example/threadlens"), false);
  assert.equal(isAllowedExternalUrl("javascript:alert(1)"), false);
});

test("createMainWindow invokes onBeforeLoad before starting navigation", () => {
  const calls = [];
  const win = {
    webContents: {
      setWindowOpenHandler() {},
    },
    loadURL(url) {
      calls.push(["loadURL", url]);
    },
    loadFile(file, options) {
      calls.push(["loadFile", file, options]);
    },
  };
  const BrowserWindow = function BrowserWindow() {
    return win;
  };
  const Menu = {
    setApplicationMenu() {},
  };

  createMainWindow({
    BrowserWindow,
    Menu,
    shell: { openExternal() {} },
    route: { view: "providers", provider: "codex" },
    isDev: false,
    rendererUrl: "http://127.0.0.1:5180",
    appDir: "/tmp/desktop",
    preloadPath: "/tmp/preload.cjs",
    windowTitleSuffix: "",
    sandbox: false,
    getAppIconPath: () => null,
    applyAppIcon() {},
    createMenu: () => ({}),
    onBeforeLoad(targetWindow) {
      calls.push(["beforeLoad", targetWindow === win]);
    },
  });

  assert.deepEqual(calls[0], ["beforeLoad", true]);
  assert.equal(calls[1][0], "loadFile");
});

test("createMainWindow blocks untrusted popup URLs from shell.openExternal", () => {
  let handler = null;
  const opened = [];
  const win = {
    webContents: {
      setWindowOpenHandler(nextHandler) {
        handler = nextHandler;
      },
    },
    loadURL() {},
    loadFile() {},
  };
  const BrowserWindow = function BrowserWindow() {
    return win;
  };
  const Menu = {
    setApplicationMenu() {},
  };

  createMainWindow({
    BrowserWindow,
    Menu,
    shell: { openExternal(url) { opened.push(url); } },
    route: null,
    isDev: false,
    rendererUrl: "http://127.0.0.1:5180",
    appDir: "/tmp/desktop",
    preloadPath: "/tmp/preload.cjs",
    windowTitleSuffix: "",
    sandbox: false,
    getAppIconPath: () => null,
    applyAppIcon() {},
    createMenu: () => ({}),
  });

  assert.equal(typeof handler, "function");
  assert.deepEqual(handler({ url: "https://evil.example/phish" }), { action: "deny" });
  assert.deepEqual(opened, []);
  assert.deepEqual(handler({ url: "https://github.com/hanityx/threadlens" }), { action: "deny" });
  assert.deepEqual(opened, ["https://github.com/hanityx/threadlens"]);
});
