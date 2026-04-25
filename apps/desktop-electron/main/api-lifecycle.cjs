const path = require("node:path");
const { spawn } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");

function buildDesktopApiBaseUrl(host, port) {
  return `http://${host}:${port}`;
}

function resolveDesktopApiEntry({ appDir, isPackaged, resourcesPath }) {
  if (isPackaged) {
    return path.join(resourcesPath, "app.asar.unpacked", "app", "api", "server.cjs");
  }
  return path.join(appDir, "app", "api", "server.cjs");
}

function buildDesktopApiEnv({
  baseEnv,
  apiPort,
  apiToken,
  appVersion,
  stateRoot,
}) {
  const env = {
    ...baseEnv,
    ELECTRON_RUN_AS_NODE: "1",
    API_TS_PORT: String(apiPort),
    APP_VERSION: appVersion,
    THREADLENS_PROJECT_ROOT: stateRoot,
  };
  if (apiToken) {
    env.THREADLENS_API_TOKEN = apiToken;
  }
  return env;
}

function logDesktopApi(stream, chunk, logger = console) {
  const lines = String(chunk || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    logger[stream](`[desktop-api] ${line}`);
  }
}

function waitForPortCandidate(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function findAvailablePort(startPort, host) {
  for (let offset = 0; offset < 20; offset += 1) {
    const candidate = startPort + offset;
    // eslint-disable-next-line no-await-in-loop
    if (await waitForPortCandidate(candidate, host)) return candidate;
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

async function waitForDesktopApi(url, timeoutMs, requestHealthImpl = requestHealth) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const status = await requestHealthImpl(`${url}/api/healthz`);
      if (status >= 200 && status < 500) return true;
    } catch {
      // keep polling
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return false;
}

function stopDesktopApi(desktopApiProcess) {
  if (!desktopApiProcess || desktopApiProcess.killed) return;
  desktopApiProcess.kill("SIGTERM");
}

async function startDesktopApi({
  isDev,
  desktopApiProcess,
  currentBaseUrl,
  appDir,
  isPackaged,
  resourcesPath,
  startPort,
  host,
  userDataPath,
  appVersion,
  apiToken,
  baseEnv,
  execPath,
  mkdirSync,
  readyTimeoutMs,
  logger = console,
  onExit,
}) {
  if (isDev || desktopApiProcess) {
    return {
      desktopApiProcess,
      baseUrl: currentBaseUrl,
      ready: true,
    };
  }

  const apiEntry = resolveDesktopApiEntry({ appDir, isPackaged, resourcesPath });
  const apiPort = await findAvailablePort(startPort, host);
  const stateRoot = path.join(userDataPath, "state");
  mkdirSync(stateRoot, { recursive: true });

  const baseUrl = buildDesktopApiBaseUrl(host, apiPort);
  const child = spawn(execPath, [apiEntry], {
    env: buildDesktopApiEnv({
      baseEnv,
      apiPort,
      apiToken,
      appVersion,
      stateRoot,
    }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (chunk) => logDesktopApi("log", chunk, logger));
  child.stderr?.on("data", (chunk) => logDesktopApi("error", chunk, logger));
  child.once("exit", (code, signal) => {
    logger.log(`[desktop-api] exited code=${code ?? "null"} signal=${signal ?? "null"}`);
    if (onExit) onExit(code, signal);
  });

  const ready = await waitForDesktopApi(baseUrl, readyTimeoutMs);
  if (!ready) {
    logger.warn(
      `[desktop-api] health check timeout for ${baseUrl}; UI will continue in degraded mode`,
    );
  }

  return {
    desktopApiProcess: child,
    baseUrl,
    ready,
  };
}

module.exports = {
  buildDesktopApiBaseUrl,
  buildDesktopApiEnv,
  resolveDesktopApiEntry,
  logDesktopApi,
  waitForPortCandidate,
  findAvailablePort,
  requestHealth,
  waitForDesktopApi,
  stopDesktopApi,
  startDesktopApi,
};
