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

const isDev = !app.isPackaged;
// In production, log to userData folder which is writable, unlike the asar archive
const logDir = isDev
  ? path.join(__dirname, "..")
  : path.join(os.tmpdir(), "zenith-radial-menu-cache");
const logFile = path.join(logDir, "diagnostic.log");

const diagLog = (msg) => {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(logFile, line);
  } catch (e) {
    // Fail silently in production if logging fails to prevent app crash
    console.error("Failed to write to diagnostic log:", e);
  }
};
const getAssetPath = (...paths) => {
  if (isDev) return path.join(__dirname, ...paths);
  // In production, backend is inside app.asar/backend. We need to point to app.asar.unpacked/backend for script execution.
  return path.join(
    __dirname.replace("app.asar", "app.asar.unpacked"),
    ...paths,
  );
};

diagLog("Zenith Main Process Started");

// Stability: Fix cache errors & GPU crashes & Window management
app.commandLine.appendSwitch("disable-gpu-cache");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy-dxgi-video"); // Optimiza vídeo
app.commandLine.appendSwitch("disable-features", "WindowOcclusionPrediction"); // Prevent window from being hidden by OS

// Fix Taskbar Icon Grouping
app.setAppUserModelId("com.henry.zenith"); // AUMID explicitly set
app.setPath("userData", path.join(os.tmpdir(), "zenith-radial-menu-cache"));

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

async function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().bounds;

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
      // Don't auto-show here to respect "start hidden" logic if desired,
      // OR only show if not in "ghost" mode.
      // For now, we only resolve. User can open via Tray or Shortcut.
      console.log("Main window ready");
      resolve(newWindow);
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
    // Register specific number key
    globalShortcut.register(key, () => {
      // Send workspace switch event (index 0-8 for keys 1-9)
      const index = key === "0" ? 9 : parseInt(key) - 1;
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log(
          `[GlobalShortcut] Key ${key} pressed -> Switching to workspace ${index}`,
        );
        mainWindow.webContents.send("switch-workspace", index);
      }
    });
  });
  console.log("[Shortcuts] Registered workspace keys 1-9,0");
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
  // Authoritative Show Sequence
  if (mainWindow.isMinimized()) mainWindow.restore();

  // ONLY call show if the window is actually hidden to the OS.
  // Otherwise, we just toggle opacity for instant appearance.
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  // 1. Instant Visibility (Opacity)
  mainWindow.setOpacity(1);

  // 2. Window State - Toggle AlwaysOnTop to force OS attention
  mainWindow.setSkipTaskbar(true);
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, "screen-saver", 1);

  // 3. CRITICAL: Input Capture
  mainWindow.setIgnoreMouseEvents(false);

  // 4. Force Focus
  // We need to be aggressive here.
  mainWindow.focus();
  mainWindow.webContents.focus();

  // 5. Safety Refresh for Input (Race condition fix)
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(false);
      mainWindow.focus();
      mainWindow.webContents.focus();
    }
  }, 20); // Slightly increased to 20ms to catch window manager lag

  // 6. GLOBAL SHORTCUTS: Register keys to intercept input (Bypass Focus Issues)
  registerWorkspaceShortcuts();

  // Force overlay mode if not already
  if (!mainWindow.isFullScreen()) {
    updateWindowSize("fullscreen");
  }

  // Ensure visibility - opaqueness 1
  mainWindow.setOpacity(1);

  const cursorPoint = screen.getCursorScreenPoint();

  // Send open-menu immediately
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
  mainWindow = await createWindow();

  // Safety: Unregister shortcuts if window loses focus
  mainWindow.on("blur", () => {
    unregisterWorkspaceShortcuts();
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
            mainWindow = await createWindow(); // Await the creation
            setupMainWindow(mainWindow); // Setup the newly created window
          }
          mainWindow.show();
          mainWindow.setSkipTaskbar(false); // Make it appear in the taskbar
          mainWindow.focus();
          mainWindow.webContents.send("open-dashboard");
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

  // Settings Management
  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  let currentSettings = {
    globalShortcut: "Alt+Z",
    enableMouseTrigger: true,
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

  // Initial load
  loadSettings();

  const registerGlobalShortcut = () => {
    globalShortcut.unregisterAll();
    const shortcut = currentSettings.globalShortcut || "Alt+Z";

    try {
      const registered = globalShortcut.register(shortcut, async () => {
        console.log(`${shortcut} shortcut triggered`);
        const allowed = await shouldOpenMenu();
        if (!allowed) return;
        showMenuAtCursor("shortcut");
      });
      console.log(`Global shortcut '${shortcut}' registered:`, registered);
    } catch (e) {
      console.error(`Failed to register shortcut '${shortcut}':`, e);
    }
  };

  // Register initial shortcut
  registerGlobalShortcut();

  // IPC: Settings Handlers
  ipcMain.handle("get-settings", () => currentSettings);

  ipcMain.on("set-settings", (event, settings) => {
    const oldMouseTrigger = currentSettings.enableMouseTrigger;
    saveSettings(settings);

    if (settings.globalShortcut) {
      registerGlobalShortcut();
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
  if (!mainWindow || mainWindow.isDestroyed()) {
    return; // Do nothing if the window is not available
  }

  // Unregister shortcuts immediately
  unregisterWorkspaceShortcuts();

  // INSTANT HIDE: Opacity 0 + Pass-through
  mainWindow.setOpacity(0);
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Blur to return focus to previous app
  mainWindow.blur();
});

// IPC: Show Window explicitly
ipcMain.on("show-window", () => {
  if (mainWindow) {
    mainWindow.setOpacity(1); // Restore opacity
    mainWindow.show();
    mainWindow.focus();
  }
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
    const configPath = path.join(app.getPath("userData"), "config.json");
    const settingsPath = path.join(app.getPath("userData"), "settings.json");

    // Delete config files
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
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
const iconCache = new Map();

ipcMain.handle("get-file-icon", async (event, filePath) => {
  try {
    if (!filePath || typeof filePath !== "string") return null;

    diagLog(`[IconRequest] Fetching icon for: ${filePath}`);

    // Check Cache with expiration (24 hours)
    const CACHE_EXPIRATION_MS = 24 * 60 * 60 * 1000;
    if (iconCache.has(filePath)) {
      const cached = iconCache.get(filePath);
      if (
        cached &&
        cached.timestamp &&
        Date.now() - cached.timestamp < CACHE_EXPIRATION_MS
      ) {
        // diagLog(`[IconRequest] Cache hit for: ${filePath}`);
        return cached.data;
      } else {
        iconCache.delete(filePath);
      }
    }

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

    diagLog(
      `[IconRequest] Resolved: ${resolvedPath} (AUMID: ${isAUMID}, File: ${isExplicitFile})`,
    );

    // 2. Try Electron Native first if it's a file path
    if (isExplicitFile && !isAUMID) {
      try {
        const icon = await app.getFileIcon(resolvedPath, { size: "large" });
        if (icon) {
          const dataUrl = icon.toDataURL();
          iconCache.set(filePath, { data: dataUrl, timestamp: Date.now() });
          return dataUrl;
        }
      } catch (e) {
        // Fall through to PowerShell
        diagLog(
          `[IconRequest] Native extraction failed for ${resolvedPath}: ${e.message}`,
        );
      }
    }

    // 3. PowerShell Extraction Strategy
    const psScript = getAssetPath("extract-icon.ps1");
    // Only pass necessary args. Note: PowerShell output needs to be captured.
    const command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${psScript}" -Target "${resolvedPath}"`;

    diagLog(`[IconRequest] PS Command: ${command}`);

    const iconData = await new Promise((resolve) => {
      exec(command, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (stderr) {
          diagLog(`[IconRequest] PS Stderr: ${stderr}`);
        }
        if (stdout) {
          // Filter out debug lines if any (lines not starting with data:)
          const lines = stdout.trim().split(/\r?\n/);
          const dataLine = lines.find((line) => line.startsWith("data:image"));
          if (dataLine) {
            resolve(dataLine);
            return;
          }
          const debugLines = lines.filter((line) => line.startsWith("DEBUG:"));
          if (debugLines.length > 0) {
            diagLog(`[IconRequest] PS Debug: ${debugLines.join(" | ")}`);
          } else {
            diagLog(
              `[IconRequest] PS Stdout (No data): ${stdout.substring(0, 200)}...`,
            );
          }
        }

        if (error) {
          diagLog(`[IconRequest] PS Error: ${error.message}`);
          resolve(null);
        } else {
          resolve(null);
        }
      });
    });

    if (iconData) {
      diagLog(`[IconRequest] Success via PowerShell for ${filePath}`);
      iconCache.set(filePath, { data: iconData, timestamp: Date.now() });
      return iconData;
    }

    // 4. Final Fallback
    try {
      diagLog(`[IconRequest] Trying final fallback for ${resolvedPath}`);
      const icon = await app.getFileIcon(resolvedPath, { size: "large" });
      const dataUrl = icon.toDataURL();
      iconCache.set(filePath, { data: dataUrl, timestamp: Date.now() });
      return dataUrl;
    } catch (e) {
      diagLog(`[IconRequest] Final fallback failed: ${e.message}`);
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

// SYSTEM CONTROLS IPC
const systemControl = require("./system-control");

ipcMain.handle("get-volume", async () => {
  return systemControl.getVolume();
});

ipcMain.on("set-volume", async (event, level) => {
  try {
    await systemControl.setVolume(level);
  } catch (err) {
    console.error("Failed to set volume:", err);
  }
});

ipcMain.handle("get-brightness", async () => {
  return systemControl.getBrightness();
});

ipcMain.on("set-brightness", async (event, level) => {
  try {
    await systemControl.setBrightness(level);
  } catch (err) {
    console.error("Failed to set brightness:", err);
  }
});

ipcMain.handle("toggle-bluetooth", async (event, enabled) => {
  return systemControl.toggleBluetooth(enabled);
});

ipcMain.handle("toggle-wifi", async (event, enabled) => {
  return systemControl.toggleWifi(enabled);
});

app.on("window-all-closed", (e) => {
  // Prevent app from quitting when all windows are closed
  // This ensures the app continues to run in the tray
  e.preventDefault();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
