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
const { exec, spawn, execFile } = require("child_process");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");
const { GlobalKeyboardListener } = require("node-global-key-listener");
const http = require("http");
const https = require("https");
const url = require("url");

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

/** Merge KEY=value lines into process.env (later files override). Supports values containing "=". */
function applyEnvFileContent(content) {
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) process.env[key] = val;
  });
}

/**
 * Packaged apps don't ship the repo-root .env.local. Load from (in order, last wins per key):
 * - project / asar parent: `.env` then `.env.local` (último ganha) — funciona com `npm start` sem build
 * - resources (extraResources / beside installer)
 * - userData (recommended for installed builds: copy .env.local here)
 */
function loadEnvLocalFiles() {
  const paths = [
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", ".env.local"),
  ];
  try {
    if (process.resourcesPath) {
      paths.push(path.join(process.resourcesPath, ".env.local"));
    }
  } catch (_) {}
  try {
    paths.push(path.join(app.getPath("userData"), ".env.local"));
  } catch (_) {}

  for (const envPath of paths) {
    try {
      if (!envPath || !fs.existsSync(envPath)) continue;
      const envContent = fs.readFileSync(envPath, "utf8");
      applyEnvFileContent(envContent);
      diagLog(`[Env] Loaded .env-style file: ${envPath}`);
    } catch (e) {
      diagLog(`[Env] Failed to read ${envPath}: ${e.message}`);
    }
  }
}

loadEnvLocalFiles();

/** Último recurso se GPU partilhada continuar a travar Edge/outros browsers com o Zenith aberto. */
if (process.env.ZENITH_DISABLE_HARDWARE_ACCELERATION === "1") {
  app.disableHardwareAcceleration();
  diagLog("[GPU] ZENITH_DISABLE_HARDWARE_ACCELERATION=1 — renderização por software.");
}

// Periodic flush to ensure logs aren't stuck in queue
setInterval(processLogQueue, 5000);

// Helper function to detect preferred terminal emulator
let cachedTerminal = null;
const getPreferredTerminal = () => {
  if (cachedTerminal) return cachedTerminal;
  
  try {
    const { execSync } = require("child_process");
    // 1. Windows Terminal (wt.exe)
    try {
      execSync("where wt.exe", { stdio: "ignore" });
      cachedTerminal = "wt.exe";
      return cachedTerminal;
    } catch (e) {}
    // 2. PowerShell
    try {
      execSync("where powershell.exe", { stdio: "ignore" });
      cachedTerminal = "powershell.exe";
      return cachedTerminal;
    } catch (e) {}
  } catch (e) {}
  // 3. Fallback to CMD
  cachedTerminal = "cmd.exe";
  return cachedTerminal;
};

const getAssetPath = (...paths) => {
  if (isDev) return path.join(__dirname, ...paths);
  // In production, backend is inside app.asar/backend. We need to point to app.asar.unpacked/backend for script execution.
  return path.join(
    __dirname.replace("app.asar", "app.asar.unpacked"),
    ...paths,
  );
};

/** VS Code–family IDEs store MRU as a raw array or { entries: [...] }; Cursor/Antigravity often keep history only in state.vscdb. */
function normalizeRecentlyOpenedPathsList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object" && Array.isArray(raw.entries)) return raw.entries;
  return [];
}

async function loadRecentlyOpenedPathsFromVscdb(vscdbPath) {
  try {
    const initSqlJs = require("sql.js");
    const distDir = path.dirname(require.resolve("sql.js"));
    const unpackedDist = distDir.replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
    const wasmDir =
      unpackedDist !== distDir && fs.existsSync(path.join(unpackedDist, "sql-wasm.wasm"))
        ? unpackedDist
        : distDir;
    const SQL = await initSqlJs({ locateFile: (f) => path.join(wasmDir, f) });
    const buf = fs.readFileSync(vscdbPath);
    const db = new SQL.Database(buf);
    const res = db.exec(
      "SELECT value FROM ItemTable WHERE key = 'history.recentlyOpenedPathsList'",
    );
    if (!res.length || !res[0].values?.length) return [];
    const parsed = JSON.parse(res[0].values[0][0]);
    return normalizeRecentlyOpenedPathsList(parsed);
  } catch (e) {
    diagLog(`[Recents] state.vscdb read failed (${vscdbPath}): ${e.message}`);
    return [];
  }
}

diagLog("Zenith Main Process Started");

/** Declared before single-instance lock so `second-instance` can safely reference it. */
let mainWindow;

// Chromium: evitar afetar a pilha GPU/DWM de todo o Windows (Edge, Zen Browser, etc. a “carregar para sempre”).
// O bloco antigo (ignore-gpu-blocklist, etc.) podia degradar drivers partilhados. Só ativar com ZENITH_AGGRESSIVE_GPU=1.
if (process.env.ZENITH_AGGRESSIVE_GPU === "1") {
  diagLog("[GPU] ZENITH_AGGRESSIVE_GPU=1 — switches Chromium legados ativos.");
  app.commandLine.appendSwitch("disable-gpu-cache");
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("enable-zero-copy-dxgi-video");
  app.commandLine.appendSwitch(
    "disable-features",
    "WindowOcclusionPrediction,CalculateNativeWinOcclusion",
  );
  app.commandLine.appendSwitch(
    "enable-features",
    "VaapiVideoDecoder,CanvasOopRasterization",
  );
  app.commandLine.appendSwitch("disable-software-rasterizer");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
} else {
  diagLog(
    "[GPU] Modo seguro: sem flags agressivas. Se o radial ficar estranho, experimente ZENITH_AGGRESSIVE_GPU=1 em .env.local",
  );
}

// Fix Taskbar Icon Grouping
app.setAppUserModelId("com.henry.zenith"); // AUMID explicitly set
// app.setPath("userData", path.join(os.tmpdir(), "zenith-radial-menu-cache")); // REMOVED: tmpdir is not persistent

// Single instance: prevents two Zenith processes when login startup is slow and the user launches manually.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  diagLog("Second instance blocked — another Zenith is already running; exiting.");
  app.quit();
} else {
  app.on("second-instance", () => {
    diagLog("Second instance launch detected — focusing existing window.");
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        windowBuriedPassive = false;
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.setOpacity(1);
        mainWindow.setIgnoreMouseEvents(false);
        mainWindow.setSkipTaskbar(false);
        mainWindow.show();
        mainWindow.focus();
      } catch (e) {
        console.error("second-instance focus failed:", e);
      }
    }
  });
}

// Remove default menus (File, Edit, etc.)
Menu.setApplicationMenu(null);

// Keep normal priority: PRIORITY_HIGH starves other apps and makes the whole OS feel sluggish.
try {
  os.setPriority(os.constants.priority.PRIORITY_NORMAL);
} catch (e) {
  console.error("Failed to set priority:", e);
}

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
/** Cleared when leaving radial overlay for settings so a pending hide does not break the window. */
let skipTaskbarHideTimer = null;

/**
 * Renderer "hide-window" leaves the window technically visible but opacity 0 + mouse passthrough.
 * If the user later focuses Zenith from the taskbar / Alt+Tab, no IPC runs — they see a blank / dead window.
 * We recover on focus/restore when this flag is set.
 */
let windowBuriedPassive = false;

/** Last mode passed to updateWindowSize — used to fix hit-testing after minimize/restore without renderer IPC. */
let nativeWindowSizeMode = "windowed";

/** When true, allow BrowserWindow to close (real quit). Otherwise close → hide to tray. */
let isAppQuitting = false;
app.on("before-quit", () => {
  isAppQuitting = true;
});

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
      // true caused broken hit-testing / "frozen" UI after minimize→restore on Windows (transparent frameless window).
      backgroundThrottling: false,
    },
  });

  // Close → hide to tray (unless app.quit() is in progress — then allow real close).
  // Without syncing React (window-hid-to-tray), the renderer still thinks the dashboard is open;
  // reopening from the tray skips showWindow and hit-testing stays broken in the old window rect.
  newWindow.on("close", (event) => {
    if (isAppQuitting) {
      return;
    }
    if (newWindow.isVisible()) {
      event.preventDefault();
      newWindow.hide();
      newWindow.setSkipTaskbar(true);
      try {
        if (!newWindow.isDestroyed()) {
          newWindow.webContents.send("window-hid-to-tray");
        }
      } catch (e) {
        /* ignore */
      }
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

/**
 * Recover from passive overlay state when the OS brings the window forward without renderer IPC.
 * Also fixes transparent frameless windows on Windows after minimize → restore (hit-testing desync).
 */
function attachWindowUserRestoreGuards(window) {
  const recoverPassiveBurialOnly = () => {
    if (!window || window.isDestroyed() || !windowBuriedPassive) return;
    try {
      window.setOpacity(1);
      window.setIgnoreMouseEvents(false);
      window.setSkipTaskbar(false);
      windowBuriedPassive = false;
      diagLog("[Window] Recovered from passive hide (focus — taskbar or Alt+Tab).");
    } catch (e) {
      diagLog(`[Window] recoverPassiveBurialOnly: ${e.message}`);
    }
  };

  const onRestore = () => {
    if (!window || window.isDestroyed()) return;
    try {
      if (windowBuriedPassive) {
        window.setOpacity(1);
        window.setIgnoreMouseEvents(false);
        window.setSkipTaskbar(false);
        windowBuriedPassive = false;
        diagLog("[Window] Recovered from passive hide (restore).");
        return;
      }
      if (
        nativeWindowSizeMode !== "small" &&
        window.isVisible() &&
        !window.isMinimized()
      ) {
        window.setOpacity(1);
        window.setIgnoreMouseEvents(false);
        window.setSkipTaskbar(false);
        if (window.webContents && !window.webContents.isDestroyed()) {
          window.webContents.send("window-native-display-restored", {
            mode: nativeWindowSizeMode,
          });
        }
      }
    } catch (e) {
      diagLog(`[Window] onRestore refresh: ${e.message}`);
    }
  };

  window.on("restore", onRestore);
  window.on("focus", recoverPassiveBurialOnly);
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

  attachWindowUserRestoreGuards(window);
}

function showMenuAtCursor(source = "shortcut") {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const cursorPoint = screen.getCursorScreenPoint();

  // Resize before IPC so the first renderer paint is already monitor-sized (send() is async; windowed→radial looked like "dashboard size").
  updateWindowSize("fullscreen", { x: cursorPoint.x, y: cursorPoint.y });

  // Do NOT setOpacity(0) here — on Windows + transparent BrowserWindow it often leaves the compositor
  // without a fresh web frame (user sees through / "nothing", while hit-testing still works).

  mainWindow.webContents.send("open-menu", {
    x: cursorPoint.x,
    y: cursorPoint.y,
    source: source,
  });

  setImmediate(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    mainWindow.setSkipTaskbar(false);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    windowBuriedPassive = false;
    mainWindow.setIgnoreMouseEvents(false);
    mainWindow.setOpacity(1);
    mainWindow.show();

    mainWindow.focus();
    mainWindow.webContents.focus();
    if (process.platform === "win32") {
      mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    }

    clearSkipTaskbarHideTimer();
    skipTaskbarHideTimer = setTimeout(() => {
      skipTaskbarHideTimer = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setSkipTaskbar(true);
      }
    }, 100);

    try {
      if (
        mainWindow.webContents &&
        typeof mainWindow.webContents.invalidate === "function"
      ) {
        mainWindow.webContents.invalidate();
      }
    } catch (e) {
      /* ignore */
    }
  });
}

/**
 * @param {string} mode
 * @param {{ x: number, y: number } | undefined} anchorScreenPoint — screen coordinates (e.g. cursor). Picks the monitor with getDisplayNearestPoint so multi-monitor matches the radial overlay.
 */
function updateWindowSize(mode, anchorScreenPoint) {
  if (!mainWindow) return;

  nativeWindowSizeMode = mode;

  let point =
    anchorScreenPoint &&
    typeof anchorScreenPoint.x === "number" &&
    typeof anchorScreenPoint.y === "number" &&
    !Number.isNaN(anchorScreenPoint.x) &&
    !Number.isNaN(anchorScreenPoint.y)
      ? anchorScreenPoint
      : screen.getCursorScreenPoint();

  const targetDisplay = screen.getDisplayNearestPoint(point);
  const b = targetDisplay.bounds;

  if (mode === "fullscreen") {
    try {
      if (typeof mainWindow.setShape === "function") {
        mainWindow.setShape([]);
      }
    } catch (e) {
      /* ignore */
    }
    mainWindow.setBounds({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
    });
    mainWindow.setResizable(true);
    mainWindow.setBackgroundColor("#00000000"); // FORCE TRANSPARENCY
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
    mainWindow.setBackgroundColor("#00000000"); // Maintain transparency mask
    mainWindow.setAlwaysOnTop(false);
    mainWindow.setIgnoreMouseEvents(false);
    try {
      if (typeof mainWindow.setShape === "function") {
        mainWindow.setShape([]);
      }
    } catch (e) {
      /* ignore */
    }
  } else if (mode === "small") {
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
    clearSkipTaskbarHideTimer();
    try {
      mainWindow.setSkipTaskbar(true);
    } catch (e) {
      /* ignore */
    }
    mainWindow.setBackgroundColor("#00000000"); // ESSENTIAL for zero-lag transparency
    mainWindow.setBounds({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
    });
    mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    mainWindow.setResizable(true);
    /*
     * Clique fora da ilha: o renderer envia `set-window-hit-shape` com retângulo(s) em coords de cliente.
     * setShape (Windows/Linux): fora da região o rato vai para o ambiente.
     * macOS: normalmente sem setShape — mantém forward.
     */
    mainWindow.setIgnoreMouseEvents(false);
    if (typeof mainWindow.setShape !== "function") {
      try {
        mainWindow.setIgnoreMouseEvents(true, { forward: true });
      } catch (e) {
        /* ignore */
      }
    }
  }
}

/** Recreate the BrowserWindow if it was closed/destroyed (e.g. after errors). */
async function ensureMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  mainWindow = await createWindow();
  return mainWindow;
}

function clearSkipTaskbarHideTimer() {
  if (skipTaskbarHideTimer) {
    clearTimeout(skipTaskbarHideTimer);
    skipTaskbarHideTimer = null;
  }
}

/**
 * Force windowed, interactive mode, then notify renderer to open settings.
 * Cancels the deferred skipTaskbar from showMenuAtCursor (fixes double-MMB → settings glitches).
 */
function openSettingsFromMainProcess() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearSkipTaskbarHideTimer();
  mainWindow.setSkipTaskbar(false);
  mainWindow.setVisibleOnAllWorkspaces(false);
  updateWindowSize("windowed");
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.setOpacity(1);
  mainWindow.show();
  try {
    mainWindow.moveTop();
  } catch (e) {
    /* ignore */
  }
  mainWindow.focus();
  mainWindow.webContents.focus();
  mainWindow.webContents.send("open-settings");
}

// Function to check if a specific process is running (Basic implementation)
let cachedProcessOutput = "";
let lastProcessCheckTime = 0;
const PROCESS_CACHE_TTL = 2000; // 2 seconds

const isProcessRunning = (processNames) => {
  return new Promise((resolve) => {
    const platform = process.platform;
    const now = Date.now();

    // Skip heavy CMD call if we checked recently
    if (now - lastProcessCheckTime < PROCESS_CACHE_TTL && cachedProcessOutput) {
      const targets = processNames.toLowerCase().split(",").map(s => s.trim()).filter(s => s.length > 0);
      const isRunning = targets.some((target) => cachedProcessOutput.includes(target));
      return resolve(isRunning);
    }

    const targets = processNames
      .toLowerCase()
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (targets.length === 0) {
      resolve(false);
      return;
    }

    const cmd = platform === "win32" ? "tasklist /FO CSV" : "ps -ax -o comm";

    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        resolve(false);
        return;
      }

      cachedProcessOutput = stdout.toLowerCase();
      lastProcessCheckTime = Date.now();
      
      const isRunning = targets.some((target) => cachedProcessOutput.includes(target));
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
  if (!gotTheLock) return;

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

  /** Used with start/stop global MMB hook (PowerShell + WH_MOUSE_LL). */
  const cachedRadialFlags = {
    enableMouseTrigger: currentSettings.enableMouseTrigger !== false,
    performanceMode: false,
  };
  try {
    const cp = path.join(app.getPath("userData"), "config-v2.json");
    if (fs.existsSync(cp)) {
      const fc = JSON.parse(fs.readFileSync(cp, "utf-8"));
      if (typeof fc.performanceMode === "boolean") {
        cachedRadialFlags.performanceMode = fc.performanceMode;
      }
      if (typeof fc.enableMouseTrigger === "boolean") {
        cachedRadialFlags.enableMouseTrigger = fc.enableMouseTrigger;
      }
    }
  } catch (_) {}

  let syncMouseHookState = () => {};

  // Register essential IPC handlers BEFORE window creation
  ipcMain.handle("get-settings", () => currentSettings);

  const saveFullConfigToDisk = (config) => {
    const configPath = path.join(app.getPath("userData"), "config-v2.json");
    const tempPath = configPath + ".tmp";
    try {
      if (!fs.existsSync(path.dirname(configPath))) {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
      }

      fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8");

      if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
        fs.renameSync(tempPath, configPath);
      } else {
        throw new Error("Temp file is empty or missing after write");
      }
    } catch (e) {
      console.error("Failed to save full config (Atomic):", e);
      diagLog(`[ERROR] Persistence Failure: ${e.message}`);
      try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      } catch (e2) {
        /* ignore */
      }
    } finally {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (e) {
        /* ignore */
      }
    }
  };

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

  ipcMain.on("save-full-config", (_event, config) => {
    saveFullConfigToDisk(config);
    if (config && typeof config === "object") {
      if (typeof config.performanceMode === "boolean") {
        cachedRadialFlags.performanceMode = config.performanceMode;
      }
      if (typeof config.enableMouseTrigger === "boolean") {
        cachedRadialFlags.enableMouseTrigger = config.enableMouseTrigger;
      }
      syncMouseHookState();
    }
  });

  /** Synchronous IPC so the renderer can flush to disk before process exit (notes, etc.). */
  ipcMain.on("save-full-config-sync", (_event, config) => {
    saveFullConfigToDisk(config);
    if (config && typeof config === "object") {
      if (typeof config.performanceMode === "boolean") {
        cachedRadialFlags.performanceMode = config.performanceMode;
      }
      if (typeof config.enableMouseTrigger === "boolean") {
        cachedRadialFlags.enableMouseTrigger = config.enableMouseTrigger;
      }
      syncMouseHookState();
    }
  });

  // IPC: Persistence Debug Logger
  ipcMain.on("save-persistence-log", (event, message) => {
    try {
      const logPath = path.join(app.getPath("userData"), "zenith-persistence.log");
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message}\n`;
      fs.appendFileSync(logPath, logEntry, "utf-8");
    } catch (e) {
      console.error("Failed to write persistence log:", e);
    }
  });

  ipcMain.handle("export-config", async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Exportar Backup Zenith",
      defaultPath: path.join(app.getPath("downloads"), "zenith-backup.json"),
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (result.canceled || !result.filePath) return { success: false };

    try {
      const configPath = path.join(app.getPath("userData"), "config-v2.json");
      const settingsPath = path.join(app.getPath("userData"), "settings.json");
      const iconCachePath = path.join(app.getPath("userData"), "icon-cache.json");

      const backup = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        config: fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf-8")) : null,
        settings: fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, "utf-8")) : null,
        iconCache: fs.existsSync(iconCachePath) ? JSON.parse(fs.readFileSync(iconCachePath, "utf-8")) : null,
      };

      fs.writeFileSync(result.filePath, JSON.stringify(backup, null, 2));
      diagLog(`[Backup] Configuration exported to ${result.filePath}`);
      return { success: true };
    } catch (e) {
      console.error("Export failed:", e);
      diagLog(`[ERROR] Export failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("import-config", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Importar Backup Zenith",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) return { success: false };

    try {
      const data = JSON.parse(fs.readFileSync(result.filePaths[0], "utf-8"));
      
      if (!data.config && !data.settings) {
        throw new Error("Arquivo de backup inválido: Nenhum dado de configuração encontrado.");
      }

      const configPath = path.join(app.getPath("userData"), "config-v2.json");
      const settingsPath = path.join(app.getPath("userData"), "settings.json");
      const iconCachePath = path.join(app.getPath("userData"), "icon-cache.json");

      if (data.config) fs.writeFileSync(configPath, JSON.stringify(data.config, null, 2));
      if (data.settings) fs.writeFileSync(settingsPath, JSON.stringify(data.settings, null, 2));
      if (data.iconCache) fs.writeFileSync(iconCachePath, JSON.stringify(data.iconCache, null, 2));

      diagLog(`[Backup] Configuration imported from ${result.filePaths[0]}. Relaunching...`);
      
      // Safety relaunch
      app.relaunch();
      app.exit(0);
      return { success: true };
    } catch (e) {
      console.error("Import failed:", e);
      diagLog(`[ERROR] Import failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle("get-app-recents", async (event, appName, appCommand) => {
    diagLog(`[Recents] Fetching for appName: "${appName}", appCommand: "${appCommand}"`);
    const appData = process.env.APPDATA;
    let storagePath = "";

    const lowerName = appName ? appName.toLowerCase() : "";
    const lowerCommand = appCommand ? appCommand.toLowerCase() : "";

    // 1. Precise Match (by Name)
    if (lowerName === "antigravity") {
      storagePath = path.join(appData, "Antigravity", "User", "globalStorage", "storage.json");
    } else if (lowerName === "cursor") {
      storagePath = path.join(appData, "Cursor", "User", "globalStorage", "storage.json");
    } else if (lowerName === "code" || lowerName === "visual studio code") {
      storagePath = path.join(appData, "Code", "User", "globalStorage", "storage.json");
    } 
    // 2. Inclusion Match (if name match failed)
    else if (lowerName.includes("antigravity")) {
      storagePath = path.join(appData, "Antigravity", "User", "globalStorage", "storage.json");
    } else if (lowerName.includes("cursor")) {
      storagePath = path.join(appData, "Cursor", "User", "globalStorage", "storage.json");
    } else if (lowerName.includes("code")) {
      storagePath = path.join(appData, "Code", "User", "globalStorage", "storage.json");
    }
    // 3. Command Path Match (Final fallback) — prefer executable path so "Antigravity" vs "Cursor" never share storage
    else if (lowerCommand.includes("\\antigravity\\") || lowerCommand.includes("/antigravity/") || lowerCommand.includes("antigravity.exe")) {
      storagePath = path.join(appData, "Antigravity", "User", "globalStorage", "storage.json");
    } else if (lowerCommand.includes("\\cursor\\") || lowerCommand.includes("/cursor/") || lowerCommand.endsWith("cursor.exe")) {
      storagePath = path.join(appData, "Cursor", "User", "globalStorage", "storage.json");
    } else if (
      (lowerCommand.includes("\\code\\") || lowerCommand.includes("/code/") || lowerCommand.includes("code.exe")) &&
      !lowerCommand.includes("cursor") &&
      !lowerCommand.includes("antigravity")
    ) {
      storagePath = path.join(appData, "Code", "User", "globalStorage", "storage.json");
    }

    // 4. Resolve ambiguous label "Code" vs VS Code: if command is literally generic, prefer VS Code storage when name says visual studio / vscode
    if (!storagePath && (lowerName.includes("visual studio code") || lowerName === "vscode")) {
      storagePath = path.join(appData, "Code", "User", "globalStorage", "storage.json");
    }
    
    if (!storagePath || !appData) {
      return [];
    }

    const globalStorageDir = path.dirname(storagePath);
    const storageJsonPath = storagePath;
    const vscdbPath = path.join(globalStorageDir, "state.vscdb");
    const hasJson = fs.existsSync(storageJsonPath);
    const hasVscdb = fs.existsSync(vscdbPath);

    diagLog(
      `[Recents] globalStorage="${globalStorageDir}" storage.json=${hasJson} state.vscdb=${hasVscdb}`,
    );

    if (!hasJson && !hasVscdb) {
      return [];
    }

    try {
      let json = {};
      if (hasJson) {
        try {
          json = JSON.parse(fs.readFileSync(storageJsonPath, "utf-8"));
        } catch (parseErr) {
          diagLog(`[Recents] storage.json parse failed: ${parseErr.message}`);
          json = {};
        }
      }

      // MRU only from history.recentlyOpenedPathsList (JSON and/or SQLite). Never profileAssociations.workspaces.
      let recentlyOpened = normalizeRecentlyOpenedPathsList(json.history?.recentlyOpenedPathsList);
      if (recentlyOpened.length === 0 && hasVscdb) {
        recentlyOpened = await loadRecentlyOpenedPathsFromVscdb(vscdbPath);
      }

      const workspaceUris = [];
      const seenUri = new Set();
      for (const item of recentlyOpened) {
        if (!item || typeof item !== "object") continue;
        const uri = item.folderUri || item.workspace?.configPath || item.fileUri;
        if (!uri || typeof uri !== "string" || seenUri.has(uri)) continue;
        seenUri.add(uri);
        workspaceUris.push(uri);
      }

      if (workspaceUris.length === 0) {
        diagLog(`[Recents] No MRU entries for ${appName} (${globalStorageDir})`);
        return [];
      }
      
      const recents = workspaceUris.map(uri => {
        // Convert file:///c%3A/path to C:\path
        let decoded = decodeURIComponent(uri.replace("file:///", ""));
        if (process.platform === 'win32') {
          if (decoded.startsWith("/")) decoded = decoded.substring(1);
          decoded = decoded.replace(/\//g, "\\");
        }
        
        const label = path.basename(decoded);
        let command = decoded;
        
        // If it's an IDE, we want to open the folder WITH the IDE
        const itemLowerName = appName ? appName.toLowerCase() : "";
        // 2. Identify if it's an IDE that supports recent folders
        let appCommandString = normalizeAumidIdeCommands((appCommand || "").trim());
        
        // If we don't have a command passed, try to infer it from the name
        if (!appCommandString) {
          const ideNames = ["antigravity", "cursor", "code"];
          const foundName = ideNames.find(n => lowerName.includes(n));
          if (foundName) appCommandString = foundName;
        }

        let commandBase = "";
        const lowerAppCmd = appCommandString.toLowerCase();
        const isIDE = 
          lowerAppCmd.includes("antigravity") || 
          lowerAppCmd.includes("cursor") || 
          lowerAppCmd.includes("code") ||
          lowerAppCmd.includes("visual studio") ||
          lowerAppCmd.includes("intellij") ||
          lowerAppCmd.includes("webstorm") ||
          lowerAppCmd.includes("pycharm");

        if (isIDE) {
          // If it's a full path with spaces and not quoted, quote it
          if (appCommandString.includes(" ") && !appCommandString.startsWith('"')) {
             commandBase = `"${appCommandString}"`;
          } else {
             commandBase = appCommandString;
          }
        }

        if (commandBase) {
          command = `${commandBase} "${decoded}"`;
        } else {
          diagLog(`[Recents] App not recognized as IDE: ${appName}`);
        }

        return {
          id: `recent-${uri}`,
          label: label || decoded,
          iconName: "Folder",
          iconSource: "lucide",
          command: command,
          commandType: "app",
          description: decoded
        };
      });

      return recents.filter(r => r.label && r.label !== ".").slice(0, 6); // Top 6 MRU
    } catch (e) {
      diagLog(`Error fetching app recents for ${appName}: ${e.message}`);
      return [];
    }
  });

  // 2. Create Window
  mainWindow = await createWindow();

  // Dashboard windowed: keep the taskbar button when the user switches to another app without using Minimize.
  // (Minimize uses skipTaskbar true — see minimize-window — so the icon only lives in the tray until restore.)
  mainWindow.on("blur", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      if (mainWindow.isMinimized()) return;
      if (nativeWindowSizeMode === "windowed") {
        mainWindow.setSkipTaskbar(false);
      }
    } catch (e) {
      /* ignore */
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

          // Must match open-settings / show-window: passive hide leaves ignoreMouseEvents(true).
          // Clearing windowBuriedPassive before restoring input would skip attachWindowUserRestoreGuards().
          clearSkipTaskbarHideTimer();
          windowBuriedPassive = false;
          mainWindow.setSkipTaskbar(false);
          mainWindow.setVisibleOnAllWorkspaces(false);
          updateWindowSize("windowed");
          mainWindow.setIgnoreMouseEvents(false);

          // Smooth Entry Trick: Mask the initial white flash/compositor stutter
          mainWindow.setOpacity(0);
          mainWindow.show();

          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.setOpacity(1);
              mainWindow.focus();
              try {
                mainWindow.webContents.focus();
              } catch (e) {
                /* ignore */
              }
              mainWindow.webContents.send("open-dashboard");
            }
          }, 50);
        },
      },
      {
        label: "Abrir Configurações",
        click: async () => {
          try {
            await ensureMainWindow();
            openSettingsFromMainProcess();
          } catch (e) {
            diagLog(`[Tray] Abrir Configurações: ${e.message}`);
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

    // Only re-register workspace shortcuts if menu is open and user uses numeric mode
    if (workspaceShortcutsMenuOpen && workspaceShortcutsUseNumeric) {
      registerWorkspaceShortcuts();
    }
  };

  const unregisterWorkspaceShortcuts = () => {
    diagLog("[Shortcuts] Unregistering global numeric workspace shortcuts (1-9)");
    for (let i = 1; i <= 9; i++) {
      globalShortcut.unregister(i.toString());
    }
  };

  // PERF: Workspace shortcuts registered via permanent listeners — flag gates IPC send
  // We extract this to a function so it can be re-called when main shortcuts are refreshed (unregisterAll)
  const registerWorkspaceShortcuts = () => {
    diagLog("[Shortcuts] Registering global numeric workspace shortcuts (1-9)");
    // RESTORED: Registration of 1-9 as global shortcuts is the ONLY reliable way
    // to capture keys when the Zenith window fails to take keyboard focus away 
    // from a background text field.
    for (let i = 1; i <= 9; i++) {
      try {
        // Unregister first if already registered to avoid double-registration errors (though Electron handles it gracefully)
        if (globalShortcut.isRegistered(i.toString())) {
            globalShortcut.unregister(i.toString());
        }

        const success = globalShortcut.register(i.toString(), () => {
          diagLog(`[Shortcuts] Global numeric shortcut triggered: ${i}`);
          if (workspaceShortcutsMenuOpen && mainWindow && !mainWindow.isDestroyed()) {
            diagLog(`[Shortcuts] Sending switch-workspace IPC: ${i - 1}`);
            mainWindow.webContents.send("switch-workspace", i - 1);
          }
        });
        if (!success) diagLog(`[Shortcuts] Failed to register workspace shortcut ${i}`);
      } catch (e) {
        diagLog(`[Shortcuts] Exception registering workspace shortcut ${i}: ${e.message}`);
      }
    }
  };

  let workspaceShortcutsMenuOpen = false;
  /** When false (picker mode), 1–9 are not registered while the radial is open. */
  let workspaceShortcutsUseNumeric = true;

  // Register initial shortcut
  registerGlobalShortcut();

  ipcMain.on("set-settings", (event, settings) => {
    saveSettings(settings);

    if (settings.enableMouseTrigger !== undefined) {
      cachedRadialFlags.enableMouseTrigger = settings.enableMouseTrigger;
    }

    if (settings.globalShortcut) {
      registerGlobalShortcut();
    }

    if (settings.openAtLogin !== undefined) {
      syncLoginItemSettings(settings.openAtLogin);
    }

    syncMouseHookState();
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

  ipcMain.handle("open-external-url", async (event, url) => {
    if (typeof url !== "string") {
      return { ok: false, error: "Invalid URL" };
    }
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return { ok: false, error: "Only http(s) URLs are allowed" };
    }
    try {
      await shell.openExternal(trimmed);
      return { ok: true };
    } catch (e) {
      diagLog(`[open-external-url] ${e.message}`);
      return { ok: false, error: e.message };
    }
  });

  ipcMain.on("toggle-settings", async () => {
    try {
      await ensureMainWindow();
      openSettingsFromMainProcess();
    } catch (e) {
      diagLog(`[toggle-settings] ${e.message}`);
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

  /** Verify Google ID token (Sign in with Google / zenithos.online auth page). */
  function verifyGoogleIdToken(idToken) {
    return new Promise((resolve, reject) => {
      const u = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
      https
        .get(u, (tokenRes) => {
          let body = "";
          tokenRes.on("data", (d) => {
            body += d;
          });
          tokenRes.on("end", () => {
            try {
              const data = JSON.parse(body);
              if (data.error) {
                reject(new Error(data.error_description || String(data.error)));
                return;
              }
              resolve(data);
            } catch (e) {
              reject(e);
            }
          });
        })
        .on("error", reject);
    });
  }

  function emitGoogleAuthSuccess(email, name, picture) {
    const isAdmin = email === "henrycauan3222@gmail.com";
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("google-auth-success", {
        email,
        name,
        avatarUrl: picture,
        isAdmin,
        isPremium: isAdmin,
        planTier: isAdmin ? "pro" : "free",
      });
      mainWindow.show();
      mainWindow.focus();
    }
  }

  function sendZenithAuthSuccessHtml(res) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Zenith — signed in</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#e8e8e8;-webkit-font-smoothing:antialiased}
  .glow{pointer-events:none;position:fixed;inset:0;overflow:hidden}
  .glow::before{content:"";position:absolute;top:18%;left:50%;transform:translateX(-50%);width:min(92vw,520px);height:300px;border-radius:50%;background:radial-gradient(ellipse at center,hsla(265,45%,50%,.14) 0%,transparent 70%);filter:blur(48px)}
  .glow::after{content:"";position:absolute;bottom:8%;right:0;width:min(80vw,380px);height:220px;border-radius:50%;background:radial-gradient(ellipse at center,hsla(200,50%,45%,.08) 0%,transparent 72%);filter:blur(40px)}
  .card{position:relative;text-align:center;max-width:420px;margin:0 16px;padding:2px;border-radius:18px;background:linear-gradient(135deg,rgba(139,92,246,.45),rgba(217,70,239,.4),rgba(56,189,248,.42));box-shadow:0 24px 80px -32px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,255,255,.08)}
  .card-inner{border-radius:16px;background:linear-gradient(180deg,hsla(265,50%,50%,.09),hsla(200,50%,45%,.05) 60%,hsla(0,0%,7%,.96));border:1px solid rgba(255,255,255,.08);padding:0 28px 30px;backdrop-filter:blur(12px)}
  .strip{height:3px;border-radius:16px 16px 0 0;margin:0 0 22px;background:linear-gradient(90deg,rgba(139,92,246,.85),rgba(217,70,239,.78),rgba(56,189,248,.75))}
  .icon-wrap{display:inline-flex;align-items:center;justify-content:center;width:76px;height:76px;border-radius:50%;margin:0 auto 18px;padding:2px;background:linear-gradient(135deg,rgba(139,92,246,.55),rgba(217,70,239,.5),rgba(56,189,248,.5));box-shadow:0 0 0 1px rgba(255,255,255,.08)}
  .icon-in{display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:50%;background:hsla(0,0%,7%,.96);border:1px solid rgba(255,255,255,.1)}
  .icon-in svg{width:40px;height:40px;stroke:#7dd3fc;stroke-width:1.35;fill:none;filter:drop-shadow(0 0 12px hsla(199,85%,58%,.35))}
  h1{font-size:1.35rem;font-weight:600;margin:0 0 10px;letter-spacing:-.03em;background:linear-gradient(90deg,#e9d5ff,#f5d0fe,#bae6fd);-webkit-background-clip:text;background-clip:text;color:transparent}
  p{font-size:14px;line-height:1.55;margin:0;opacity:.88}
  p.sub{margin-top:12px;font-size:13px;opacity:.65;line-height:1.45}
</style></head>
<body>
  <div class="glow" aria-hidden="true"></div>
  <div class="card">
    <div class="card-inner">
      <div class="strip" aria-hidden="true"></div>
      <div class="icon-wrap" aria-hidden="true"><div class="icon-in"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div></div>
      <h1>Signed in to Zenith</h1>
      <p>This page finished linking your account. Return to the Zenith window &mdash; it should already be signed in.</p>
      <p class="sub">You can close this tab.</p>
    </div>
  </div>
</body></html>`);
  }

  // GOOGLE AUTH: browser opens zenithos.online/auth; site redirects here with id_token (or legacy OAuth /callback).
  let authServer = null;
  ipcMain.on("start-google-auth", () => {
    if (authServer) {
      try {
        authServer.close();
      } catch (e) {}
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;
    const allowedAuds = [GOOGLE_WEB_CLIENT_ID, GOOGLE_CLIENT_ID].filter(Boolean);

    if (allowedAuds.length === 0) {
      let userDataHint = "";
      try {
        userDataHint = app.getPath("userData");
      } catch (_) {}
      diagLog(
        "[Auth] Missing GOOGLE_CLIENT_ID or GOOGLE_WEB_CLIENT_ID (need at least one for web sign-in)."
      );
      const msg =
        "Google sign-in needs an OAuth client ID. Add GOOGLE_WEB_CLIENT_ID (same as the website / VITE_GOOGLE_CLIENT_ID) or GOOGLE_CLIENT_ID to .env.local in:\n\n" +
        (userDataHint || "AppData") +
        "\n\nThen restart Zenith.";
      dialog.showErrorBox("Zenith — Google sign-in", msg);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("google-auth-error", {
          code: "MISSING_OAUTH_CONFIG",
          userDataPath: userDataHint,
        });
      }
      return;
    }

    diagLog("[Auth] Starting local auth bridge (web sign-in → localhost)...");

    const REDIRECT_URI = "http://localhost:3892/callback";

    authServer = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url, true);
      const pathname = parsedUrl.pathname || "";

      if (pathname === "/ping") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
        return;
      }

      if (pathname === "/desktop-complete") {
        const idToken = parsedUrl.query.id_token;
        if (!idToken || typeof idToken !== "string") {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing id_token.");
          return;
        }
        verifyGoogleIdToken(idToken)
          .then((data) => {
            if (!allowedAuds.includes(data.aud)) {
              diagLog(`[Auth] id_token aud rejected: ${data.aud}`);
              res.writeHead(400, { "Content-Type": "text/plain" });
              res.end("Invalid sign-in token (audience). Use the same Google OAuth client as the app.");
              return;
            }
            const email = data.email;
            const name = data.name || (email ? String(email).split("@")[0] : "User");
            const picture = data.picture;
            diagLog(`[Auth] Web id_token OK: ${email}`);
            emitGoogleAuthSuccess(email, name, picture);
            sendZenithAuthSuccessHtml(res);
            if (authServer) {
              try {
                authServer.close();
              } catch (e) {}
              authServer = null;
            }
          })
          .catch((e) => {
            diagLog(`[Auth] id_token verify failed: ${e.message}`);
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("Could not verify sign-in.");
          });
        return;
      }

      if (pathname === "/callback") {
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Legacy OAuth redirect is not configured (missing client secret). Use the website sign-in flow.");
          return;
        }
        const { code } = parsedUrl.query;
        if (!code) {
            res.end("Error: No code received.");
            return;
        }

        diagLog(`[Auth] Received code, exchanging for tokens...`);
        
        // Exchange code for tokens
        const postData = new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
        }).toString();

        const options = {
            hostname: 'oauth2.googleapis.com',
            port: 443,
            path: '/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length
            }
        };

        const tokenReq = https.request(options, (tokenRes) => {
            let body = '';
            tokenRes.on('data', (d) => body += d);
            tokenRes.on('end', () => {
                let tokenData;
                try {
                    tokenData = JSON.parse(body);
                } catch (e) {
                    diagLog("[Auth] Error parsing token response: " + body);
                    res.end("Authentication failed.");
                    return;
                }

                if (tokenData.access_token) {
                    diagLog("[Auth] Access token received, fetching user info...");
                    
                    // Fetch user info
                    https.get(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${tokenData.access_token}`, (userRes) => {
                        let userBody = '';
                        userRes.on('data', (d) => userBody += d);
                        userRes.on('end', () => {
                            const userInfo = JSON.parse(userBody);
                            const { email, name, picture } = userInfo;
                            
                            diagLog(`[Auth] Successfully authenticated as ${email}`);
                            emitGoogleAuthSuccess(email, name, picture);
                            sendZenithAuthSuccessHtml(res);
                            
                            if (authServer) {
                                authServer.close();
                                authServer = null;
                            }
                        });
                    });
                } else {
                    diagLog("[Auth] Error: Failed to exchange code for token: " + body);
                    res.end("Authentication failed.");
                }
            });
        });

        tokenReq.on('error', (e) => {
            diagLog("[Auth] Request error: " + e.message);
            res.end("Network error.");
        });

        tokenReq.write(postData);
        tokenReq.end();

      } else {
        res.writeHead(404);
        res.end();
      }
    });

    authServer.on("error", (err) => {
      diagLog(`[Auth] HTTP server error: ${err.code || ""} ${err.message}`);
      const detail =
        err.code === "EADDRINUSE"
          ? "Port 3892 is already in use. Close another Zenith instance or any app using that port, then try again."
          : err.message;
      dialog.showErrorBox("Zenith — Google sign-in", detail);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("google-auth-error", {
          code: err.code,
          message: err.message,
        });
      }
      authServer = null;
    });

    authServer.listen(3892, () => {
      diagLog("[Auth] Local callback server listening on port 3892");
      const base =
        process.env.ZENITH_WEB_AUTH_URL || "https://zenithos.online/auth";
      const sep = base.includes("?") ? "&" : "?";
      const webAuthUrl = `${base}${sep}client=desktop`;
      diagLog(`[Auth] Opening browser (web sign-in): ${webAuthUrl}`);
      shell.openExternal(webAuthUrl);
    });

    setTimeout(() => {
        if (authServer) {
            authServer.close();
            authServer = null;
            diagLog("[Auth] Server timed out after 5 minutes");
        }
    }, 5 * 60 * 1000);
  });

  ipcMain.on("set-workspace-shortcuts", (event, isOpen, mode) => {
    const useNumeric = mode !== "picker";
    if (
      workspaceShortcutsMenuOpen === isOpen &&
      workspaceShortcutsUseNumeric === useNumeric
    ) {
      return;
    }
    workspaceShortcutsMenuOpen = isOpen;
    workspaceShortcutsUseNumeric = useNumeric;
    if (isOpen && useNumeric) {
      registerWorkspaceShortcuts();
    } else {
      unregisterWorkspaceShortcuts();
    }
  });


  // Open Settings Window Handler

  // Helper to handle ASAR path for child processes
  const getAssetPath = (relative) => {
    const p = path.join(__dirname, relative);
    return isDev ? p : p.replace("app.asar", "app.asar.unpacked");
  };

  // 2. PowerShell Mouse Hook (C# Low Level Hook) for Global Reliability
  let mouseHook = null;
  /** If the first MMB opened the radial immediately, the second MMB (double-click → settings) would race fullscreen vs windowed. We defer the radial slightly so a second MMB can cancel it and open settings only — no overlay conflict. */
  /** Single MMB opens radial after this delay so a second MMB can cancel → settings only (no fullscreen race). */
  const MMB_MENU_DEBOUNCE_MS = 280;
  let mmbMenuDebounceTimer = null;
  let mmbFirstDownAt = 0;

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
          const now = Date.now();
          const sinceFirst = mmbFirstDownAt ? now - mmbFirstDownAt : 99999;

          // Second MMB while radial open is still deferred (timer pending): open settings only — no radial this gesture
          if (
            mmbFirstDownAt &&
            mmbMenuDebounceTimer &&
            sinceFirst >= 8
          ) {
            if (mmbMenuDebounceTimer) {
              clearTimeout(mmbMenuDebounceTimer);
              mmbMenuDebounceTimer = null;
            }
            mmbFirstDownAt = 0;
            (async () => {
              try {
                await ensureMainWindow();
                openSettingsFromMainProcess();
              } catch (e) {
                diagLog(`[MouseHook] open settings: ${e.message}`);
              }
            })();
          } else {
            // Start (or restart) a single-MMB gesture: defer radial so double-MMB can cancel
            if (mmbMenuDebounceTimer) {
              clearTimeout(mmbMenuDebounceTimer);
              mmbMenuDebounceTimer = null;
            }
            mmbFirstDownAt = now;
            mmbMenuDebounceTimer = setTimeout(() => {
              mmbMenuDebounceTimer = null;
              mmbFirstDownAt = 0;
              showMenuAtCursor("mmb");
            }, MMB_MENU_DEBOUNCE_MS);
          }
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
    if (mmbMenuDebounceTimer) {
      clearTimeout(mmbMenuDebounceTimer);
      mmbMenuDebounceTimer = null;
    }
    mmbFirstDownAt = 0;
    diagLog("Stopping Mouse Hook");
    mouseHook.kill();
    mouseHook = null;
  };

  syncMouseHookState = () => {
    const wantHook =
      cachedRadialFlags.enableMouseTrigger && !cachedRadialFlags.performanceMode;
    if (wantHook) startMouseHook();
    else stopMouseHook();
  };
  const mouseHookDelayMs = Number.parseInt(
    process.env.ZENITH_MOUSE_HOOK_DELAY_MS ?? "12000",
    10,
  );
  if (mouseHookDelayMs > 0) {
    diagLog(
      `[MouseHook] Primeira ativação do hook global adiada ${mouseHookDelayMs}ms (ZENITH_MOUSE_HOOK_DELAY_MS=0 para imediato).`,
    );
    setTimeout(() => syncMouseHookState(), mouseHookDelayMs);
  } else {
    syncMouseHookState();
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

/** Cursor from Windows Start Menu is often stored as AUMID "Anysphere.Cursor" — not a valid CMD executable. */
function resolveCursorExePath() {
  if (process.platform !== "win32") return "cursor";
  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "Programs", "cursor", "Cursor.exe"),
    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Cursor", "Cursor.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Cursor", "Cursor.exe"),
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch (e) {}
  }
  return "cursor";
}

/**
 * Rewrites Cursor/VS Code–style AUMID tokens to a real .exe or PATH shim so spawn/cmd succeed.
 */
function normalizeAumidIdeCommands(cmd) {
  if (!cmd || typeof cmd !== "string") return cmd;
  let s = cmd;
  const cursorExe = resolveCursorExePath();
  const token = /\s/.test(cursorExe) ? `"${cursorExe}"` : cursorExe;

  s = s.replace(/"Anysphere\.Cursor(?:![^"]*)?"/gi, `"${cursorExe}"`);
  s = s.replace(/shell:AppsFolder\\Anysphere\.Cursor(?:![^\s"]*)?/gi, `"${cursorExe}"`);
  s = s.replace(/^(shell:AppsFolder\\)?Anysphere\.Cursor(?:![^\s"]*)?(?=\s|$)/i, token);
  return s;
}

/**
 * VS Code / Cursor / Antigravity: open folder in a new window when the IDE is already running (-n).
 * Only adds the flag when there is a path argument after the executable.
 */
function addIdeNewWindowFlag(cmd) {
  if (!cmd || typeof cmd !== "string") return cmd;
  const t = cmd.trim();
  if (/\s(-n|--new-window)(\s|$)/i.test(t)) return cmd;

  const lower = t.toLowerCase();
  const looksLikeVsFamily =
    lower.includes("cursor.exe") ||
    lower.includes("\\cursor\\") ||
    /^cursor\s/i.test(t) ||
    lower.includes("code.exe") ||
    lower.includes("microsoft vs code\\") ||
    /^code\s/i.test(t) ||
    lower.includes("antigravity.exe") ||
    /^antigravity\s/i.test(t);
  if (!looksLikeVsFamily) return cmd;

  if (t.startsWith('"')) {
    let i = 1;
    while (i < t.length) {
      if (t[i] === '"') break;
      i++;
    }
    if (i < t.length && t[i] === '"') {
      const first = t.slice(0, i + 1);
      const after = t.slice(i + 1).trim();
      if (after) return `${first} -n ${after}`;
    }
    return cmd;
  }

  const sp = t.indexOf(" ");
  if (sp > 0) {
    const head = t.slice(0, sp);
    const rest = t.slice(sp + 1).trim();
    if (!rest) return cmd;
    if (/\.exe$/i.test(head) || /^(cursor|code|antigravity)$/i.test(head)) {
      return `${head} -n ${rest}`;
    }
  }
  return cmd;
}

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
  // If it already has quotes, don't add more (likely complex command)
  if (cmd.includes('"')) {
    return cmd;
  }
  // For file paths with spaces, ensure they're properly quoted
  if (cmd.includes(" ") && !cmd.startsWith('"')) {
    return `"${cmd}"`;
  }
  return cmd;
};

/**
 * Split the tail of a Windows command line into argv tokens (quoted runs and space-separated words).
 * Used after the executable token so flags like -n and folder paths are separate argv entries.
 */
function parseWin32CommandLineArgs(rest) {
  const args = [];
  const s = (rest || "").trim();
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    if (s[i] === '"') {
      let j = i + 1;
      while (j < s.length && s[j] !== '"') j++;
      args.push(s.slice(i + 1, j));
      i = j + 1;
    } else {
      let j = i;
      while (j < s.length && !/\s/.test(s[j])) j++;
      args.push(s.slice(i, j));
      i = j;
    }
  }
  return args;
}

// IPC: Recebe comando do React para executar app
ipcMain.on("execute-command", async (event, command, commandType, options = {}) => {
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
  let resolvedCommand = resolveShellPath(trimmedCommand);
  resolvedCommand = normalizeAumidIdeCommands(resolvedCommand);
  resolvedCommand = addIdeNewWindowFlag(resolvedCommand);

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

  const isShellApp = (cmd) => {
    if (!cmd) return false;
    const cleanCmd = cmd.trim().replace(/['"]/g, "");
    const lower = cleanCmd.toLowerCase();
    const base = lower.split(" ")[0];

    // Explicit common AppIDs that are known to work with shell:AppsFolder but might be short
    const commonAppIds = ["msedge", "edge", "chrome", "spotify", "calculator", "notepad"];
    if (commonAppIds.includes(lower)) return true;

    // Common Win32 apps that should NOT be treated as shell apps even if they lack an extension
    const win32Aliases = ["explorer", "calc", "notepad", "cmd", "powershell", "taskmgr", "regedit", "control"];
    if (win32Aliases.includes(base)) return false;

    // Identify Windows Store apps, AUMIDs, and Shell/GUID namespaces
    return (
      lower.startsWith("shell:") ||
      lower.includes("!") || // Standard AUMID indicator (e.g. App!ID)
      lower.includes("google.antigravity") ||
      lower.includes("microsoft.") ||
      lower.includes("discord") ||
      base.startsWith("{") || // GUID
      /^[A-F0-9]{8,64}$/i.test(base) || // Hex identifier
      // If it looks like a simple name without extension/path, treat as potential AUMID
      (base.length > 2 && !base.match(/\.(exe|lnk|bat|cmd|com|vbs|ps1|txt|pdf|png|jpg|mp3|mp4)$/i) && !base.includes("\\") && !base.includes("/") && !base.includes("."))
    );
  };

  const tryExecution = (method, cmd) => {
    return new Promise((resolve, reject) => {
      diagLog(`  → [${method}] Trying...`);
      let execCmd;
      switch (method) {
        case "shell.openExternal":
          shell
            .openExternal(cmd)
            .then(() => {
              diagLog(`  ✓ [${method}] Success!`);
              resolve(true);
            })
            .catch((err) => {
              diagLog(`  ✗ [${method}] Failed: ${err.message}`);
              reject(err);
            });
          break;
        case "shell.openPath":
          shell.openPath(cmd).then((errMsg) => {
            if (errMsg) {
              diagLog(`  ✗ [${method}] Failed: ${errMsg}`);
              reject(new Error(errMsg));
            } else {
              diagLog(`  ✓ [${method}] Success!`);
              resolve(true);
            }
          });
          break;
        case "exec_start":
          execCmd = `start "" ${escapeCommand(cmd)}`;
          diagLog(`  → [${method}] Running: ${execCmd}`);
          exec(execCmd, (err, stdout, stderr) => {
            if (err) {
              diagLog(`  ✗ [${method}] Failed: ${err.message}`);
              reject(err);
            } else {
              diagLog(`  ✓ [${method}] Success!`);
              resolve(true);
            }
          });
          break;
        case "exec_explorer_shell":
          // Special handling for AUMIDs with arguments
          let aumid = cmd;
          let args = "";

          // If the command already starts with shell:AppsFolder\, strip it to avoid double prefixing
          if (aumid.toLowerCase().startsWith("shell:appsfolder\\")) {
            aumid = aumid.substring("shell:appsfolder\\".length);
          } else if (aumid.toLowerCase().startsWith("shell:appsfolder/")) {
            aumid = aumid.substring("shell:appsfolder/".length);
          }

          if (aumid.includes(" ")) {
            const firstSpace = aumid.indexOf(" ");
            args = aumid.substring(firstSpace + 1);
            aumid = aumid.substring(0, firstSpace);
          }

          // Basic AUMID launch - args support depends on Windows version and app
          const shellPath = `shell:AppsFolder\\${aumid}`;
          execCmd = args ? `start "" "${shellPath}" ${args}` : `start "" "${shellPath}"`;
          diagLog(`  → [${method}] Running: ${execCmd}`);
          exec(execCmd, (err, stdout, stderr) => {
            if (err) {
              console.log(`  ✗ [${method}] Failed: ${err.message}`);
              if (stderr) console.log(`  stderr: ${stderr}`);
              reject(err);
            } else {
              diagLog(`  ✓ [${method}] Success!`);
              resolve(true);
            }
          });
          break;

        case "exec_direct":
          const terminal = getPreferredTerminal();
          if (terminal === "wt.exe") {
            // Windows Terminal needs special flags to stay as a single window or specific profile
            execCmd = `wt.exe -d . cmd /c ${cmd}`;
          } else {
            execCmd = `${terminal} /c ${cmd}`;
          }
          
          diagLog(`  → [${method}] Running: ${execCmd}`);
          exec(execCmd, (err, stdout, stderr) => {
            if (err) {
              diagLog(`  ✗ [${method}] Failed: ${err.message}`);
              reject(err);
            } else {
              diagLog(`  ✓ [${method}] Success!`);
              resolve(true);
            }
          });
          break;
        case "exec_silent_spawn":
          return new Promise((resolve, reject) => {
            try {
              let spawnPath = cmd;
              let spawnArgs = [];
              if (cmd.includes(" ") && !cmd.startsWith('"')) {
                const firstSpace = cmd.indexOf(" ");
                spawnPath = cmd.substring(0, firstSpace);
                spawnArgs = parseWin32CommandLineArgs(cmd.substring(firstSpace + 1));
              } else if (cmd.startsWith('"')) {
                const secondQuote = cmd.indexOf('"', 1);
                if (secondQuote > 0) {
                  spawnPath = cmd.substring(1, secondQuote);
                  spawnArgs = parseWin32CommandLineArgs(cmd.substring(secondQuote + 1));
                }
              }

              diagLog(`  → [${method}] Spawning: ${spawnPath} ${spawnArgs.join(" ")}`);
              const looksLikeWinExe =
                /\.(exe|cmd|bat)$/i.test(spawnPath) || /^[a-zA-Z]:[\\/]/.test(spawnPath);
              const child = spawn(spawnPath, spawnArgs, {
                detached: true,
                stdio: "ignore",
                shell: !looksLikeWinExe,
              });
              
              child.on('error', (err) => {
                diagLog(`  ✗ [${method}] Failed to start: ${err.message}`);
                reject(err);
              });

              // Give it a tiny bit of time to see if it immediately errors
              setTimeout(() => {
                child.unref();
                diagLog(`  ✓ [${method}] Success (Process unrefed)`);
                resolve(true);
              }, 100);
            } catch (e) {
              reject(e);
            }
          });
          break;
        default:
          reject(new Error(`Unknown method: ${method}`));
      }
    });
  };

  /**
   * Resolves cwd for external terminal windows. IDE launch lines look like
   * `"Cursor.exe" "D:\project"` — the first quoted segment is the binary; the last is the folder.
   * Using only the first match wrongly cwd's to Program Files or falls through to process.cwd() (Zenith).
   */
  const extractTerminalWorkingDir = (targetPath) => {
    if (!targetPath || typeof targetPath !== "string") return null;
    const t = targetPath.trim();
    if (!t) return null;

    try {
      if (fs.existsSync(t)) {
        const st = fs.statSync(t);
        return st.isDirectory() ? t : path.dirname(t);
      }
    } catch (_) {}

    const quoted = [...t.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    for (let i = quoted.length - 1; i >= 0; i--) {
      const p = quoted[i];
      try {
        if (!fs.existsSync(p)) continue;
        const st = fs.statSync(p);
        if (st.isDirectory()) return p;
        return path.dirname(p);
      } catch (_) {}
    }

    // Unquoted arg after first token, e.g. cursor D:\path
    const sp = t.indexOf(" ");
    if (sp > 0) {
      const tail = t.slice(sp + 1).trim().replace(/^["']|["']$/g, "");
      if (tail && tail !== t) {
        try {
          if (fs.existsSync(tail)) {
            const st = fs.statSync(tail);
            return st.isDirectory() ? tail : path.dirname(tail);
          }
        } catch (_) {}
      }
    }

    return null;
  };

  // Helper to run terminal commands in a specific directory
  const runAutoCommands = async (cmds, targetPath, openEmptyIfNoCmds = false) => {
    const commandsToRun = (cmds && Array.isArray(cmds) && cmds.length > 0) 
      ? cmds.filter(c => c && c.trim() !== "") 
      : [];
    
    // If we have no specific commands but openTerminal was requested, open one empty terminal
    const finalCmds = (commandsToRun.length === 0 && openEmptyIfNoCmds) ? [""] : commandsToRun;
    
    if (finalCmds.length === 0) return;
    
    const terminal = getPreferredTerminal();
    let workingDir = process.cwd();
    const resolvedWd = extractTerminalWorkingDir(targetPath);
    if (resolvedWd) workingDir = resolvedWd;

    diagLog(`  → [AutoCommands] Starting execution of ${finalCmds.length} command(s) in ${workingDir}`);

    for (const cmd of finalCmds) {
      let shellCmd;
      const safeWorkingDir = workingDir.replace(/"/g, '""'); // Double quotes for CMD escape

      if (terminal === "wt.exe") {
        // Windows Terminal: Use PowerShell instead of CMD as the default shell for running commands
        shellCmd = cmd 
          ? `wt.exe -d "${workingDir}" powershell.exe -NoExit -Command "${cmd}"` 
          : `wt.exe -d "${workingDir}"`;
      } else if (terminal === "powershell.exe") {
        // PowerShell: cd first, then run command if present. Use -NoExit to keep window open.
        shellCmd = cmd 
          ? `start powershell.exe -NoExit -Command "Set-Location '${workingDir}'; ${cmd}"` 
          : `start powershell.exe -NoExit -Command "Set-Location '${workingDir}'"`;
      } else {
        // CMD: Use "" as a blank title so 'start' doesn't think the quoted path is the title
        shellCmd = cmd 
          ? `start "" cmd.exe /k "cd /d "${workingDir}" && ${cmd}"` 
          : `start "" cmd.exe /k "cd /d "${workingDir}""`;
      }
      
      diagLog(`  → [AutoCommands] Spawning window: ${shellCmd}`);
      // Use spawn with shell: true for faster, more reliable execution on Windows
      spawn(shellCmd, { shell: true, detached: true, stdio: 'ignore' }).unref();
    }
  };

  /** When IDE branch already spawned wt/cmd for openTerminal, skip duplicate in success loop. */
  let skipTerminalAfterLaunchLoop = false;

  try {
    if (commandType === "url") {
      diagLog("  → Detected: Explicit URL (from commandType)");
      await tryExecution("shell.openExternal", resolvedCommand);
      runAutoCommands(options.terminalCommands, resolvedCommand, options?.openTerminal);
      diagLog(
        `\n✓✓✓ EXEC_SUCCESS: Launched URL with 'shell.openExternal' ✓✓✓\n`,
      );
      return; 
    }

    if (commandType === "folder") {
      diagLog("  → Detected: Explicit Folder (from commandType)");
      
      if (options?.openTerminal || (options?.terminalCommands && options.terminalCommands.length > 0)) {
        diagLog("  → Folder + Open Terminal (or AutoCommands) requested");
        try {
          await runAutoCommands(options.terminalCommands, resolvedCommand, options?.openTerminal);
          diagLog(`\n✓✓✓ EXEC_SUCCESS: Terminal(s) spawned for folder ✓✓✓\n`);
        } catch (err) {
          diagLog(`[Exec] Failed to run auto-commands, falling back to basic folder open: ${err.message}`);
          await tryExecution("shell.openPath", resolvedCommand);
        }
      } else {
        await tryExecution("shell.openPath", resolvedCommand);
        diagLog(
          `\n✓✓✓ EXEC_SUCCESS: Opened Folder with 'shell.openPath' ✓✓✓\n`,
        );
      }
      return;
    }

    let methodsToTry = [];

    if (commandType === "app") {
      let finalCommand = resolvedCommand.trim();
      const originalAumidCommand = finalCommand; // Keep original in case mapping fails
      const lowerCmd = finalCommand.toLowerCase();
      const hasArgs = finalCommand.includes(" ") && !finalCommand.startsWith('"'); // Simple heuristic for args

      let wasMapped = false;
      // IDE MAPPING: Auto-convert AUMIDs to CLI for folder opening
      // If the command contains an AUMID and looks like it's trying to open a folder
      if (lowerCmd.includes("google.antigravity") && lowerCmd.includes(":\\")) {
        finalCommand = finalCommand.replace(/google\.antigravity/i, "antigravity");
        diagLog(`[Exec] Auto-mapped Antigravity AUMID to CLI for folder opening.`);
        wasMapped = true;
      } else if (lowerCmd.includes("cursor") && lowerCmd.includes("!")) {
        // Many cursor installs use AUMIDs that fail with args
        if (lowerCmd.includes(":\\")) {
           const firstSpace = finalCommand.indexOf(" ");
           if (firstSpace > 0) {
             const pathArg = finalCommand.substring(firstSpace).trim();
             finalCommand = `cursor ${pathArg}`;
             diagLog(`[Exec] Auto-mapped Cursor AUMID to CLI.`);
             wasMapped = true;
           }
        }
      }

      const isShell = isShellApp(finalCommand);
      const isIDE = 
        finalCommand.toLowerCase().includes("antigravity") ||
        finalCommand.toLowerCase().includes("cursor") ||
        finalCommand.toLowerCase().includes("code");

      // Update resolved command for execution methods
      resolvedCommand = finalCommand;

      if (isIDE && finalCommand.includes(" ")) {
        diagLog(`[Exec] IDE with args detected: prioritizing silent spawn for no flashes.`);
        
        if (wasMapped) {
          try {
            await tryExecution("exec_silent_spawn", finalCommand);
            diagLog(`\n✓✓✓ EXEC_SUCCESS: Launched with 'exec_silent_spawn' (Mapped CLI) ✓✓✓\n`);
            
            if (options?.openTerminal || (options?.terminalCommands && options.terminalCommands.length > 0)) {
              diagLog(`[Exec] Launching IDE Folder with AutoCommands: ${finalCommand}`);
              await runAutoCommands(options?.terminalCommands, finalCommand, options?.openTerminal);
            }
            
            return;
          } catch (e) {
            diagLog(`[Exec] Mapped CLI silent spawn failed: ${e.message}. Falling back to original AUMID sequence.`);
          }
        }
        
        // Terminal cwd is derived from the full launch line (last quoted path = project folder).
        if (options?.openTerminal || (options?.terminalCommands && options.terminalCommands.length > 0)) {
          diagLog(`[Exec] IDE + terminal: resolving cwd from launch command`);
          await runAutoCommands(options.terminalCommands, finalCommand, options.openTerminal);
          skipTerminalAfterLaunchLoop = true;
        }
        
        resolvedCommand = originalAumidCommand;
        methodsToTry = ["exec_silent_spawn", "exec_start", "exec_direct", "shell.openPath", "exec_explorer_shell"];
      } else if (isShell && !finalCommand.includes(" ")) {
        methodsToTry = ["exec_explorer_shell", "exec_start", "exec_direct"];
        diagLog(`[Exec] Shell app (AUMID) detected: prioritizing explorer shell.`);
      } else if (isShell && finalCommand.includes(" ")) {
        // Mixed case: AUMID with args. Try direct CLI first (in case it's actually path to exe)
        methodsToTry = ["exec_direct", "exec_start", "exec_explorer_shell"];
        diagLog(`[Exec] Shell app with args: trying direct execution first.`);
      } else {
        methodsToTry = ["exec_direct", "exec_start", "shell.openPath"];
      }
    }
    // GUID/AUMID detection (Shell Namespace / UWP apps)
    else if (
      resolvedCommand.startsWith("{") ||
      resolvedCommand.includes("!") ||
      /^[A-F0-9]{8,64}$/i.test(resolvedCommand) ||
      (resolvedCommand.includes(".") &&
        !resolvedCommand.match(/\.(exe|lnk|bat|cmd)$/i) &&
        !resolvedCommand.includes("\\") &&
        !resolvedCommand.includes("/"))
    ) {
      console.log("  → Detected: Shell App (GUID or AUMID)");
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
    else if (resolvedCommand.match(/\.(exe|lnk|bat|cmd)$/i) || (resolvedCommand.includes("\\") || resolvedCommand.includes("/"))) {
      console.log("  → Detected: Executable file");
      methodsToTry = ["shell.openPath", "exec_start", "exec_direct"];
    }
    // Simple command / Alias (like "notepad", "calc", "MSEdge", "chrome")
    else {
      console.log("  → Detected: Simple command or Alias");
      methodsToTry = [
        "exec_start",           // try 'start' which handles many aliases well
        "exec_explorer_shell",  // try as AUMID
        "shell.openPath",       // try as path
        "exec_direct",          // last resort: terminal (shows error window if fails)
      ];
    }

    // Try each method in order
    let lastError = null;
    for (const method of methodsToTry) {
      try {
        await tryExecution(method, resolvedCommand);
        if (!skipTerminalAfterLaunchLoop) {
          await runAutoCommands(options.terminalCommands, resolvedCommand, options?.openTerminal);
        }
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

  windowBuriedPassive = true;

  // Low latency "hide": Opacity + Passthrough + Blur
  mainWindow.setOpacity(0);
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.blur();
});

// IPC: Show Window explicitly
ipcMain.on("show-window", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  windowBuriedPassive = false;

  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.show();
  mainWindow.focus();
  try {
    mainWindow.webContents.focus();
  } catch (e) {
    /* ignore */
  }
  // hide-window forces opacity 0 — restore immediately so the user never interacts with a "dead" layer
  mainWindow.setOpacity(1);
  try {
    if (typeof mainWindow.webContents.invalidate === "function") {
      mainWindow.webContents.invalidate();
    }
  } catch (e) {
    /* ignore */
  }
});

/** Force Chromium to schedule a full repaint — helps transparent/frameless windows on Windows after resize/show. */
ipcMain.handle("invalidate-paint", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    if (typeof mainWindow.webContents.invalidate === "function") {
      mainWindow.webContents.invalidate();
      return true;
    }
  } catch (e) {
    /* ignore */
  }
  return false;
});

ipcMain.on("set-window-opacity", (event, opacity) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const v = typeof opacity === "number" && !Number.isNaN(opacity)
    ? Math.max(0, Math.min(1, opacity))
    : 1;
  mainWindow.setOpacity(v);
});

ipcMain.handle("get-onboarding-apps", async () => {
  return new Promise((resolve) => {
    const targetApps = ["Chrome", "Edge", "Discord", "Spotify", "Steam", "VS Code", "Visual Studio Code", "Notepad", "Calculadora", "Calculator"];
    const psScriptContent = `
      $ErrorActionPreference = 'SilentlyContinue'
      $targets = @(${targetApps.map((a) => `'${a}'`).join(", ")})
      $apps = Get-StartApps | Where-Object {
        $name = $_.Name
        $match = $targets | Where-Object { $name -like "*$_*" }
        $match -and ($_.AppID -notmatch 'Help|Feedback|Contact|Support|Manual|Desinstalar|Ajuda')
      } | Select-Object Name, AppID | Select-Object -First 5

      $results = @()
      foreach ($app in $apps) {
        $results += [PSCustomObject]@{
          Name = [string]$app.Name
          Path = [string]$app.AppID
        }
      }
      $results | ConvertTo-Json -Compress
    `;

    const tempPath = path.join(app.getPath("userData"), "temp-onboarding.ps1");
    try {
      fs.writeFileSync(tempPath, psScriptContent, "utf8");
      exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPath}"`, (error, stdout) => {
        try { fs.unlinkSync(tempPath); } catch (e) {}
        if (error || !stdout) { resolve([]); return; }
        try {
          const apps = JSON.parse(stdout);
          resolve(Array.isArray(apps) ? apps : [apps]);
        } catch (e) { resolve([]); }
      });
    } catch (e) { resolve([]); }
  });
});

// IPC: Get recommended apps for initial workspace (Discovery)
ipcMain.handle("get-startup-apps", async () => {
  return new Promise((resolve) => {
    diagLog("[Discovery] Running Smart Discovery for initial apps...");

    const psScriptContent = `
      $ErrorActionPreference = 'SilentlyContinue'
      $ProgressPreference = 'SilentlyContinue'

      try {
        # 1. Gather all start apps and define aggressive exclusion
        $excludePattern = 'Help|Feedback|Contact|Support|Manual|Setting|Uninstall|Remover|Windows PowerShell|Windows Terminal|Terminal|Welcome|Store|Optional Features|Drivers|Games|Diagnostic|Documentation|AMD |NVIDIA|Intel|Realtek|Update|Setup|Service|Helper|System|Framework|Microsoft |Ajuda|Suporte|Desinstalar|Instalador'
        $startApps = Get-StartApps | Where-Object { $_.Name -and $_.AppID -and $_.Name -notmatch $excludePattern }

        $results = New-Object System.Collections.ArrayList
        $seenAppIds = New-Object System.Collections.ArrayList

        # STEP A: High-Value Priority Search (Common Productivity/Social Apps)
        $priorityTerms = @('Chrome', 'Visual Studio Code', 'VS Code', 'Discord', 'Spotify', 'Telegram', 'WhatsApp', 'Steam', 'Edge', 'Firefox', 'Cursor', 'Obsidian', 'Figma', 'Slack', 'Teams', 'Zoom', 'Notepad', 'Calculadora', 'Calculator')
        foreach ($term in $priorityTerms) {
          $match = $startApps | Where-Object { $_.Name -like "*$term*" } | Select-Object -First 1
          if ($null -ne $match -and $seenAppIds -notcontains $match.AppID) {
            $null = $results.Add([PSCustomObject]@{
              Name = [string]$match.Name
              Path = [string]$match.AppID
              Command = [string]$match.AppID
              TargetPath = ""
            })
            $null = $seenAppIds.Add($match.AppID)
            if ($results.Count -ge 5) { break }
          }
        }

        # STEP B: Search USER START MENU (APPDATA)
        if ($results.Count -lt 5) {
          $userPrograms = "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs"
          if (Test-Path $userPrograms) {
            $shell = New-Object -ComObject WScript.Shell
            $userLnks = Get-ChildItem -Path $userPrograms -Filter *.lnk -Recurse | Sort-Object LastWriteTime -Descending | Select-Object -First 50
            foreach ($lnk in $userLnks) {
              try {
                $target = $shell.CreateShortcut($lnk.FullName).TargetPath
                if ($target -and (Test-Path $target)) {
                    $item = Get-Item $target
                    if (-not $item.PSIsContainer -and $target -match '\\.(exe|lnk|bat|cmd|msi)$') {
                        $baseName = $lnk.BaseName
                        $match = $startApps | Where-Object { $_.Name -eq $baseName -or $_.AppID -match [regex]::Escape($baseName) } | Select-Object -First 1
                        $appId = if ($null -ne $match) { $match.AppID } else { $lnk.FullName }
                        $appName = if ($null -ne $match) { $match.Name } else { $baseName }
                        if ($seenAppIds -notcontains $appId) {
                            $null = $results.Add([PSCustomObject]@{ Name = [string]$appName; Path = [string]$appId; Command = [string]$appId; TargetPath = [string]$lnk.FullName })
                            $null = $seenAppIds.Add($appId)
                            if ($results.Count -ge 5) { break }
                        }
                    }
                }
              } catch {}
            }
          }
        }

        # STEP C: Final Fallback
        if ($results.Count -lt 5) {
          foreach ($app in $startApps) {
            if ($seenAppIds -notcontains $app.AppID) {
              $null = $results.Add([PSCustomObject]@{ Name = [string]$app.Name; Path = [string]$app.AppID; Command = [string]$app.AppID; TargetPath = "" })
              $null = $seenAppIds.Add($app.AppID)
              if ($results.Count -ge 5) { break }
            }
          }
        }

        if ($results.Count -eq 0) { Write-Output "[]" } else { $results | ConvertTo-Json -Compress }
      } catch { Write-Output "[]" }
    `;

    const tempScriptPath = path.join(app.getPath("userData"), "temp-discovery.ps1");
    try {
      fs.writeFileSync(tempScriptPath, psScriptContent, "utf8");
      exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}"`, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        try { fs.unlinkSync(tempScriptPath); } catch (e) {}
        if (error) { diagLog(`[Discovery] PowerShell error: ${error.message}`); resolve([]); return; }
        if (!stdout || stdout.trim() === "" || stdout.trim() === "[]") { diagLog("[Discovery] No apps found"); resolve([]); return; }
        try {
          const apps = JSON.parse(stdout.trim());
          const result = Array.isArray(apps) ? apps : [apps];
          diagLog(`[Discovery] Success: Found ${result.length} apps`);
          resolve(result);
        } catch (e) { resolve([]); }
      });
    } catch (err) { resolve([]); }
  });
});

// IPC: Toggle Window Size
ipcMain.on("set-window-size", (event, mode, anchorScreenPoint) => {
  updateWindowSize(mode, anchorScreenPoint);
});

/** Same as set-window-size but invoke() so the renderer can await before painting (avoids one frame at windowed bounds). */
ipcMain.handle("apply-window-size", (event, mode, anchorScreenPoint) => {
  updateWindowSize(mode, anchorScreenPoint);
  return true;
});

/** Re-run `small` overlay (forward mouse) — refreshes Windows hit-testing after fullscreen → HUD-only. */
ipcMain.handle("reapply-small-overlay", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const point = screen.getCursorScreenPoint();
  updateWindowSize("small", point);
  try {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.focus();
  } catch (e) {
    /* ignore */
  }
  return true;
});

/**
 * Região(ões) clicável(is) em coordenadas de **cliente** (como getBoundingClientRect no renderer).
 * Fora disto o Windows envia o rato para a janela por baixo — resolve ilha “transparente” com forward.
 * Deduplicação: `setShape` repetido com as mesmas regiões custa ao DWM — evita trabalho se nada mudou.
 */
let lastWindowHitShapeKey = "";
ipcMain.handle("set-window-hit-shape", (event, rects) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (typeof mainWindow.setShape !== "function") return false;
  try {
    if (!rects || !Array.isArray(rects) || rects.length === 0) {
      if (lastWindowHitShapeKey === "__empty__") return true;
      lastWindowHitShapeKey = "__empty__";
      mainWindow.setShape([]);
      return true;
    }
    const normalized = rects.map((r) => ({
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.max(1, Math.round(r.width)),
      height: Math.max(1, Math.round(r.height)),
    }));
    const key = JSON.stringify(normalized);
    if (key === lastWindowHitShapeKey) return true;
    lastWindowHitShapeKey = key;
    mainWindow.setShape(normalized);
    return true;
  } catch (e) {
    return false;
  }
});

// IPC: Minimize — hide from taskbar (tray-only), same idea as old “close” that stayed in the tray.
ipcMain.on("minimize-window", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.setSkipTaskbar(true);
    mainWindow.minimize();
  } catch (e) {
    console.error("minimize-window failed:", e);
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

  ipcMain.on("reset-config", async (event, options = {}) => {
  try {
    diagLog("[Reset] Starting full configuration reset...");
    const configPath = path.join(app.getPath("userData"), "config-v2.json");
    const oldConfigPath = path.join(app.getPath("userData"), "config.json");
    const settingsPath = path.join(app.getPath("userData"), "settings.json");

    // Delete config files
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      diagLog("[Reset] Deleted config-v2.json");
    }
    if (fs.existsSync(oldConfigPath)) {
      fs.unlinkSync(oldConfigPath);
      diagLog("[Reset] Deleted config.json");
    }
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
      diagLog("[Reset] Deleted settings.json");
    }

    // Clear icon cache
    const iconCachePath = path.join(app.getPath("userData"), "icon-cache.json");
    if (fs.existsSync(iconCachePath)) {
      fs.unlinkSync(iconCachePath);
      diagLog("[Reset] Deleted icon-cache.json");
    }

    // Clear Electron session storage (Local Storage, IndexedDB, Cache, etc.)
    const { session } = require('electron');
    await session.defaultSession.clearStorageData();
    diagLog("[Reset] Cleared browser session data (Local Storage, etc.)");

    // Clear internal caches
    iconCache.clear();
    gameModeConfig = { enabled: false, blockFullscreen: true, blockedApps: "" };

    diagLog("[Reset] Configuration reset completed. Restarting...");

    // Relaunch logic handles dev vs prod
    if (isDev) {
      console.log("Dev mode: Reloading window instead of relaunching app...");
      if (mainWindow) {
        await mainWindow.webContents.session.clearStorageData();
        mainWindow.reload();
        mainWindow.show();
      }
    } else {
      app.relaunch();
      app.exit(0);
    }
  } catch (err) {
    console.error("Failed to reset config:", err);
    diagLog(`[Reset] Error: ${err.message}`);
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
// Copy into userData so the icon survives if the original file is deleted/moved.
ipcMain.handle("select-image", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "ico", "svg"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const srcPath = result.filePaths[0];
  try {
    const customIconsDir = path.join(app.getPath("userData"), "custom-icons");
    if (!fs.existsSync(customIconsDir)) {
      fs.mkdirSync(customIconsDir, { recursive: true });
    }
    const ext = path.extname(srcPath) || ".png";
    const destPath = path.join(
      customIconsDir,
      `${crypto.randomUUID()}${ext}`,
    );
    fs.copyFileSync(srcPath, destPath);
    return destPath;
  } catch (e) {
    diagLog(`[select-image] Failed to copy into app data: ${e.message}`);
    return null;
  }
});

/** Pomodoro ambient: copy selected audio into userData/pomodoro-ambient. */
ipcMain.handle("select-pomodoro-audio", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      {
        name: "Audio",
        extensions: ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "webm"],
      },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const srcPath = result.filePaths[0];
  try {
    const dir = path.join(app.getPath("userData"), "pomodoro-ambient");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(srcPath) || ".mp3";
    const destPath = path.join(dir, `ambient-${crypto.randomUUID()}${ext}`);
    fs.copyFileSync(srcPath, destPath);
    return destPath;
  } catch (e) {
    diagLog(`[select-pomodoro-audio] ${e.message}`);
  }
  return null;
});

ipcMain.handle("remove-managed-pomodoro-audio", async (_, filePath) => {
  try {
    if (!filePath || typeof filePath !== "string") return;
    let p = filePath.trim();
    if (p.startsWith("file:")) p = url.fileURLToPath(p);
    p = path.resolve(p);
    const base = path.resolve(path.join(app.getPath("userData"), "pomodoro-ambient"));
    const rel = path.relative(base, p);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (e) {
    diagLog(`[remove-managed-pomodoro-audio] ${e.message}`);
  }
});

// Delete a copied custom icon file (only if path is under userData/custom-icons).
ipcMain.handle("remove-managed-custom-icon", async (_, urlOrPath) => {
  try {
    if (!urlOrPath || typeof urlOrPath !== "string") return;
    let filePath = urlOrPath.trim();
    if (filePath.startsWith("file:")) {
      filePath = url.fileURLToPath(filePath);
    }
    filePath = path.resolve(filePath);
    const customDir = path.resolve(path.join(app.getPath("userData"), "custom-icons"));
    const rel = path.relative(customDir, filePath);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    diagLog(`[remove-managed-custom-icon] ${e.message}`);
  }
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
    if (!filePath || typeof filePath !== "string") {
      diagLog(`[IconRequest] Aborted: Invalid filePath: ${typeof filePath}`);
      return null;
    }

    // Check Memory Cache first (fastest)
    if (iconCache.has(filePath)) {
      const cached = iconCache.get(filePath);
      if (cached && cached.data) {
        // diagLog(`[IconRequest] Cache Hit: ${filePath}`);
        return cached.data;
      }
    }

    diagLog(`[IconRequest] Fetching icon for: ${filePath}`);

    // 1. Resolve shell paths
    let resolvedPath = resolveShellPath(filePath);
    resolvedPath = resolvedPath.replace(/['\"]/g, "");
    if (resolvedPath !== filePath) {
      diagLog(`[IconRequest] Resolved path: ${resolvedPath}`);
    }

    // Special Handling for Common Apps
    const lowerPath = filePath.toLowerCase();
    const isExplorer = lowerPath === "explorer" || lowerPath === "microsoft.windows.explorer" || lowerPath === "file explorer";
    const isCalc = lowerPath === "calc" || lowerPath === "calculator" || lowerPath === "calculadora" || lowerPath.includes("windowscalculator");
    const isEdge = lowerPath === "msedge" || lowerPath === "edge" || lowerPath.includes("microsoftedge");

    if (isExplorer) {
      resolvedPath = path.join(
        process.env["SystemRoot"] || "C:\\Windows",
        "explorer.exe",
      );
    } else if (isCalc) {
      const calcPath = path.join(
        process.env["SystemRoot"] || "C:\\Windows",
        "System32",
        "calc.exe",
      );
      if (fs.existsSync(calcPath)) {
        resolvedPath = calcPath;
      } else {
        resolvedPath = "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App";
      }
    } else if (isEdge) {
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
          diagLog(`[IconRequest] Success via Native Electron for ${resolvedPath}`);
          const dataUrl = icon.toDataURL();
          iconCache.set(filePath, { data: dataUrl });
          return dataUrl;
        }
      } catch (e) {
        diagLog(`[IconRequest] Native extraction failed for ${resolvedPath}: ${e.message}`);
      }
    }

    // 3. PowerShell extraction — use spawn + argv so AUMIDs like Microsoft.X_y!App are not mangled by cmd.exe / string parsing
    const psScript = getAssetPath("extract-icon.ps1");
    diagLog(`[IconRequest] Trying PowerShell extraction for ${resolvedPath}`);

    const iconData = await new Promise((resolve) => {
      const chunks = [];
      const psExe = path.join(
        process.env.SystemRoot || "C:\\Windows",
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );
      const child = spawn(
        fs.existsSync(psExe) ? psExe : "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psScript, "-Target", resolvedPath],
        { windowsHide: true },
      );
      child.stdout.on("data", (d) => chunks.push(d));
      child.stderr.on("data", (d) =>
        diagLog(`[IconRequest] PowerShell stderr: ${String(d).trim()}`),
      );
      child.on("error", (err) => {
        diagLog(`[IconRequest] PowerShell spawn error: ${err.message}`);
        resolve(null);
      });
      child.on("close", (code) => {
        if (code !== 0) {
          diagLog(`[IconRequest] PowerShell exit ${code} for ${resolvedPath}`);
        }
        const stdout = Buffer.concat(chunks).toString("utf8");
        const lines = stdout.trim().split(/\r?\n/);
        const dataLine = lines.find((line) => line.startsWith("data:image"));
        resolve(dataLine || null);
      });
    });

    if (iconData) {
      diagLog(`[IconRequest] Success via PowerShell for ${filePath}`);
      iconCache.set(filePath, { data: iconData });
      return iconData;
    }

    // 4. Final Fallback
    diagLog(`[IconRequest] Falling back to generic Native extraction for ${resolvedPath}`);
    try {
      const icon = await app.getFileIcon(resolvedPath, { size: "large" });
      const dataUrl = icon.toDataURL();
      diagLog(`[IconRequest] Final fallback success for ${resolvedPath}`);
      iconCache.set(filePath, { data: dataUrl });
      return dataUrl;
    } catch (e) {
      diagLog(`[IconRequest] All extraction methods failed for ${filePath}. Error: ${e.message}`);
      return null;
    }
  } catch (error) {
    diagLog(`[IconRequest] Critical error in get-file-icon for ${filePath}: ${error.message}`);
    console.error("Critical error in get-file-icon:", error);
    return null;
  }
});

function stripBom(str) {
  return String(str || "").replace(/^\uFEFF/, "").trim();
}

function getPowerShellExePath() {
  const root = process.env.SystemRoot || "C:\\Windows";
  return path.join(
    root,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

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
