const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  executeCommand: (command, commandType) =>
    ipcRenderer.send("execute-command", command, commandType),
  hideWindow: () => ipcRenderer.send("hide-window"),
  showWindow: () => ipcRenderer.send("show-window"),
  onOpenMenu: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on("open-menu", listener);
    return () => ipcRenderer.removeListener("open-menu", listener);
  },
  onOpenDashboard: (callback) => {
    const listener = (event) => callback();
    ipcRenderer.on("open-dashboard", listener);
    return () => ipcRenderer.removeListener("open-dashboard", listener);
  },
  onMouseUp: (callback) => {
    const listener = (event) => callback();
    ipcRenderer.on("mouse-up", listener);
    return () => ipcRenderer.removeListener("mouse-up", listener);
  },
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
  setLoginItemSettings: (settings) =>
    ipcRenderer.send("set-login-item-settings", settings),
  getFileIcon: (path) => ipcRenderer.invoke("get-file-icon", path),
  onWindowState: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on("window-state", listener);
    return () => ipcRenderer.removeListener("window-state", listener);
  },
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  toggleMaximize: () => ipcRenderer.send("toggle-maximize"),
  quitApp: () => ipcRenderer.send("quit-app"),
  selectFile: () => ipcRenderer.invoke("select-file"),
  selectImage: () => ipcRenderer.invoke("select-image"),
  getInstalledApps: () => ipcRenderer.invoke("get-installed-apps"),
  onExecutionError: (callback) => {
    const listener = (event, errorMsg) => callback(errorMsg);
    ipcRenderer.on("execution-error", listener);
    return () => ipcRenderer.removeListener("execution-error", listener);
  },
  relaunchApp: () => ipcRenderer.send("relaunch-app"),
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
  openSettingsWindow: () => ipcRenderer.send("open-settings-window"),
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
