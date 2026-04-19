const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const { spawn } = require("node:child_process");
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

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const isSmokeTest = process.env.THREADLENS_SMOKE_TEST === "1";
const DESKTOP_API_START_PORT = Number(
  process.env.THREADLENS_API_PORT || process.env.API_TS_PORT || 8788,
);
const DESKTOP_API_HOST = "127.0.0.1";
const DESKTOP_API_READY_TIMEOUT_MS = 12000;
const DESKTOP_SMOKE_TIMEOUT_MS = Number(process.env.THREADLENS_SMOKE_TIMEOUT_MS || 15000);
const DESKTOP_RENDERER_SANDBOX = false;
let desktopApiProcess = null;
let desktopApiBaseUrl = `http://${DESKTOP_API_HOST}:${DESKTOP_API_START_PORT}`;
const WINDOW_TITLE_SUFFIX = typeof process.env.THREADLENS_WINDOW_TITLE_SUFFIX === "string"
  ? process.env.THREADLENS_WINDOW_TITLE_SUFFIX.trim()
  : "";

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

async function previewLocalPath(filePath) {
  if (process.platform === "darwin") {
    const previewProcess = spawn("qlmanage", ["-p", filePath], {
      detached: true,
      stdio: "ignore",
    });
    previewProcess.unref();
    return;
  }

  const openError = await shell.openPath(filePath);
  if (openError) {
    throw new Error(openError);
  }
}

function createRouteSearch(route) {
  const params = new URLSearchParams();
  if (route?.view) params.set("view", String(route.view));
  if (route?.provider) params.set("provider", String(route.provider));
  if (route?.filePath) params.set("filePath", String(route.filePath));
  if (route?.threadId) params.set("threadId", String(route.threadId));
  const query = params.toString();
  return query ? `?${query}` : "";
}

function readInitialRoute() {
  const raw = typeof process.env.THREADLENS_INITIAL_ROUTE === "string"
    ? process.env.THREADLENS_INITIAL_ROUTE.trim()
    : "";
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      view: typeof parsed.view === "string" ? parsed.view : "",
      provider: typeof parsed.provider === "string" ? parsed.provider : "",
      filePath: typeof parsed.filePath === "string" ? parsed.filePath : "",
      threadId: typeof parsed.threadId === "string" ? parsed.threadId : "",
    };
  } catch (error) {
    console.warn("[desktop] invalid THREADLENS_INITIAL_ROUTE", error);
    return null;
  }
}

function logDesktopApi(stream, chunk) {
  const lines = String(chunk || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    console[stream](`[desktop-api] ${line}`);
  }
}

function resolveRendererEntry() {
  if (isDev) return process.env.ELECTRON_RENDERER_URL;
  return path.join(__dirname, "app", "web", "index.html");
}

function resolveDesktopApiEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "app", "api", "server.cjs");
  }
  return path.join(__dirname, "app", "api", "server.cjs");
}

function waitForPortCandidate(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, DESKTOP_API_HOST);
  });
}

async function findAvailablePort(startPort) {
  for (let offset = 0; offset < 20; offset += 1) {
    const candidate = startPort + offset;
    // eslint-disable-next-line no-await-in-loop
    if (await waitForPortCandidate(candidate)) return candidate;
  }
  return startPort;
}

function requestHealth(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on("error", reject);
    req.setTimeout(1200, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

async function waitForDesktopApi(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const status = await requestHealth(`${url}/api/healthz`);
      if (status >= 200 && status < 500) return true;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

function stopDesktopApi() {
  if (!desktopApiProcess || desktopApiProcess.killed) return;
  desktopApiProcess.kill("SIGTERM");
}

function attachDesktopSmoke(win) {
  let settled = false;
  const timeoutId = setTimeout(() => {
    if (settled) return;
    settled = true;
    console.error(`[desktop-smoke] timeout after ${DESKTOP_SMOKE_TIMEOUT_MS}ms`);
    app.exit(1);
  }, DESKTOP_SMOKE_TIMEOUT_MS);

  const finish = (code, message, stream = "log") => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    console[stream](message);
    app.exit(code);
  };

  win.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
    finish(
      1,
      `[desktop-smoke] renderer failed code=${errorCode} error=${errorDescription}`,
      "error",
    );
  });

  win.webContents.once("did-finish-load", async () => {
    try {
      const status = await requestHealth(`${desktopApiBaseUrl}/api/healthz`);
      if (status >= 200 && status < 300) {
        finish(0, `[desktop-smoke] ready api=${desktopApiBaseUrl} status=${status}`);
        return;
      }
      finish(1, `[desktop-smoke] unexpected health status=${status}`, "error");
    } catch (error) {
      finish(
        1,
        `[desktop-smoke] health check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        "error",
      );
    }
  });
}

async function startDesktopApi() {
  if (isDev || desktopApiProcess) return;

  const apiEntry = resolveDesktopApiEntry();
  const apiPort = await findAvailablePort(DESKTOP_API_START_PORT);
  const stateRoot = path.join(app.getPath("userData"), "state");
  fs.mkdirSync(stateRoot, { recursive: true });

  desktopApiBaseUrl = `http://${DESKTOP_API_HOST}:${apiPort}`;
  process.env.THREADLENS_DESKTOP_API_BASE_URL = desktopApiBaseUrl;

  desktopApiProcess = spawn(process.execPath, [apiEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      API_TS_PORT: String(apiPort),
      APP_VERSION: app.getVersion(),
      THREADLENS_PROJECT_ROOT: stateRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  desktopApiProcess.stdout?.on("data", (chunk) => logDesktopApi("log", chunk));
  desktopApiProcess.stderr?.on("data", (chunk) => logDesktopApi("error", chunk));
  desktopApiProcess.once("exit", (code, signal) => {
    console.log(`[desktop-api] exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    desktopApiProcess = null;
  });

  const ready = await waitForDesktopApi(
    desktopApiBaseUrl,
    DESKTOP_API_READY_TIMEOUT_MS,
  );
  if (!ready) {
    console.warn(
      `[desktop-api] health check timeout for ${desktopApiBaseUrl}; UI will continue in degraded mode`,
    );
  }
}

function createMainWindow(route = null) {
  const windowTitle = WINDOW_TITLE_SUFFIX
    ? `ThreadLens ${WINDOW_TITLE_SUFFIX}`
    : "ThreadLens";
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    title: windowTitle,
    backgroundColor: "#0a0d14",
    autoHideMenuBar: true,
    ...(process.platform !== "darwin" && getAppIconPath() ? { icon: getAppIconPath() } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // Keep sandbox off until a dedicated preload-compatibility pass covers packaged flows.
      sandbox: DESKTOP_RENDERER_SANDBOX,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const entry = resolveRendererEntry();
  const routeSearch = createRouteSearch(route);
  if (isDev) {
    const entryUrl = new URL(entry);
    if (routeSearch) {
      entryUrl.search = routeSearch;
    }
    void win.loadURL(entryUrl.toString());
  } else {
    void win.loadFile(entry, routeSearch ? { search: routeSearch } : undefined);
  }

  applyAppIcon(win);
  Menu.setApplicationMenu(createMenu());
  return win;
}

function createMenu() {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  return Menu.buildFromTemplate(
    buildMenuTemplate({
      appName: "ThreadLens",
      isMac: process.platform === "darwin",
      isDev,
      hasFocusedWindow: Boolean(focusedWindow),
      onOpenRoute: (route) => createMainWindow(route),
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

ipcMain.handle("threadlens:file-action", async (_event, payload) => {
  try {
    const { action, filePath } = parseFileActionPayload(payload);
    const resolvedPath = resolveExistingPath(filePath);
    console.log(`[desktop-electron] file-action action=${action || "unknown"} path=${filePath}`);

    if (action === "reveal") {
      shell.showItemInFolder(resolvedPath);
      return { ok: true };
    }

    if (action === "open") {
      const openError = await shell.openPath(resolvedPath);
      if (openError) {
        throw new Error(openError);
      }
      return { ok: true };
    }

    if (action === "preview") {
      await previewLocalPath(resolvedPath);
      return { ok: true };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("threadlens:open-window", async (_event, payload) => {
  try {
    const route = parseOpenWindowPayload(payload);
    console.log(
      `[desktop-electron] open-window view=${route.view || "none"} provider=${route.provider || "none"} filePath=${route.filePath || "none"} threadId=${route.threadId || "none"}`,
    );
    createMainWindow(route);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("threadlens:get-api-base-url", async () => desktopApiBaseUrl);

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
    .then(() => startDesktopApi())
    .catch((error) => {
      console.error("[desktop-api] failed to start", error);
    })
    .finally(() => {
      const win = createMainWindow(readInitialRoute());
      if (isSmokeTest) {
        attachDesktopSmoke(win);
      }
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  stopDesktopApi();
});

app.on("window-all-closed", () => {
  stopDesktopApi();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
