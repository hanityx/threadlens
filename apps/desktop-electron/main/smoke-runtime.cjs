function attachDesktopSmoke({
  win,
  app,
  requestHealth,
  apiBaseUrl,
  timeoutMs,
  logger = console,
}) {
  let settled = false;
  const timeoutId = setTimeout(() => {
    if (settled) return;
    settled = true;
    logger.error(`[desktop-smoke] timeout after ${timeoutMs}ms`);
    app.exit(1);
  }, timeoutMs);

  const finish = (code, message, stream = "log") => {
    if (settled) return;
    settled = true;
    clearTimeout(timeoutId);
    logger[stream](message);
    app.exit(code);
  };

  const runHealthCheck = async () => {
    try {
      const status = await requestHealth(`${apiBaseUrl}/api/healthz`);
      if (status >= 200 && status < 300) {
        finish(0, `[desktop-smoke] ready api=${apiBaseUrl} status=${status}`);
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
  };

  win.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
    finish(
      1,
      `[desktop-smoke] renderer failed code=${errorCode} error=${errorDescription}`,
      "error",
    );
  });

  win.webContents.once("dom-ready", () => {
    void runHealthCheck();
  });

  if (
    typeof win.webContents.isLoadingMainFrame === "function"
    && typeof win.webContents.getURL === "function"
    && !win.webContents.isLoadingMainFrame()
    && win.webContents.getURL()
  ) {
    queueMicrotask(runHealthCheck);
  }
}

module.exports = {
  attachDesktopSmoke,
};
