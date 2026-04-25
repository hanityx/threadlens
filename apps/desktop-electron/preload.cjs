const { contextBridge, ipcRenderer } = require("electron");

function runFileAction(action, filePath) {
  return ipcRenderer.invoke("threadlens:file-action", {
    action,
    filePath,
  });
}

contextBridge.exposeInMainWorld("threadLensDesktop", {
  runtime: "electron",
  getApiBaseUrl() {
    return ipcRenderer.invoke("threadlens:get-api-base-url");
  },
  revealPath(filePath) {
    return runFileAction("reveal", filePath);
  },
  openPath(filePath) {
    return runFileAction("open", filePath);
  },
  previewPath(filePath) {
    return runFileAction("preview", filePath);
  },
  pickDirectory(initialPath) {
    return ipcRenderer.invoke("threadlens:pick-directory", { initialPath });
  },
  openWorkbenchWindow(payload) {
    return ipcRenderer.invoke("threadlens:open-window", payload);
  },
});
