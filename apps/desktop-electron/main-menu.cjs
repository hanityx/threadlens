const fs = require("node:fs");
const path = require("node:path");

function buildMenuTemplate(options) {
  const {
    appName = "ThreadLens",
    isMac = process.platform === "darwin",
    isDev = false,
    hasFocusedWindow = false,
    onOpenRoute = () => {},
    onRefresh = () => {},
    onOpenAppData = () => {},
    onOpenLogs = () => {},
    onShowAbout = () => {},
    onReportIssue = () => {},
    onOpenHomepage = () => {},
  } = options ?? {};

  const workspaceSubmenu = [
    {
      label: "Open Overview Window",
      accelerator: "CmdOrCtrl+1",
      click: () => onOpenRoute({ view: "overview" }),
    },
    {
      label: "Open Search Window",
      accelerator: "CmdOrCtrl+2",
      click: () => onOpenRoute({ view: "search" }),
    },
    {
      label: "Open Cleanup Window",
      accelerator: "CmdOrCtrl+3",
      click: () => onOpenRoute({ view: "threads" }),
    },
    {
      label: "Open Sessions Window",
      accelerator: "CmdOrCtrl+4",
      click: () => onOpenRoute({ view: "providers" }),
    },
  ];

  const actionsSubmenu = [
    {
      label: "Refresh Current Window",
      accelerator: "CmdOrCtrl+R",
      enabled: hasFocusedWindow,
      click: () => onRefresh(),
    },
    { type: "separator" },
    {
      label: "Open App Data Folder",
      click: () => onOpenAppData(),
    },
    {
      label: "Open Logs Folder",
      click: () => onOpenLogs(),
    },
  ];

  const viewSubmenu = [
    { role: "reload" },
    { role: "forceReload" },
    ...(isDev ? [{ role: "toggleDevTools" }] : []),
    { type: "separator" },
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ];

  const helpSubmenu = [
    {
      label: `About ${appName}`,
      click: () => onShowAbout(),
    },
    {
      label: "Report Issue",
      click: () => onReportIssue(),
    },
    {
      label: "Open Project Homepage",
      click: () => onOpenHomepage(),
    },
  ];

  return [
    ...(isMac
      ? [
          {
            label: appName,
            submenu: [
              { label: `About ${appName}`, click: () => onShowAbout() },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : [
          {
            label: "File",
            submenu: [{ role: "quit" }],
          },
        ]),
    { label: "Workspace", submenu: workspaceSubmenu },
    { label: "Actions", submenu: actionsSubmenu },
    { label: "View", submenu: viewSubmenu },
    { role: "windowMenu", label: "Window" },
    { label: "Help", submenu: helpSubmenu },
  ];
}

function resolveAppIconPath(options) {
  const {
    candidates = [],
    existsSync = fs.existsSync,
  } = options ?? {};
  return candidates.find((candidate) => Boolean(candidate) && existsSync(candidate)) || null;
}

function joinForPlatform(platform, ...segments) {
  return platform === "win32" ? path.win32.join(...segments) : path.posix.join(...segments);
}

function getDefaultIconCandidates(
  baseDir,
  isPackaged,
  resourcesPath,
  platform = process.platform,
) {
  const joinPath = (...segments) => joinForPlatform(platform, ...segments);
  if (isPackaged) {
    if (platform === "darwin") {
      return [joinPath(resourcesPath, "icon.icns"), joinPath(resourcesPath, "icon.png")];
    }
    if (platform === "win32") {
      return [joinPath(resourcesPath, "icon.ico"), joinPath(resourcesPath, "icon.png")];
    }
    return [joinPath(resourcesPath, "icon.png"), joinPath(resourcesPath, "icon.ico")];
  }

  return [
    joinPath(baseDir, "build", "icon.icns"),
    joinPath(baseDir, "build", "icon.ico"),
    joinPath(baseDir, "build", "icon.png"),
    joinPath(baseDir, "app", "web", "favicon.svg"),
    joinPath(baseDir, "..", "web", "public", "favicon.svg"),
  ];
}

module.exports = {
  buildMenuTemplate,
  getDefaultIconCandidates,
  resolveAppIconPath,
};
