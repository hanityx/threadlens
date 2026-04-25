const test = require("node:test");
const assert = require("node:assert/strict");

const { registerDesktopIpcHandlers } = require("./ipc-handlers.cjs");

test("registerDesktopIpcHandlers exposes a directory picker handler", async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(name, fn) {
      handlers.set(name, fn);
    },
  };

  registerDesktopIpcHandlers({
    ipcMain,
    parseFileActionPayload: () => {
      throw new Error("unused");
    },
    parseOpenWindowPayload: () => ({ view: "providers" }),
    resolveExistingPath: (filePath) => filePath,
    shell: {},
    dialog: {
      async showOpenDialog(options) {
        assert.deepEqual(options.properties, ["openDirectory", "createDirectory"]);
        assert.equal(options.defaultPath, "/tmp/backups");
        return {
          canceled: false,
          filePaths: ["/tmp/chosen-backups"],
        };
      },
    },
    createMainWindow: () => undefined,
    getDesktopApiBaseUrl: () => "http://127.0.0.1:8788",
    getDesktopApiAuthToken: () => "desktop-token",
  });

  const pickDirectory = handlers.get("threadlens:pick-directory");
  assert.ok(pickDirectory);
  const getApiAuthToken = handlers.get("threadlens:get-api-auth-token");
  assert.ok(getApiAuthToken);
  assert.equal(await getApiAuthToken(), "desktop-token");

  const result = await pickDirectory({}, { initialPath: "/tmp/backups" });
  assert.deepEqual(result, {
    ok: true,
    canceled: false,
    path: "/tmp/chosen-backups",
  });
});

test("directory picker returns canceled without error when the dialog is dismissed", async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(name, fn) {
      handlers.set(name, fn);
    },
  };

  registerDesktopIpcHandlers({
    ipcMain,
    parseFileActionPayload: () => {
      throw new Error("unused");
    },
    parseOpenWindowPayload: () => ({ view: "providers" }),
    resolveExistingPath: (filePath) => filePath,
    shell: {},
    dialog: {
      async showOpenDialog() {
        return {
          canceled: true,
          filePaths: [],
        };
      },
    },
    createMainWindow: () => undefined,
    getDesktopApiBaseUrl: () => "http://127.0.0.1:8788",
  });

  const pickDirectory = handlers.get("threadlens:pick-directory");
  assert.ok(pickDirectory);

  const result = await pickDirectory({}, {});
  assert.deepEqual(result, {
    ok: true,
    canceled: true,
  });
});

test("directory picker is parented to the invoking BrowserWindow when available", async () => {
  const handlers = new Map();
  const ipcMain = {
    handle(name, fn) {
      handlers.set(name, fn);
    },
  };
  const parentWindow = { id: 7 };
  const sender = { id: "sender" };
  let receivedParent = null;
  let receivedOptions = null;

  registerDesktopIpcHandlers({
    ipcMain,
    parseFileActionPayload: () => {
      throw new Error("unused");
    },
    parseOpenWindowPayload: () => ({ view: "providers" }),
    resolveExistingPath: (filePath) => filePath,
    shell: {},
    dialog: {
      async showOpenDialog(parent, options) {
        receivedParent = parent;
        receivedOptions = options;
        return {
          canceled: false,
          filePaths: ["/tmp/chosen"],
        };
      },
    },
    browserWindowFromWebContents: (webContents) => {
      assert.equal(webContents, sender);
      return parentWindow;
    },
    createMainWindow: () => undefined,
    getDesktopApiBaseUrl: () => "http://127.0.0.1:8788",
  });

  const pickDirectory = handlers.get("threadlens:pick-directory");
  assert.ok(pickDirectory);

  const result = await pickDirectory({ sender }, { initialPath: "/tmp/backups" });
  assert.equal(receivedParent, parentWindow);
  assert.deepEqual(receivedOptions.properties, ["openDirectory", "createDirectory"]);
  assert.equal(receivedOptions.defaultPath, "/tmp/backups");
  assert.deepEqual(result, {
    ok: true,
    canceled: false,
    path: "/tmp/chosen",
  });
});
