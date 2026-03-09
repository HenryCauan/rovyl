const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  screen,
  nativeImage,
  Menu,
  Tray,
  shell,
  dialog,
} = require("electron");
const path = require("path");
const { exec, spawn } = require("child_process");
const os = require("os");
const fs = require("fs");
const { GlobalKeyboardListener } = require("node-global-key-listener");

const isDev = !app.isPackaged;
const logDir = isDev
  ? path.join(__dirname, "..")
  : path.join(os.homedir(), ".zenith-radial-menu");
const logFile = path.join(logDir, "diagnostic.log");

const logQueue = [];
let isWriting = false;

const processLogQueue = () => {
  if (isWriting || logQueue.length === 0) return;
  isWriting = true;

  const logsToWrite = logQueue.splice(0, logQueue.length).join("");

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFile(logFile, logsToWrite, (err) => {
      isWriting = false;
      if (err) {
        console.error("Async log write failed:", err);
      }
      // Process any new logs that arrived during writing
      if (logQueue.length > 0) processLogQueue();
    });
  } catch (e) {
    isWriting = false;
    console.error("Failed to ensure log directory exists:", e);
  }
};

const diagLog = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  logQueue.push(line);

  // Throttle writes: process immediately in dev, or when queue reaches 10 lines in prod
  if (isDev || logQueue.length >= 10) {
    processLogQueue();
  }
};

// Periodic flush to ensure logs aren't stuck in queue
setInterval(processLogQueue, 5000);
const getAssetPath = (...paths) => {
  if (isDev) return path.join(__dirname, ...paths);
  // In production, backend is inside app.asar/backend. We need to point to app.asar.unpacked/backend for script execution.
  return path.join(
    __dirname.replace("app.asar", "app.asar.unpacked"),
    ...paths,
  );
};

diagLog("Zenith Main Process Started");

// Performance: GPU rendering optimizations
// IMPORTANT: disable-gpu-rasterization was REMOVED — it forced CPU rendering causing sluggish animations.
app.commandLine.appendSwitch("disable-gpu-cache"); // Avoid stale cache issues on startup
app.commandLine.appendSwitch("no-sandbox"); // Required for some Electron builds
app.commandLine.appendSwitch("enable-zero-copy-dxgi-video"); // Optimize video rendering on Windows
app.commandLine.appendSwitch(
  "disable-features",
  "WindowOcclusionPrediction,CalculateNativeWinOcclusion",
); // Prevent OS from hiding/throttling window
app.commandLine.appendSwitch(
  "enable-features",
  "VaapiVideoDecoder,CanvasOopRasterization",
); // GPU-accelerated rendering
app.commandLine.appendSwitch("disable-software-rasterizer"); // Prevent fallback to software rendering
app.commandLine.appendSwitch("enable-gpu-rasterization"); // Explicitly enable GPU rasterization for smooth animations
app.commandLine.appendSwitch("ignore-gpu-blocklist"); // Use GPU even if on the blocklist (some integrated GPUs)

// Fix Taskbar Icon Grouping
app.setAppUserModelId("com.henry.zenith"); // AUMID explicitly set
// app.setPath("userData", path.join(os.tmpdir(), "zenith-radial-menu-cache")); // REMOVED: tmpdir is not persistent

// Remove default menus (File, Edit, etc.)
Menu.setApplicationMenu(null);

// High Priority for Global Inputs
try {
  os.setPriority(os.constants.priority.PRIORITY_HIGH);
  console.log("Process priority set to HIGH");
} catch (e) {
  console.error("Failed to set priority:", e);
}

let mainWindow;
let settingsWindow = null;

// Game Mode Configuration Storage
let gameModeConfig = {
  enabled: false,
  blockFullscreen: true,
  blockedApps: "",
};

// Window Management Persistence
let lastWindowedBounds = { width: 1280, height: 800, x: 100, y: 100 };
let isUpdatingBounds = false;

// Shortcut Recording State
let keyboardListener = null;
let recordingActive = false;

function startShortcutRecording() {
  if (keyboardListener) return;

  keyboardListener = new GlobalKeyboardListener();
  recordingActive = true;

  keyboardListener.addListener((e, down) => {
    if (e.state === "DOWN" && recordingActive) {
      // Collect all currently pressed keys
      const modifiers = {
        CTRL: false,
        ALT: false,
        SHIFT: false,
        META: false,
      };

      // Check modifiers using the 'down' object which tracks all pressed keys
      // The listener provides names like "LEFT CTRL", "RIGHT SHIFT", etc.
      Object.keys(down).forEach((keyName) => {
        if (keyName.includes("CTRL")) modifiers.CTRL = true;
        if (keyName.includes("ALT")) modifiers.ALT = true;
        if (keyName.includes("SHIFT")) modifiers.SHIFT = true;
        if (keyName.includes("META") || keyName.includes("WINDOWS"))
          modifiers.META = true;
      });

      // Extract the main key
      let key = e.name;

      // Ignore lone modifiers (don't record if ONLY Ctrl is pressed)
      if (
        [
          "LEFT CTRL",
          "RIGHT CTRL",
          "LEFT ALT",
          "RIGHT ALT",
          "LEFT SHIFT",
          "RIGHT SHIFT",
          "LEFT META",
          "RIGHT META",
          "WINDOWS",
        ].includes(key)
      ) {
        return;
      }

      const formattedModifiers = [];
      if (modifiers.CTRL) formattedModifiers.push("Ctrl");
      if (modifiers.ALT) formattedModifiers.push("Alt");
      if (modifiers.SHIFT) formattedModifiers.push("Shift");
      if (modifiers.META) formattedModifiers.push("Super"); // Map Win key to Super for Electron compatibility

      // Key name normalization for Zenith format
      if (key === "SPACE") key = "Space";
      if (key === "ESCAPE") key = "Escape";
      if (key.length === 1) key = key.toUpperCase();

      // Handle Function keys F1-F12 (they come in as F1, F2...)

      const shortcutString = [...formattedModifiers, key].join("+");

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("shortcut-recorded", shortcutString);
      }
    }
  });
}

function stopShortcutRecording() {
  recordingActive = false;
  if (keyboardListener) {
    keyboardListener.kill();
    keyboardListener = null;
  }
}

async function createWindow() {
  const newWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    x: 100,
    y: 100,
    frame: false, // Keep frameless for transparency
    titleBarStyle: "hidden", // Hide default title bar but keep controls
    titleBarOverlay: false,
    transparent: true,
    alwaysOnTop: false,
    skipTaskbar: false,
    show: false,
    fullscreen: false,
    hasShadow: false, // Disable native shadow to prevent rectangular ghosting around rounded CSS corners
    thickFrame: false, // Prevents native resizing border artifacts on Win 11
    icon: isDev
      ? path.join(__dirname, "../public/icon.png")
      : path.join(__dirname, "../dist/icon.png"),
    backgroundColor: "#00000000",
    backgroundMaterial: "none", // Avoid acrylic blur leaking outside rounded corners
    webPreferences: {
      preload: path.join(__dirname, "electron-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
      backgroundThrottling: false,
    },
  });

  // Handle window close event to hide it to tray instead of quitting
  newWindow.on("close", (event) => {
    if (newWindow.isVisible()) {
      event.preventDefault(); // Prevent actual close
      newWindow.hide();
      newWindow.setSkipTaskbar(true); // Ensure it's not in the taskbar when hidden
    }
  });

  // Setup window content immediately to trigger loading -> ready-to-show
  setupMainWindow(newWindow);

  return new Promise((resolve) => {
    newWindow.once("ready-to-show", () => {
      // Phase 1: Stabilization Delay (200ms)
      // Chromium on Windows often needs a few frames to stabilize the transparent compositor
      setTimeout(() => {
        console.log("Main window ready (stabilized)");
        resolve(newWindow);
      }, 200);
    });

    // Track bounds for persistence
    newWindow.on("resize", () => {
      if (
        !newWindow.isFullScreen() &&
        !newWindow.isMaximized() &&
        !isUpdatingBounds
      ) {
        lastWindowedBounds = {
          ...lastWindowedBounds,
          ...newWindow.getBounds(),
        };
      }
    });

    newWindow.on("move", () => {
      if (
        !newWindow.isFullScreen() &&
        !newWindow.isMaximized() &&
        !isUpdatingBounds
      ) {
        lastWindowedBounds = {
          ...lastWindowedBounds,
          ...newWindow.getBounds(),
        };
      }
    });
  });
}

function setupMainWindow(window) {
  // Nível máximo de sobreposição
  window.setAlwaysOnTop(true, "screen-saver", 1);

  // Enviar eventos de janelamento para o React
  window.on("maximize", () =>
    window.webContents.send("window-state", "maximized"),
  );
  window.on("unmaximize", () =>
    window.webContents.send("window-state", "windowed"),
  );

  if (isDev) {
    console.log("DEBUG: Loading URL http://localhost:5173");
    window.loadURL("http://localhost:5173");
  } else {
    console.log(
      "DEBUG: Loading file " + path.join(__dirname, "../dist/index.html"),
    );
    window.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Add error handling
  window.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      diagLog(
        `Renderer Failed to Load: Code ${errorCode} - ${errorDescription}`,
      );
      console.error(
        `DEBUG: Failed to load content: ${errorCode} - ${errorDescription}`,
      );
    },
  );

  window.webContents.on("crashed", (event, killed) => {
    diagLog(`Renderer process crashed. Killed: ${killed}`);
    console.error(`DEBUG: Renderer process crashed. Killed: ${killed}`);
  });

  window.webContents.on("render-process-gone", (event, details) => {
    diagLog(
      `Renderer process gone. Reason: ${details.reason}, Exit Code: ${details.exitCode}`,
    );
    console.error(
      `DEBUG: Renderer process gone. Reason: ${details.reason}, Exit Code: ${details.exitCode}`,
    );
  });

  window.webContents.on("did-finish-load", () => {
    diagLog("Renderer: Content finished loading successfully");
    console.log("DEBUG: Content finished loading successfully");
  });

  // IPC handler for renderer process logs
  ipcMain.on("renderer-log", (event, level, message, ...args) => {
    // In production, only log warnings and errors to save performance
    if (!isDev && level !== "warn" && level !== "error") return;
    diagLog(`RENDERER [${level.toUpperCase()}]: ${message} ${args.join(" ")}`);
  });

  // Open dev tools
  // window.webContents.openDevTools();

  // DISABLED FOR DEBUG: window.setIgnoreMouseEvents(true, { forward: true });
}

// WORKSPACE SHORTCUT MANAGEMENT
function registerWorkspaceShortcuts() {
  const shortcutKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  shortcutKeys.forEach((key) => {
    // Optimization: Only register if not already managed by us
    if (!globalShortcut.isRegistered(key)) {
      globalShortcut.register(key, () => {
        const index = key === "0" ? 9 : parseInt(key) - 1;
        if (mainWindow && !mainWindow.isDestroyed()) {
          diagLog(
            `[GlobalShortcut] Key ${key} pressed -> Switching to workspace ${index}`,
          );
          mainWindow.webContents.send("switch-workspace", index);
        }
      });
    }
  });
}

function unregisterWorkspaceShortcuts() {
  const shortcutKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
  shortcutKeys.forEach((key) => {
    if (globalShortcut.isRegistered(key)) {
      globalShortcut.unregister(key);
    }
  });
  console.log("[Shortcuts] Unregistered workspace keys");
}

function showMenuAtCursor(source = "shortcut") {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  // 1. Force state updates in one block
  mainWindow.setSkipTaskbar(true);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // 2. Window Position & Size (Only update if needed)
  if (!mainWindow.isFullScreen()) {
    updateWindowSize("fullscreen");
  }

  // 3. Visibility & Interaction (Instant)
  mainWindow.setOpacity(1);
  mainWindow.setIgnoreMouseEvents(false);

  // 4. Aggressive Focus
  mainWindow.show(); // Ensure OS knows it's active
  mainWindow.focus();
  mainWindow.webContents.focus();

  // 5. Cleanup/Register inputs
  registerWorkspaceShortcuts();

  const cursorPoint = screen.getCursorScreenPoint();
  mainWindow.webContents.send("open-menu", {
    x: cursorPoint.x,
    y: cursorPoint.y,
    source: source,
  });
}

function updateWindowSize(mode) {
  if (!mainWindow) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  if (mode === "fullscreen") {
    // Fill the entire screen
    mainWindow.setBounds({
      x: primaryDisplay.bounds.x,
      y: primaryDisplay.bounds.y,
      width: screenWidth,
      height: screenHeight,
    });
    mainWindow.setResizable(true);
    mainWindow.setOpacity(1); // ENSURE VISIBILITY
    mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    mainWindow.setIgnoreMouseEvents(false);
  } else if (mode === "windowed") {
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
    mainWindow.setResizable(true);
    isUpdatingBounds = true;
    mainWindow.setBounds(lastWindowedBounds);
    isUpdatingBounds = false;
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.setOpacity(1);
    if (!mainWindow.isVisible()) mainWindow.show();
  } else if (mode === "small") {
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    // Keep it large/fullscreen but transparent and ignore mouse to avoid resize flashes
    // We use setBounds to ensure it covers the whole screen even if not "fullscreen" mode
    mainWindow.setBounds({
      x: 0,
      y: 0,
      width: screenWidth,
      height: screenHeight,
    });
    mainWindow.setOpacity(1);
  }
}

// Function to check if a specific process is running (Basic implementation)
const isProcessRunning = (processNames) => {
  return new Promise((resolve) => {
    const platform = process.platform;
    let cmd = "";

    // Normalize input list
    const targets = processNames
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (targets.length === 0) {
      resolve(false);
      return;
    }

    if (platform === "win32") {
      cmd = "tasklist /FO CSV";
    } else {
      cmd = "ps -ax -o comm";
    }

    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        resolve(false);
        return;
      }

      const output = stdout.toLowerCase();
      const isRunning = targets.some((target) => output.includes(target));
      resolve(isRunning);
    });
  });
};

// Main function to decide if we should open
const shouldOpenMenu = async () => {
  if (!gameModeConfig.enabled) return true;

  // 1. Check Fullscreen (Placeholder logic - requires native dependency 'active-win' for accurate results)
  // For this simulated environment, we skip the actual fullscreen check or user has to add native logic.
  // if (gameModeConfig.blockFullscreen) { /* check active-win */ }

  // 2. Check Blocked Apps
  if (gameModeConfig.blockedApps && gameModeConfig.blockedApps.length > 0) {
    const isRunning = await isProcessRunning(gameModeConfig.blockedApps);
    if (isRunning) {
      console.log("Zenith blocked: Game/Focus mode active.");
      return false;
    }
  }

  return true;
};

let tray = null;

app.whenReady().then(async () => {
  // 1. Initialize Settings Management First (to avoid race conditions with renderer)
  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  let currentSettings = {
    globalShortcut: "Alt+Z",
    enableMouseTrigger: true,
    openAtLogin: false,
  };

  const syncLoginItemSettings = (openAtLogin) => {
    try {
      if (typeof openAtLogin === "boolean") {
        const currentLoginSettings = app.getLoginItemSettings();
        if (currentLoginSettings.openAtLogin !== openAtLogin || isDev) {
          app.setLoginItemSettings({
            openAtLogin: openAtLogin,
            path: app.getPath("exe"),
          });
          console.log(
            `Login item settings synced: openAtLogin = ${openAtLogin}`,
          );
        }
      }
    } catch (e) {
      console.error("Failed to sync login item settings:", e);
    }
  };

  const loadSettings = () => {
    try {
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, "utf-8");
        currentSettings = { ...currentSettings, ...JSON.parse(data) };
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  };

  const saveSettings = (newSettings) => {
    try {
      currentSettings = { ...currentSettings, ...newSettings };
      fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 2));
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  };

  loadSettings();
  loadIconCache();
  if (currentSettings.openAtLogin !== undefined) {
    syncLoginItemSettings(currentSettings.openAtLogin);
  }

  // Register essential IPC handlers BEFORE window creation
  ipcMain.handle("get-settings", () => currentSettings);

  ipcMain.handle("get-full-config", () => {
    const configPath = path.join(app.getPath("userData"), "config-v2.json");
    try {
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, "utf-8");
        return JSON.parse(data);
      }
    } catch (e) {
      console.error("Failed to load full config:", e);
    }
    return null;
  });

  ipcMain.on("save-full-config", (event, config) => {
    const configPath = path.join(app.getPath("userData"), "config-v2.json");
    try {
      if (!fs.existsSync(path.dirname(configPath))) {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      diagLog("[Config] Full configuration saved successfully");
    } catch (e) {
      console.error("Failed to save full config:", e);
      diagLog(`[ERROR] Failed to save full config: ${e.message}`);
    }
  });

  // 2. Create Window
  mainWindow = await createWindow();

  // Safety: Unregister shortcuts ONLY if window is truly inactive/hidden
  // Avoid unregistering on every minor blur if we are still the active overlay
  mainWindow.on("blur", () => {
    if (mainWindow && !mainWindow.isVisible()) {
      unregisterWorkspaceShortcuts();
    }
  });

  // Configurar Ícone na Bandeja (Tray)
  const iconPath = isDev
    ? path.join(__dirname, "../public/icon.png")
    : path.join(__dirname, "../dist/icon.png");
  try {
    const trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      console.warn("WARNING: Tray icon is empty. Path:", iconPath);
    }
    const resizedIcon = trayIcon.resize({ width: 16, height: 16 });
    tray = new Tray(resizedIcon);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Abrir Dashboard Zenith",
        click: async () => {
          if (!mainWindow || mainWindow.isDestroyed()) {
            mainWindow = await createWindow();
            setupMainWindow(mainWindow);
          }

          // Smooth Entry Trick: Mask the initial white flash/compositor stutter
          mainWindow.setOpacity(0);
          mainWindow.show();
          mainWindow.setSkipTaskbar(false);

          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setOpacity(1);
              mainWindow.focus();
              mainWindow.webContents.send("open-dashboard");
            }
          }, 50);
        },
      },
      {
        label: "Abrir Configurações",
        click: async () => {
          if (mainWindow) {
            mainWindow.setOpacity(1); // Restore opacity
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send("open-settings");
          }
        },
      },
      { type: "separator" },
      { label: "Sair", click: () => app.quit() },
    ]);
    tray.setToolTip("Zenith Radial Menu");
    tray.setContextMenu(contextMenu);

    // Feedback de início
    console.log("Zenith iniciado com sucesso em background.");
  } catch (err) {
    console.error("Erro ao criar tray icon:", err);
  }

  const registerGlobalShortcut = () => {
    globalShortcut.unregisterAll();
    let shortcut = currentSettings.globalShortcut || "Alt+Z";

    // MIGRATION / NORMALIZATION: 'Win' is recorded as 'Super' now, but old settings might have 'Win'
    if (shortcut.includes("Win")) {
      shortcut = shortcut.replace(/Win/g, "Super");
      diagLog(
        `[Shortcut] Normalized 'Win' to 'Super' in shortcut: ${shortcut}`,
      );
    }

    try {
      const registered = globalShortcut.register(shortcut, async () => {
        diagLog(`${shortcut} shortcut triggered`);
        const allowed = await shouldOpenMenu();
        if (!allowed) return;
        showMenuAtCursor("shortcut");
      });

      if (registered) {
        diagLog(`Global shortcut '${shortcut}' registered successfully.`);
      } else {
        const errorMsg = `Shortcut '${shortcut}' could not be registered (likely reserved by OS).`;
        diagLog(`[ERROR] ${errorMsg}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("execution-error", errorMsg);
        }
      }
    } catch (e) {
      const errorMsg = `Critical error registering shortcut '${shortcut}': ${e.message}`;
      diagLog(`[FATAL] ${errorMsg}`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("execution-error", errorMsg);
      }
    }

    // Register individual app shortcuts from workspaces
    if (
      currentSettings.workspaces &&
      Array.isArray(currentSettings.workspaces)
    ) {
      currentSettings.workspaces.forEach((ws) => {
        // Helper to recursively register shortcuts in app trees (folders)
        const registerAppShortcutsRecursive = (apps) => {
          if (!apps || !Array.isArray(apps)) return;

          apps.forEach((app) => {
            if (app.shortcut && app.command) {
              try {
                const appShortcut = app.shortcut.includes("Win")
                  ? app.shortcut.replace(/Win/g, "Super")
                  : app.shortcut;
                const success = globalShortcut.register(appShortcut, () => {
                  diagLog(
                    `[Shortcuts] App shortcut triggered: ${appShortcut} -> ${app.label}`,
                  );
                  executeCommand(app.command, app.commandType || "app");
                });
                if (success) {
                  diagLog(
                    `[Shortcuts] Successfully registered app shortcut: ${appShortcut} for ${app.label}`,
                  );
                } else {
                  diagLog(
                    `[Shortcuts] Failed to register app shortcut: ${appShortcut} for ${app.label} (Likely reserved by OS)`,
                  );
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send(
                      "execution-error",
                      `Erro ao registrar atalho para ${app.label}: ${appShortcut}`,
                    );
                  }
                }
              } catch (e) {
                diagLog(
                  `[Shortcuts] Exception registering shortcut for ${app.label}: ${e.message}`,
                );
              }
            }
            if (app.children) registerAppShortcutsRecursive(app.children);
          });
        };

        registerAppShortcutsRecursive(ws.apps);
      });
    }
  };

  // Register initial shortcut
  registerGlobalShortcut();

  ipcMain.on("set-settings", (event, settings) => {
    const oldMouseTrigger = currentSettings.enableMouseTrigger;
    saveSettings(settings);

    if (settings.globalShortcut) {
      registerGlobalShortcut();
    }

    if (settings.openAtLogin !== undefined) {
      syncLoginItemSettings(settings.openAtLogin);
    }

    if (
      settings.enableMouseTrigger !== undefined &&
      settings.enableMouseTrigger !== oldMouseTrigger
    ) {
      if (settings.enableMouseTrigger) {
        startMouseHook();
      } else {
        stopMouseHook();
      }
    }
  });

  ipcMain.on("set-login-item-settings", (event, settings) => {
    if (settings && typeof settings.openAtLogin === "boolean") {
      syncLoginItemSettings(settings.openAtLogin);
      // We also update currentSettings so it persists
      currentSettings.openAtLogin = settings.openAtLogin;
      saveSettings(currentSettings);
    }
  });

  ipcMain.on("set-background-material", (event, material) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setBackgroundMaterial(material);
    }
  });

  ipcMain.on("open-config-folder", () => {
    shell.openPath(app.getPath("userData"));
  });

  ipcMain.on("toggle-settings", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(1);
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("open-settings");
    }
  });

  ipcMain.on("pause-global-shortcut", () => {
    console.log("[Shortcuts] Pausing global shortcuts for recording...");
    globalShortcut.unregisterAll();
  });

  ipcMain.on("resume-global-shortcut", () => {
    console.log("[Shortcuts] Resuming global shortcuts...");
    registerGlobalShortcut();
    // (though recording is usually done in settings where menu is not 'open-radial' but 'open-settings')
  });

  ipcMain.on("start-shortcut-recording", () => {
    diagLog("[Shortcuts] Starting global recording session.");
    startShortcutRecording();
  });

  ipcMain.on("stop-shortcut-recording", () => {
    diagLog("[Shortcuts] Stopping global recording session.");
    stopShortcutRecording();
  });

  // Open Settings Window Handler

  // Helper to handle ASAR path for child processes
  const getAssetPath = (relative) => {
    const p = path.join(__dirname, relative);
    return isDev ? p : p.replace("app.asar", "app.asar.unpacked");
  };

  // 2. PowerShell Mouse Hook (C# Low Level Hook) for Global Reliability
  let mouseHook = null;

  const startMouseHook = () => {
    if (mouseHook) return;
    const psScriptPath = getAssetPath("mouse-hook.ps1");
    diagLog(`Starting Mouse Hook: ${psScriptPath}`);
    mouseHook = spawn("powershell", [
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      psScriptPath,
    ]);

    mouseHook.stdout.on("data", async (data) => {
      const lines = data.toString().split(/\r?\n/);
      for (const line of lines) {
        const msg = line.trim();
        if (!msg) continue;

        if (msg === "MIDDLE_DOWN") {
          showMenuAtCursor("mmb");
        } else if (msg === "MIDDLE_UP") {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("mmb-release");
          }
        }
      }
    });

    mouseHook.stderr.on("data", (data) => {
      console.error(`MouseHook Error: ${data}`);
    });

    mouseHook.on("error", (err) =>
      console.error("Mouse Hook Process Error:", err),
    );
  };

  const stopMouseHook = () => {
    if (!mouseHook) return;
    diagLog("Stopping Mouse Hook");
    mouseHook.kill();
    mouseHook = null;
  };

  if (currentSettings.enableMouseTrigger) {
    startMouseHook();
  }
});

// IPC: Recebe atualização de configuração do Game Mode
ipcMain.on("set-game-mode", (event, config) => {
  gameModeConfig = config;
});

// Helper function to escape command strings for Windows
// Helper to resolve Shell Folder GUIDs (like {7C5A40EF...}) to real paths
const resolveShellPath = (cmd) => {
  if (!cmd || typeof cmd !== "string") return cmd;

  // Common Windows Known Folder GUIDs
  const guidMap = {
    "{7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}":
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    "{6D809371-213E-4545-97F7-7977F5C0D49C}":
      process.env["ProgramFiles"] || "C:\\Program Files",
    "{F38BF404-1D43-42F2-9305-67DE0B28FC23}":
      process.env["SystemRoot"] || "C:\\Windows",
    "{D65231B0-B2F1-4857-A4CE-A8E7C6EA7D27}": path.join(
      process.env["SystemRoot"] || "C:\\Windows",
      "System32",
    ),
    "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}": path.join(
      process.env["SystemRoot"] || "C:\\Windows",
      "System32",
    ),
  };

  let resolved = cmd;
  for (const [guid, p] of Object.entries(guidMap)) {
    // Escape and create a case-insensitive global regex for the GUID
    const escapedGuid = guid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapedGuid, "gi");
    if (regex.test(resolved)) {
      resolved = resolved.replace(regex, p);
    }
  }

  // Also handle environment variables if they slipped in (e.g. %SystemRoot%)
  resolved = resolved.replace(/%([^%]+)%/g, (_, n) => process.env[n] || _);

  return resolved;
};

// Helper function to escape command strings for Windows
const escapeCommand = (cmd) => {
  // If it's a GUID/AUMID (contains ! or is wrapped in {}), don't escape for common paths
  // but we might need quotes if it contains spaces
  if (cmd.includes("!") || (cmd.startsWith("{ ") && cmd.includes("}"))) {
    if (cmd.includes(" ") && !cmd.startsWith('"')) {
      return `"${cmd}"`;
    }
    return cmd;
  }
  // If it's a URL, don't escape
  if (cmd.match(/^https?:\/\//i) || cmd.match(/^(steam|discord|spotify):/i)) {
    return cmd;
  }
  // For file paths with spaces, ensure they're properly quoted
  if (cmd.includes(" ") && !cmd.startsWith('"')) {
    return `"${cmd}"`;
  }
  return cmd;
};

// IPC: Recebe comando do React para executar app
ipcMain.on("execute-command", async (event, command, commandType) => {
  if (!command || typeof command !== "string" || command.trim() === "") {
    console.warn("EXEC_ERROR: Received empty or invalid command");
    if (mainWindow) {
      mainWindow.webContents.send(
        "execution-error",
        "Comando vazio ou inválido",
      );
    }
    return;
  }

  const trimmedCommand = command.trim();

  // CRITICAL: Resolve GUIDs to real paths FIRST, before any detection logic
  const resolvedCommand = resolveShellPath(trimmedCommand);

  console.log(`\n========================================`);
  console.log(`EXEC_START: Attempting to launch`);
  console.log(`Command: "${trimmedCommand}"`);
  if (resolvedCommand !== trimmedCommand) {
    console.log(`Resolved to: "${resolvedCommand}"`);
  }
  console.log(`Length: ${trimmedCommand.length} chars`);
  console.log(`Command Type: ${commandType}`);
  console.log(`========================================\n`);

  if (trimmedCommand.startsWith("shortcut:")) {
    const keys = trimmedCommand.replace("shortcut:", "");
    console.log(`  → [shortcut] Simulating keys: ${keys}`);

    // Map common key names to Virtual Key Codes (Windows)
    const vkMap = {
      Ctrl: 0x11,
      Alt: 0x12,
      Shift: 0x10,
      Super: 0x5b, // Windows Key
      Win: 0x5b,
      Space: 0x20,
      Escape: 0x1b,
      Enter: 0x0d,
      Backspace: 0x08,
      Tab: 0x09,
      Delete: 0x2e,
      Insert: 0x2d,
      Home: 0x24,
      End: 0x23,
      PageUp: 0x21,
      PageDown: 0x22,
      ArrowLeft: 0x25,
      ArrowUp: 0x26,
      ArrowRight: 0x27,
      ArrowDown: 0x28,
      Left: 0x25,
      Up: 0x26,
      Right: 0x27,
      Down: 0x28,
    };

    // Add A-Z and 0-9 to map
    for (let i = 0; i < 26; i++) {
      vkMap[String.fromCharCode(65 + i)] = 0x41 + i;
    }
    for (let i = 0; i < 10; i++) {
      vkMap[i.toString()] = 0x30 + i;
    }

    const parts = keys.split("+");
    const vks = parts
      .map((p) => {
        const pClean = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(); // Normalize case like "ctrl" -> "Ctrl"
        // Try normalized and then raw
        const vk = vkMap[p] || vkMap[pClean];
        if (!vk) console.warn(`[Shortcut Simulation] Unknown key: ${p}`);
        return vk;
      })
      .filter((vk) => vk !== undefined);

    if (vks.length === 0) {
      console.error("  ✗ [shortcut] No valid keys found for simulation.");
      return;
    }

    // PowerShell script using keybd_event from user32.dll
    // keybd_event flags: 0 = Down, 2 = Up

    const scriptPath = getAssetPath("simulate-keys.ps1");
    const vksString = vks.join(",");

    diagLog(
      `[Shortcut Simulation] Calling script: ${scriptPath} with VKS: ${vksString}`,
    );

    spawn("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-vks",
      vksString,
    ]).on("error", (err) => {
      console.error("  ✗ [shortcut] Failed to spawn simulation script:", err);
      if (mainWindow) {
        mainWindow.webContents.send(
          "execution-error",
          "Erro ao iniciar simulador de teclas",
        );
      }
    });

    console.log("  ✓ [shortcut] Simulation script spawned.");
    return;
  }

  const tryExecution = (method, cmd) => {
    return new Promise((resolve, reject) => {
      console.log(`  → [${method}] Trying...`);
      let execCmd;
      switch (method) {
        case "shell.openExternal":
          shell
            .openExternal(cmd)
            .then(() => {
              console.log(`  ✓ [${method}] Success!`);
              resolve(true);
            })
            .catch((err) => {
              console.log(`  ✗ [${method}] Failed: ${err.message}`);
              reject(err);
            });
          break;
        case "shell.openPath":
          shell.openPath(cmd).then((errMsg) => {
            if (errMsg) {
              console.log(`  ✗ [${method}] Failed: ${errMsg}`);
              reject(new Error(errMsg));
            } else {
              console.log(`  ✓ [${method}] Success!`);
              resolve(true);
            }
          });
          break;
        case "exec_start":
          execCmd = `start "" ${escapeCommand(cmd)}`;
          console.log(`  → [${method}] Running: ${execCmd}`);
          exec(execCmd, (err, stdout, stderr) => {
            if (err) {
              console.log(`  ✗ [${method}] Failed: ${err.message}`);
              if (stderr) console.log(`  stderr: ${stderr}`);
              reject(err);
            } else {
              console.log(`  ✓ [${method}] Success!`);
              if (stdout) console.log(`  stdout: ${stdout}`);
              resolve(true);
            }
          });
          break;
        case "exec_explorer_shell":
          // Use 'start shell:AppsFolder\ID' which is the Windows native way to launch
          // both AUMIDs and Shell Namespace items (GUIDs).
          // We wrap the path in quotes to handle spaces correctly.
          const shellPath = `shell:AppsFolder\\${cmd}`;
          execCmd = `start "" "${shellPath}"`;
          console.log(`  → [${method}] Running: ${execCmd}`);
          exec(execCmd, (err, stdout, stderr) => {
            if (err) {
              console.log(`  ✗ [${method}] Failed: ${err.message}`);
              if (stderr) console.log(`  stderr: ${stderr}`);
              reject(err);
            } else {
              console.log(`  ✓ [${method}] Success!`);
              resolve(true);
            }
          });
          break;
        case "exec_direct":
          execCmd = `cmd.exe /c ${cmd}`;
          console.log(`  → [${method}] Running: ${execCmd}`);
          exec(execCmd, (err, stdout, stderr) => {
            if (err) {
              console.log(`  ✗ [${method}] Failed: ${err.message}`);
              if (stderr) console.log(`  stderr: ${stderr}`);
              reject(err);
            } else {
              console.log(`  ✓ [${method}] Success!`);
              if (stdout) console.log(`  stdout: ${stdout}`);
              resolve(true);
            }
          });
          break;
        default:
          reject(new Error(`Unknown method: ${method}`));
      }
    });
  };

  try {
    if (commandType === "url") {
      console.log("  → Detected: Explicit URL (from commandType)");
      await tryExecution("shell.openExternal", resolvedCommand);
      console.log(
        `\n✓✓✓ EXEC_SUCCESS: Launched URL with 'shell.openExternal' ✓✓✓\n`,
      );
      return; // Exit early if it's explicitly a URL
    }

    if (commandType === "folder") {
      console.log("  → Detected: Explicit Folder (from commandType)");
      await tryExecution("shell.openPath", resolvedCommand);
      console.log(
        `\n✓✓✓ EXEC_SUCCESS: Opened Folder with 'shell.openPath' ✓✓✓\n`,
      );
      return; // Exit early if it's explicitly a folder
    }

    // Determine the best method based on command type
    let methodsToTry = [];

    // GUID/AUMID detection (Shell Namespace / UWP apps)
    // Steam uses GUIDs like {7C5A40EF-A0FB-4BFC-874A-C0F2E0B9FA8E}\Steam\Steam.exe
    // WhatsApp uses AUMIDs like 5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App
    // Some system apps use hex IDs like FODC299D809B9700
    const isHexID = /^[A-F0-9]{8,64}$/i.test(resolvedCommand);
    const isShellApp =
      resolvedCommand.startsWith("{") ||
      resolvedCommand.includes("!") ||
      isHexID ||
      (resolvedCommand.includes(".") &&
        !resolvedCommand.match(/\.(exe|lnk|bat|cmd)$/i) &&
        !resolvedCommand.includes("\\") &&
        !resolvedCommand.includes("/"));

    // File path detection (.exe, .lnk, etc)
    const isExplicitFile =
      resolvedCommand.includes("\\") || resolvedCommand.includes("/");
    const isExe = resolvedCommand.toLowerCase().endsWith(".exe");

    if (isShellApp) {
      console.log("  → Detected: Shell App (GUID or AUMID)");
      // For Shell apps, shell:AppsFolder is the primary method
      methodsToTry = [
        "exec_explorer_shell",
        "shell.openExternal",
        "exec_start",
      ];
    }
    // URL detection
    else if (
      resolvedCommand.match(/^https?:\/\//i) ||
      resolvedCommand.match(/^(steam|discord|spotify):/i)
    ) {
      console.log("  → Detected: URL/Protocol");
      methodsToTry = ["shell.openExternal", "exec_start"];
    }
    // Commands starting with "start " (Windows shell commands)
    else if (resolvedCommand.toLowerCase().startsWith("start ")) {
      console.log("  → Detected: Windows 'start' command");
      methodsToTry = ["exec_direct", "exec_start"];
    }
    // Executable file detection
    else if (resolvedCommand.match(/\.(exe|lnk|bat|cmd)$/i) || isExplicitFile) {
      console.log("  → Detected: Executable file");
      methodsToTry = ["shell.openPath", "exec_start", "exec_direct"];
    }
    // Simple command / Alias (like "notepad", "calc", "MSEdge", "chrome")
    else {
      console.log("  → Detected: Simple command or Alias");
      // Add 'exec_explorer_shell' as a final fallback for aliases that might be Shell AppIDs
      methodsToTry = [
        "exec_start",
        "exec_direct",
        "shell.openPath",
        "exec_explorer_shell",
      ];
    }

    // Try each method in order
    let lastError = null;
    for (const method of methodsToTry) {
      try {
        await tryExecution(method, resolvedCommand);
        console.log(`\n✓✓✓ EXEC_SUCCESS: Launched with '${method}' ✓✓✓\n`);
        return; // Success! Exit early
      } catch (err) {
        lastError = err;
        // Continue to next method
      }
    }

    // If we get here, all methods failed
    const finalError = `Falha ao executar "${resolvedCommand.substring(0, 50)}${resolvedCommand.length > 50 ? "..." : ""}". Erro: ${lastError?.message || "Desconhecido"}`;
    console.error(`\n✗✗✗ EXEC_ABORT: ${finalError} ✗✗✗\n`);
    if (mainWindow) {
      mainWindow.webContents.send("execution-error", finalError);
    }
  } catch (err) {
    const finalError = `Erro inesperado ao executar comando: ${err.message}`;
    console.error(`\n✗✗✗ EXEC_ABORT: ${finalError} ✗✗✗\n`);
    if (mainWindow) {
      mainWindow.webContents.send("execution-error", finalError);
    }
  }
});

// IPC: Recebe comando para esconder janela
ipcMain.on("hide-window", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  unregisterWorkspaceShortcuts();

  // Low latency "hide": Opacity + Passthrough + Blur
  mainWindow.setOpacity(0);
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.blur();
});

// IPC: Show Window explicitly
ipcMain.on("show-window", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  mainWindow.setOpacity(1);
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.show();
  mainWindow.focus();
});

ipcMain.handle("get-onboarding-apps", async () => {
  return new Promise((resolve) => {
    // We search for a specific set of high-priority common apps for onboarding
    const targetApps = [
      "Chrome",
      "Edge",
      "Discord",
      "Spotify",
      "Steam",
      "VS Code",
      "Visual Studio Code",
      "Notepad",
      "Calculadora",
      "Calculator",
    ];
    const psScript = `
      $ErrorActionPreference = 'SilentlyContinue';
      $targets = @(${targetApps.map((a) => `'${a}'`).join(", ")});
      $apps = Get-StartApps | Where-Object { 
        $name = $_.Name; 
        $match = $targets | Where-Object { $name -like "*$_*" };
        $match -and ($_.AppID -notmatch 'Help|Feedback|Contact|Support|Manual')
      } | Select-Object Name, AppID | Select-Object -First 5;
      
      $results = @();
      foreach ($app in $apps) {
        $results += [PSCustomObject]@{ 
          Name = [string]$app.Name; 
          Path = [string]$app.AppID; 
        };
      }
      $results | ConvertTo-Json -Compress
    `;

    const command = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript
      .replace(/"/g, '\\"')
      .replace(/[\r\n]+/g, " ")
      .trim()}"`;

    exec(command, (error, stdout) => {
      if (error || !stdout) {
        resolve([]);
        return;
      }
      try {
        const apps = JSON.parse(stdout);
        resolve(Array.isArray(apps) ? apps : [apps]);
      } catch (e) {
        resolve([]);
      }
    });
  });
});

// IPC: Toggle Window Size
ipcMain.on("set-window-size", (event, mode) => {
  updateWindowSize(mode);
});

// IPC: Window Controls
ipcMain.on("minimize-window", () => {
  if (mainWindow) {
    mainWindow.hide();
    mainWindow.setSkipTaskbar(true); // Send to tray
  }
});

ipcMain.on("toggle-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on("quit-app", () => {
  globalShortcut.unregisterAll();
  app.quit();
});

  ipcMain.on("reset-config", () => {
  try {
    const configPath = path.join(app.getPath("userData"), "config-v2.json");
    const oldConfigPath = path.join(app.getPath("userData"), "config.json");
    const settingsPath = path.join(app.getPath("userData"), "settings.json");

    // Delete config files
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      console.log("Deleted config-v2.json");
    }
    if (fs.existsSync(oldConfigPath)) {
      fs.unlinkSync(oldConfigPath);
      console.log("Deleted config.json");
    }
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
      console.log("Deleted settings.json");
    }

    // Clear internal caches
    iconCache.clear();
    gameModeConfig = { enabled: false, blockFullscreen: true, blockedApps: "" };

    // Relaunch logic handles dev vs prod
    if (isDev) {
      console.log("Dev mode: Reloading window instead of relaunching app...");
      if (mainWindow) {
        mainWindow.reload();
        mainWindow.show();
      }
    } else {
      app.relaunch();
      app.exit(0);
    }
  } catch (err) {
    console.error("Failed to reset config:", err);
  }
});

// IPC: Select File (Executable)
ipcMain.handle("select-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Executables", extensions: ["exe", "lnk", "bat", "cmd"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// IPC: Select Folder (Directory)
ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// IPC: Select Image (Custom Icon)
ipcMain.handle("select-image", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "ico", "svg"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// IPC: Get File Icon
const iconCachePath = path.join(app.getPath("userData"), "icon-cache.json");
let iconCache = new Map();

const loadIconCache = () => {
  try {
    if (fs.existsSync(iconCachePath)) {
      const data = JSON.parse(fs.readFileSync(iconCachePath, "utf-8"));
      iconCache = new Map(Object.entries(data));
      diagLog(`[IconCache] Loaded ${iconCache.size} icons from disk`);
    }
  } catch (e) {
    diagLog(`[IconCache] Failed to load icon cache: ${e.message}`);
  }
};

const saveIconCache = () => {
  try {
    const data = Object.fromEntries(iconCache);
    fs.writeFileSync(iconCachePath, JSON.stringify(data));
  } catch (e) {
    diagLog(`[IconCache] Failed to save icon cache: ${e.message}`);
  }
};

// Start periodic save to prevent data loss on crash
setInterval(saveIconCache, 60000); // Every minute

ipcMain.handle("get-file-icon", async (event, filePath) => {
  try {
    if (!filePath || typeof filePath !== "string") return null;

    // Check Memory Cache first (fastest)
    if (iconCache.has(filePath)) {
      const cached = iconCache.get(filePath);
      // We removed individual timestamps to keep the file small,
      // relying on the manual reset config if needed.
      if (cached && cached.data) return cached.data;
    }

    diagLog(`[IconRequest] Fetching icon for: ${filePath}`);

    // 1. Resolve shell paths
    let resolvedPath = resolveShellPath(filePath);
    resolvedPath = resolvedPath.replace(/['\"]/g, "");

    // Special Handling for Common Apps
    if (
      filePath === "Microsoft.Windows.Explorer" ||
      filePath === "File Explorer"
    ) {
      resolvedPath = path.join(
        process.env["SystemRoot"] || "C:\\Windows",
        "explorer.exe",
      );
    } else if (
      filePath === "Microsoft.MicrosoftEdge" ||
      filePath === "MSEdge"
    ) {
      const edgePath = path.join(
        process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
        "Microsoft\\Edge\\Application\\msedge.exe",
      );
      if (fs.existsSync(edgePath)) {
        resolvedPath = edgePath;
      } else {
        resolvedPath = "Microsoft.MicrosoftEdge_8wekyb3d8bbwe!MicrosoftEdge";
      }
    }

    const isAUMID = resolvedPath.includes("!");
    const isExplicitFile =
      resolvedPath.includes("\\") || resolvedPath.includes("/");

    // 2. Try Electron Native first if it's a file path
    if (isExplicitFile && !isAUMID) {
      try {
        const icon = await app.getFileIcon(resolvedPath, { size: "large" });
        if (icon) {
          const dataUrl = icon.toDataURL();
          iconCache.set(filePath, { data: dataUrl });
          return dataUrl;
        }
      } catch (e) {
        diagLog(
          `[IconRequest] Native extraction failed for ${resolvedPath}: ${e.message}`,
        );
      }
    }

    // 3. PowerShell Extraction Strategy
    const psScript = getAssetPath("extract-icon.ps1");
    const command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}" -Target "${resolvedPath}"`;

    const iconData = await new Promise((resolve) => {
      exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (stdout) {
          const lines = stdout.trim().split(/\r?\n/);
          const dataLine = lines.find((line) => line.startsWith("data:image"));
          if (dataLine) {
            resolve(dataLine);
            return;
          }
        }
        resolve(null);
      });
    });

    if (iconData) {
      diagLog(`[IconRequest] Success via PowerShell for ${filePath}`);
      iconCache.set(filePath, { data: iconData });
      return iconData;
    }

    // 4. Final Fallback
    try {
      const icon = await app.getFileIcon(resolvedPath, { size: "large" });
      const dataUrl = icon.toDataURL();
      iconCache.set(filePath, { data: dataUrl });
      return dataUrl;
    } catch (e) {
      return null;
    }
  } catch (error) {
    console.error("Critical error in get-file-icon:", error);
    return null;
  }
});

let installedAppsCache = null;

ipcMain.handle("get-installed-apps", async (event, forceRefresh = false) => {
  if (installedAppsCache && !forceRefresh) {
    return installedAppsCache;
  }

  return new Promise((resolve) => {
    const { exec } = require("child_process");

    // Get-StartApps is much faster and reliable on Win 10/11
    // It returns both Win32 (as paths) and UWP (as AUMIDs)
    // We optimized the query to only select necessary fields
    const psScript = `
      $ErrorActionPreference = 'SilentlyContinue';
      try {
        $apps = Get-StartApps | Where-Object { $_.Name -and $_.AppID -and $_.Name -notmatch 'Help|Feedback|Contact|Support|Manual' } | Select-Object Name, AppID;
        $results = @();
        foreach ($app in $apps) {
          $path = $app.AppID;
          $iconPath = $path;
          if ($path -match '!') { $iconPath = '' };
          $results += [PSCustomObject]@{ 
            Name = [string]$app.Name; 
            DisplayName = [string]$app.Name; 
            Path = [string]$app.AppID; 
            IconPath = [string]$iconPath;
          };
        }
        $results | ConvertTo-Json -Compress
      } catch {
        "[]"
      }
    `.replace(/#.*$/gm, "");

    const command = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript
      .replace(/"/g, '\\"')
      .replace(/[\r\n]+/g, " ")
      .trim()}"`;

    exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout) => {
      if (error && !stdout) {
        console.error("Scanner failed:", error);
        resolve([]);
        return;
      }
      try {
        const apps = JSON.parse(stdout);
        const appList = (Array.isArray(apps) ? apps : [apps]).filter(
          (a) => a && a.Path && a.Name,
        );
        // Scanner found ${appList.length} valid apps
        installedAppsCache = appList; // Cache the result
        resolve(appList);
      } catch (e) {
        console.error("Parse error:", e);
        console.debug("Raw scanner output:", stdout);
        resolve([]);
      }
    });
  });
});

app.on("window-all-closed", (e) => {
  // Prevent app from quitting when all windows are closed
  // This ensures the app continues to run in the tray
  e.preventDefault();
});

app.on("will-quit", () => {
  saveIconCache();
  globalShortcut.unregisterAll();
});
