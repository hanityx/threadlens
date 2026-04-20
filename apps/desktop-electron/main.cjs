const path = require("node:path");
const fs = require("node:fs");
const { app, BrowserWindow, Menu, ipcMain, nativeImage, shell } = require("electron");
const {
  buildMenuTemplate,
  getDefaultIconCandidates,
  resolveAppIconPath,
} = require("./main-menu.cjs");
const {
  parseFileActionPayload,
  parseOpenWindowPayload,
  resolveExistingPath,
} = require("./ipc-validation.cjs");
const {
  buildDesktopApiBaseUrl,
  requestHealth,
  startDesktopApi,
  stopDesktopApi,
} = require("./main/api-lifecycle.cjs");
const {
  registerDesktopIpcHandlers,
} = require("./main/ipc-handlers.cjs");
const {
  attachDesktopSmoke,
} = require("./main/smoke-runtime.cjs");
const {
  createMainWindow: createDesktopWindow,
  readInitialRoute,
} = require("./main/window-runtime.cjs");

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const isSmokeTest = process.env.THREADLENS_SMOKE_TEST === "1";
const DESKTOP_API_START_PORT = Number(
  process.env.THREADLENS_API_PORT || process.env.API_TS_PORT || 8788,
);
const DESKTOP_API_HOST = "127.0.0.1";
const DESKTOP_API_READY_TIMEOUT_MS = 12000;
const DESKTOP_SMOKE_TIMEOUT_MS = Number(process.env.THREADLENS_SMOKE_TIMEOUT_MS || 15000);
const DESKTOP_RENDERER_SANDBOX = false;
const WINDOW_TITLE_SUFFIX = typeof process.env.THREADLENS_WINDOW_TITLE_SUFFIX === "string"
  ? process.env.THREADLENS_WINDOW_TITLE_SUFFIX.trim()
  : "";

let desktopApiProcess = null;
let desktopApiBaseUrl = buildDesktopApiBaseUrl(
  DESKTOP_API_HOST,
  DESKTOP_API_START_PORT,
);

function getAppIconPath() {
  return resolveAppIconPath({
    candidates: getDefaultIconCandidates(__dirname, app.isPackaged, process.resourcesPath),
  });
}

function applyAppIcon(targetWindow) {
  const iconPath = getAppIconPath();
  if (!iconPath) return;

  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return;

  if (process.platform === "darwin") {
    app.dock?.setIcon(image);
  }

  if (targetWindow && process.platform !== "darwin") {
    targetWindow.setIcon(image);
  }
}

function createMenu() {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  return Menu.buildFromTemplate(
    buildMenuTemplate({
      appName: "ThreadLens",
      isMac: process.platform === "darwin",
      isDev,
      hasFocusedWindow: Boolean(focusedWindow),
      onOpenRoute: (route) => createWindow(route),
      onRefresh: () => {
        const target = BrowserWindow.getFocusedWindow();
        if (target) target.webContents.reload();
      },
      onOpenAppData: async () => {
        const stateRoot = path.join(app.getPath("userData"), "state");
        fs.mkdirSync(stateRoot, { recursive: true });
        await shell.openPath(stateRoot);
      },
      onOpenLogs: async () => {
        const logsDir = app.getPath("logs");
        fs.mkdirSync(logsDir, { recursive: true });
        await shell.openPath(logsDir);
      },
      onShowAbout: () => {
        app.showAboutPanel();
      },
      onOpenHomepage: () => {
        void shell.openExternal("https://github.com/hanityx/threadlens");
      },
    }),
  );
}

function createWindow(route = null) {
  return createDesktopWindow({
    BrowserWindow,
    Menu,
    shell,
    route,
    isDev,
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    appDir: __dirname,
    preloadPath: path.join(__dirname, "preload.cjs"),
    windowTitleSuffix: WINDOW_TITLE_SUFFIX,
    sandbox: DESKTOP_RENDERER_SANDBOX,
    getAppIconPath,
    applyAppIcon,
    createMenu,
    onBeforeLoad: isSmokeTest
      ? (win) => {
          attachDesktopSmoke({
            win,
            app,
            requestHealth,
            apiBaseUrl: desktopApiBaseUrl,
            timeoutMs: DESKTOP_SMOKE_TIMEOUT_MS,
            logger: console,
          });
        }
      : undefined,
  });
}

registerDesktopIpcHandlers({
  ipcMain,
  parseFileActionPayload,
  parseOpenWindowPayload,
  resolveExistingPath,
  shell,
  createMainWindow: createWindow,
  getDesktopApiBaseUrl: () => desktopApiBaseUrl,
});

app.whenReady().then(() => {
  app.setName("ThreadLens");
  app.setAboutPanelOptions({
    applicationName: "ThreadLens",
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    credits: "Local-first AI thread and session workbench",
  });
  Menu.setApplicationMenu(createMenu());
  Promise.resolve()
    .then(async () => {
      const result = await startDesktopApi({
        isDev,
        desktopApiProcess,
        currentBaseUrl: desktopApiBaseUrl,
        appDir: __dirname,
        isPackaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        startPort: DESKTOP_API_START_PORT,
        host: DESKTOP_API_HOST,
        userDataPath: app.getPath("userData"),
        appVersion: app.getVersion(),
        baseEnv: process.env,
        execPath: process.execPath,
        mkdirSync: fs.mkdirSync,
        readyTimeoutMs: DESKTOP_API_READY_TIMEOUT_MS,
        logger: console,
        onExit: () => {
          desktopApiProcess = null;
        },
      });
      desktopApiProcess = result.desktopApiProcess;
      desktopApiBaseUrl = result.baseUrl;
      process.env.THREADLENS_DESKTOP_API_BASE_URL = desktopApiBaseUrl;
    })
    .catch((error) => {
      console.error("[desktop-api] failed to start", error);
    })
    .finally(() => {
      createWindow(readInitialRoute());
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  stopDesktopApi(desktopApiProcess);
});

app.on("window-all-closed", () => {
  stopDesktopApi(desktopApiProcess);
  if (process.platform !== "darwin") {
    app.quit();
  }
});
