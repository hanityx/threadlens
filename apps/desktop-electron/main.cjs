const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, shell } = require("electron");

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const DESKTOP_API_START_PORT = Number(
  process.env.PROVIDER_OBSERVATORY_API_PORT || process.env.API_TS_PORT || 8788,
);
const DESKTOP_API_HOST = "127.0.0.1";
const DESKTOP_API_READY_TIMEOUT_MS = 12000;
let desktopApiProcess = null;
let desktopApiBaseUrl = `http://${DESKTOP_API_HOST}:${DESKTOP_API_START_PORT}`;

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

async function startDesktopApi() {
  if (isDev || desktopApiProcess) return;

  const apiEntry = resolveDesktopApiEntry();
  const apiPort = await findAvailablePort(DESKTOP_API_START_PORT);
  const stateRoot = path.join(app.getPath("userData"), "state");
  fs.mkdirSync(stateRoot, { recursive: true });

  desktopApiBaseUrl = `http://${DESKTOP_API_HOST}:${apiPort}`;
  process.env.PROVIDER_OBSERVATORY_DESKTOP_API_BASE_URL = desktopApiBaseUrl;

  desktopApiProcess = spawn(process.execPath, [apiEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      API_TS_PORT: String(apiPort),
      APP_VERSION: app.getVersion(),
      PROVIDER_OBSERVATORY_PROJECT_ROOT: stateRoot,
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

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    title: "Provider Observatory",
    backgroundColor: "#0a0d14",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const entry = resolveRendererEntry();
  if (isDev) {
    void win.loadURL(entry);
  } else {
    void win.loadFile(entry);
  }
}

app.whenReady().then(() => {
  Promise.resolve()
    .then(() => startDesktopApi())
    .catch((error) => {
      console.error("[desktop-api] failed to start", error);
    })
    .finally(() => {
      createMainWindow();
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
