const { contextBridge, ipcRenderer } = require("electron");

const apiBaseUrl =
  process.env.PROVIDER_OBSERVATORY_DESKTOP_API_BASE_URL || "http://127.0.0.1:8788";

function runFileAction(action, filePath) {
  return ipcRenderer.invoke("provider-surface:file-action", {
    action,
    filePath,
  });
}

contextBridge.exposeInMainWorld("providerObservatoryDesktop", {
  runtime: "electron",
  apiBaseUrl,
  revealPath(filePath) {
    return runFileAction("reveal", filePath);
  },
  openPath(filePath) {
    return runFileAction("open", filePath);
  },
  previewPath(filePath) {
    return runFileAction("preview", filePath);
  },
  openWorkbenchWindow(payload) {
    return ipcRenderer.invoke("provider-surface:open-window", payload);
  },
});
