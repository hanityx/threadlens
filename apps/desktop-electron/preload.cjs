const { contextBridge } = require("electron");

const apiBaseUrl =
  process.env.PROVIDER_OBSERVATORY_DESKTOP_API_BASE_URL || "http://127.0.0.1:8788";

contextBridge.exposeInMainWorld("providerObservatoryDesktop", {
  runtime: "electron",
  apiBaseUrl,
});
