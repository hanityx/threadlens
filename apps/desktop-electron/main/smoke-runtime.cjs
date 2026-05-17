function attachDesktopSmoke({
  win,
  app,
  requestHealth,
  requestRendererFetch = defaultRequestRendererFetch,
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

  const runSmokeChecks = async () => {
    try {
      const status = await requestHealth(`${apiBaseUrl}/api/healthz`);
      if (status < 200 || status >= 300) {
        finish(1, `[desktop-smoke] unexpected health status=${status}`, "error");
        return;
      }

      const rendererFetch = await requestRendererFetch(win, `${apiBaseUrl}/api/version`);
      if (!rendererFetch?.ok) {
        finish(
          1,
          `[desktop-smoke] renderer fetch failed status=${rendererFetch?.status ?? "unknown"} stage=${rendererFetch?.stage ?? "unknown"}`,
          "error",
        );
        return;
      }

      finish(
        0,
        `[desktop-smoke] ready api=${apiBaseUrl} status=${status} rendererFetch=${rendererFetch.status}`,
      );
    } catch (error) {
      finish(
        1,
        `[desktop-smoke] checks failed: ${
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
    void runSmokeChecks();
  });

  if (
    typeof win.webContents.isLoadingMainFrame === "function"
    && typeof win.webContents.getURL === "function"
    && !win.webContents.isLoadingMainFrame()
    && win.webContents.getURL()
  ) {
    queueMicrotask(runSmokeChecks);
  }
}

function defaultRequestRendererFetch(win, url) {
  if (typeof win.webContents.executeJavaScript !== "function") {
    return Promise.resolve({
      ok: false,
      status: 0,
      stage: "execute-javascript-unavailable",
    });
  }

  return win.webContents.executeJavaScript(
    `
      (async () => {
        try {
          const token = await window.threadLensDesktop?.getApiAuthToken?.();
          if (!token) {
            return { ok: false, status: 0, stage: "auth-token" };
          }
          const response = await fetch(${JSON.stringify(url)}, {
            headers: { "x-threadlens-api-token": token },
          });
          return {
            ok: response.ok,
            status: response.status,
            stage: "fetch",
          };
        } catch (error) {
          return {
            ok: false,
            status: 0,
            stage: error instanceof Error ? error.message : String(error),
          };
        }
      })()
    `,
    true,
  );
}

module.exports = {
  attachDesktopSmoke,
  defaultRequestRendererFetch,
};
