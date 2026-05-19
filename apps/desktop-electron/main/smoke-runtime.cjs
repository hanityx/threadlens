const fs = require("node:fs");
const path = require("node:path");

function attachDesktopSmoke({
  win,
  app,
  requestHealth,
  requestRendererFetch = defaultRequestRendererFetch,
  apiBaseUrl,
  timeoutMs,
  artifactDir = process.env.THREADLENS_SMOKE_ARTIFACT_DIR,
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

      const artifacts = await writeDesktopSmokeArtifacts({
        win,
        apiBaseUrl,
        artifactDir,
        healthStatus: status,
        rendererFetch,
      });

      finish(
        0,
        `[desktop-smoke] ready api=${apiBaseUrl} status=${status} rendererFetch=${rendererFetch.status}${artifacts ? ` artifacts=${artifacts.artifactDir}` : ""}`,
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

async function collectRendererProof(win) {
  if (typeof win?.webContents?.executeJavaScript !== "function") {
    return {
      ok: false,
      reason: "execute-javascript-unavailable",
    };
  }

  return win.webContents.executeJavaScript(
    `
      (() => {
        const text = document.body?.innerText || "";
        const url = location.href.startsWith("file:")
          ? location.href.replace(/^file:\\/\\/.*?(ThreadLens\\.app\\/)/, "file://.../$1")
          : location.href;
        return {
          ok: true,
          title: document.title,
          url,
          bodyTextLength: text.length,
          signals: {
            hasThreadLensTitle: document.title.includes("ThreadLens"),
            hasOverviewText: text.includes("Overview"),
            hasSearchText: text.includes("Search"),
            hasThreadText: text.includes("Thread"),
            hasSessionsText: text.includes("Sessions"),
            hasCleanupText: text.includes("Cleanup"),
          },
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio,
          },
        };
      })()
    `,
    true,
  );
}

async function writeDesktopSmokeArtifacts({
  win,
  apiBaseUrl,
  artifactDir,
  healthStatus,
  rendererFetch,
}) {
  if (!artifactDir) {
    return null;
  }

  await fs.promises.mkdir(artifactDir, { recursive: true });

  let screenshotPath = null;
  if (typeof win?.webContents?.capturePage === "function") {
    const image = await win.webContents.capturePage();
    if (typeof image?.toPNG === "function") {
      screenshotPath = path.join(artifactDir, "desktop-smoke.png");
      await fs.promises.writeFile(screenshotPath, image.toPNG());
    }
  }

  const proof = {
    generatedAt: new Date().toISOString(),
    apiBaseUrl,
    healthStatus,
    rendererFetch,
    renderer: await collectRendererProof(win),
    screenshotPath,
  };
  const proofPath = path.join(artifactDir, "desktop-smoke-proof.json");
  await fs.promises.writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`);

  return {
    artifactDir,
    proofPath,
    screenshotPath,
  };
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
