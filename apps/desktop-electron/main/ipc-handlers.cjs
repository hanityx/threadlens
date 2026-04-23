const { spawn } = require("node:child_process");
const path = require("node:path");

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
  dialog,
  browserWindowFromWebContents = () => null,
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
        `[desktop-electron] file-action action=${action || "unknown"} name=${path.basename(filePath)}`,
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
        `[desktop-electron] open-window view=${route.view || "none"} provider=${route.provider || "none"} sessionId=${route.sessionId || "none"} threadId=${route.threadId || "none"} hasLegacyFilePath=${route.filePath ? "yes" : "no"}`,
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

  ipcMain.handle("threadlens:pick-directory", async (event, payload) => {
    try {
      const initialPath =
        typeof payload?.initialPath === "string" && payload.initialPath.trim()
          ? payload.initialPath.trim()
          : undefined;
      const options = {
        properties: ["openDirectory", "createDirectory"],
        defaultPath: initialPath,
      };
      const parentWindow = browserWindowFromWebContents(event?.sender);
      const result = parentWindow
        ? await dialog.showOpenDialog(parentWindow, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || !result.filePaths?.length) {
        return { ok: true, canceled: true };
      }
      return {
        ok: true,
        canceled: false,
        path: result.filePaths[0],
      };
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
