const path = require("node:path");

function buildWindowTitle(windowTitleSuffix) {
  return windowTitleSuffix ? `ThreadLens ${windowTitleSuffix}` : "ThreadLens";
}

function createRouteSearch(route) {
  const params = new URLSearchParams();
  if (route?.view) params.set("view", String(route.view));
  if (route?.provider) params.set("provider", String(route.provider));
  if (route?.filePath) params.set("filePath", String(route.filePath));
  if (route?.threadId) params.set("threadId", String(route.threadId));
  const query = params.toString();
  return query ? `?${query}` : "";
}

function readInitialRoute(raw = process.env.THREADLENS_INITIAL_ROUTE, logger = console) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      view: typeof parsed.view === "string" ? parsed.view : "",
      provider: typeof parsed.provider === "string" ? parsed.provider : "",
      filePath: typeof parsed.filePath === "string" ? parsed.filePath : "",
      threadId: typeof parsed.threadId === "string" ? parsed.threadId : "",
    };
  } catch (error) {
    logger.warn("[desktop] invalid THREADLENS_INITIAL_ROUTE", error);
    return null;
  }
}

function resolveRendererEntry({ isDev, rendererUrl, appDir }) {
  if (isDev) return rendererUrl;
  return path.join(appDir, "app", "web", "index.html");
}

function createMainWindow({
  BrowserWindow,
  Menu,
  shell,
  route = null,
  isDev,
  rendererUrl,
  appDir,
  preloadPath,
  windowTitleSuffix,
  sandbox,
  backgroundColor = "#0a0d14",
  getAppIconPath,
  applyAppIcon,
  createMenu,
}) {
  const windowTitle = buildWindowTitle(windowTitleSuffix);
  const iconPath = getAppIconPath();
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    title: windowTitle,
    backgroundColor,
    autoHideMenuBar: true,
    ...(process.platform !== "darwin" && iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  const entry = resolveRendererEntry({ isDev, rendererUrl, appDir });
  const routeSearch = createRouteSearch(route);
  if (isDev) {
    const entryUrl = new URL(entry);
    if (routeSearch) entryUrl.search = routeSearch;
    void win.loadURL(entryUrl.toString());
  } else {
    void win.loadFile(entry, routeSearch ? { search: routeSearch } : undefined);
  }

  applyAppIcon(win);
  Menu.setApplicationMenu(createMenu());
  return win;
}

module.exports = {
  buildWindowTitle,
  createRouteSearch,
  readInitialRoute,
  resolveRendererEntry,
  createMainWindow,
};
