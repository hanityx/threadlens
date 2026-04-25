const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildWindowTitle,
  createRouteSearch,
  createMainWindow,
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
