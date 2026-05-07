const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  executeCommand: (command, commandType, options) =>
    ipcRenderer.send("execute-command", command, commandType, options),
  hideWindow: () => ipcRenderer.send("hide-window"),
  showWindow: () => ipcRenderer.send("show-window"),
  onOpenMenu: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on("open-menu", listener);
    return () => ipcRenderer.removeListener("open-menu", listener);
  },
  /** zenith-verify:radial-handshake-preload — Main vai mostrar o radial — pintar cobertura neutra e confirmar antes de `open-menu` (evita flash pós-minimizar). */
  onPrepareRadialShow: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("prepare-radial-show", listener);
    return () => ipcRenderer.removeListener("prepare-radial-show", listener);
  },
  notifyRadialPrepPaintDone: () =>
    ipcRenderer.send("radial-prep-paint-done"),
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
  /** Main process hid the window to tray (Alt+F4 / system close) — React must drop "interactive" state. */
  onWindowHidToTray: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("window-hid-to-tray", listener);
    return () => ipcRenderer.removeListener("window-hid-to-tray", listener);
  },
  onMainWindowMinimized: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("main-window-minimized", listener);
    return () =>
      ipcRenderer.removeListener("main-window-minimized", listener);
  },
  /** After minimize→restore (Windows transparent window): main process reapplies bounds + hit-testing. */
  onWindowNativeDisplayRestored: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on("window-native-display-restored", listener);
    return () =>
      ipcRenderer.removeListener("window-native-display-restored", listener);
  },
  setWindowSize: (mode, anchorScreenPoint) =>
    ipcRenderer.send("set-window-size", mode, anchorScreenPoint),
  applyWindowSize: (mode, anchorScreenPoint) =>
    ipcRenderer.invoke("apply-window-size", mode, anchorScreenPoint),
  reapplySmallOverlay: () => ipcRenderer.invoke("reapply-small-overlay"),
  setWindowHitShape: (rects, opts) =>
    ipcRenderer.invoke("set-window-hit-shape", rects, opts || {}),
  setWindowOpacity: (opacity) => ipcRenderer.send("set-window-opacity", opacity),
  invalidatePaint: () => ipcRenderer.invoke("invalidate-paint"),
  getMainWindowContentBounds: () =>
    ipcRenderer.invoke("get-main-window-content-bounds"),
  setGameMode: (config) => ipcRenderer.send("set-game-mode", config),
  setLoginItemSettings: (settings) =>
    ipcRenderer.send("set-login-item-settings", settings),
  getFileIcon: (path) => ipcRenderer.invoke("get-file-icon", path),
  getWebsiteFaviconDataUrl: (pageUrl) =>
    ipcRenderer.invoke("get-website-favicon-data-url", pageUrl),
  onWindowState: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on("window-state", listener);
    return () => ipcRenderer.removeListener("window-state", listener);
  },
  onSwitchWorkspace: (callback) => {
    const listener = (event, index) => callback(index);
    ipcRenderer.on("switch-workspace", listener);
    return () => ipcRenderer.removeListener("switch-workspace", listener);
  },
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  toggleMaximize: () => ipcRenderer.send("toggle-maximize"),
  quitApp: () => ipcRenderer.send("quit-app"),
  selectFile: () => ipcRenderer.invoke("select-file"),
  selectFolder: () => ipcRenderer.invoke("select-folder"),
  selectImage: () => ipcRenderer.invoke("select-image"),
  removeManagedCustomIcon: (urlOrPath) =>
    ipcRenderer.invoke("remove-managed-custom-icon", urlOrPath),
  selectPomodoroAudio: () => ipcRenderer.invoke("select-pomodoro-audio"),
  removeManagedPomodoroAudio: (filePath) =>
    ipcRenderer.invoke("remove-managed-pomodoro-audio", filePath),
  getInstalledApps: () => ipcRenderer.invoke("get-installed-apps"),
  getOnboardingApps: () => ipcRenderer.invoke("get-onboarding-apps"),
  getStartupApps: () => ipcRenderer.invoke("get-startup-apps"),
  onExecutionError: (callback) => {
    const listener = (event, errorMsg) => callback(errorMsg);
    ipcRenderer.on("execution-error", listener);
    return () => ipcRenderer.removeListener("execution-error", listener);
  },
  relaunchApp: () => ipcRenderer.send("relaunch-app"),
  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSettings: (settings) => ipcRenderer.send("set-settings", settings),
  openSettingsWindow: () => ipcRenderer.send("open-settings-window"),
  resetConfig: () => ipcRenderer.send("reset-config"),
  toggleSettings: () => ipcRenderer.send("toggle-settings"),
  setBackgroundMaterial: (material) =>
    ipcRenderer.send("set-background-material", material),
  pauseGlobalShortcut: () => ipcRenderer.send("pause-global-shortcut"),
  resumeGlobalShortcut: () => ipcRenderer.send("resume-global-shortcut"),
  startShortcutRecording: () => ipcRenderer.send("start-shortcut-recording"),
  stopShortcutRecording: () => ipcRenderer.send("stop-shortcut-recording"),
  onShortcutRecorded: (callback) => {
    const subscription = (event, shortcut) => callback(shortcut);
    ipcRenderer.on("shortcut-recorded", subscription);
    return () => ipcRenderer.removeListener("shortcut-recorded", subscription);
  },
  saveFullConfig: (config) => ipcRenderer.send("save-full-config", config),
  /** Blocks until written — use on shutdown / visibility hidden so notes are not lost. */
  saveFullConfigSync: (config) => {
    try {
      ipcRenderer.sendSync("save-full-config-sync", config);
    } catch (e) {
      console.error("saveFullConfigSync failed:", e);
    }
  },
  getFullConfig: () => ipcRenderer.invoke("get-full-config"),
  getConfigPersistenceMeta: () =>
    ipcRenderer.invoke("get-config-persistence-meta"),
  onBeforeQuitFlush: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("zenith-before-quit-flush", listener);
    return () =>
      ipcRenderer.removeListener("zenith-before-quit-flush", listener);
  },
  ackQuitFlush: () => ipcRenderer.send("zenith-quit-flush-ack"),
  exportConfig: () => ipcRenderer.invoke("export-config"),
  importConfig: () => ipcRenderer.invoke("import-config"),
  getAppRecents: (appName, appCommand) =>
    ipcRenderer.invoke("get-app-recents", appName, appCommand),
  setWorkspaceShortcutsState: (isOpen, workspaceSwitchMode) =>
    ipcRenderer.send("set-workspace-shortcuts", isOpen, workspaceSwitchMode),
  startGoogleAuth: () => ipcRenderer.send("start-google-auth"),
  onGoogleAuthSuccess: (callback) => {
    const listener = (event, user) => callback(user);
    ipcRenderer.on("google-auth-success", listener);
    return () => ipcRenderer.removeListener("google-auth-success", listener);
  },
  onGoogleAuthError: (callback) => {
    const listener = (event, payload) => callback(payload);
    ipcRenderer.on("google-auth-error", listener);
    return () => ipcRenderer.removeListener("google-auth-error", listener);
  },
  savePersistenceLog: (message) => ipcRenderer.send("save-persistence-log", message),
  /** Opens http(s) URLs in the system default browser (not an Electron window). */
  openExternalUrl: (url) => ipcRenderer.invoke("open-external-url", url),
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
