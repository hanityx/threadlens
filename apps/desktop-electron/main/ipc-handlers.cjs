const { spawn } = require("node:child_process");

async function previewLocalPath(filePath, { platform = process.platform, shell, spawnFn = spawn }) {
  if (platform === "darwin") {
    const previewProcess = spawnFn("qlmanage", ["-p", filePath], {
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

function registerDesktopIpcHandlers({
  ipcMain,
  parseFileActionPayload,
  parseOpenWindowPayload,
  resolveExistingPath,
  shell,
  createMainWindow,
  getDesktopApiBaseUrl,
  logger = console,
  previewLocalPathImpl = previewLocalPath,
}) {
  ipcMain.handle("threadlens:file-action", async (_event, payload) => {
    try {
      const { action, filePath } = parseFileActionPayload(payload);
      const resolvedPath = resolveExistingPath(filePath);
      logger.log(
        `[desktop-electron] file-action action=${action || "unknown"} path=${filePath}`,
      );

      if (action === "reveal") {
        shell.showItemInFolder(resolvedPath);
        return { ok: true };
      }

      if (action === "open") {
        const openError = await shell.openPath(resolvedPath);
        if (openError) throw new Error(openError);
        return { ok: true };
      }

      if (action === "preview") {
        await previewLocalPathImpl(resolvedPath, { shell });
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
      logger.log(
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

  ipcMain.handle(
    "threadlens:get-api-base-url",
    async () => getDesktopApiBaseUrl(),
  );
}

module.exports = {
  previewLocalPath,
  registerDesktopIpcHandlers,
};
