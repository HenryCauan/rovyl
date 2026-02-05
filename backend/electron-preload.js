const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  executeCommand: (command, commandType) =>
    ipcRenderer.send("execute-command", command, commandType),
  hideWindow: () => ipcRenderer.send("hide-window"),
  showWindow: () => ipcRenderer.send("show-window"),
  onOpenMenu: (callback) =>
    ipcRenderer.on("open-menu", (event, data) => callback(data)),
  onOpenDashboard: (callback) =>
    ipcRenderer.on("open-dashboard", (event) => callback()),
  onMouseUp: (callback) => ipcRenderer.on("mouse-up", (event) => callback()),
  onMmbRelease: (callback) => {
    const listener = (event) => callback();
    ipcRenderer.on("mmb-release", listener);
    return () => ipcRenderer.removeListener("mmb-release", listener);
  },
  onOpenSettings: (callback) => {
    const listener = (event) => callback();
    ipcRenderer.on("open-settings", listener);
    return () => ipcRenderer.removeListener("open-settings", listener);
  },
  setWindowSize: (mode) => ipcRenderer.send("set-window-size", mode),
  setGameMode: (config) => ipcRenderer.send("set-game-mode", config),
  getFileIcon: (path) => ipcRenderer.invoke("get-file-icon", path),
  onWindowState: (callback) =>
    ipcRenderer.on("window-state", (event, state) => callback(state)),
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  toggleMaximize: () => ipcRenderer.send("toggle-maximize"),
  quitApp: () => ipcRenderer.send("quit-app"),
  selectFile: () => ipcRenderer.invoke("select-file"),
  getInstalledApps: () => ipcRenderer.invoke("get-installed-apps"),
  onExecutionError: (callback) =>
    ipcRenderer.on("execution-error", (event, errorMsg) => callback(errorMsg)),
  // System Controls
  getVolume: () => ipcRenderer.invoke("get-volume"),
  setVolume: (level) => ipcRenderer.send("set-volume", level),
  getBrightness: () => ipcRenderer.invoke("get-brightness"),
  setBrightness: (level) => ipcRenderer.send("set-brightness", level),
  toggleBluetooth: (enabled) => ipcRenderer.invoke("toggle-bluetooth", enabled),
  toggleWifi: (enabled) => ipcRenderer.invoke("toggle-wifi", enabled),
  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (settings) => ipcRenderer.send("set-settings", settings),
});

// Intercept console messages from the renderer process and send them to the main process
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

console.log = (...args) => {
  ipcRenderer.send("renderer-log", "log", ...args);
  originalConsole.log(...args);
};

console.warn = (...args) => {
  ipcRenderer.send("renderer-log", "warn", ...args);
  originalConsole.warn(...args);
};

console.error = (...args) => {
  ipcRenderer.send("renderer-log", "error", ...args);
  originalConsole.error(...args);
};
