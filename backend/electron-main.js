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
  session,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const { exec, spawn, execFile, execFileSync } = require("child_process");
const os = require("os");
const fs = require("fs");
const win32Launch = require("./win32-launch");
const { normalizeFullPersistenceBlob } = require("./persistence-normalize.cjs");
const { detectGameExecutable } = require("./game-detection.cjs");
const crypto = require("crypto");
const { GlobalKeyboardListener } = require("node-global-key-listener");
const http = require("http");
const https = require("https");
const url = require("url");

const isDev = !app.isPackaged;

/**
 * Canal de distribuição. A Microsoft Store proíbe mecanismos próprios de atualização — quem
 * atualiza é a loja — e uma submissão com o `electron-updater` ativo é reprovada na certificação.
 * O mesmo código serve os dois canais; é aqui que se decide qual deles está a correr.
 *
 * `process.windowsStore` é posto pelo Electron quando o processo corre dentro de um pacote MSIX.
 * A variável de ambiente existe só para poder testar o comportamento sem empacotar.
 */
const isStoreBuild = () =>
  process.windowsStore === true || process.env.ROVYL_STORE_BUILD === "1";
const logDir = isDev
  ? path.join(__dirname, "..")
  : path.join(os.homedir(), ".zenith-radial-menu");
const logFile = path.join(logDir, "diagnostic.log");

const logQueue = [];
let isWriting = false;
let logFlushTimer = null;

/**
 * O log era append puro: crescia para sempre (e cada abertura acrescenta uma linha por ícone
 * resolvido). Duas gerações de 2 MB chegam para diagnosticar e o disco deixa de pagar juros.
 * O tamanho é contado em memória — `statSync` a cada escrita seria trocar um problema por outro.
 */
const LOG_MAX_BYTES = 2 * 1024 * 1024;
let logBytesWritten = null;

const rotateLogIfNeeded = (incomingBytes) => {
  try {
    if (logBytesWritten === null) {
      logBytesWritten = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
    }
    if (logBytesWritten + incomingBytes <= LOG_MAX_BYTES) {
      logBytesWritten += incomingBytes;
      return;
    }
    /** `renameSync` sobre o `.1` anterior descarta a geração mais velha sem passo extra. */
    fs.renameSync(logFile, `${logFile}.1`);
    logBytesWritten = incomingBytes;
  } catch (e) {
    logBytesWritten = 0;
  }
};

const processLogQueue = () => {
  if (isWriting || logQueue.length === 0) return;
  if (logFlushTimer) {
    clearTimeout(logFlushTimer);
    logFlushTimer = null;
  }
  isWriting = true;

  const logsToWrite = logQueue.splice(0, logQueue.length).join("");

  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    rotateLogIfNeeded(Buffer.byteLength(logsToWrite, "utf-8"));
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

/**
 * Flush only after a log actually arrives. The old permanent 5 s interval woke
 * the Electron main process all day even when the app was completely idle.
 */
const scheduleLogFlush = () => {
  if (logFlushTimer || logQueue.length === 0) return;
  logFlushTimer = setTimeout(() => {
    logFlushTimer = null;
    processLogQueue();
  }, 1500);
  logFlushTimer.unref?.();
};

/**
 * Botões de rato aceites como gatilho. Esquerdo (0x01) e direito (0x02) estão deliberadamente
 * fora: vigiá-los globalmente colidiria com o clique primário e o menu de contexto de todo o
 * sistema. Os laterais (X1/X2) são livres na esmagadora maioria das aplicações.
 */
const MOUSE_TRIGGER_VK = { middle: 0x04, x1: 0x05, x2: 0x06 };
const MOUSE_TRIGGER_BUTTONS = Object.keys(MOUSE_TRIGGER_VK);

const diagLog = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  logQueue.push(line);

  // Throttle writes: process immediately in dev, or when queue reaches 10 lines in prod
  if (isDev || logQueue.length >= 10) {
    processLogQueue();
  } else {
    scheduleLogFlush();
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
 * Rovyl keeps one profile for packaged and development builds. During the rebrand,
 * copy the former Zenith profile forward so existing workspaces and preferences survive.
 * `ZENITH_USER_DATA` remains supported as a backwards-compatible environment override.
 * Must run before any `app.getPath("userData")`.
 */
function ensureUnifiedUserDataDirectory() {
  const udOverride = (
    process.env.ROVYL_USER_DATA ||
    process.env.ZENITH_USER_DATA ||
    ""
  ).trim();
  if (udOverride) {
    try {
      app.setPath("userData", udOverride);
      diagLog(`[Persist] userData override=${app.getPath("userData")}`);
      return;
    } catch (e) {
      console.error("ROVYL_USER_DATA setPath failed:", e.message);
    }
  }

  try {
    const appData = app.getPath("appData");
    const unifiedDir = path.join(appData, "Rovyl");
    const unifiedCfg = path.join(unifiedDir, "config-v2.json");
    const legacyDirs = [
      path.join(appData, "Zenith OS"),
      path.join(appData, "zenith-radial-menu"),
    ];
    const legacyDir = legacyDirs.find((dir) =>
      fs.existsSync(path.join(dir, "config-v2.json")),
    );

    if (!fs.existsSync(unifiedCfg) && legacyDir) {
      if (!fs.existsSync(unifiedDir)) {
        fs.mkdirSync(unifiedDir, { recursive: true });
      }
      for (const f of [
        "config-v2.json",
        "config-v2.json.bak",
        "settings.json",
        "zenith-persistence.log",
        "rovyl-persistence.log",
        "icon-cache.json",
      ]) {
        const src = path.join(legacyDir, f);
        const dst = path.join(unifiedDir, f);
        if (fs.existsSync(src) && !fs.existsSync(dst)) {
          try {
            fs.copyFileSync(src, dst);
            diagLog(`[Persist] Migrated legacy profile ${f} → Rovyl userData`);
          } catch (e) {
            diagLog(`[Persist] Migrate ${f} failed: ${e.message}`);
          }
        }
      }
    }

    app.setPath("userData", unifiedDir);
    diagLog(`[Persist] Rovyl userData: ${unifiedDir}`);
  } catch (e) {
    console.error("ensureUnifiedUserDataDirectory:", e.message);
  }
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

ensureUnifiedUserDataDirectory();
loadEnvLocalFiles();

// Software rendering makes the transparent radial and its blur contend with the UI thread, which
// presents as a slow-motion pointer. The idle HWND is now truly hidden, so GPU is the safe default.
if (process.env.ZENITH_DISABLE_HARDWARE_ACCELERATION === "1") {
  app.disableHardwareAcceleration();
  diagLog(
    "[GPU] ZENITH_DISABLE_HARDWARE_ACCELERATION=1 — renderização por software.",
  );
} else {
  diagLog("[GPU] Aceleração de hardware ativa para o radial transparente.");
}

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

/* ── MRU de IDEs da família VS Code ──────────────────────────────────────────────────────────
 *
 * O nome da pasta de perfil não é o nome do produto e muda entre versões e fabricantes:
 * "Antigravity IDE" (e não "Antigravity", que é só runtime do Chromium), "Code - Insiders",
 * "Windsurf", "Trae"… Uma tabela fixa de caminhos falha em silêncio — devolve lista vazia sem
 * erro, exatamente o que aconteceu com o Antigravity. Em vez de adivinhar o caminho, descobre-se:
 * qualquer pasta com `User/globalStorage/{storage.json|state.vscdb}` É um perfil desta família,
 * e escolhe-se a que melhor corresponde ao nome/executável da app. IDEs que ainda não existem
 * passam a funcionar sem alterar código.
 */

/** Nomes normalizados: comparação sem espaços, hífens, pontuação nem maiúsculas. */
function normalizeIdeToken(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Rótulos que não parecem com a pasta que o produto cria. */
const IDE_TOKEN_ALIASES = {
  visualstudiocode: "code",
  vscode: "code",
  vscodeinsiders: "codeinsiders",
};

/** Troços de caminho e de nome de ficheiro que nunca identificam um produto. */
const IDE_TOKEN_STOPLIST = new Set([
  "exe", "com", "app", "bin", "cmd", "lnk", "url",
  "users", "user", "appdata", "local", "locallow", "roaming",
  "program", "programs", "programfiles", "files", "windows", "system32",
  "start", "menu", "desktop", "microsoft", "google", "data",
  /** Prefixos de AUMID de apps Electron: `electron.app.Antigravity` não identifica produto nenhum. */
  "electron", "electronapp", "shell", "launcher",
]);

/**
 * Pistas de identidade por ordem de confiança. O EXECUTÁVEL vem primeiro: `Antigravity IDE.exe` e
 * `Antigravity.exe` são produtos diferentes que partilham prefixo, e o rótulo — editável pelo
 * utilizador — não os distingue. Só depois vem o nome visível e, por fim, o caminho.
 */
function ideIdentityTokens(appName, appCommand) {
  const tokens = [];
  const push = (raw) => {
    const token = normalizeIdeToken(raw);
    if (!token || token.length < 3 || tokens.includes(token)) return;
    if (IDE_TOKEN_STOPLIST.has(token)) return;
    tokens.push(token);
    const alias = IDE_TOKEN_ALIASES[token];
    if (alias && !tokens.includes(alias)) tokens.push(alias);
  };

  const command = String(appCommand || "").trim().replace(/^"|"$/g, "");
  const segments = command.split(/[\\/]/).filter(Boolean);
  const executable = segments[segments.length - 1] || "";

  /** `Antigravity IDE.exe` → `antigravityide`. */
  push(executable.replace(/\.[a-z0-9]+$/i, ""));
  /** Pasta de instalação: `...\Programs\Antigravity IDE\...`. */
  if (segments.length >= 2) push(segments[segments.length - 2]);
  /** AUMID: `Google.Antigravity` → `antigravity`. */
  executable.split(".").forEach(push);

  push(appName);
  String(appName || "")
    .split(/[\s\-_]+/)
    .forEach(push);

  segments.forEach(push);

  return tokens;
}

/** Diretórios onde as apps desta família guardam o perfil. */
function ideProfileSearchRoots() {
  return [process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean);
}

function readIdeProfileAt(dir, dirName) {
  const globalStorage = path.join(dir, "User", "globalStorage");
  const storageJson = path.join(globalStorage, "storage.json");
  const vscdb = path.join(globalStorage, "state.vscdb");
  let mtime = 0;
  let found = false;
  for (const file of [vscdb, storageJson]) {
    try {
      mtime = Math.max(mtime, fs.statSync(file).mtimeMs);
      found = true;
    } catch (e) {
      /* ficheiro ausente — o outro ainda pode existir */
    }
  }
  return found ? { name: dirName, normalized: normalizeIdeToken(dirName), globalStorage, mtime } : null;
}

/** A varredura é de disco: guardada por instantes para não correr a cada abertura da roda. */
let ideProfileCache = { at: 0, profiles: [] };
const IDE_PROFILE_CACHE_MS = 15000;

function listIdeProfiles() {
  const now = Date.now();
  if (now - ideProfileCache.at < IDE_PROFILE_CACHE_MS) return ideProfileCache.profiles;

  const profiles = [];
  const seen = new Set();
  for (const root of ideProfileSearchRoots()) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      const profile = readIdeProfileAt(dir, entry.name);
      if (profile) {
        if (seen.has(profile.globalStorage)) continue;
        seen.add(profile.globalStorage);
        profiles.push(profile);
        continue;
      }
      /** Um nível abaixo cobre perfis debaixo do fabricante (`Google\Antigravity`). */
      let nested = [];
      try {
        nested = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        continue;
      }
      for (const child of nested) {
        if (!child.isDirectory()) continue;
        const nestedProfile = readIdeProfileAt(path.join(dir, child.name), child.name);
        if (!nestedProfile || seen.has(nestedProfile.globalStorage)) continue;
        seen.add(nestedProfile.globalStorage);
        profiles.push(nestedProfile);
      }
    }
  }

  ideProfileCache = { at: now, profiles };
  diagLog(`[Recents] IDE profiles found: ${profiles.map((p) => p.name).join(", ") || "none"}`);
  return profiles;
}

/**
 * Correspondência por grau, nunca por substring solta: `code` não pode capturar `VSCodium`, e
 * `antigravity` tem de encontrar `Antigravity IDE`. Empate resolve-se pelo perfil escrito há menos
 * tempo, que é o que o utilizador anda mesmo a usar.
 */
function scoreIdeProfile(token, profile) {
  const name = profile.normalized;
  if (!token || !name) return 0;
  if (name === token) return 100;
  if (name.startsWith(token)) return 80;
  if (token.startsWith(name)) return 70;
  if (token.length >= 5 && name.includes(token)) return 50;
  return 0;
}

/**
 * Verdadeiro quando o token nomeia uma pasta de dados própria que NÃO é um perfil desta família.
 * É o sinal decisivo contra o espelhamento: `Antigravity.exe` (o agente) tem `%APPDATA%\Antigravity`
 * sem `globalStorage`, portanto não tem MRU nenhum — e não pode herdar o de `Antigravity IDE` só
 * porque um nome é prefixo do outro.
 */
function ideTokenHasOwnNonProfileDataDir(token) {
  for (const root of ideProfileSearchRoots()) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || normalizeIdeToken(entry.name) !== token) continue;
      const globalStorage = path.join(root, entry.name, "User", "globalStorage");
      if (!fs.existsSync(globalStorage)) return true;
    }
  }
  return false;
}

/** `globalStorage` do IDE indicado, ou "" quando nenhum perfil corresponde. */
function resolveIdeGlobalStorage(appName, appCommand) {
  const tokens = ideIdentityTokens(appName, appCommand);
  if (tokens.length === 0) return "";
  const profiles = listIdeProfiles();
  if (profiles.length === 0) return "";

  /** 1) Correspondência exata: um produto identificado ao milímetro nunca cede a um prefixo. */
  for (const token of tokens) {
    const exact = profiles
      .filter((profile) => profile.normalized === token)
      .sort((a, b) => b.mtime - a.mtime)[0];
    if (exact) {
      diagLog(`[Recents] "${appName}" → perfil "${exact.name}" (exato via "${token}")`);
      return exact.globalStorage;
    }
    /** 2) O produto tem casa própria e ela não é um perfil: não há MRU para mostrar. */
    if (ideTokenHasOwnNonProfileDataDir(token)) {
      diagLog(`[Recents] "${appName}" tem pasta de dados própria sem globalStorage ("${token}") — sem MRU`);
      return "";
    }
  }

  /** 3) Só então se aceita parcial, para perfis cujo nome difere do produto. */
  let best = null;
  tokens.forEach((token, tokenIndex) => {
    for (const profile of profiles) {
      const score = scoreIdeProfile(token, profile);
      if (score === 0) continue;
      const candidate = { profile, score, tokenIndex };
      if (
        !best ||
        candidate.tokenIndex < best.tokenIndex ||
        (candidate.tokenIndex === best.tokenIndex &&
          (candidate.score > best.score ||
            (candidate.score === best.score && candidate.profile.mtime > best.profile.mtime)))
      ) {
        best = candidate;
      }
    }
  });

  if (!best) return "";
  diagLog(`[Recents] "${appName}" → perfil "${best.profile.name}" (parcial ${best.score})`);
  return best.profile.globalStorage;
}

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

diagLog("Rovyl Main Process Started");

/**
 * Ctrl+C no terminal envia SIGINT ao processo Node/Electron. Sem este handler, o processo
 * termina abruptamente sem acionar `before-quit`, pelo que o flush síncrono do renderer
 * nunca acontece e as últimas alterações perdem-se. Redirecionar SIGINT para `app.quit()`
 * permite que o fluxo normal de fecho (before-quit → renderer flush → exit) ocorra.
 */
process.on("SIGINT", () => {
  diagLog("[Signal] SIGINT received — routing through app.quit() for clean persistence flush");
  app.quit();
});

/** Sum bytes of config-v2.json.broken-*.json (after quarantine) so the renderer can block destructive saves. */
function sumQuarantinedConfigBytes(userDataDir) {
  let total = 0;
  try {
    if (!userDataDir || !fs.existsSync(userDataDir)) return 0;
    const files = fs.readdirSync(userDataDir);
    for (const f of files) {
      if (f.startsWith("config-v2.json.broken-") && f.endsWith(".json")) {
        try {
          const p = path.join(userDataDir, f);
          const st = fs.statSync(p);
          if (st.isFile()) total += st.size;
        } catch (_) {
          /* ignore */
        }
      }
    }
  } catch (_) {
    /* ignore */
  }
  return total;
}

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

/**
 * Chromium throttles occluded/background renderers aggressively on Windows.
 * The transparent radial HUD must keep requestAnimationFrame + drag at full rate.
 *
 * `CalculateNativeWinOcclusion` é o ponto crítico e vale TAMBÉM em dev: numa janela layered
 * transparente que é escondida/mostrada/redimensionada a cada gesto, o Chromium marca-a como
 * ocluída, descarta os frames e o `show()` seguinte apresenta a textura antiga (dashboard/ilha)
 * ou um frame preto. Isto reproduz-se em QUALQUER ação (abrir, fechar, restaurar), não só na
 * abertura — era por isso que os handshakes de cobertura não chegavam.
 * A deteção nativa continua desativada para evitar a textura antiga, mas o throttling
 * global de timers NÃO: `webContents.setBackgroundThrottling(false/true)` já o alterna
 * nos pontos de mostrar/esconder, permitindo que a app durma quando está na bandeja.
 */
if (process.env.ZENITH_AGGRESSIVE_GPU !== "1") {
  /** No modo agressivo o `disable-features` já inclui estas (appendSwitch repetido substitui a lista). */
  app.commandLine.appendSwitch(
    "disable-features",
    "CalculateNativeWinOcclusion,WindowOcclusionPrediction",
  );
}
diagLog("[Perf] Background throttling dynamically controlled by window visibility.");

// Fix Taskbar Icon Grouping
app.setName("Rovyl");
app.setAppUserModelId("com.henry.rovyl"); // AUMID explicitly set
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
        applyMousePolicyAfterReveal(mainWindow);
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

// Game Mode Configuration Storage (merged from renderer; keep defaults for missing keys)
let gameModeConfig = {
  enabled: false,
  mode: "list",
  blockedApps: "",
  autoDetectGames: false,
};

function mergeGameModeConfig(gm) {
  if (!gm || typeof gm !== "object") return;
  let blocked = "";
  if (typeof gm.blockedApps === "string") blocked = gm.blockedApps;
  else if (Array.isArray(gm.blockedApps)) {
    blocked = gm.blockedApps.map((s) => String(s).trim()).filter(Boolean).join(", ");
  }
  gameModeConfig = {
    enabled: !!gm.enabled,
    mode: gm.mode === "all" ? "all" : "list",
    blockedApps: blocked,
    autoDetectGames: !!gm.autoDetectGames,
  };
}

/** Full persistence blob is `{ config: UIConfig, ... }`; older saves may be flat. */
function extractUiConfigFromPersistenceBlob(blob) {
  if (!blob || typeof blob !== "object") return null;
  if (blob.config && typeof blob.config === "object") return blob.config;
  return blob;
}

// Window Management Persistence — compact desktop panel, not a full-screen dashboard.
/**
 * 720×540 deixava ~430px de conteúdo depois da navegação e do padding: as Settings
 * pareciam miniaturas dentro de um rect grande. 880×600 dá uma coluna de conteúdo de
 * ~565px (236px de navegação + padding) — a largura para que a escala tipográfica
 * (13px label / 11.5px descrição) foi desenhada — sem virar dashboard.
 * Continua a caber a 175% de escala do Windows em 1080p
 * graças ao clamp de `windowedBoundsForWorkArea`.
 */
const DEFAULT_WINDOWED_WIDTH = 880;
const DEFAULT_WINDOWED_HEIGHT = 600;
let lastWindowedBounds = {
  width: DEFAULT_WINDOWED_WIDTH,
  height: DEFAULT_WINDOWED_HEIGHT,
  x: 100,
  y: 100,
};
let isUpdatingBounds = false;

/** Ilha (modo `small` + hit-shape) encolhe o HWND — não gravar isso como "janela normal" ou o dashboard abre num rect minúsculo. */
const MIN_REASONABLE_WINDOWED_W = 480;
const MIN_REASONABLE_WINDOWED_H = 360;

/**
 * Rect windowed por omissão, centrado e sempre dentro da área de trabalho.
 * `workArea` já vem em DIPs, por isso isto cobre 100/125/150/175% de escala do Windows:
 * a 175% em 1080p a área útil ronda 1097×583 DIPs e o rect encolhe em vez de sair do ecrã.
 */
function windowedBoundsForWorkArea() {
  try {
    const { workArea } = screen.getPrimaryDisplay();
    const w = Math.min(DEFAULT_WINDOWED_WIDTH, Math.max(MIN_REASONABLE_WINDOWED_W, workArea.width - 80));
    const h = Math.min(DEFAULT_WINDOWED_HEIGHT, Math.max(MIN_REASONABLE_WINDOWED_H, workArea.height - 80));
    return {
      x: Math.round(workArea.x + (workArea.width - w) / 2),
      y: Math.round(workArea.y + (workArea.height - h) / 2),
      width: w,
      height: h,
    };
  } catch (e) {
    return {
      x: 100,
      y: 100,
      width: DEFAULT_WINDOWED_WIDTH,
      height: DEFAULT_WINDOWED_HEIGHT,
    };
  }
}

function resetLastWindowedBoundsIfIslandCorrupted() {
  const b = lastWindowedBounds;
  if (
    b &&
    b.width >= MIN_REASONABLE_WINDOWED_W &&
    b.height >= MIN_REASONABLE_WINDOWED_H
  ) {
    return;
  }
  lastWindowedBounds = windowedBoundsForWorkArea();
}
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

/** Sync with `set-window-hit-shape`: "__empty__" ou "" = rato reencaminhado; outro = regiões HUD. */
let lastWindowHitShapeKey = "";

/**
 * `updateWindowSize` não pode aplicar `setBounds` com a janela minimizada; guardamos o último pedido
 * e aplicamos no `restore` para a ilha/`small` voltarem a sincronizar com o HWND.
 */
let pendingWindowSize = null;

function flushPendingWindowSizeIfNeeded() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    if (mainWindow.isMinimized()) return;
  } catch (e) {
    return;
  }
  if (!pendingWindowSize) return;
  const p = pendingWindowSize;
  pendingWindowSize = null;
  updateWindowSize(p.mode, p.anchorScreenPoint);
}

/**
 * `show-window` e restauros de foco não podem forçar `setIgnoreMouseEvents(false)` em modo `small`:
 * isso fazia o overlay a tamanho do monitor capturar o rato (invisível).
 */
function applyMousePolicyAfterReveal(win) {
  const w = win || mainWindow;
  if (!w || w.isDestroyed()) return;
  try {
    if (nativeWindowSizeMode === "fullscreen" || nativeWindowSizeMode === "windowed") {
      w.setIgnoreMouseEvents(false);
      return;
    }
    if (nativeWindowSizeMode === "small") {
      if (lastWindowHitShapeKey === "__empty__" || lastWindowHitShapeKey === "") {
        if (typeof w.setShape === "function") {
          w.setShape([]);
        }
        w.setIgnoreMouseEvents(true, { forward: true });
      } else {
        w.setIgnoreMouseEvents(false);
      }
    }
  } catch (e) {
    /* ignore */
  }
}

/** When true, allow BrowserWindow to close (real quit). Otherwise close → hide to tray. */
let isAppQuitting = false;
/**
 * Parar o gatilho no fecho — e é um requisito de ATUALIZAÇÃO, não de higiene.
 *
 * O processo PowerShell do gatilho vive dentro da pasta de instalação. Se sobreviver ao fecho da
 * app, mantém um handle aberto sobre `mouse-blocker.ps1`, o instalador NSIS não consegue substituir
 * os ficheiros, e a atualização falha em silêncio: no arranque seguinte a app encontra a mesma
 * versão nova e volta a propô-la. Para sempre.
 *
 * A função vive dentro de `app.whenReady`; esta referência é como o `will-quit` lhe chega.
 */
let stopMouseHookForShutdown = () => {};

let updateInstallInProgress = false;
/** Ensures renderer runs saveFullConfigSync before exit (tray "Sair" / OS shutdown paths). */
let zenithQuitFlushStarted = false;
/**
 * Definido como `true` imediatamente antes de chamar `app.exit(0)` no handler de importação.
 * Impede que o `before-quit` envie `zenith-before-quit-flush` ao renderer — que ainda tem
 * o estado ANTERIOR à importação em memória e sobrescreveria o backup recém-gravado no disco.
 */
let skipQuitFlushForImport = false;

app.on("before-quit", (event) => {
  isAppQuitting = true;
  // `quitAndInstall` must not be delayed by the normal renderer persistence handshake.
  if (updateInstallInProgress) {
    return;
  }
  if (zenithQuitFlushStarted) {
    return;
  }
  const w = mainWindow;
  if (!w || w.isDestroyed()) {
    return;
  }
  // Importação: o backup já está no disco — não deixar o renderer sobrescrevê-lo com estado antigo.
  if (skipQuitFlushForImport) {
    diagLog("[Quit] Skipping renderer flush — import in progress, backup on disk is authoritative");
    return;
  }
  event.preventDefault();
  zenithQuitFlushStarted = true;

  let finished = false;
  let timeoutId = null;
  const finishExit = () => {
    if (finished) return;
    finished = true;
    if (timeoutId != null) clearTimeout(timeoutId);
    app.exit(0);
  };

  timeoutId = setTimeout(() => {
    diagLog("[Quit] Persistence flush timeout — exiting");
    finishExit();
  }, 12000);

  ipcMain.once("zenith-quit-flush-ack", finishExit);

  try {
    w.webContents.send("zenith-before-quit-flush");
  } catch (e) {
    diagLog(`[Quit] Flush IPC failed: ${e.message}`);
    finishExit();
  }
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
  /** Centrado e clampado à área útil — nunca maior que o ecrã em escalas altas do Windows. */
  const initialBounds = windowedBoundsForWorkArea();
  /** `updateWindowSize('windowed')` pode correr antes do primeiro evento `resize`: alinhar já. */
  lastWindowedBounds = { ...initialBounds };
  const newWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
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
      // Let Chromium fully suspend animation/timers while the transparent window is hidden.
      // Keeping an invisible renderer at full frame rate can contend with high-polling-rate mice.
      backgroundThrottling: true,
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
      // Notify renderer before native hide so it can sync-save while webContents is still fully alive.
      try {
        if (
          !newWindow.isDestroyed() &&
          newWindow.webContents &&
          !newWindow.webContents.isDestroyed()
        ) {
          newWindow.webContents.send("window-hid-to-tray");
        }
      } catch (e) {
        /* ignore */
      }
      newWindow.hide();
      newWindow.setSkipTaskbar(true);
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

    // Track bounds for persistence — só em modo `windowed` (fullscreen/small usam bounds especiais; small+ilha não deve sobrescrever o último tamanho real).
    newWindow.on("resize", () => {
      if (
        nativeWindowSizeMode === "windowed" &&
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
        nativeWindowSizeMode === "windowed" &&
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
      applyMousePolicyAfterReveal(window);
      window.setSkipTaskbar(false);
      windowBuriedPassive = false;
      diagLog("[Window] Recovered from passive hide (focus — taskbar or Alt+Tab).");
    } catch (e) {
      diagLog(`[Window] recoverPassiveBurialOnly: ${e.message}`);
    }
  };

  const onRestore = () => {
    if (!window || window.isDestroyed()) return;
    /** Restaurar da bandeja/minimização com o renderer ainda throttled expõe a textura antiga. */
    try {
      if (typeof window.webContents?.setBackgroundThrottling === "function") {
        window.webContents.setBackgroundThrottling(false);
      }
    } catch (e) {
      /* ignore */
    }
    try {
      if (windowBuriedPassive) {
        window.setOpacity(1);
        applyMousePolicyAfterReveal(window);
        window.setSkipTaskbar(false);
        windowBuriedPassive = false;
        diagLog("[Window] Recovered from passive hide (restore).");
        return;
      }
      /**
       * Minimize→atalho radial: `updateWindowSize('fullscreen')` só encola em `pendingWindowSize`.
       * O handler seguinte faz flush em `setImmediate`; se enviarmos `window-native-display-restored` antes,
       * o renderer aplica `setWindowSize('windowed')` com modo nativo ainda obsoleto e o menu fica no rect do painel.
       */
      flushPendingWindowSizeIfNeeded();
      if (
        nativeWindowSizeMode !== "small" &&
        window.isVisible() &&
        !window.isMinimized()
      ) {
        window.setOpacity(1);
        window.setIgnoreMouseEvents(false);
        /** Apenas o painel windowed visível representa Settings na barra de tarefas. */
        window.setSkipTaskbar(
          nativeWindowSizeMode !== "windowed" || !rendererPanelVisible,
        );
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

  /** Sincroniza ilha/painel no renderer: minimizado ≠ painel “visível” (React mantém dashboard aberto). */
  const sendMainWindowMinimizedState = () => {
    if (window.isDestroyed() || !window.webContents || window.webContents.isDestroyed()) return;
    try {
      window.webContents.send("main-window-minimized", {
        minimized: window.isMinimized(),
      });
    } catch (e) {
      /* ignore */
    }
  };
  window.on("minimize", sendMainWindowMinimizedState);
  window.on("restore", () => {
    if (window.isDestroyed() || !window.webContents || window.webContents.isDestroyed()) return;
    const win = window;
    /** Deixa o renderer processar `open-dashboard` / IPC antes de aplicar o pending (bandeja → windowed). */
    setImmediate(() => {
      try {
        if (win.isDestroyed()) return;
        if (!win.isMinimized()) {
          flushPendingWindowSizeIfNeeded();
        }
      } catch (e) {
        /* ignore */
      }
      sendMainWindowMinimizedState();
    });
  });
}

let radialOpenPaintSequence = 0;

/* zenith-verify:radial-handshake-main — prepare → radial-prep-paint-done → open-menu → radial-open-paint-done → show; ver scripts/verify-radial-windowing.mjs */
function showMenuAtCursor(source = "shortcut") {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const radialOpenStartedAt = Date.now();

  /** Posição fixa significa fixa de verdade: nem a posição nem o monitor seguem o cursor. */
  const targetDisplay = screen.getPrimaryDisplay();
  let radialCenter = {
    x: Math.round(targetDisplay.bounds.x + targetDisplay.bounds.width / 2),
    y: Math.round(targetDisplay.bounds.y + targetDisplay.bounds.height / 2),
  };
  /**
   * Se o centro real do monitor cabe dentro do HWND do Settings, mantemos o HWND completamente
   * imóvel (sem flash DWM) e desenhamos a roda naquele ponto em coordenadas de cliente. Antes este
   * caminho substituía `radialCenter` pelo centro DO SETTINGS — (906,345) no vídeo — e parecia
   * seguir o cursor. Se o painel estiver noutro monitor/fora do centro, usa-se o caminho seguro de
   * hide+resize abaixo para honrar o centro do monitor principal.
   */
  let keepExistingPanelWindow = false;
  if (
    nativeWindowSizeMode === "windowed" &&
    rendererPanelVisible &&
    isMainWindowOnScreen()
  ) {
    try {
      const bounds = mainWindow.getBounds();
      const visualMargin = Math.min(150, Math.floor(Math.min(bounds.width, bounds.height) / 4));
      keepExistingPanelWindow =
        radialCenter.x >= bounds.x + visualMargin &&
        radialCenter.x <= bounds.x + bounds.width - visualMargin &&
        radialCenter.y >= bounds.y + visualMargin &&
        radialCenter.y <= bounds.y + bounds.height - visualMargin;
    } catch (e) {
      keepExistingPanelWindow = false;
    }
  }

  let wasMinimized = false;
  try {
    wasMinimized = mainWindow.isMinimized();
  } catch (e) {
    wasMinimized = false;
  }

  /**
   * Definir isto ANTES de qualquer resize, `open-menu` ou `show-window`. Se esperarmos pelo
   * `reveal`, o renderer pode pedir `show()` primeiro e o Windows cria por um instante um botão
   * do radial na barra de tarefas. Quando Settings permanece por baixo do radial, preservamos o
   * botão existente porque ele continua a representar o painel visível, não o modal radial.
   */
  if (!rendererPanelVisible) {
    clearSkipTaskbarHideTimer();
    try {
      mainWindow.setSkipTaskbar(true);
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * O estado lógico pode ficar um IPC atrás da geometria (Settings→radial→Settings→fechar).
   * Se o renderer já confirmou que não há painel, nenhuma flag de união pode sobreviver.
   */
  if (!rendererPanelVisible) {
    panelOverlayActive = false;
    panelOverlayKeptWindow = false;
  }

  /**
   * Qualquer transição geométrica → radial muda os bounds nativos. Se o HWND continuar visível,
   * o DWM estica por um frame a última textura do Settings (ou a textura que acabou de fechar),
   * causando o flash. Guardamos antes que o painel estava realmente visível e retiramos a
   * superfície do compositor antes do resize; o handshake volta a mostrá-la já pintada.
   */
  let nativeResizeRisk = false;
  if (!wasMinimized && !keepExistingPanelWindow) {
    try {
      const currentBounds = mainWindow.getBounds();
      const desiredBounds = radialModeBounds(targetDisplay.bounds, radialCenter);
      nativeResizeRisk =
        mainWindow.isVisible() && !boundsApproxEqual(currentBounds, desiredBounds);
    } catch (e) {
      nativeResizeRisk = true;
    }
  }
  if (nativeResizeRisk) {
    diagLog(
      `[RadialOpen] Native bounds differ from centered radial; hiding before resize (mode=${nativeWindowSizeMode}, panel=${rendererPanelVisible})`,
    );
    if (rendererPanelVisible && isMainWindowOnScreen()) {
      panelOverlayActive = true;
    }
    try {
      mainWindow.hide();
      windowBuriedPassive = true;
    } catch (e) {
      /* ignore */
    }
  }

  // Resize before IPC so the first renderer paint is already monitor-sized (send() is async; windowed→radial looked like "dashboard size").
  updateWindowSize("fullscreen", radialCenter);

  // Do NOT setOpacity(0) here — on Windows + transparent BrowserWindow it often leaves the compositor
  // without a fresh web frame (user sees through / "nothing", while hit-testing still works).

  /**
   * `hide-window` / `collapse-idle-overlay` / `reapply-small-overlay` deixam o renderer throttled.
   * Se abrirmos pelo caminho rápido sem o acordar, o `show()` chega antes do primeiro frame novo
   * e o DWM apresenta a textura anterior (ilha/dashboard) ou preto. Acordar em TODOS os caminhos.
   */
  try {
    if (typeof mainWindow.webContents?.setBackgroundThrottling === "function") {
      mainWindow.webContents.setBackgroundThrottling(false);
    }
  } catch (e) {
    /* ignore */
  }

  const sendOpenMenuAndReveal = (waitForRadialPaint = false) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    let radialClientPosition = null;
    let radialWindowOrigin = null;
    let radialClientSize = null;
    try {
      /**
       * Minimizada, `updateWindowSize` só enfileira fullscreen; `getBounds()` ainda devolve o
       * Settings na posição em que foi minimizado. Usar esse rect gerava (440,300) e prendia a
       * primeira roda ao antigo centro do painel. O rect radial é determinístico, portanto o
       * payload pode — e deve — antecipar a geometria que será aplicada no restore.
       */
      const bounds = wasMinimized
        ? radialModeBounds(targetDisplay.bounds, radialCenter)
        : mainWindow.getBounds();
      radialWindowOrigin = { x: bounds.x, y: bounds.y };
      radialClientPosition = {
        x: radialCenter.x - bounds.x,
        y: radialCenter.y - bounds.y,
      };
      radialClientSize = { width: bounds.width, height: bounds.height };
    } catch (e) {
      /* renderer falls back to screen coordinates */
    }

    const paintToken = waitForRadialPaint ? ++radialOpenPaintSequence : undefined;
    let revealStarted = false;
    let paintTimeout = null;
    let onRadialPaint = null;

    const reveal = () => {
      if (revealStarted) return;
      revealStarted = true;
      if (paintTimeout) clearTimeout(paintTimeout);
      if (onRadialPaint) ipcMain.removeListener("radial-open-paint-done", onRadialPaint);

      setImmediate(async () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;

        /**
         * Radial por cima do painel sem resize: a janela JÁ está visível, no sítio certo e na
         * barra de tarefas. Repetir `show`/`setSkipTaskbar`/`setVisibleOnAllWorkspaces` aqui só
         * força recomposição do HWND — e cada recomposição de uma janela layered é um risco de
         * flash. Neste caminho só é preciso pô-la à frente.
         */
        if (panelOverlayKeptWindow) {
          windowBuriedPassive = false;
          mainWindow.setIgnoreMouseEvents(false);
          mainWindow.focus();
          mainWindow.webContents.focus();
          if (process.platform === "win32") {
            mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
          }
          return;
        }

        /**
         * Fechar Settings dispara a recolha assíncrona para `small`. O atalho global pode chegar
         * enquanto esse IPC ainda está na fila: nesse caso ele sobrescrevia o primeiro resize do
         * radial e o HWND era revelado no rect antigo/canto do monitor. O reveal é a barreira final
         * da abertura; reaplicar fullscreen aqui garante que nenhum resize obsoleto do fechamento
         * seja o último comando geométrico antes de `show()`.
         */
        updateWindowSize("fullscreen", radialCenter);

        /** Defesa final: só um Settings ainda visível por baixo do radial conserva o botão. */
        mainWindow.setSkipTaskbar(!rendererPanelVisible);

        windowBuriedPassive = false;
        mainWindow.setIgnoreMouseEvents(false);
        mainWindow.setOpacity(1);
        if (!mainWindow.isVisible()) mainWindow.showInactive();
        if (typeof paintToken === "number") {
          /**
           * O renderer preparou o radial com alfa zero. Liberar o bloom somente depois de `show()`
           * garante que o primeiro frame entregue ao DWM seja transparente, nunca meia animação.
           */
          const releaseAnimationTimer = setTimeout(() => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            mainWindow.webContents.send("radial-native-revealed", paintToken);
          }, 16);
          releaseAnimationTimer.unref?.();
        }

        try {
          const revealBounds = mainWindow.getBounds();
          const revealClientCenter = {
            x: radialCenter.x - revealBounds.x,
            y: radialCenter.y - revealBounds.y,
          };
          diagLog(
            `[RadialOpen] reveal latency=${Date.now() - radialOpenStartedAt}ms bounds=${JSON.stringify(revealBounds)} centerScreen=${JSON.stringify(radialCenter)} centerClient=${JSON.stringify(revealClientCenter)}`,
          );
        } catch (e) {
          /* diagnostic only */
        }

        mainWindow.focus();
        mainWindow.webContents.focus();
        if (process.platform === "win32") {
          mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
        }

        /**
         * O handshake já esperou dois paints completos. Invalidar depois de `show()` fazia o DWM
         * reapresentar a textura vazia/antiga, percebida como clarão nas primeiras aberturas.
         */
      });
    };

    if (waitForRadialPaint) {
      onRadialPaint = (_event, acknowledgedToken) => {
        if (acknowledgedToken !== paintToken) return;
        reveal();
      };
      ipcMain.on("radial-open-paint-done", onRadialPaint);
      // Fallback only: normal path acknowledges after the next painted animation frame.
      paintTimeout = setTimeout(reveal, wasMinimized ? 240 : 120);
      paintTimeout.unref?.();
    }

    mainWindow.webContents.send("open-menu", {
      /** Centro real do monitor; nunca usar estas coordenadas como posição livre do cursor. */
      x: radialCenter.x,
      y: radialCenter.y,
      source: source,
      /** Main já chamou `updateWindowSize('fullscreen')` (exceto minimizado: bounds em fila). */
      preSizedByMain: !wasMinimized,
      /** O painel continua no ecrã por baixo do radial — o renderer não o pode fechar. */
      keepPanel: panelOverlayActive,
      /**
       * Rect de ecrã do painel, SEMPRE que ele fica por baixo do radial.
       *
       * Antes só era enviado quando a janela tinha sido alargada, partindo do princípio de que no
       * outro caminho ela ficava do tamanho do painel. Mas a janela do radial é uma caixa quadrada
       * (988×988 com os valores típicos) e o painel é 880×600: sem rect, ele é desenhado a
       * `inset-0` e cresce com a janela — as Definições ficavam maiores do que são.
       *
       * Mandá-lo sempre remove a ambiguidade: no caminho sem resize o rect coincide com os bounds
       * da janela, portanto posicionar dá exatamente o mesmo resultado que `inset-0`.
       */
      panelRect: panelOverlayActive ? { ...lastWindowedBounds } : null,
      /** Não depender de window.screenX/Y no primeiro tick após setBounds: ainda podem ser os do Settings. */
      clientPosition: radialClientPosition,
      windowOrigin: radialWindowOrigin,
      clientSize: radialClientSize,
      paintToken,
    });

    if (!waitForRadialPaint) reveal();
  };

  const wc = mainWindow.webContents;
  if (!wc || wc.isDestroyed()) {
    sendOpenMenuAndReveal();
    return;
  }

  let visibleOk = false;
  try {
    visibleOk = mainWindow.isVisible();
  } catch {
    visibleOk = false;
  }

  /**
   * Caminho rápido: janela já visível e não minimizada — handshake prepare-radial custa ~2 rAF + IPC
   * e parece “lag” ao abrir. O prep mantém-se só quando minimizado ou HWND oculto (bandeja / flash DWM).
   */
  if (!wasMinimized && visibleOk) {
    setImmediate(sendOpenMenuAndReveal);
    return;
  }

  /**
   * A janela ociosa fica oculta e throttled. Acordamos o renderer, mas mantemos o HWND escondido:
   * `showInactive()` aqui expunha exatamente a textura antiga de Settings que o handshake pretende
   * substituir. Com background throttling desligado, os rAF de preparação continuam a ser pintados.
   */
  try {
    if (typeof wc.setBackgroundThrottling === "function") {
      wc.setBackgroundThrottling(false);
    }
  } catch (e) {
    /* ignore */
  }

  /**
   * Repouso normal: o HWND está oculto, mas não minimizado. O próprio `open-menu` monta todas as
   * camadas em alfa zero e confirma o paint, logo o handshake neutro anterior era redundante e
   * somava até 72 ms antes de sequer montar a roda. Minimização mantém a preparação especial.
   */
  if (!wasMinimized) {
    sendOpenMenuAndReveal(true);
    return;
  }

  /**
   * Frame neutro antes de `open-menu` + `show` — sobretudo restore da minimização / HWND escondido.
   */
  const prepTimeoutMs = wasMinimized ? 200 : 72;
  const prepPromise = new Promise((resolve) => {
    const t = setTimeout(resolve, prepTimeoutMs);
    ipcMain.once("radial-prep-paint-done", () => {
      clearTimeout(t);
      resolve();
    });
    try {
      wc.send("prepare-radial-show");
    } catch (e) {
      clearTimeout(t);
      resolve();
    }
  });

  prepPromise.then(() => sendOpenMenuAndReveal(true));
}

/**
 * Em `small` não há absolutamente nada para desenhar — o HWND encolhe ao canto e é escondido.
 * Deixá-lo ao tamanho do monitor mantinha uma janela layered topmost que o DWM compõe em cada frame
 * e que recebe todo o hit-testing do rato: ~22% de `dwm|3d`, com cursor e arrasto lentos em todo o sistema.
 *
 * Existia aqui uma flag `overlayHudActive` para o caso de haver um HUD (faixa de Pomodoro/Cronómetro).
 * Além de os widgets já não existirem, a flag causava um artefacto: ao FECHAR o radial, o renderer
 * chamava `setWindowSize('small')` de forma síncrona, antes do commit React que a punha a false. O main
 * ainda a via `true`, expandia o HWND ao monitor inteiro (origem = borda ESQUERDA) com a janela visível,
 * e via-se o radial a saltar para a esquerda antes de desaparecer.
 */
/**
 * Radial aberto: caixa quadrada à volta do menu em vez do monitor inteiro — menos área layered para o DWM.
 * `size` vem do renderer (raio + ícone + rótulo + margem de gesto); o fallback cobre a config padrão.
 * A margem importa: o ângulo e o clique de seleção são lidos de eventos de rato da JANELA, por isso a caixa
 * tem de ser bem maior que o círculo, senão um gesto largo sai da janela e a seleção não confirma.
 */
let radialViewportSize = 988;
ipcMain.on("set-radial-viewport", (_event, payload) => {
  if (!payload || typeof payload !== "object") return;
  const n = Number(payload.size);
  if (Number.isFinite(n) && n >= 320 && n <= 4096) {
    radialViewportSize = Math.round(n);
  }
});

/**
 * Uma janela transparente do tamanho do monitor faz o Windows marcar vídeos/apps por baixo como
 * ocultos e reduzir a renderização. Este hook fica dormente fora do radial e, durante o modal,
 * consome apenas cliques/scroll fora da caixa visual da nossa BrowserWindow.
 */
let radialMouseBlocker = null;
let radialMouseBlockerReady = false;
let pendingRadialMouseBlockCommand = null;
/**
 * Quem recebe TRIGGER_DOWN/TRIGGER_UP. O botao de disparo passou a ser capturado pelo hook do
 * bloqueador em vez de sondado por GetAsyncKeyState: engolir o evento e continuar a deteta-lo
 * por sondagem e impossivel, porque um hook que devolve 1 esconde o botao do GetAsyncKeyState.
 */
let radialTriggerListener = null;

/** Folga de arrasto: abaixo disto a pressao foi um clique, nao uma mira. */
const TRIGGER_PASSTHROUGH_SLOP_PX = 6;

function radialMouseBlockerAssetPath() {
  const p = path.join(__dirname, "mouse-blocker.ps1");
  return isDev ? p : p.replace("app.asar", "app.asar.unpacked");
}

function writeRadialMouseBlocker(command) {
  pendingRadialMouseBlockCommand = command;
  if (!radialMouseBlocker || !radialMouseBlockerReady || !radialMouseBlocker.stdin?.writable) return;
  try {
    radialMouseBlocker.stdin.write(`${command}\n`);
    pendingRadialMouseBlockCommand = null;
  } catch (e) {
    diagLog(`[RadialBlocker] comando falhou: ${e.message}`);
  }
}

function ensureRadialMouseBlocker() {
  if (process.platform !== "win32" || radialMouseBlocker) return;
  radialMouseBlockerReady = false;
  const child = spawn(
    "powershell",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "RemoteSigned",
      "-File",
      radialMouseBlockerAssetPath(),
      String(process.pid),
    ],
    { windowsHide: true },
  );
  radialMouseBlocker = child;
  child.stdout.on("data", (data) => {
    const text = data.toString();
    if (radialTriggerListener && text.includes("TRIGGER_")) {
      try {
        radialTriggerListener(text);
      } catch (e) {
        diagLog(`[RadialBlocker] disparo: ${e.message}`);
      }
    }
    /** Linha isolada: "TRIGGER_READY" tambem contem READY e nao anuncia o arranque. */
    if (!/^READY\s*$/m.test(text)) return;
    radialMouseBlockerReady = true;
    if (pendingRadialMouseBlockCommand) {
      const command = pendingRadialMouseBlockCommand;
      pendingRadialMouseBlockCommand = null;
      writeRadialMouseBlocker(command);
    }
  });
  child.stderr.on("data", (data) => {
    diagLog(`[RadialBlocker] ${data.toString().trim()}`);
  });
  child.on("exit", () => {
    if (radialMouseBlocker === child) {
      radialMouseBlocker = null;
      radialMouseBlockerReady = false;
    }
  });
}

function setRadialMouseBlocking(bounds, monitorBounds) {
  if (process.platform !== "win32") return;
  ensureRadialMouseBlocker();
  writeRadialMouseBlocker(
    `BLOCK ${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height} ${monitorBounds.x} ${monitorBounds.y} ${monitorBounds.width} ${monitorBounds.height}`,
  );
}

/**
 * Passa a captura do botao de disparo para o hook. `slop` decide o que ainda conta como clique
 * simples e e devolvido a janela por baixo; acima disso o gesto foi uma mira e nao se devolve nada.
 */
function setRadialTriggerCapture(virtualKey, mode, slop) {
  if (process.platform !== "win32") return;
  ensureRadialMouseBlocker();
  writeRadialMouseBlocker(`TRIGGER ${virtualKey} ${mode} ${slop}`);
}

function clearRadialTriggerCapture() {
  if (process.platform !== "win32") return;
  if (!radialMouseBlocker) return;
  writeRadialMouseBlocker("TRIGGER OFF");
}

function clearRadialMouseBlocking() {
  pendingRadialMouseBlockCommand = null;
  if (!radialMouseBlocker || !radialMouseBlockerReady) return;
  writeRadialMouseBlocker("UNBLOCK");
}

function stopRadialMouseBlocker() {
  pendingRadialMouseBlockCommand = null;
  if (!radialMouseBlocker) return;
  const child = radialMouseBlocker;
  radialMouseBlocker = null;
  radialMouseBlockerReady = false;
  try {
    if (child.stdin?.writable) child.stdin.write("EXIT\n");
  } catch (e) {
    /* ignore */
  }
  setTimeout(() => {
    try { if (!child.killed) child.kill(); } catch (e) { /* ignore */ }
  }, 250);
}

/**
 * Radial aberto POR CIMA do painel (Settings/Welcome): a janela é uma só, por isso encolher ao
 * quadrado do radial fazia o painel desaparecer — era o "pisca e fica só o radial".
 * Aqui a caixa do radial passa a englobar também o rect do painel, e o renderer desenha-o na
 * mesma posição de ecrã que tinha. O modo `windowed` continua a guardar esse rect em
 * `lastWindowedBounds`, portanto fechar o radial devolve a janela ao sítio exato.
 */
let panelOverlayActive = false;
/** Verdadeiro quando o radial abriu por cima do painel SEM tocar nos bounds (ver `keepPanelWindow`). */
let panelOverlayKeptWindow = false;
/**
 * Painel à vista, segundo o renderer. `nativeWindowSizeMode === 'windowed'` NÃO serve para isto:
 * `hide-window` esconde a janela sem mudar de modo, e o radial seguinte concluía que havia painel
 * no ecrã — abria sem redimensionar e trazia as definições atrás.
 */
let rendererPanelVisible = false;
ipcMain.on("set-panel-surface-visible", (event, visible) => {
  rendererPanelVisible = !!visible;
  /** O renderer usa sendSync: fechar Settings e acionar o radial no mesmo instante não pode ler estado antigo. */
  event.returnValue = true;
});

function isMainWindowOnScreen() {
  try {
    return (
      !!mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      !mainWindow.isMinimized()
    );
  } catch (e) {
    return false;
  }
}

function radialBoundsUnionWithPanel(radialRect, displayBounds) {
  if (!panelOverlayActive) return radialRect;
  const panel = lastWindowedBounds;
  if (!panel || !Number.isFinite(panel.width) || panel.width <= 0) return radialRect;

  const union = unionScreenRects([radialRect, panel]);
  if (!union) return radialRect;

  /** Limitado ao monitor: um painel arrastado para fora não pode esticar a janela para lá dele. */
  const width = Math.min(union.width, displayBounds.width);
  const height = Math.min(union.height, displayBounds.height);
  return {
    x: Math.round(
      Math.max(displayBounds.x, Math.min(union.x, displayBounds.x + displayBounds.width - width)),
    ),
    y: Math.round(
      Math.max(displayBounds.y, Math.min(union.y, displayBounds.y + displayBounds.height - height)),
    ),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** Caixa do radial sempre centrada no monitor apontado. A posição livre foi descontinuada. */
function radialModeBounds(displayBounds, point) {
  const side = Math.min(
    radialViewportSize,
    displayBounds.width,
    displayBounds.height,
  );
  const center = {
    x: displayBounds.x + displayBounds.width / 2,
    y: displayBounds.y + displayBounds.height / 2,
  };
  const half = side / 2;
  const maxX = displayBounds.x + displayBounds.width - side;
  const maxY = displayBounds.y + displayBounds.height - side;
  return {
    x: Math.round(Math.max(displayBounds.x, Math.min(center.x - half, maxX))),
    y: Math.round(Math.max(displayBounds.y, Math.min(center.y - half, maxY))),
    width: Math.round(side),
    height: Math.round(side),
  };
}

/**
 * Repouso estável: a superfície transparente usa exatamente os bounds do radial.
 * Assim abrir não exige hide/show nem resize; como o mouse é ignorado, a área não bloqueia o desktop.
 */
function smallModeBounds(displayBounds) {
  return radialModeBounds(displayBounds, {
    x: displayBounds.x + displayBounds.width / 2,
    y: displayBounds.y + displayBounds.height / 2,
  });
}

function applySmallModeCollapsedBounds(anchorScreenPoint) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  /** O radial é fixo no monitor principal; repouso nunca segue o cursor. */
  const targetDisplay = screen.getPrimaryDisplay();
  const nextBounds = smallModeBounds(targetDisplay.bounds);
  if (!boundsApproxEqual(mainWindow.getBounds(), nextBounds)) {
    mainWindow.setBounds(nextBounds);
  }
}

function unionScreenRects(rects) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    if (!r || typeof r.x !== "number") continue;
    const x1 = r.x;
    const y1 = r.y;
    const x2 = r.x + r.width;
    const y2 = r.y + r.height;
    minX = Math.min(minX, x1);
    minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2);
    maxY = Math.max(maxY, y2);
  }
  if (!Number.isFinite(minX)) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function clampBoundsToWorkArea(bounds, workArea) {
  let { x, y, width, height } = bounds;
  const minW = 48;
  const minH = 28;
  width = Math.max(minW, Math.round(width));
  height = Math.max(minH, Math.round(height));
  if (width > workArea.width) width = workArea.width;
  if (height > workArea.height) height = workArea.height;
  x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width));
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height));
  return { x: Math.round(x), y: Math.round(y), width, height };
}

function boundsApproxEqual(a, b, eps = 2) {
  return (
    Math.abs(a.x - b.x) <= eps &&
    Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.width - b.width) <= eps &&
    Math.abs(a.height - b.height) <= eps
  );
}

/**
 * @param {string} mode
 * @param {{ x: number, y: number } | undefined} anchorScreenPoint — screen coordinates (e.g. cursor). Picks the monitor with getDisplayNearestPoint so multi-monitor matches the radial overlay.
 */
function updateWindowSize(mode, anchorScreenPoint) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  /** Enquanto minimizado não aplicamos `setBounds`; fila e aplicamos no `restore` (flush). */
  try {
    if (mainWindow.isMinimized()) {
      pendingWindowSize = { mode, anchorScreenPoint };
      /** Minimizada não há painel à vista — não deixar a flag anterior decidir o próximo radial. */
      panelOverlayActive = false;
      panelOverlayKeptWindow = false;
      return;
    }
  } catch (e) {
    return;
  }

  pendingWindowSize = null;

  const previousMode = nativeWindowSizeMode;
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
    lastWindowHitShapeKey = "__empty__";
    if (!rendererPanelVisible) {
      panelOverlayActive = false;
      panelOverlayKeptWindow = false;
    }
    /**
     * Vir de `windowed` significa que há painel no ecrã: ele fica visível por baixo do radial,
     * logo a janela tem de continuar a cobri-lo. A flag é o estado, não `previousMode` — reabrir
     * o radial já em fullscreen não pode perder o painel.
     */
    const keepPanelWindow =
      previousMode === "windowed" &&
      rendererPanelVisible &&
      isMainWindowOnScreen();
    if (keepPanelWindow) {
      panelOverlayActive = true;
    }
    /**
     * Mantemos a superfície visual compacta para o DWM não congelar vídeos/apps por baixo. O hook
     * temporário bloqueia os cliques no restante monitor sem criar uma janela que os cubra.
     */
    /** Settings visível usa o HWND estável; fora dele a caixa radial continua centrada no monitor. */
    panelOverlayKeptWindow = keepPanelWindow;
    if (keepPanelWindow) {
      /**
       * Não tocar nos bounds: Settings e radial partilham o frame já composto. Ao fechar,
       * `windowed` encontra os mesmos bounds e também não recompõe a janela.
       */
      const stableBounds = mainWindow.getBounds();
      setRadialMouseBlocking(stableBounds, b);
    } else {
      const radialRect = radialBoundsUnionWithPanel(radialModeBounds(b, point), b);
      if (!boundsApproxEqual(mainWindow.getBounds(), radialRect)) {
        mainWindow.setBounds(radialRect);
      }
      setRadialMouseBlocking(radialRect, b);
    }
    mainWindow.setResizable(true);
    mainWindow.setBackgroundColor("#00000000"); // FORCE TRANSPARENCY
    mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    mainWindow.setIgnoreMouseEvents(false);
    /**
     * Não usar centenas de rects em `setShape` para imitar o círculo: o DWM recalcula essas regiões
     * durante o movimento e pode atrasar o cursor global. O círculo visual já é desenhado em CSS.
     */
    try {
      if (typeof mainWindow.setShape === "function") mainWindow.setShape([]);
    } catch (e) {
      /* ignore */
    }
  } else if (mode === "windowed") {
    clearRadialMouseBlocking();
    panelOverlayActive = false;
    panelOverlayKeptWindow = false;
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
    /** Ilha tinha o HWND encolhido — repor estado do hit-shape para o próximo modo não herdar rect fantasma. */
    lastWindowHitShapeKey = "__empty__";
    mainWindow.setResizable(true);
    resetLastWindowedBoundsIfIslandCorrupted();
    /**
     * Se a janela já está exatamente nestes bounds (caso do radial aberto por cima do painel sem
     * resize), voltar a aplicá-los é uma recomposição inútil do HWND — e cada uma é um risco de
     * flash na janela transparente. Fechar o radial passa a não tocar na geometria.
     */
    let boundsAlreadyCorrect = false;
    try {
      boundsAlreadyCorrect = boundsApproxEqual(mainWindow.getBounds(), lastWindowedBounds);
    } catch (e) {
      boundsAlreadyCorrect = false;
    }
    if (!boundsAlreadyCorrect) {
      isUpdatingBounds = true;
      mainWindow.setBounds(lastWindowedBounds);
      isUpdatingBounds = false;
    }
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
    /** Ilha em `small` → rect windowed: o DWM reutiliza a textura e o relógio parece “deslizar” até ao painel. */
    if (previousMode === "small") {
      try {
        setImmediate(() => {
          try {
            if (
              mainWindow &&
              !mainWindow.isDestroyed() &&
              mainWindow.webContents &&
              typeof mainWindow.webContents.invalidate === "function"
            ) {
              mainWindow.webContents.invalidate();
            }
          } catch (e) {
            /* ignore */
          }
        });
      } catch (e) {
        /* ignore */
      }
    }
  } else if (mode === "small") {
    clearRadialMouseBlocking();
    panelOverlayActive = false;
    panelOverlayKeptWindow = false;
    lastWindowHitShapeKey = "__empty__";
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
    try {
      mainWindow.setIgnoreMouseEvents(true);
      mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch (e) {
      /* ignore */
    }
    applySmallModeCollapsedBounds(point);
    mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    mainWindow.setResizable(true);
    try {
      if (!mainWindow.isVisible()) mainWindow.showInactive();
      mainWindow.webContents.setBackgroundThrottling(true);
    } catch (e) {
      /* ignore */
    }
    try {
      if (typeof mainWindow.setShape === "function") {
        mainWindow.setShape([]);
      }
    } catch (e) {
      /* ignore */
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
}

/** Lazy — native binding may fail on some installs; fail-open (allow radial). */
function getActiveWinModule() {
  try {
    return require("active-win");
  } catch (e) {
    diagLog(`[GameMode] active-win require failed: ${e.message}`);
    return null;
  }
}

/**
 * Rect da janela cobre o monitor inteiro (fullscreen real), não maximizado típico (workArea).
 */
function isBoundsFullscreenMonitor(bounds, ownerExePathLower) {
  if (!bounds || typeof bounds.width !== "number") return false;
  try {
    const myExe = path.resolve(app.getPath("exe")).toLowerCase();
    const op = (ownerExePathLower || "").trim();
    if (op) {
      const resolved = path.resolve(op).toLowerCase();
      if (myExe && resolved === myExe) return false;
    }
  } catch (_) {
    /* ignore */
  }

  const shellBase = path.basename(ownerExePathLower || "").toLowerCase();
  if (shellBase === "explorer.exe") return false;

  const { x, y, width, height } = bounds;
  if (width < 320 || height < 240) return false;

  const cx = Math.round(x + width / 2);
  const cy = Math.round(y + height / 2);
  let display;
  try {
    display = screen.getDisplayNearestPoint({ x: cx, y: cy });
  } catch (_) {
    return false;
  }

  const db = display.bounds;
  const wa = display.workArea;
  const slack = 10;

  const matchesWorkArea =
    Math.abs(x - wa.x) <= slack &&
    Math.abs(y - wa.y) <= slack &&
    Math.abs(width - wa.width) <= slack &&
    Math.abs(height - wa.height) <= slack;
  if (matchesWorkArea) return false;

  const coversFullDisplay =
    x <= db.x + slack &&
    y <= db.y + slack &&
    x + width >= db.x + db.width - slack &&
    y + height >= db.y + db.height - slack;

  return coversFullDisplay;
}

function isForegroundWindowFullscreen(win) {
  if (!win || !win.bounds) return false;
  const op = (win.owner && win.owner.path) || "";
  return isBoundsFullscreenMonitor(win.bounds, op);
}

/**
 * Lista plana de especificações de correspondência.
 * Cada segmento CSV pode ser: `token` ou `alt1|alt2::rótulo` (rótulo só para UI; alts são OR).
 */
function parseBlockedAppTokens(csv) {
  const out = [];
  const segments = String(csv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const segment of segments) {
    const lower = segment.toLowerCase();
    const matchPart = lower.includes("::")
      ? lower.split("::")[0].trim()
      : lower;
    for (const alt of matchPart.split("|")) {
      const a = alt.trim();
      if (a) out.push(a);
    }
  }
  return out;
}

/** Mínimo de caracteres no "stem" para bater no título/cmd (evita ruído). */
const GAME_MODE_TITLE_STEM_MIN = 5;

/** Palavra isolada (evita "zen" em "frozen"). */
function hayContainsTokenWord(hay, word) {
  if (!word || word.length < 3) return false;
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(hay);
}

/** Segmentos úteis a partir de tokens antigos tipo "openai.chatgpt - desktop_xxx" ou caminhos WindowsApps. */
function expandGameModeTokenFragments(tok) {
  const t = String(tok).toLowerCase().trim();
  const out = new Set();
  if (!t) return [];
  out.add(t);
  const noExe = t.replace(/\.exe$/i, "");
  out.add(noExe);
  const head = noExe.split(/\s+/)[0];
  for (const part of head.split(/[^a-z0-9]+/i)) {
    if (part.length >= 4) out.add(part);
  }
  const dotParts = head.split(".").filter((p) => /^[a-z0-9]+$/i.test(p));
  if (dotParts.length) {
    out.add(dotParts[dotParts.length - 1]);
  }
  return [...out];
}

/**
 * App em primeiro plano corresponde à lista — exe, título, CommandLine e fragmentos do token (Store/PWA).
 */
function tokensMatchForeground(exePathLower, titleLower, cmdlineLower, tokens) {
  if (!tokens.length) return false;
  const normExe = String(exePathLower || "")
    .replace(/\//g, "\\")
    .toLowerCase();
  const title = String(titleLower || "").toLowerCase();
  const cmd = String(cmdlineLower || "").toLowerCase();
  const hay = `${title}\n${cmd}\n${normExe}`;
  for (const tok of tokens) {
    const frags = expandGameModeTokenFragments(tok);
    for (const frag of frags) {
      const withExe = frag.endsWith(".exe") ? frag : `${frag}.exe`;
      const stem = frag.replace(/\.exe$/i, "");
      if (normExe) {
        const base = path.basename(normExe).toLowerCase();
        if (base === withExe || base === frag || base === `${stem}.exe`) return true;
        if (normExe.endsWith("\\" + withExe)) return true;
        if (normExe.includes("\\" + withExe + "\\")) return true;
        if (stem.length >= 4 && normExe.includes(stem)) return true;
      }
      if (stem === "chatgpt") {
        if (
          hay.includes("chatgpt") ||
          hay.includes("openai.com") ||
          hay.includes("chat.openai")
        ) {
          return true;
        }
      }
      if (stem.length >= GAME_MODE_TITLE_STEM_MIN && hay.includes(stem)) return true;
      if (
        stem.length >= 3 &&
        stem.length < GAME_MODE_TITLE_STEM_MIN &&
        /^[a-z]+$/.test(stem) &&
        hayContainsTokenWord(hay, stem)
      ) {
        return true;
      }
    }
  }
  return false;
}

function parseForegroundPsOutput(stdout) {
  let raw = String(stdout || "").replace(/^\uFEFF/, "").trimEnd();
  if (!raw) return { exe: null, title: "", cmdline: "", bounds: null };
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const exe = (lines[0] || "").toLowerCase() || null;
  const title = (lines[1] || "").toLowerCase();
  const cmdline = (lines[2] || "").toLowerCase();
  let bounds = null;
  if (lines[3]) {
    const parts = lines[3].split(",").map((x) => parseInt(x.trim(), 10));
    if (
      parts.length >= 4 &&
      parts.every((n) => typeof n === "number" && !Number.isNaN(n))
    ) {
      bounds = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  return { exe, title, cmdline, bounds };
}

function getWindowsPowerShellExe() {
  const root = process.env.SystemRoot || process.env.windir;
  if (root) {
    const full = path.join(
      root,
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    try {
      if (fs.existsSync(full)) return full;
    } catch (_) {}
  }
  return "powershell.exe";
}

function getForegroundContextWindows() {
  return new Promise((resolve) => {
    const scriptPath = getAssetPath("get-foreground-exe.ps1");
    try {
      if (!fs.existsSync(scriptPath)) {
        diagLog(`[GameMode] missing script ${scriptPath}`);
        return resolve({ exe: null, title: "", cmdline: "", bounds: null });
      }
    } catch (e) {
      diagLog(`[GameMode] stat script: ${e.message}`);
      return resolve({ exe: null, title: "", cmdline: "", bounds: null });
    }

    const ps = getWindowsPowerShellExe();
    execFile(
      ps,
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "RemoteSigned",
        "-File",
        scriptPath,
      ],
      { encoding: "utf8", timeout: 8000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          diagLog(
            `[GameMode] get-foreground-exe.ps1 err=${err.message} stderr=${String(stderr || "").slice(0, 200)}`,
          );
          return resolve({ exe: null, title: "", cmdline: "", bounds: null });
        }
        resolve(parseForegroundPsOutput(stdout));
      },
    );
  });
}

function isZenithOwnExePath(exeLower) {
  if (!exeLower) return false;
  try {
    const my = path.resolve(app.getPath("exe")).toLowerCase();
    return path.resolve(exeLower).toLowerCase() === my;
  } catch (_) {
    return false;
  }
}

/** active-win: exe + título (sem command line nativo). */
function foregroundMatchesBlockedList(win, tokens) {
  if (!win || !tokens.length) return false;
  const ownerPath = ((win.owner && win.owner.path) || "")
    .toLowerCase()
    .replace(/\//g, "\\");
  const wtitle = ((win.title && String(win.title)) || "").toLowerCase();
  return tokensMatchForeground(ownerPath, wtitle, "", tokens);
}

const autoDetectedGameCache = new Map();
const AUTO_GAME_CACHE_LIMIT = 256;

function foregroundLooksLikeGame(exePath, cmdline = "") {
  const exe = String(exePath || "").trim();
  if (!exe) return false;
  const commandSignal = /steam_appid|-epicapp=|-epicportal|-fromfl=eac/i.test(String(cmdline || ""));
  const cacheKey = exe.toLowerCase();
  if (!commandSignal && autoDetectedGameCache.has(cacheKey)) {
    return autoDetectedGameCache.get(cacheKey);
  }
  const result = detectGameExecutable({ exePath: exe, cmdline });
  if (!commandSignal) {
    autoDetectedGameCache.delete(cacheKey);
    autoDetectedGameCache.set(cacheKey, result);
    while (autoDetectedGameCache.size > AUTO_GAME_CACHE_LIMIT) {
      const oldest = autoDetectedGameCache.keys().next().value;
      if (!oldest) break;
      autoDetectedGameCache.delete(oldest);
    }
  }
  return result;
}

// Main function to decide if we should open (atalho global + botão do meio)
const shouldOpenMenu = async () => {
  const decisionStartedAt = Date.now();
  if (!gameModeConfig.enabled) return true;

  const mode = gameModeConfig.mode === "all" ? "all" : "list";
  const tokens = parseBlockedAppTokens(gameModeConfig.blockedApps);
  const autoDetectGames = mode === "list" && !!gameModeConfig.autoDetectGames;

  let activeResult = null;
  const aw = getActiveWinModule();
  if (aw) {
    try {
      activeResult = await aw();
    } catch (e) {
      diagLog(`[GameMode] active-win() failed: ${e.message}`);
    }
  }

  if (mode === "all") {
    if (activeResult && isForegroundWindowFullscreen(activeResult)) {
      diagLog("[GameMode] Blocked: foreground fullscreen (mode=all)");
      return false;
    }
    /**
     * Caminho rápido para produtividade diária: `active-win` cobre o caso normal de fullscreen.
     * O fallback PowerShell era usado em toda abertura e pode custar 1-2s no Windows.
     */
    if (activeResult) return true;
  }

  /**
   * `active-win` já entrega executável, título e limites da janela ativa. No modo
   * de lista isso é tudo de que precisamos para decidir o caso normal. Antes,
   * mesmo com esses dados válidos, cada acionamento ainda iniciava um novo
   * PowerShell; essa criação de processo acontecia antes de `showMenuAtCursor`
   * e era percebida como atraso do radial.
   */
  if (mode === "list" && activeResult) {
    const listed = foregroundMatchesBlockedList(activeResult, tokens);
    const fullscreen = isForegroundWindowFullscreen(activeResult);
    const activeOwnerPath = activeResult?.owner?.path || "";
    const autoGame =
      autoDetectGames &&
      !!activeOwnerPath &&
      !isZenithOwnExePath(activeOwnerPath) &&
      foregroundLooksLikeGame(activeOwnerPath);

    if (fullscreen && (listed || autoGame)) {
      diagLog(
        `[GameMode] Blocked: protected fullscreen app (native, decision=${Date.now() - decisionStartedAt}ms)`,
      );
      return false;
    }

    const decisionMs = Date.now() - decisionStartedAt;
    if (decisionMs >= 20) {
      diagLog(`[GameMode] Native decision latency=${decisionMs}ms`);
    }
    return true;
  }

  let fgCtx = { exe: null, title: "", cmdline: "", bounds: null };
  if (process.platform === "win32") {
    fgCtx = await getForegroundContextWindows();
  }

  if (mode === "all") {
    if (
      process.platform === "win32" &&
      fgCtx.bounds &&
      fgCtx.exe &&
      !isZenithOwnExePath(fgCtx.exe) &&
      isBoundsFullscreenMonitor(fgCtx.bounds, fgCtx.exe)
    ) {
      diagLog("[GameMode] Blocked: foreground fullscreen (mode=all, PS)");
      return false;
    }
    return true;
  }

  // mode === "list": apps escolhidos e, opcionalmente, jogos detectados automaticamente.
  if (tokens.length === 0 && !autoDetectGames) return true;

  const listedPs =
    process.platform === "win32" &&
    fgCtx.exe &&
    !isZenithOwnExePath(fgCtx.exe) &&
    tokensMatchForeground(fgCtx.exe, fgCtx.title, fgCtx.cmdline, tokens);
  const fullscreenPs =
    !!fgCtx.bounds &&
    !!fgCtx.exe &&
    isBoundsFullscreenMonitor(fgCtx.bounds, fgCtx.exe);

  const listedAw = !!(activeResult && foregroundMatchesBlockedList(activeResult, tokens));
  const fullscreenAw = !!(activeResult && isForegroundWindowFullscreen(activeResult));

  const autoGamePs =
    autoDetectGames &&
    !!fgCtx.exe &&
    !isZenithOwnExePath(fgCtx.exe) &&
    foregroundLooksLikeGame(fgCtx.exe, fgCtx.cmdline);
  const activeOwnerPath = (activeResult?.owner?.path || "").toLowerCase();
  const autoGameAw =
    autoDetectGames &&
    !!activeOwnerPath &&
    !isZenithOwnExePath(activeOwnerPath) &&
    foregroundLooksLikeGame(activeOwnerPath);

  if (
    (listedPs && fullscreenPs) ||
    (listedAw && fullscreenAw) ||
    (autoGamePs && fullscreenPs) ||
    (autoGameAw && fullscreenAw)
  ) {
    diagLog(
      `[GameMode] Blocked: protected fullscreen app (listPs=${!!(listedPs && fullscreenPs)} listAw=${!!(listedAw && fullscreenAw)} autoPs=${!!(autoGamePs && fullscreenPs)} autoAw=${!!(autoGameAw && fullscreenAw)})`,
    );
    return false;
  }

  return true;
};

let tray = null;

/**
 * Checks GitHub Releases for a newer NSIS build.  This is deliberately disabled
 * in development: `latest.yml` only exists beside a published installer.
 */
/**
 * O renderer precisa de saber que há atualização para a assinalar na roda — um selo no hub, que
 * o utilizador vê quando abre o menu, sem ninguém lhe interromper o que está a fazer.
 */
/** Última versão anunciada pelo updater — o painel pede-a ao abrir, para não depender do evento. */
let lastKnownUpdate = { state: "idle", version: null };

function notifyRendererUpdateState(state, version) {
  lastKnownUpdate = { state, version: version ?? null };
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send("update-state", { state, version });
  } catch (e) {
    /* ignore */
  }
}

function configureAutoUpdates() {
  if (!app.isPackaged || process.platform !== "win32") return;

  /**
   * Build da Store: nem sequer registamos os listeners. Não basta não chamar `checkForUpdates` —
   * o `autoInstallOnAppQuit` deixaria o instalador a correr à saída, que é exatamente o
   * comportamento que a certificação procura.
   */
  if (isStoreBuild()) {
    diagLog("[Update] Build da Store — updater desativado");
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", (error) => {
    diagLog(`[Update] ${error?.message || error}`);
  });

  autoUpdater.on("update-available", (info) => {
    diagLog(`[Update] Downloading version ${info.version}`);
    notifyRendererUpdateState("downloading", info.version);
  });

  /**
   * Sem caixa nativa.
   *
   * O diálogo do sistema aparecia por cima do que o utilizador estivesse a fazer, com o visual do
   * Windows e um texto noutra língua do resto da app — e para uma coisa que não é urgente: a
   * atualização JÁ está descarregada e instala-se sozinha ao sair. O aviso passou para onde não
   * interrompe: o selo no hub do radial, e uma linha nas Definições com a ação.
   */
  autoUpdater.on("update-downloaded", (info) => {
    diagLog(`[Update] Downloaded version ${info.version}`);
    notifyRendererUpdateState("ready", info.version);
  });

  // Let the UI finish starting before the network request begins.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((error) => {
      diagLog(`[Update] Check failed: ${error?.message || error}`);
    });
  }, 10_000).unref?.();
}

app.whenReady().then(async () => {
  /** Compila/inicializa o helper em repouso; ao abrir o radial o bloqueio entra sem atraso. */
  ensureRadialMouseBlocker();
  if (!gotTheLock) return;

  configureAutoUpdates();

  /**
   * Carrega e executa `active-win` durante a inicialização. A primeira carga do
   * binding nativo não deve acontecer justamente no primeiro acionamento do radial.
   */
  const activeWinWarmup = getActiveWinModule();
  if (activeWinWarmup) {
    Promise.resolve(activeWinWarmup()).catch((e) => {
      diagLog(`[Perf] active-win warmup failed: ${e.message}`);
    });
  }

  try {
    const codeCacheDir = path.join(app.getPath("userData"), "v8-code-cache");
    fs.mkdirSync(codeCacheDir, { recursive: true });
    session.defaultSession.setCodeCachePath(codeCacheDir);
    diagLog(`[Perf] V8 code cache: ${codeCacheDir}`);
  } catch (e) {
    diagLog(`[Perf] V8 code cache setup failed: ${e.message}`);
  }

  try {
    diagLog(`[Persist] userData=${app.getPath("userData")}`);
  } catch (e) {
    diagLog(`[Persist] userData path unavailable: ${e.message}`);
  }


  // 1. Initialize Settings Management First (to avoid race conditions with renderer)
  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  let currentSettings = {
    globalShortcut: "Alt+Z",
    enableMouseTrigger: true,
    mouseTriggerMode: "click",
    mouseTriggerButton: "middle",
    openAtLogin: false,
  };

  const syncLoginItemSettings = (openAtLogin) => {
    try {
      if (typeof openAtLogin === "boolean") {
        const currentLoginSettings = app.getLoginItemSettings();
        if (currentLoginSettings.openAtLogin !== openAtLogin) {
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

  /** Merge UI fields used by registerGlobalShortcut; workspaces stay in memory only (not written to settings.json). */
  const applyUiConfigToCurrentSettings = (ui) => {
    if (!ui || typeof ui !== "object") return;
    if (typeof ui.globalShortcut === "string" && ui.globalShortcut.trim()) {
      currentSettings.globalShortcut = ui.globalShortcut.trim();
    }
    if (typeof ui.enableMouseTrigger === "boolean") {
      currentSettings.enableMouseTrigger = ui.enableMouseTrigger;
    }
    if (ui.mouseTriggerMode === "click" || ui.mouseTriggerMode === "hold") {
      currentSettings.mouseTriggerMode = ui.mouseTriggerMode;
    }
    if (MOUSE_TRIGGER_BUTTONS.includes(ui.mouseTriggerButton)) {
      currentSettings.mouseTriggerButton = ui.mouseTriggerButton;
    }
    if (typeof ui.openAtLogin === "boolean") {
      currentSettings.openAtLogin = ui.openAtLogin;
    }
    if (Array.isArray(ui.workspaces)) {
      currentSettings.workspaces = ui.workspaces;
    }
  };

  const saveSettings = (newSettings) => {
    try {
      currentSettings = { ...currentSettings, ...newSettings };
      const slim = {
        globalShortcut: currentSettings.globalShortcut || "Alt+Z",
        enableMouseTrigger: currentSettings.enableMouseTrigger !== false,
        mouseTriggerMode:
          currentSettings.mouseTriggerMode === "hold" ? "hold" : "click",
        mouseTriggerButton: MOUSE_TRIGGER_BUTTONS.includes(currentSettings.mouseTriggerButton)
          ? currentSettings.mouseTriggerButton
          : "middle",
        openAtLogin: !!currentSettings.openAtLogin,
      };
      fs.writeFileSync(settingsPath, JSON.stringify(slim, null, 2));
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  };

  loadSettings();
  loadIconCache();
  if (currentSettings.openAtLogin !== undefined) {
    syncLoginItemSettings(currentSettings.openAtLogin);
  }

  /** Used with the non-blocking middle-button state monitor. */
  const cachedRadialFlags = {
    enableMouseTrigger: currentSettings.enableMouseTrigger !== false,
    mouseTriggerMode:
      currentSettings.mouseTriggerMode === "hold" ? "hold" : "click",
    mouseTriggerButton: MOUSE_TRIGGER_BUTTONS.includes(currentSettings.mouseTriggerButton)
      ? currentSettings.mouseTriggerButton
      : "middle",
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
      if (fc.mouseTriggerMode === "click" || fc.mouseTriggerMode === "hold") {
        cachedRadialFlags.mouseTriggerMode = fc.mouseTriggerMode;
      }
      if (MOUSE_TRIGGER_BUTTONS.includes(fc.mouseTriggerButton)) {
        cachedRadialFlags.mouseTriggerButton = fc.mouseTriggerButton;
      }
      const ui = extractUiConfigFromPersistenceBlob(fc);
      if (ui) {
        // Authoritative UI state lives in config-v2.json — win over stale settings.json (fixes shortcut/sync races).
        applyUiConfigToCurrentSettings(ui);
        if (typeof ui.performanceMode === "boolean") {
          cachedRadialFlags.performanceMode = ui.performanceMode;
        }
        if (typeof ui.enableMouseTrigger === "boolean") {
          cachedRadialFlags.enableMouseTrigger = ui.enableMouseTrigger;
        }
        if (ui.mouseTriggerMode === "click" || ui.mouseTriggerMode === "hold") {
          cachedRadialFlags.mouseTriggerMode = ui.mouseTriggerMode;
        }
        mergeGameModeConfig(ui.gameMode);
      }
    }
  } catch (_) {}

  let syncMouseHookState = () => {};

  /** Assigned after registerGlobalShortcut(); refreshes OS shortcuts when renderer saves config-v2. */
  let refreshShortcutsFromFullConfig = null;

  // Register essential IPC handlers BEFORE window creation
  ipcMain.handle("get-settings", () => currentSettings);

  /** Flush temp / final file to disk — reduces loss on crash/reboot right after save (Windows). */
  const fsyncFileBestEffort = (filePath) => {
    try {
      if (!fs.existsSync(filePath)) return;
      const fd = fs.openSync(filePath, "r+");
      try {
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } catch (e) {
      diagLog(`[Persist] fsync ${path.basename(filePath)}: ${e.message}`);
    }
  };

  /** @returns {boolean} */
  const saveFullConfigToDisk = (config) => {
    const configPath = path.join(app.getPath("userData"), "config-v2.json");
    const tempPath = configPath + ".tmp";
    let toWrite = config;
    try {
      if (!fs.existsSync(path.dirname(configPath))) {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
      }

      if (process.platform === "win32" && config && typeof config === "object") {
        try {
          toWrite = JSON.parse(JSON.stringify(config));
          win32Launch.normalizePersistedPayloadWin32(toWrite);
        } catch (e) {
          diagLog(`[Persist] win32 command normalize (clone) failed: ${e.message}`);
        }
      }

      const json = JSON.stringify(toWrite, null, 2);
      fs.writeFileSync(tempPath, json, "utf-8");
      fsyncFileBestEffort(tempPath);

      if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
        try {
          if (fs.existsSync(configPath) && fs.statSync(configPath).size > 0) {
            fs.copyFileSync(configPath, `${configPath}.bak`);
          }
        } catch (e) {
          diagLog(`[Persist] config-v2.json backup: ${e.message}`);
        }
        fs.renameSync(tempPath, configPath);
        fsyncFileBestEffort(configPath);
        try {
          const sz = fs.statSync(configPath).size;
          diagLog(`[Persist] save-full-config ok path=${configPath} bytes=${sz}`);
        } catch (_) {
          diagLog(`[Persist] save-full-config ok path=${configPath}`);
        }
        return true;
      }
      throw new Error("Temp file is empty or missing after write");
    } catch (e) {
      console.error("Failed to save full config (Atomic):", e);
      diagLog(`[ERROR] Persistence Failure: ${e.message}`);
      try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
        fsyncFileBestEffort(configPath);
        return fs.existsSync(configPath) && fs.statSync(configPath).size > 0;
      } catch (e2) {
        /* ignore */
      }
      return false;
    } finally {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (e) {
        /* ignore */
      }
    }
  };

  /**
   * Caminho normal de gravação: assíncrono, serializado e sem regravar conteúdo idêntico.
   *
   * A versão síncrona acima continua a existir — é a certa para o flush de saída, onde não há
   * mais loop de eventos para esperar. Mas usá-la em TODAS as alterações punha ~1,2 MB de
   * `JSON.stringify` + `writeFile` + dois `fsync` no processo main, que é o mesmo processo que
   * serve o IPC de abrir o radial: era daí que vinham engasgos sem causa aparente.
   *
   * Três defesas, por ordem de valor:
   *   1. hash do conteúdo — o renderer grava a cada alteração de estado, e boa parte é idêntica;
   *   2. serialização — sem ela duas gravações competiam pelo mesmo ficheiro `.tmp`;
   *   3. coalescência — se chegarem várias durante uma gravação, só a última interessa.
   */
  const fsp = fs.promises;
  let configWritePending = null;
  let configWriteLoop = null;
  let lastConfigWriteOk = true;
  let lastConfigWriteHash = null;

  const fsyncFileBestEffortAsync = async (filePath) => {
    let handle = null;
    try {
      handle = await fsp.open(filePath, "r+");
      await handle.sync();
    } catch (e) {
      diagLog(`[Persist] fsync ${path.basename(filePath)}: ${e.message}`);
    } finally {
      try {
        await handle?.close();
      } catch (e) {
        /* ignore */
      }
    }
  };

  const writeFullConfigAsync = async (config) => {
    const configPath = path.join(app.getPath("userData"), "config-v2.json");
    const tempPath = configPath + ".tmp";
    let toWrite = config;
    try {
      await fsp.mkdir(path.dirname(configPath), { recursive: true });

      if (process.platform === "win32" && config && typeof config === "object") {
        try {
          toWrite = JSON.parse(JSON.stringify(config));
          win32Launch.normalizePersistedPayloadWin32(toWrite);
        } catch (e) {
          diagLog(`[Persist] win32 command normalize (clone) failed: ${e.message}`);
        }
      }

      const json = JSON.stringify(toWrite, null, 2);
      const hash = crypto.createHash("sha1").update(json).digest("hex");
      const bytes = Buffer.byteLength(json, "utf-8");
      /**
       * Saltar a escrita exige duas provas: o conteúdo é o mesmo que gravámos E o ficheiro em disco
       * continua a ser esse. Sem a segunda, um primário substituído por fora (foi o que aconteceu
       * a 12/ago) ficaria desatualizado para sempre — a app nunca mais o reescreveria.
       */
      if (hash === lastConfigWriteHash) {
        const current = await fsp.stat(configPath).catch(() => null);
        if (current && current.size === bytes) return true;
        diagLog("[Persist] Primário divergente do último save — a reescrever.");
      }

      await fsp.writeFile(tempPath, json, "utf-8");
      await fsyncFileBestEffortAsync(tempPath);

      const tempStat = await fsp.stat(tempPath).catch(() => null);
      if (!tempStat || tempStat.size === 0) {
        throw new Error("Temp file is empty or missing after write");
      }

      try {
        const primaryStat = await fsp.stat(configPath).catch(() => null);
        if (primaryStat && primaryStat.size > 0) {
          await fsp.copyFile(configPath, `${configPath}.bak`);
        }
      } catch (e) {
        diagLog(`[Persist] config-v2.json backup: ${e.message}`);
      }

      await fsp.rename(tempPath, configPath);
      await fsyncFileBestEffortAsync(configPath);
      lastConfigWriteHash = hash;
      diagLog(`[Persist] save-full-config ok (async) path=${configPath} bytes=${tempStat.size}`);
      return true;
    } catch (e) {
      console.error("Failed to save full config (async):", e);
      diagLog(`[ERROR] Persistence Failure (async): ${e.message}`);
      /** Último recurso é o caminho síncrono já provado — perder a config é pior que um engasgo. */
      lastConfigWriteHash = null;
      return saveFullConfigToDisk(config);
    } finally {
      try {
        if (fs.existsSync(tempPath)) await fsp.unlink(tempPath);
      } catch (e) {
        /* ignore */
      }
    }
  };

  const runConfigWriteLoop = async () => {
    try {
      while (configWritePending !== null) {
        const payload = configWritePending;
        configWritePending = null;
        lastConfigWriteOk = await writeFullConfigAsync(payload);
      }
    } finally {
      configWriteLoop = null;
    }
  };

  /** @returns {Promise<boolean>} */
  const saveFullConfigToDiskAsync = async (config) => {
    configWritePending = config;
    if (!configWriteLoop) configWriteLoop = runConfigWriteLoop();
    await configWriteLoop;
    return lastConfigWriteOk;
  };

  const applyPersistedFullConfigSideEffects = (payload) => {
    if (!payload || typeof payload !== "object") return;
    if (typeof payload.performanceMode === "boolean") {
      cachedRadialFlags.performanceMode = payload.performanceMode;
    }
    if (typeof payload.enableMouseTrigger === "boolean") {
      cachedRadialFlags.enableMouseTrigger = payload.enableMouseTrigger;
    }
    if (payload.mouseTriggerMode === "click" || payload.mouseTriggerMode === "hold") {
      cachedRadialFlags.mouseTriggerMode = payload.mouseTriggerMode;
    }
    if (MOUSE_TRIGGER_BUTTONS.includes(payload.mouseTriggerButton)) {
      cachedRadialFlags.mouseTriggerButton = payload.mouseTriggerButton;
    }
    const ui = extractUiConfigFromPersistenceBlob(payload);
    if (ui) {
      applyUiConfigToCurrentSettings(ui);
      saveSettings({});
      if (typeof ui.openAtLogin === "boolean") {
        syncLoginItemSettings(ui.openAtLogin);
      }
      if (typeof ui.performanceMode === "boolean") {
        cachedRadialFlags.performanceMode = ui.performanceMode;
      }
      if (typeof ui.enableMouseTrigger === "boolean") {
        cachedRadialFlags.enableMouseTrigger = ui.enableMouseTrigger;
      }
      if (ui.mouseTriggerMode === "click" || ui.mouseTriggerMode === "hold") {
        cachedRadialFlags.mouseTriggerMode = ui.mouseTriggerMode;
      }
      if (MOUSE_TRIGGER_BUTTONS.includes(ui.mouseTriggerButton)) {
        cachedRadialFlags.mouseTriggerButton = ui.mouseTriggerButton;
      }
      mergeGameModeConfig(ui.gameMode);
    }
    syncMouseHookState();
    try {
      refreshShortcutsFromFullConfig?.();
    } catch (e) {
      diagLog(`[Persist] refreshShortcutsFromFullConfig: ${e.message}`);
    }
  };

  /** Caminho síncrono — só para o flush de saída. Invalida o hash: o assíncrono não pode assumir estado. */
  const persistFullConfigFromRenderer = (payload) => {
    const ok = saveFullConfigToDisk(payload);
    lastConfigWriteHash = null;
    applyPersistedFullConfigSideEffects(payload);
    return ok;
  };

  /** Caminho normal — os efeitos colaterais aplicam-se já; só a ida ao disco é que espera. */
  const persistFullConfigFromRendererAsync = async (payload) => {
    applyPersistedFullConfigSideEffects(payload);
    return saveFullConfigToDiskAsync(payload);
  };

  ipcMain.handle("get-full-config", () => {
    const configPath = path.join(app.getPath("userData"), "config-v2.json");
    const bakPath = `${configPath}.bak`;

    const quarantineUnreadablePrimary = (err) => {
      try {
        if (fs.existsSync(configPath)) {
          const bad = `${configPath}.broken-${Date.now()}.json`;
          fs.renameSync(configPath, bad);
          diagLog(
            `[Persist] Quarantined unreadable config-v2.json → ${path.basename(bad)} (${err.message})`,
          );
        }
      } catch (e) {
        diagLog(`[Persist] Quarantine primary failed: ${e.message}`);
      }
    };

    const loadShapeAndWin32 = (filePath, label) => {
      const data = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(data);
      const shaped = normalizeFullPersistenceBlob(parsed);
      if (!shaped) {
        diagLog(
          `[Persist] get-full-config ${label}: JSON ok but shape invalid (missing workspaces?) path=${filePath}`,
        );
        return null;
      }
      if (process.platform === "win32") {
        try {
          const copy = JSON.parse(JSON.stringify(shaped));
          win32Launch.normalizePersistedPayloadWin32(copy);
          return copy;
        } catch (e) {
          diagLog(`[Persist] get-full-config win32 normalize (${label}): ${e.message}`);
        }
      }
      return shaped;
    };

    try {
      if (fs.existsSync(configPath)) {
        const st = fs.statSync(configPath);
        const loaded = loadShapeAndWin32(configPath, "primary");
        if (loaded) {
          diagLog(
            `[Persist] load ok source=primary path=${configPath} bytes=${st.size}`,
          );
          return loaded;
        }
      }
    } catch (e) {
      console.error("Failed to load full config:", e);
      diagLog(`[Persist] get-full-config primary failed: ${e.message}`);
      quarantineUnreadablePrimary(e);
    }
    try {
      if (fs.existsSync(bakPath)) {
        const st = fs.statSync(bakPath);
        const loaded = loadShapeAndWin32(bakPath, "bak");
        if (loaded) {
          diagLog(
            `[Persist] load ok source=bak path=${bakPath} bytes=${st.size}`,
          );
          return loaded;
        }
      }
    } catch (e2) {
      console.error("Failed to load backup config:", e2);
      diagLog(`[Persist] get-full-config bak failed: ${e2.message}`);
    }
    diagLog(
      `[Persist] load miss: no readable v2 config (primaryExists=${fs.existsSync(configPath)} bakExists=${fs.existsSync(bakPath)} quarantineBytes=${sumQuarantinedConfigBytes(path.dirname(configPath))})`,
    );
    return null;
  });

  ipcMain.handle("get-config-persistence-meta", () => {
    const configPath = path.join(app.getPath("userData"), "config-v2.json");
    const bakPath = `${configPath}.bak`;
    const userDataDir = path.dirname(configPath);
    try {
      const primaryBytes =
        fs.existsSync(configPath) && fs.statSync(configPath).isFile()
          ? fs.statSync(configPath).size
          : 0;
      const backupBytes =
        fs.existsSync(bakPath) && fs.statSync(bakPath).isFile()
          ? fs.statSync(bakPath).size
          : 0;
      const quarantineBytes = sumQuarantinedConfigBytes(userDataDir);
      return { primaryBytes, backupBytes, quarantineBytes };
    } catch (e) {
      diagLog(`[Persist] get-config-persistence-meta: ${e.message}`);
      return { primaryBytes: 0, backupBytes: 0, quarantineBytes: 0 };
    }
  });

  /** invoke: main processa e grava antes do renderer continuar — mais fiável que `send` ao fechar a app. */
  ipcMain.handle("save-full-config", async (_event, payload) => {
    try {
      if (!payload || typeof payload !== "object") {
        return { ok: false, error: "invalid payload" };
      }
      const ok = await persistFullConfigFromRendererAsync(payload);
      return ok ? { ok: true } : { ok: false, error: "write failed" };
    } catch (e) {
      diagLog(`[Persist] save-full-config handle: ${e.message}`);
      return { ok: false, error: e.message };
    }
  });

  /** Synchronous IPC so the renderer can flush to disk before process exit (notes, etc.). */
  ipcMain.on("save-full-config-sync", (event, payload) => {
    try {
      if (!payload || typeof payload !== "object") {
        event.returnValue = false;
        return;
      }
      event.returnValue = persistFullConfigFromRenderer(payload);
    } catch (e) {
      diagLog(`[Persist] save-full-config-sync: ${e.message}`);
      event.returnValue = false;
    }
  });

  /**
   * IPC: Persistence Debug Logger.
   * Era `appendFileSync` a cada gravação — I/O síncrono no main pelo mesmo motivo que a config,
   * e sem limite de tamanho. Agora é assíncrono e roda numa geração anterior ao passar de 1 MB.
   */
  const PERSIST_LOG_MAX_BYTES = 1024 * 1024;
  let persistLogBytes = null;
  ipcMain.on("save-persistence-log", (event, message) => {
    try {
      const logPath = path.join(app.getPath("userData"), "rovyl-persistence.log");
      const logEntry = `[${new Date().toISOString()}] ${message}\n`;
      const size = Buffer.byteLength(logEntry, "utf-8");
      if (persistLogBytes === null) {
        persistLogBytes = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
      }
      if (persistLogBytes + size > PERSIST_LOG_MAX_BYTES) {
        try {
          fs.renameSync(logPath, `${logPath}.1`);
        } catch (e) {
          /* ignore */
        }
        persistLogBytes = 0;
      }
      persistLogBytes += size;
      fs.appendFile(logPath, logEntry, "utf-8", (err) => {
        if (err) console.error("Failed to write persistence log:", err);
      });
    } catch (e) {
      console.error("Failed to write persistence log:", e);
    }
  });

  ipcMain.handle("export-config", async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "Export Rovyl Backup",
      defaultPath: path.join(app.getPath("downloads"), "rovyl-backup.json"),
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
      title: "Import Rovyl Backup",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) return { success: false };

    try {
      const data = JSON.parse(fs.readFileSync(result.filePaths[0], "utf-8"));
      
      if (!data.config && !data.settings) {
        throw new Error("Invalid backup file: no configuration data found.");
      }

      const configPath = path.join(app.getPath("userData"), "config-v2.json");
      const settingsPath = path.join(app.getPath("userData"), "settings.json");
      const iconCachePath = path.join(app.getPath("userData"), "icon-cache.json");

      if (data.config) {
        /**
         * Normalizar antes de gravar: garantir que `config.workspaces` é um array válido e
         * que existe o espelho `workspaces` de topo de nível que `normalizeFullPersistenceBlob`
         * usa como fallback. Sem isto, um backup com forma ligeiramente diferente pode fazer
         * `get-full-config` retornar `null` → LS migration → overwrite do backup.
         */
        const normalized = normalizeFullPersistenceBlob(data.config);
        if (!normalized) {
          throw new Error("Invalid backup file: workspace structure is missing or empty.");
        }
        // Garantir mirror de workspaces no nível de raiz (fallback do normalizer)
        if (!Array.isArray(normalized.workspaces) && Array.isArray(normalized.config?.workspaces)) {
          normalized.workspaces = normalized.config.workspaces;
        }
        /**
         * A licença NÃO vem no backup — e não pode ir-se embora com ele.
         *
         * O perfil ativado vive no `user` dentro do `config-v2.json`, e a importação substitui
         * esse ficheiro inteiro. Um backup feito antes da ativação (ou noutra máquina) traz
         * `user: null`, e a app pedia a chave outra vez a seguir a restaurar — apesar de o
         * dispositivo continuar ativado do lado do servidor.
         *
         * A ativação é uma propriedade DESTA instalação, não do conteúdo do backup: se já existe
         * um perfil ativado, ele sobrevive à importação. Um backup que traga um perfil ativado
         * continua a poder trazê-lo, para quem restaura numa máquina nova.
         */
        try {
          const currentRaw = fs.existsSync(configPath)
            ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
            : null;
          const currentUser = currentRaw && (currentRaw.user || (currentRaw.config && currentRaw.config.user));
          const importedUser = normalized.user || (normalized.config && normalized.config.user);
          if (currentUser && currentUser.isPremium === true && !(importedUser && importedUser.isPremium === true)) {
            normalized.user = currentUser;
            if (normalized.config) normalized.config.user = currentUser;
            diagLog("[Import] Licença desta instalação preservada — o backup não trazia perfil ativado");
          }
        } catch (e) {
          diagLog(`[Import] Não foi possível preservar a licença: ${e.message}`);
        }

        const toWrite = JSON.stringify(normalized, null, 2);
        // Escrita atómica idêntica ao saveFullConfigToDisk
        const tempPath = configPath + ".tmp";
        fs.writeFileSync(tempPath, toWrite, "utf-8");
        fs.renameSync(tempPath, configPath);
      }
      if (data.settings) fs.writeFileSync(settingsPath, JSON.stringify(data.settings, null, 2));

      /**
       * Ícones de um backup antigo não são reaproveitáveis.
       *
       * O backup guarda os `customIconUrl` já resolvidos — imagens em base64 — e o cache de
       * ícones. Se esse material foi produzido por um pipeline anterior, restaurá-lo repõe
       * exatamente os ícones defeituosos que motivaram a correção: com placa, com halo, ou
       * simplesmente do produto errado. E a cura automática nunca os substitui, porque ela só
       * preenche quem está SEM ícone; um ícone errado, para ela, é um ícone presente.
       *
       * Quando a proveniência não corresponde ao pipeline atual, descartamos os dois: os ícones
       * embutidos na config e o cache. Ficam por resolver, e a cura resolve-os de novo — agora
       * pelo caminho correto. Favicons de atalhos web são poupados: vêm da net, não do Windows.
       */
      const backupIconVersion = data.iconCache && data.iconCache.__pipelineVersion;
      const iconsAreCurrent = backupIconVersion === ICON_PIPELINE_VERSION;

      if (iconsAreCurrent) {
        fs.writeFileSync(iconCachePath, JSON.stringify(data.iconCache, null, 2));
      } else {
        try {
          if (fs.existsSync(iconCachePath)) fs.unlinkSync(iconCachePath);
        } catch (e) {
          /* non-fatal */
        }
        const stripped = stripStaleNativeIcons(configPath);
        diagLog(
          `[Import] Ícones do backup descartados (pipeline ${backupIconVersion ?? "desconhecido"} ` +
            `≠ ${ICON_PIPELINE_VERSION}); ${stripped} entradas ficam para reextração`,
        );
      }

      // Criar o .bak imediatamente — se o before-quit disparar mesmo assim, o save do renderer
      // iria sobrescrever apenas o primary (o .bak preserva o backup importado).
      try {
        if (data.config && fs.existsSync(configPath)) {
          fs.copyFileSync(configPath, `${configPath}.bak`);
        }
      } catch (_) { /* non-fatal */ }

      /**
       * Limpar o localStorage do renderer antes do relaunch.
       * Se `get-full-config` falhar no próximo arranque e o LS ainda tiver as chaves
       * `zenith_config` / `zenith_apps` antigas, a migração LS sobrescreveria o backup.
       */
      try {
        const { session } = require("electron");
        await session.defaultSession.clearStorageData({ storages: ["localstorage"] });
        diagLog("[Backup] Cleared renderer localStorage before import relaunch");
      } catch (lse) {
        diagLog(`[Backup] localStorage clear failed (non-fatal): ${lse.message}`);
      }

      diagLog(`[Backup] Configuration imported from ${result.filePaths[0]}. Relaunching...`);

      /**
       * Sinalizar ao handler before-quit que não deve pedir ao renderer para fazer flush
       * — o renderer tem estado ANTERIOR à importação em memória e sobrescreveria o backup.
       */
      skipQuitFlushForImport = true;
      app.relaunch();
      app.exit(0);
      return { success: true };
    } catch (e) {
      console.error("Import failed:", e);
      diagLog(`[ERROR] Import failed: ${e.message}`);
      return { success: false, error: e.message };
    }
  });

  /**
   * Fonte única de verdade para "isto é um IDE com projetos recentes?": a mesma resolução que o
   * MRU usa. O renderer adivinhava por palavras-chave, e `electron.app.Antigravity` (o agente)
   * batia em "antigravity" — passava por IDE e oferecia recentes que não existem.
   */
  ipcMain.handle("app-supports-recents", (event, appName, appCommand) =>
    Boolean(resolveIdeGlobalStorage(appName, appCommand)),
  );

  ipcMain.handle("get-app-recents", async (event, appName, appCommand) => {
    diagLog(`[Recents] Fetching for appName: "${appName}", appCommand: "${appCommand}"`);

    /** Usados mais abaixo, ao converter cada entrada do MRU no comando que abre a pasta. */
    const lowerName = appName ? appName.toLowerCase() : "";
    const lowerCommand = appCommand ? appCommand.toLowerCase() : "";

    /** Descoberta em vez de caminho fixo — ver `resolveIdeGlobalStorage`. */
    const globalStorageDir = resolveIdeGlobalStorage(appName, appCommand);
    if (!globalStorageDir) {
      diagLog(`[Recents] Nenhum perfil de IDE corresponde a "${appName}" / "${appCommand}"`);
      return [];
    }

    const storageJsonPath = path.join(globalStorageDir, "storage.json");
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

        /** Atalhos descobertos pelo Windows podem ser AUMIDs, que não aceitam argumento de pasta. */
        const ideIdentity = `${itemLowerName} ${lowerCommand}`;
        if (ideIdentity.includes("cursor")) {
          appCommandString = resolveCursorExePath();
        } else if (ideIdentity.includes("antigravity")) {
          appCommandString = resolveAntigravityExePath();
        } else if (
          ideIdentity.includes("visual studio code") ||
          ideIdentity.includes("visualstudiocode") ||
          itemLowerName === "code" ||
          itemLowerName === "vscode"
        ) {
          appCommandString = resolveVsCodeExePath();
        }
        
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

        let workingDirectory = decoded;
        try {
          if (fs.existsSync(decoded) && !fs.statSync(decoded).isDirectory()) {
            workingDirectory = path.dirname(decoded);
          }
        } catch (e) { /* manter o caminho decodificado */ }

        return {
          id: `recent-${uri}`,
          label: label || decoded,
          iconName: "Folder",
          iconSource: "lucide",
          command: command,
          commandType: "app",
          description: decoded,
          workingDirectory,
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
      if (nativeWindowSizeMode === "windowed" && rendererPanelVisible) {
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
        label: "Open Settings",
        click: async () => {
          try {
            await ensureMainWindow();
            openSettingsFromMainProcess();
          } catch (e) {
            diagLog(`[Tray] Abrir Configurações: ${e.message}`);
          }
        },
      },
      { label: "Quit", click: () => app.quit() },
    ]);
    tray.setToolTip("Rovyl");
    tray.setContextMenu(contextMenu);

    // Feedback de início
    console.log("Rovyl started successfully in the background.");
  } catch (err) {
    console.error("Failed to create tray icon:", err);
  }

  /**
   * Evita toast a cada save/reopen do radial quando o atalho está ocupado (ex.: Alt+Z da NVIDIA).
   * Volta a notificar se o utilizador mudar o atalho e o novo também falhar.
   */
  let mainShortcutConflictNotify = { failedKey: null, notifiedForKey: null };

  const shortcutCompactKey = (s) =>
    String(s || "")
      .replace(/\s+/g, "")
      .replace(/Win/gi, "Super")
      .toLowerCase();

  /** Alt+Z é comum na sobreposição GeForce / outros — mensagem mais útil que genérico "OS". */
  const altZOverlayHint = (shortcutStr) => {
    const k = shortcutCompactKey(shortcutStr);
    if (k === "alt+z" || k === "option+z") {
      return " Alt+Z is commonly reserved by the NVIDIA GeForce Experience overlay or another app. Disable it there or choose a different shortcut in Rovyl Settings.";
    }
    return "";
  };

  let lastShortcutRegistrationSignature = null;
  const shortcutRegistrationSignature = () => {
    const entries = [String(currentSettings.globalShortcut || "Alt+Z")];
    const visit = (apps) => {
      if (!Array.isArray(apps)) return;
      for (const item of apps) {
        if (item && item.shortcut && item.command) {
          entries.push(`${item.shortcut}\u0000${item.command}`);
        }
        visit(item?.children);
      }
    };
    for (const workspace of currentSettings.workspaces || []) visit(workspace?.apps);
    return entries.join("\u0001");
  };

  const registerGlobalShortcut = (force = false) => {
    const registrationSignature = shortcutRegistrationSignature();
    if (!force && registrationSignature === lastShortcutRegistrationSignature) {
      return;
    }
    lastShortcutRegistrationSignature = registrationSignature;
    globalShortcut.unregisterAll();
    let shortcut = currentSettings.globalShortcut || "Alt+Z";
    const openRadialFromShortcut = async (sourceShortcut) => {
      diagLog(`${sourceShortcut} shortcut triggered`);
      /**
       * Fechar diretamente evita passar novamente pelo fluxo de show/resize e, principalmente,
       * não deixa a tecla que acionou o toggle confirmar o app/workspace atualmente apontado.
       */
      if (workspaceShortcutsMenuOpen && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("open-menu", {
          source: "shortcut",
          closeOnly: true,
        });
        return;
      }
      const allowed = await shouldOpenMenu();
      if (!allowed) return;
      showMenuAtCursor("shortcut");
    };

    // MIGRATION / NORMALIZATION: 'Win' is recorded as 'Super' now, but old settings might have 'Win'
    if (shortcut.includes("Win")) {
      shortcut = shortcut.replace(/Win/g, "Super");
      diagLog(
        `[Shortcut] Normalized 'Win' to 'Super' in shortcut: ${shortcut}`,
      );
    }

    try {
      const registered = globalShortcut.register(shortcut, () =>
        openRadialFromShortcut(shortcut),
      );

      if (registered) {
        mainShortcutConflictNotify = { failedKey: null, notifiedForKey: null };
        diagLog(`Global shortcut '${shortcut}' registered successfully.`);
      } else {
        const failKey = shortcutCompactKey(shortcut);
        mainShortcutConflictNotify.failedKey = failKey;
        mainShortcutConflictNotify.notifiedForKey = failKey;
        diagLog(
          `[Shortcut] Global shortcut '${shortcut}' not registered; it is likely already in use.${altZOverlayHint(shortcut)}`,
        );
        /** Sem monitor global de mouse, garantir sempre uma forma segura de abrir o radial. */
        const fallbackShortcut = "Alt+Shift+F9";
        if (
          shortcutCompactKey(shortcut) !== shortcutCompactKey(fallbackShortcut) &&
          globalShortcut.register(fallbackShortcut, () =>
            openRadialFromShortcut(fallbackShortcut),
          )
        ) {
          diagLog(
            `[Shortcut] Fallback '${fallbackShortcut}' registrado porque '${shortcut}' está ocupado.`,
          );
        }
      }
    } catch (e) {
      const failKey = shortcutCompactKey(shortcut);
      mainShortcutConflictNotify.failedKey = failKey;
      mainShortcutConflictNotify.notifiedForKey = failKey;
      diagLog(
        `[Shortcut] Global shortcut '${shortcut}' registration failed: ${e.message}${altZOverlayHint(shortcut)}`,
      );
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
                  // Não enviar execution-error: save-full-config re-regista atalhos muitas vezes e inundava o UI.
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

  refreshShortcutsFromFullConfig = () => {
    registerGlobalShortcut();
  };

  ipcMain.on("set-settings", (event, settings) => {
    if (!settings || typeof settings !== "object") return;
    const patch = {};
    if (typeof settings.globalShortcut === "string") patch.globalShortcut = settings.globalShortcut;
    if (typeof settings.enableMouseTrigger === "boolean") patch.enableMouseTrigger = settings.enableMouseTrigger;
    if (settings.mouseTriggerMode === "click" || settings.mouseTriggerMode === "hold") {
      patch.mouseTriggerMode = settings.mouseTriggerMode;
    }
    if (MOUSE_TRIGGER_BUTTONS.includes(settings.mouseTriggerButton)) {
      patch.mouseTriggerButton = settings.mouseTriggerButton;
    }
    if (typeof settings.openAtLogin === "boolean") patch.openAtLogin = settings.openAtLogin;
    if (Array.isArray(settings.workspaces)) patch.workspaces = settings.workspaces;
    if (Object.keys(patch).length === 0) return;

    saveSettings(patch);

    if (patch.enableMouseTrigger !== undefined) {
      cachedRadialFlags.enableMouseTrigger = patch.enableMouseTrigger;
    }
    if (patch.mouseTriggerMode !== undefined) {
      cachedRadialFlags.mouseTriggerMode = patch.mouseTriggerMode;
    }
    if (patch.mouseTriggerButton !== undefined) {
      cachedRadialFlags.mouseTriggerButton = patch.mouseTriggerButton;
      syncMouseHookState();
    }

    if (patch.globalShortcut) {
      registerGlobalShortcut();
    }

    if (patch.openAtLogin !== undefined) {
      syncLoginItemSettings(patch.openAtLogin);
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

  /** Windows: run NSIS uninstaller from registry, or open Apps settings; dev → Apps; macOS: reveal .app in Finder. */
  ipcMain.handle("open-system-uninstall", async () => {
    const displayName = "Rovyl";
    try {
      if (process.platform === "win32") {
        if (isDev) {
          await shell.openExternal("ms-settings:appsfeatures");
          return { ok: true, mode: "settings", dev: true };
        }
        const esc = (s) => String(s).replace(/'/g, "''");
        const ps = [
          "$ErrorActionPreference='SilentlyContinue'",
          `$n='${esc(displayName)}'`,
          "$roots=@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall')",
          "foreach($r in $roots){",
          "if(-not(Test-Path $r)){continue};",
          "$hit=Get-ChildItem $r -EA 0 | ForEach-Object { Get-ItemProperty $_.PSPath -EA 0 } | Where-Object { $_.DisplayName -eq $n -and $_.UninstallString } | Select-Object -First 1;",
          "if($hit){ [Console]::Out.Write($hit.UninstallString); exit 0 }",
          "}",
          "exit 1",
        ].join(" ");
        try {
          const out = execFileSync(
            "powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "RemoteSigned", "-Command", ps],
            {
              encoding: "utf8",
              windowsHide: true,
              timeout: 20000,
              maxBuffer: 4 * 1024 * 1024,
            },
          )
            .trim()
            .replace(/\r\n/g, "\n")
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)[0];
          if (out) {
            const child = spawn(out, { shell: true, detached: true, stdio: "ignore" });
            try {
              child.unref();
            } catch (_) {}
            return { ok: true, mode: "uninstaller" };
          }
        } catch (e) {
          diagLog(`[Uninstall] registry: ${e.message}`);
        }
        await shell.openExternal("ms-settings:appsfeatures");
        return { ok: true, mode: "settings" };
      }
      if (process.platform === "darwin") {
        shell.showItemInFolder(app.getPath("exe"));
        return { ok: true, mode: "finder" };
      }
      return { ok: false, error: "unsupported" };
    } catch (e) {
      diagLog(`[Uninstall] ${e.message}`);
      return { ok: false, error: e.message || "error" };
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
    lastShortcutRegistrationSignature = null;
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

  /**
   * Impressão digital ESTÁVEL da máquina.
   *
   * O `MachineGuid` é escrito pelo Windows na instalação do sistema e não muda com reinstalações
   * de aplicações, limpezas de perfil nem atualizações. O UUID do hardware serve de alternativa
   * quando o registo não é legível. Só se cai no aleatório se ambos falharem — e aí volta a valer
   * o ficheiro em disco.
   */
  function readStableMachineId() {
    if (process.platform !== "win32") return null;
    const attempts = [
      () =>
        execFileSync(
          "reg",
          ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
          { encoding: "utf8", windowsHide: true, timeout: 4000 },
        ),
      () =>
        execFileSync(
          "wmic",
          ["csproduct", "get", "uuid"],
          { encoding: "utf8", windowsHide: true, timeout: 4000 },
        ),
    ];
    for (const attempt of attempts) {
      try {
        const output = attempt();
        const match = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(output);
        if (match) return match[0].toLowerCase();
      } catch (e) {
        /* tenta o seguinte */
      }
    }
    return null;
  }

  /**
   * Identificador do dispositivo para o servidor de licenças.
   *
   * Era um valor ALEATÓRIO guardado na pasta de dados da app. Qualquer coisa que apagasse essa
   * pasta — reinstalar, limpar o perfil, testar com `--user-data-dir` — produzia um identificador
   * novo, e o servidor contava a MESMA máquina como mais um dispositivo. Três ativações no mesmo
   * computador esgotavam o limite de três.
   *
   * Agora deriva-se do `MachineGuid` do Windows: o mesmo computador devolve sempre o mesmo
   * identificador, haja ou não pasta de dados. O ficheiro passa a ser só cache.
   */
  function getOrCreateLicenseDeviceId() {
    const devicePath = path.join(app.getPath("userData"), "license-device.json");
    const machineId = readStableMachineId();

    if (machineId) {
      const deviceId = crypto
        .createHash("sha256")
        .update(`rovyl:${machineId}`)
        .digest("hex");
      try {
        const saved = JSON.parse(fs.readFileSync(devicePath, "utf8"));
        if (saved.deviceId !== deviceId) {
          diagLog("[License] deviceId migrado para a impressão digital estável da máquina");
        }
      } catch (e) {
        /* ficheiro ausente ou ilegível — escrever de novo */
      }
      try {
        fs.writeFileSync(devicePath, JSON.stringify({ deviceId, source: "machine-guid" }), {
          encoding: "utf8",
          mode: 0o600,
        });
      } catch (e) {
        /* o identificador é derivável na mesma; o ficheiro é só cache */
      }
      return deviceId;
    }

    /** Sem identificador de máquina: comportamento antigo, com o ficheiro a mandar. */
    try {
      const saved = JSON.parse(fs.readFileSync(devicePath, "utf8"));
      if (typeof saved.deviceId === "string" && saved.deviceId.length >= 32) return saved.deviceId;
    } catch (_) {}
    const deviceId = crypto.randomUUID() + crypto.randomBytes(24).toString("hex");
    fs.writeFileSync(devicePath, JSON.stringify({ deviceId }), { encoding: "utf8", mode: 0o600 });
    return deviceId;
  }

  async function activateRovylLicense(idToken) {
    const endpoint = process.env.ROVYL_LICENSE_API_URL || "https://rovyl-red.vercel.app/api/license/activate";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": `Rovyl/${app.getVersion()}` },
      body: JSON.stringify({
        idToken,
        deviceId: getOrCreateLicenseDeviceId(),
        deviceName: `${os.hostname()} · ${os.platform()} ${os.release()}`,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.licensed !== true) {
      const error = new Error(result.error || "Rovyl purchase could not be verified.");
      error.code = result.code || "LICENSE_DENIED";
      throw error;
    }
    return result;
  }

  async function activateRovylLicenseKey(licenseKey) {
    const endpoint = process.env.ROVYL_LICENSE_KEY_API_URL || "https://rovyl-red.vercel.app/api/license/activate-key";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": `Rovyl/${app.getVersion()}` },
      body: JSON.stringify({
        licenseKey,
        deviceId: getOrCreateLicenseDeviceId(),
        deviceName: `${os.hostname()} · ${os.platform()} ${os.release()}`,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.licensed !== true) {
      const error = new Error(result.error || "This Rovyl license could not be activated.");
      error.code = result.code || "LICENSE_DENIED";
      throw error;
    }
    return result;
  }

  /**
   * Libertar o lugar do dispositivo no servidor.
   *
   * Sem isto, "Remove license" só apagava o perfil local: o lugar continuava ocupado e o
   * utilizador ficava sem forma de o reaver — foi assim que se esgotaram três lugares numa só
   * máquina. A chamada é tolerante por desenho: se a rota ainda não existir, ou a rede falhar,
   * devolve o motivo e a app remove a licença localmente na mesma, para nunca ficar presa.
   */
  async function deactivateRovylLicenseDevice() {
    const endpoint =
      process.env.ROVYL_LICENSE_DEACTIVATE_API_URL ||
      "https://rovyl-red.vercel.app/api/license/deactivate";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": `Rovyl/${app.getVersion()}` },
      body: JSON.stringify({ deviceId: getOrCreateLicenseDeviceId() }),
    });
    if (response.status === 404) {
      const error = new Error("O serviço de licenças ainda não expõe desativação.");
      error.code = "DEACTIVATE_UNAVAILABLE";
      throw error;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || "Não foi possível libertar este dispositivo.");
      error.code = result.code || "DEACTIVATE_FAILED";
      throw error;
    }
    return result;
  }

  ipcMain.handle("deactivate-rovyl-license", async () => {
    try {
      const result = await deactivateRovylLicenseDevice();
      diagLog("[License] Dispositivo libertado no servidor");
      return { ok: true, result };
    } catch (error) {
      diagLog(`[License] Desativação remota falhou: ${error?.message}`);
      return {
        ok: false,
        error: error?.message || "Não foi possível libertar este dispositivo.",
        code: error?.code || "DEACTIVATE_FAILED",
      };
    }
  });

  /**
   * Chave de desenvolvimento — ativação local, sem servidor e sem gastar dispositivos.
   *
   * No binário fica só o SHA-256; a chave em si nunca é escrita no código, portanto quem
   * desmontar o executável encontra um hash e não uma chave. Continua a ser uma porta: quem a
   * souber ativa qualquer instalação. Trata-a como uma credencial — não a metas em capturas de
   * ecrã, commits ou vídeos.
   */
  const DEV_LICENSE_KEY_SHA256 =
    "b94dc0c453f99b63185c20e3fa538c7d89528328a5cf30fa92dd5fe358510972";

  function isDevLicenseKey(licenseKey) {
    if (typeof licenseKey !== "string" || !licenseKey.trim()) return false;
    const digest = crypto
      .createHash("sha256")
      .update(licenseKey.trim().toUpperCase())
      .digest("hex");
    /** Comparação em tempo constante: uma comparação normal vaza o prefixo por temporização. */
    const a = Buffer.from(digest, "hex");
    const b = Buffer.from(DEV_LICENSE_KEY_SHA256, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  ipcMain.handle("activate-rovyl-license", async (_event, licenseKey) => {
    if (isDevLicenseKey(licenseKey)) {
      diagLog("[License] Chave de desenvolvimento aceite — ativação local, sem servidor");
      return {
        ok: true,
        license: {
          name: "Rovyl Dev",
          email: "dev@rovyl.app",
          isPremium: true,
          isAdmin: true,
          planTier: "pro",
        },
      };
    }

    try {
      const license = await activateRovylLicenseKey(licenseKey);
      return { ok: true, license };
    } catch (error) {
      return { ok: false, error: error?.message || "Could not activate this license.", code: error?.code || "LICENSE_DENIED" };
    }
  });

  function emitGoogleAuthSuccess(license) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("google-auth-success", {
        email: license.email,
        name: license.name,
        avatarUrl: license.avatarUrl,
        isAdmin: license.isAdmin === true,
        isPremium: true,
        planTier: "pro",
      });
      mainWindow.show();
      mainWindow.focus();
    }
  }

  function sendZenithAuthSuccessHtml(res) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Rovyl — signed in</title>
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
      <h1>Signed in to Rovyl</h1>
      <p>This page finished linking your account. Return to the Rovyl window &mdash; it should already be signed in.</p>
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
    /**
     * Sem valor por omissao: o ID identifica o projeto Google Cloud de quem publica, e num
     * repositorio publico uma bifurcacao herdaria silenciosamente o projeto do autor.
     * Quem compila define o seu em `.env.local` — ver `.env.example`.
     */
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
        "\n\nThen restart Rovyl.";
      dialog.showErrorBox("Rovyl — Google sign-in", msg);
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
          .then(async (data) => {
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
            const license = await activateRovylLicense(idToken);
            emitGoogleAuthSuccess({ ...license, name: license.name || name, avatarUrl: license.avatarUrl || picture });
            sendZenithAuthSuccessHtml(res);
            if (authServer) {
              try {
                authServer.close();
              } catch (e) {}
              authServer = null;
            }
          })
          .catch((e) => {
            diagLog(`[Auth] Sign-in/license failed (${e.code || "AUTH_ERROR"}): ${e.message}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send("google-auth-error", { code: e.code || "LICENSE_DENIED", message: e.message });
            }
            dialog.showErrorBox("Rovyl — license required", e.message);
            res.writeHead(e.code === "PURCHASE_REQUIRED" ? 403 : 400, { "Content-Type": "text/plain; charset=utf-8" });
            res.end(e.code === "PURCHASE_REQUIRED" ? "No Rovyl purchase was found for this Google account." : "Could not verify your Rovyl license.");
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

                if (tokenData.access_token && tokenData.id_token) {
                    diagLog("[Auth] Access token received, fetching user info...");
                    
                    // Fetch user info
                    https.get(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${tokenData.access_token}`, (userRes) => {
                        let userBody = '';
                        userRes.on('data', (d) => userBody += d);
                        userRes.on('end', async () => {
                            const userInfo = JSON.parse(userBody);
                            const { email, name, picture } = userInfo;
                            
                            diagLog(`[Auth] Successfully authenticated as ${email}`);
                            try {
                              const license = await activateRovylLicense(tokenData.id_token);
                              emitGoogleAuthSuccess({ ...license, name: license.name || name, avatarUrl: license.avatarUrl || picture });
                              sendZenithAuthSuccessHtml(res);
                            } catch (e) {
                              diagLog(`[Auth] Legacy license failed (${e.code || "LICENSE_DENIED"}): ${e.message}`);
                              dialog.showErrorBox("Rovyl — license required", e.message);
                              res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
                              res.end("No active Rovyl license was found for this account.");
                            }
                            
                            if (authServer) {
                                authServer.close();
                                authServer = null;
                            }
                        });
                    });
                } else {
                    diagLog("[Auth] Error: Failed to exchange code for an ID token: " + body);
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
          ? "Port 3892 is already in use. Close another Rovyl instance or any app using that port, then try again."
          : err.message;
      dialog.showErrorBox("Rovyl — Google sign-in", detail);
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
        process.env.ZENITH_WEB_AUTH_URL || "https://rovyl-red.vercel.app/auth";
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

  // 2. PowerShell middle-button monitor (GetAsyncKeyState; never intercepts cursor movement)
  let mouseHook = null;
  /** Botão com que a sonda atual foi lançada — comparado para saber se é preciso relançá-la. */
  let activeMouseHookButton = "middle";
  let activeMouseHookMode = null;
  /**
   * Limiar real do modo "segurar". Um clique MMB normal costuma terminar antes deste tempo:
   * o MIDDLE_UP cancela o timer e o navegador recebe o gesto normalmente (por exemplo, para
   * fechar uma aba). Somente manter o botão premido por 200 ms abre o radial.
   * O modo "click" não passa por este timer.
   */
  const MMB_HOLD_OPEN_DELAY_MS = 200;
  let mmbHoldOpenTimer = null;
  let mmbIsDown = false;
  /** Invalida uma verificação assíncrona se o botão for solto ou surgir um gesto mais novo. */
  let mmbHoldGestureId = 0;
  let mmbFirstDownAt = 0;
  let mmbClickDownAt = 0;
  /** O MIDDLE_UP que pertence ao MMB usado apenas para fechar não pode selecionar a fatia ativa. */
  let suppressNextMmbRelease = false;

  /**
   * Modo "segurar": o radial abre com o botão do meio AINDA premido. No Windows a captura do rato
   * pertence à janela que recebeu o WM_MBUTTONDOWN (o desktop / a app por baixo), por isso a nossa
   * janela não recebe UM ÚNICO `mousemove` enquanto o botão não é largado — o ângulo nunca atualiza
   * e nada fica selecionável. Sondamos o cursor no main e reenviamos ao renderer, que o reproduz
   * como um `mousemove` real. Só corre entre o MIDDLE_DOWN que abriu o radial e o MIDDLE_UP.
   */
  const MMB_CURSOR_POLL_MS = 8;
  /**
   * Rede de segurança: o fim normal da sonda é o MIDDLE_UP, mas se o processo do hook morrer com o
   * botão premido esse evento nunca chega. Sem este limite ficava um intervalo de 8 ms a enviar IPC
   * para sempre — exatamente o tipo de fuga que só se manifesta depois de horas de uso.
   * Nenhum gesto de "segurar" real dura um minuto.
   */
  const MMB_CURSOR_MAX_MS = 60000;
  let mmbCursorTimer = null;
  let mmbCursorStartedAt = 0;
  let mmbLastCursor = { x: NaN, y: NaN };

  const stopMmbCursorTracking = () => {
    if (!mmbCursorTimer) return;
    clearInterval(mmbCursorTimer);
    mmbCursorTimer = null;
    mmbCursorStartedAt = 0;
    mmbLastCursor = { x: NaN, y: NaN };
  };

  const startMmbCursorTracking = () => {
    stopMmbCursorTracking();
    mmbCursorStartedAt = Date.now();
    mmbCursorTimer = setInterval(() => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        stopMmbCursorTracking();
        return;
      }
      if (Date.now() - mmbCursorStartedAt > MMB_CURSOR_MAX_MS) {
        diagLog("[MouseHook] Sonda do cursor terminada por tempo limite (MIDDLE_UP não chegou).");
        stopMmbCursorTracking();
        return;
      }
      let point;
      try {
        point = screen.getCursorScreenPoint();
      } catch (e) {
        return;
      }
      if (point.x === mmbLastCursor.x && point.y === mmbLastCursor.y) return;
      mmbLastCursor = point;
      try {
        mainWindow.webContents.send("mmb-cursor", { x: point.x, y: point.y });
      } catch (e) {
        /* ignore */
      }
    }, MMB_CURSOR_POLL_MS);
  };

  /** Definido mais abaixo; o bloqueador chama-o com as linhas TRIGGER_*. */
  let handleTriggerData = null;

  const startMouseHook = () => {
    if (mouseHook) return;
    activeMouseHookButton = cachedRadialFlags.mouseTriggerButton;
    activeMouseHookMode = cachedRadialFlags.mouseTriggerMode;
    const virtualKey = MOUSE_TRIGGER_VK[activeMouseHookButton] ?? MOUSE_TRIGGER_VK.middle;
    const mode = cachedRadialFlags.mouseTriggerMode === "click" ? "click" : "hold";
    diagLog(
      `Mouse trigger capturado pelo hook (${activeMouseHookButton}, ${mode}, folga ${TRIGGER_PASSTHROUGH_SLOP_PX}px)`,
    );
    /** Marcador de "ativo": ja nao ha processo proprio, mas o resto do codigo testa a verdade disto. */
    mouseHook = { active: true };
    radialTriggerListener = (text) => {
      if (handleTriggerData) void handleTriggerData(text);
    };
    setRadialTriggerCapture(virtualKey, mode, TRIGGER_PASSTHROUGH_SLOP_PX);

    handleTriggerData = async (data) => {
      const lines = data.toString().split(/\r?\n/);
      for (const line of lines) {
        const msg = line.trim();
        if (!msg) continue;

        if (msg === "TRIGGER_DOWN") {
          const now = Date.now();
          mmbIsDown = true;
          const holdGestureId = ++mmbHoldGestureId;
          /**
           * O renderer sincroniza `workspaceShortcutsMenuOpen` com o estado real do radial.
           * Quando já está aberto, fechar imediatamente no DOWN e consumir o UP correspondente;
           * assim um app/workspace sob o cursor nunca é executado pelo gesto de toggle.
           */
          if (workspaceShortcutsMenuOpen && mainWindow && !mainWindow.isDestroyed()) {
            if (mmbHoldOpenTimer) {
              clearTimeout(mmbHoldOpenTimer);
              mmbHoldOpenTimer = null;
            }
            mmbFirstDownAt = 0;
            mmbClickDownAt = 0;
            suppressNextMmbRelease = true;
            stopMmbCursorTracking();
            mainWindow.webContents.send("open-menu", {
              source: cachedRadialFlags.mouseTriggerMode === "click" ? "mmb-click" : "mmb",
              closeOnly: true,
            });
            continue;
          }
          if (cachedRadialFlags.mouseTriggerMode === "click") {
            mmbClickDownAt = now;
            continue;
          }
          const sinceFirst = mmbFirstDownAt ? now - mmbFirstDownAt : 99999;

          // Second MMB while radial open is still deferred (timer pending): open settings only — no radial this gesture
          if (
            mmbFirstDownAt &&
            mmbHoldOpenTimer &&
            sinceFirst >= 8
          ) {
            if (mmbHoldOpenTimer) {
              clearTimeout(mmbHoldOpenTimer);
              mmbHoldOpenTimer = null;
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
            if (mmbHoldOpenTimer) {
              clearTimeout(mmbHoldOpenTimer);
              mmbHoldOpenTimer = null;
            }
            mmbFirstDownAt = now;
            mmbHoldOpenTimer = setTimeout(async () => {
              mmbHoldOpenTimer = null;
              mmbFirstDownAt = 0;
              const allowed = await shouldOpenMenu();
              /** O clique pode ter terminado enquanto a verificação de modo de jogo aguardava. */
              if (
                !allowed ||
                !mmbIsDown ||
                mmbHoldGestureId !== holdGestureId ||
                cachedRadialFlags.mouseTriggerMode !== "hold"
              ) return;
              showMenuAtCursor("mmb");
              /** Botão ainda premido: sem esta sonda o renderer não recebe `mousemove` nenhum. */
              startMmbCursorTracking();
            }, MMB_HOLD_OPEN_DELAY_MS);
          }
        } else if (msg === "TRIGGER_UP") {
          mmbIsDown = false;
          mmbHoldGestureId += 1;
          stopMmbCursorTracking();
          if (suppressNextMmbRelease) {
            suppressNextMmbRelease = false;
            continue;
          }
          if (cachedRadialFlags.mouseTriggerMode === "click") {
            mmbClickDownAt = 0;
            const allowed = await shouldOpenMenu();
            if (allowed) showMenuAtCursor("mmb-click");
            continue;
          }
          if (mmbHoldOpenTimer) {
            clearTimeout(mmbHoldOpenTimer);
            mmbHoldOpenTimer = null;
            mmbFirstDownAt = 0;
            continue;
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("mmb-release");
          }
        }
      }
    };
  };

  const stopMouseHook = () => {
    if (!mouseHook) return;
    mmbIsDown = false;
    mmbHoldGestureId += 1;
    stopMmbCursorTracking();
    if (mmbHoldOpenTimer) {
      clearTimeout(mmbHoldOpenTimer);
      mmbHoldOpenTimer = null;
    }
    mmbFirstDownAt = 0;
    mmbClickDownAt = 0;
    diagLog("Stopping Mouse Hook");
    radialTriggerListener = null;
    clearRadialTriggerCapture();
    mouseHook = null;
  };

  stopMouseHookForShutdown = stopMouseHook;

  syncMouseHookState = () => {
    // MMB remains global, but uses GetAsyncKeyState polling rather than WH_MOUSE_LL. The old
    // low-level hook was invoked synchronously for every pointer movement and could delay the cursor.
    const wantHook = cachedRadialFlags.enableMouseTrigger;
    /** Trocar de botão exige relançar a sonda: o VK é passado no arranque do processo. */
    /** Botao OU modo: ambos vao no comando TRIGGER, logo qualquer um exige re-armar a captura. */
    if (
      mouseHook &&
      (activeMouseHookButton !== cachedRadialFlags.mouseTriggerButton ||
        activeMouseHookMode !== cachedRadialFlags.mouseTriggerMode)
    ) {
      stopMouseHook();
    }
    if (wantHook) startMouseHook();
    else stopMouseHook();
  };
  const mouseHookDelayMs = Number.parseInt(
    process.env.ZENITH_MOUSE_HOOK_DELAY_MS ?? "0",
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

// IPC: Renderer atualiza modo jogo (também hidratamos de config-v2.json no arranque / save-full-config)
ipcMain.on("set-game-mode", (_event, gm) => {
  mergeGameModeConfig(gm);
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

function resolveVsCodeExePath() {
  if (process.platform !== "win32") return "code";
  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Microsoft VS Code", "Code.exe"),
    path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Microsoft VS Code", "Code.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft VS Code", "Code.exe"),
  ];
  for (const candidate of candidates) {
    try { if (candidate && fs.existsSync(candidate)) return candidate; } catch (e) { /* ignore */ }
  }
  return "code";
}

/**
 * "Antigravity" sao dois produtos: o IDE (`Antigravity IDE.exe`, com MRU) e o agente
 * (`Antigravity.exe`, sem MRU e sem argumento de pasta). Abrir um projeto recente tem de usar o
 * IDE, por isso ele vem sempre primeiro — o agente fica como ultimo recurso para instalacoes
 * antigas em que o IDE ainda se chamava so "Antigravity".
 */
function resolveAntigravityExePath() {
  if (process.platform !== "win32") return "antigravity";
  const local = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  const candidates = [
    path.join(local, "Programs", "Antigravity IDE", "Antigravity IDE.exe"),
    path.join(local, "Programs", "Google", "Antigravity IDE", "Antigravity IDE.exe"),
    path.join(programFiles, "Antigravity IDE", "Antigravity IDE.exe"),
    path.join(local, "Programs", "Antigravity", "Antigravity.exe"),
    path.join(local, "Programs", "Google", "Antigravity", "Antigravity.exe"),
    path.join(programFiles, "Antigravity", "Antigravity.exe"),
  ];
  for (const candidate of candidates) {
    try { if (candidate && fs.existsSync(candidate)) return candidate; } catch (e) { /* ignore */ }
  }
  return "antigravity";
}

/**
 * Rewrites Cursor/VS Code–style AUMID tokens to a real .exe or PATH shim so spawn/cmd succeed.
 */
/**
 * Um id do tipo `electron.app.Antigravity` NAO e um AUMID do Windows: e o AppUserModelID que uma
 * app Electron define para agrupar janelas na barra de tarefas. Nao existe em `shell:AppsFolder`,
 * portanto lanca-lo por ai falha e o erro mostrado ao utilizador e o proprio id. O nome a seguir a
 * `electron.app.` e, porem, o do produto — e isso chega para encontrar o executavel instalado.
 *
 * AUMIDs reais (MSIX) trazem sempre `!` (`Microsoft.WindowsTerminal_8wekyb3d8bbwe!App`) e passam
 * intactos por aqui.
 */
function resolveElectronAumidExe(rawCommand) {
  if (process.platform !== "win32" || !rawCommand || typeof rawCommand !== "string") return null;
  const command = rawCommand.trim().replace(/^"|"$/g, "");
  const match = /^electron\.app\.([^\s"!\\/]+)$/i.exec(command);
  if (!match) return null;

  const product = match[1];
  const wanted = product.toLowerCase().replace(/[^a-z0-9]/g, "");
  const roots = [
    path.join(process.env.LOCALAPPDATA || "", "Programs"),
    process.env.PROGRAMFILES || "C:\\Program Files",
    process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)",
  ].filter(Boolean);

  for (const root of roots) {
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.toLowerCase().replace(/[^a-z0-9]/g, "") !== wanted) continue;
      const dir = path.join(root, entry.name);
      /** O executavel costuma repetir o nome da pasta; caso contrario, o primeiro .exe do topo. */
      const candidates = [path.join(dir, `${entry.name}.exe`), path.join(dir, `${product}.exe`)];
      for (const candidate of candidates) {
        try {
          if (fs.existsSync(candidate)) return candidate;
        } catch (e) {
          /* continua */
        }
      }
      try {
        const exe = fs
          .readdirSync(dir, { withFileTypes: true })
          .find((file) => file.isFile() && /\.exe$/i.test(file.name) && !/^unins/i.test(file.name));
        if (exe) return path.join(dir, exe.name);
      } catch (e) {
        /* continua */
      }
    }
  }
  return null;
}

function normalizeAumidIdeCommands(cmd) {
  if (!cmd || typeof cmd !== "string") return cmd;
  let s = cmd;
  const cursorExe = resolveCursorExePath();
  const token = /\s/.test(cursorExe) ? `"${cursorExe}"` : cursorExe;

  s = s.replace(/"Anysphere\.Cursor(?:![^"]*)?"/gi, `"${cursorExe}"`);
  s = s.replace(/shell:AppsFolder\\Anysphere\.Cursor(?:![^\s"]*)?/gi, `"${cursorExe}"`);
  s = s.replace(/^(shell:AppsFolder\\)?Anysphere\.Cursor(?:![^\s"]*)?(?=\s|$)/i, token);

  /** `electron.app.X` nao existe em AppsFolder: trocar pelo executavel real antes de lancar. */
  const head = s.trim().split(/\s+/)[0];
  const electronExe = resolveElectronAumidExe(head);
  if (electronExe) {
    const quoted = /\s/.test(electronExe) ? `"${electronExe}"` : electronExe;
    s = `${quoted}${s.trim().slice(head.length)}`;
    diagLog(`[Exec] AppUserModelID de Electron "${head}" resolvido para ${electronExe}`);
  }
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

function removeIdeNewWindowFlag(cmd) {
  if (!cmd || typeof cmd !== "string") return cmd;
  return cmd.replace(/\s+(?:-n|--new-window)(?=\s|$)/i, "");
}

/** Pequeno working set mantido em RAM; o Windows também conserva estas páginas no file cache. */
const prewarmedExecutableBuffers = new Map();
let prewarmAppsSignature = "";
ipcMain.on("prewarm-apps", async (_event, rawCommands) => {
  const commands = Array.isArray(rawCommands)
    ? [...new Set(rawCommands.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))]
    : [];
  const signature = commands.slice().sort().join("\u0000");
  if (signature === prewarmAppsSignature) return;
  prewarmAppsSignature = signature;
  prewarmedExecutableBuffers.clear();

  const MAX_APPS = 8;
  const MAX_BYTES_PER_APP = 8 * 1024 * 1024;
  for (const original of commands.slice(0, MAX_APPS)) {
    try {
      let launch = normalizeAumidIdeCommands(resolveShellPath(original));
      const lower = launch.toLowerCase();
      if (lower.includes("cursor") && (lower.includes("!") || !/\.exe(?:"|\s|$)/i.test(lower))) {
        launch = resolveCursorExePath();
      } else if (lower.includes("antigravity") && (lower.includes("!") || !/\.exe(?:"|\s|$)/i.test(lower))) {
        launch = resolveAntigravityExePath();
      } else if ((lower.includes("visualstudiocode") || lower.includes("visual studio code")) && !/\.exe(?:"|\s|$)/i.test(lower)) {
        launch = resolveVsCodeExePath();
      }
      const { exe } = win32Launch.splitWin32SpawnExeAndArgs(launch);
      const stat = await fs.promises.stat(exe);
      if (!stat.isFile()) continue;
      const length = Math.min(stat.size, MAX_BYTES_PER_APP);
      const handle = await fs.promises.open(exe, "r");
      try {
        const buffer = Buffer.allocUnsafe(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);
        prewarmedExecutableBuffers.set(exe.toLowerCase(), buffer.subarray(0, bytesRead));
        diagLog(`[Prewarm] Cached ${(bytesRead / 1024 / 1024).toFixed(1)} MB from ${exe}`);
      } finally {
        await handle.close();
      }
    } catch (e) {
      diagLog(`[Prewarm] Skipped "${original}": ${e.message}`);
    }
  }
});

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

// IPC: Recebe comando do React para executar app
ipcMain.on("execute-command", async (event, command, commandType, options = {}) => {
  if (!command || typeof command !== "string" || command.trim() === "") {
    console.warn("EXEC_ERROR: Received empty or invalid command");
    if (mainWindow) {
      mainWindow.webContents.send(
        "execution-error",
        "Empty or invalid command",
      );
    }
    return;
  }

  const trimmedCommand = command.trim();

  // CRITICAL: Resolve GUIDs to real paths FIRST, before any detection logic
  let resolvedCommand = resolveShellPath(trimmedCommand);
  resolvedCommand = normalizeAumidIdeCommands(resolvedCommand);
  const prefersProcessReuse = options?.launchMode === "reuse" || options?.launchMode === "prewarm";
  resolvedCommand = prefersProcessReuse
    ? removeIdeNewWindowFlag(resolvedCommand)
    : addIdeNewWindowFlag(resolvedCommand);
  if (process.platform === "win32") {
    try {
      const canon = win32Launch.canonicalizeWin32LaunchCommand(resolvedCommand);
      if (canon !== resolvedCommand) {
        diagLog(`[Exec] Canonicalized launch line: "${resolvedCommand}" → "${canon}"`);
        resolvedCommand = canon;
      }
    } catch (e) {
      diagLog(`[Exec] Canonicalize skipped: ${e.message}`);
    }
  }

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
      "RemoteSigned",
      "-File",
      scriptPath,
      "-vks",
      vksString,
    ]).on("error", (err) => {
      console.error("  ✗ [shortcut] Failed to spawn simulation script:", err);
      if (mainWindow) {
        mainWindow.webContents.send(
          "execution-error",
          "Failed to start key simulator",
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

        case "exec_direct": {
          const terminal = getPreferredTerminal();
          if (process.platform === "win32") {
            const { exe, args } = win32Launch.splitWin32SpawnExeAndArgs(String(cmd).trim());
            const tail =
              args.length > 0
                ? `${win32Launch.quoteWin32CmdToken(exe)} ${args.map(win32Launch.quoteWin32CmdToken).join(" ")}`
                : win32Launch.quoteWin32CmdToken(exe);
            if (terminal === "wt.exe") {
              execCmd = `wt.exe -d . cmd /c ${tail}`;
            } else {
              execCmd = `${terminal} /c ${tail}`;
            }
          } else if (terminal === "wt.exe") {
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
        }
        case "exec_silent_spawn":
          return new Promise((resolve, reject) => {
            try {
              const { exe: spawnPath, args: spawnArgs } = win32Launch.splitWin32SpawnExeAndArgs(
                String(cmd || "").trim(),
              );

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
  const runAutoCommands = async (cmds, targetPath, openEmptyIfNoCmds = false, explicitWorkingDirectory) => {
    const commandsToRun = (cmds && Array.isArray(cmds) && cmds.length > 0) 
      ? cmds.filter(c => c && c.trim() !== "") 
      : [];
    
    // If we have no specific commands but openTerminal was requested, open one empty terminal
    const finalCmds = (commandsToRun.length === 0 && openEmptyIfNoCmds) ? [""] : commandsToRun;
    
    if (finalCmds.length === 0) return;
    
    const terminal = getPreferredTerminal();
    let workingDir = process.cwd();
    const resolvedWd = extractTerminalWorkingDir(explicitWorkingDirectory) || extractTerminalWorkingDir(targetPath);
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
      runAutoCommands(options.terminalCommands, resolvedCommand, options?.openTerminal, options?.workingDirectory);
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
          await runAutoCommands(options.terminalCommands, resolvedCommand, options?.openTerminal, options?.workingDirectory);
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
              await runAutoCommands(options?.terminalCommands, finalCommand, options?.openTerminal, options?.workingDirectory);
            }
            
            return;
          } catch (e) {
            diagLog(`[Exec] Mapped CLI silent spawn failed: ${e.message}. Falling back to original AUMID sequence.`);
          }
        }
        
        // Terminal cwd is derived from the full launch line (last quoted path = project folder).
        if (options?.openTerminal || (options?.terminalCommands && options.terminalCommands.length > 0)) {
          diagLog(`[Exec] IDE + terminal: resolving cwd from launch command`);
          await runAutoCommands(options.terminalCommands, finalCommand, options.openTerminal, options?.workingDirectory);
          skipTerminalAfterLaunchLoop = true;
        }
        
        resolvedCommand = originalAumidCommand;
        methodsToTry = ["exec_silent_spawn", "exec_start", "exec_direct", "shell.openPath", "exec_explorer_shell"];
      } else if (isShell && !finalCommand.includes(" ")) {
        methodsToTry = ["exec_explorer_shell", "exec_start", "exec_direct"];
        diagLog(`[Exec] Shell app (AUMID) detected: prioritizing explorer shell.`);
      } else if (isShell && finalCommand.includes(" ")) {
        methodsToTry = ["exec_start", "exec_direct", "exec_explorer_shell"];
        diagLog(`[Exec] Shell app with args: trying start / quoted paths first.`);
      } else {
        /** `exec_direct` passava o caminho inteiro ao cmd sem partir bem em espaços — preferir start/openPath. */
        methodsToTry = ["exec_start", "shell.openPath", "exec_direct"];
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
          await runAutoCommands(options.terminalCommands, resolvedCommand, options?.openTerminal, options?.workingDirectory);
        }
        console.log(`\n✓✓✓ EXEC_SUCCESS: Launched with '${method}' ✓✓✓\n`);
        return; // Success! Exit early
      } catch (err) {
        lastError = err;
        // Continue to next method
      }
    }

    // If we get here, all methods failed
    const finalError = `Failed to run "${resolvedCommand.substring(0, 50)}${resolvedCommand.length > 50 ? "..." : ""}". Error: ${lastError?.message || "Unknown"}`;
    console.error(`\n✗✗✗ EXEC_ABORT: ${finalError} ✗✗✗\n`);
    if (mainWindow) {
      mainWindow.webContents.send("execution-error", finalError);
    }
  } catch (err) {
    const finalError = `Unexpected error while running command: ${err.message}`;
    console.error(`\n✗✗✗ EXEC_ABORT: ${finalError} ✗✗✗\n`);
    if (mainWindow) {
      mainWindow.webContents.send("execution-error", finalError);
    }
  }
});

// IPC: Recebe comando para esconder janela
ipcMain.on("hide-window", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  clearRadialMouseBlocking();
  if (nativeWindowSizeMode === "small") {
    windowBuriedPassive = false;
    try {
      mainWindow.setIgnoreMouseEvents(true);
      applySmallModeCollapsedBounds(undefined);
      if (!mainWindow.isVisible()) mainWindow.showInactive();
      mainWindow.webContents.setBackgroundThrottling(true);
    } catch (e) {
      /* ignore */
    }
    return;
  }

  windowBuriedPassive = true;

  // Remove the native transparent surface completely. Opacity 0 + mouse forwarding still keeps
  // a layered HWND in the Windows input/composition path and can delay high-rate pointers.
  mainWindow.setIgnoreMouseEvents(true);
  mainWindow.hide();
  try {
    mainWindow.webContents.setBackgroundThrottling(true);
  } catch (e) {
    /* ignore */
  }
});

// IPC: Show Window explicitly
/** Helper persistente: arrancar um powershell por pedido custaria mais do que o utilizador demora a escrever. */
let foregroundFocusHelper = null;
let foregroundFocusHelperReady = false;
let pendingForegroundHwnd = null;
let foregroundStealBusyUntil = 0;

function foregroundFocusAssetPath() {
  const p = path.join(__dirname, "foreground-focus.ps1");
  return isDev ? p : p.replace("app.asar", "app.asar.unpacked");
}

function ensureForegroundFocusHelper() {
  if (process.platform !== "win32" || foregroundFocusHelper) return;
  foregroundFocusHelperReady = false;
  const child = spawn(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "RemoteSigned", "-File", foregroundFocusAssetPath()],
    { windowsHide: true },
  );
  foregroundFocusHelper = child;
  child.stdout.on("data", (data) => {
    const text = data.toString().trim();
    if (text.includes("READY")) {
      foregroundFocusHelperReady = true;
      if (pendingForegroundHwnd) {
        const hwnd = pendingForegroundHwnd;
        pendingForegroundHwnd = null;
        writeForegroundFocus(hwnd);
      }
      return;
    }
    diagLog(`[Foreground] ${text}`);
  });
  child.stderr.on("data", (data) => diagLog(`[Foreground] ${data.toString().trim()}`));
  child.on("exit", () => {
    if (foregroundFocusHelper === child) {
      foregroundFocusHelper = null;
      foregroundFocusHelperReady = false;
    }
  });
  child.on("error", (err) => diagLog(`[Foreground] falhou: ${err.message}`));
}

function writeForegroundFocus(hwnd) {
  if (!foregroundFocusHelper || !foregroundFocusHelperReady || !foregroundFocusHelper.stdin?.writable) {
    pendingForegroundHwnd = hwnd;
    return;
  }
  try {
    foregroundFocusHelper.stdin.write(`FOCUS ${hwnd}\n`);
  } catch (e) {
    diagLog(`[Foreground] escrita falhou: ${e.message}`);
  }
}

function stopForegroundFocusHelper() {
  pendingForegroundHwnd = null;
  if (!foregroundFocusHelper) return;
  const child = foregroundFocusHelper;
  foregroundFocusHelper = null;
  foregroundFocusHelperReady = false;
  try {
    if (child.stdin?.writable) child.stdin.write("EXIT\n");
  } catch (e) {
    /* ignore */
  }
  setTimeout(() => {
    try { if (!child.killed) child.kill(); } catch (e) { /* ignore */ }
  }, 200).unref?.();
}

/**
 * Windows aplica o foreground lock a quem não recebeu o último input: o radial é mostrado com
 * `showInactive()` e nem `focus()` nem `app.focus({ steal: true })` lhe dão teclado — as teclas
 * continuam a cair na app por baixo. Só partilhando a fila de input com a thread em primeiro plano
 * (no helper) é que `SetForegroundWindow` passa.
 */
function stealForegroundForMainWindow() {
  if (process.platform !== "win32") return;
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;
  const now = Date.now();
  if (now < foregroundStealBusyUntil) return;
  foregroundStealBusyUntil = now + 250;

  let hwnd;
  try {
    hwnd = mainWindow.getNativeWindowHandle().readBigUInt64LE(0).toString();
  } catch (e) {
    diagLog(`[Foreground] HWND indisponível: ${e.message}`);
    return;
  }
  ensureForegroundFocusHelper();
  writeForegroundFocus(hwnd);
}

/**
 * Superfícies com campo de texto (gate da licença) pedem o teclado explicitamente. O renderer só
 * envia isto quando `document.hasFocus()` é falso, portanto NÃO confiamos em `isFocused()` aqui:
 * o Electron reporta foco assim que `focus()` é chamado, mesmo quando o Windows o recusou — foi
 * exatamente essa leitura otimista que travava o roubo nativo e obrigava ao clique.
 */
/** Versão real do executável — o rodapé das definições mostra-a. */
/**
 * A app foi aberta pelo arranque do Windows?
 *
 * A varredura do Menu Iniciar é adiada 20 s para não competir com o login — nessa altura o disco
 * e o CPU estão saturados e uma sondagem em PowerShell deixa o sistema lento. Só que esse adiamento
 * aplicava-se SEMPRE, mesmo quando o utilizador abre a app à mão a meio do dia, e nesse caso ele
 * fica 20 s à espera de atalhos sem motivo nenhum. Saber a origem do arranque separa os dois casos.
 */
ipcMain.handle("was-opened-at-login", () => {
  try {
    return app.getLoginItemSettings().wasOpenedAtLogin === true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle("get-app-version", () => app.getVersion());

/**
 * O renderer esconde as linhas de atualização quando a app veio da Store — deixar lá um botão
 * "Check now" que devolve sempre erro é pior do que não ter botão nenhum.
 */
ipcMain.handle("get-build-channel", () => (isStoreBuild() ? "store" : "direct"));

/** Estado atual, para o painel se pintar mesmo que tenha aberto depois do evento. */
ipcMain.handle("get-update-state", () => lastKnownUpdate);

/**
 * Verificação a pedido. O arranque já verifica sozinho passados 10 s; isto é para quem quer
 * confirmar agora — e para dar uma resposta visível a quem carrega no botão.
 */
ipcMain.handle("check-for-updates", async () => {
  if (!app.isPackaged || process.platform !== "win32") {
    return { ok: false, code: "UNSUPPORTED", state: lastKnownUpdate.state };
  }
  /** Na Store o botão nem aparece; o guarda fica para o caso de alguém chamar o canal à mão. */
  if (isStoreBuild()) {
    return { ok: false, code: "STORE_BUILD", state: "idle" };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    const version = result?.updateInfo?.version;
    if (version && version !== app.getVersion()) {
      return { ok: true, state: "downloading", version };
    }
    return { ok: true, state: "current", version: app.getVersion() };
  } catch (error) {
    diagLog(`[Update] Manual check failed: ${error?.message || error}`);
    return { ok: false, code: "CHECK_FAILED", error: error?.message || String(error) };
  }
});

/** Reinício para instalar — o utilizador escolhe o momento, na linha das Definições. */
ipcMain.on("install-update-now", () => {
  if (isStoreBuild()) return;
  if (lastKnownUpdate.state !== "ready") return;
  diagLog("[Update] Instalação pedida pelo utilizador");
  updateInstallInProgress = true;

  /**
   * Parar os helpers ANTES de sair. O `will-quit` também os para, mas o `quitAndInstall` corre o
   * instalador assim que o processo termina, e um PowerShell órfão com um ficheiro da pasta de
   * instalação aberto chega para a substituição falhar.
   */
  stopMouseHookForShutdown();
  stopRadialMouseBlocker();
  stopForegroundFocusHelper();

  /**
   * `isForceRunAfter: true` — sem isto o NSIS instala e NÃO relança a app, obrigando o utilizador
   * a abri-la à mão. Uma app que vive na bandeja simplesmente desaparecia depois de atualizar.
   */
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.on("request-keyboard-focus", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  /** Antes do reveal a janela ainda está oculta; o renderer volta a pedir a seguir. */
  if (!mainWindow.isVisible()) return;
  try {
    windowBuriedPassive = false;
    mainWindow.setIgnoreMouseEvents(false);
    if (process.platform === "win32") {
      mainWindow.setAlwaysOnTop(true, "screen-saver", 1);
    }
    app.focus({ steal: true });
    mainWindow.moveTop();
    mainWindow.focus();
    mainWindow.webContents.focus();
  } catch (e) {
    /* ignore */
  }

  stealForegroundForMainWindow();
  /** O `focus()` do Electron só se reflete depois de o HWND ser mesmo o foreground. */
  const settle = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      mainWindow.focus();
      mainWindow.webContents.focus();
    } catch (e) {
      /* ignore */
    }
  }, 180);
  settle.unref?.();
});

ipcMain.on("show-window", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  windowBuriedPassive = false;

  try {
    mainWindow.webContents.setBackgroundThrottling(false);
  } catch (e) {
    /* ignore */
  }
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
  applyMousePolicyAfterReveal(mainWindow);
});

/** Force Chromium to schedule a full repaint — helps transparent/frameless windows on Windows after resize/show. */
ipcMain.handle("invalidate-paint", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    if (mainWindow.isMinimized()) return false;
  } catch (e) {
    return false;
  }
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

/** Área de conteúdo Web em coordenadas de ecrã — `window.screenX/Y` no renderer podem atrasar após windowed→small (ilha deslocada). */
ipcMain.handle("get-main-window-content-bounds", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  try {
    return mainWindow.getContentBounds();
  } catch (e) {
    return null;
  }
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
      exec(`powershell -NoProfile -ExecutionPolicy RemoteSigned -File "${tempPath}"`, (error, stdout) => {
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
      exec(`powershell -NoProfile -ExecutionPolicy RemoteSigned -File "${tempScriptPath}"`, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
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

/** Garante cliques no renderer após abrir widget/radial — limpa passthrough da ilha `small`. */
ipcMain.handle("ensure-window-interactive", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    if (typeof mainWindow.setShape === "function") {
      mainWindow.setShape([]);
    }
  } catch (e) {
    /* ignore */
  }
  lastWindowHitShapeKey = "__empty__";
  try {
    mainWindow.setIgnoreMouseEvents(false);
  } catch (e) {
    /* ignore */
  }
  return true;
});

/** Compatibilidade: a geometria estável já elimina a transição small↔fullscreen. */
let radialTransitionWarmed = false;
ipcMain.handle("warm-radial-transition", () => {
  if (radialTransitionWarmed) return true;
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    if (mainWindow.isMinimized()) return false;
  } catch (e) {
    return false;
  }
  if (nativeWindowSizeMode !== "small") {
    radialTransitionWarmed = true;
    return true;
  }

  /** `small` e radial já partilham os mesmos bounds; não há transição nativa a aquecer. */
  radialTransitionWarmed = true;
  return true;
});

/**
 * Repouso sem HUD: conserva apenas o quadrado compacto do radial, totalmente transparente e com
 * mouse passthrough. Não é uma camada do tamanho do monitor e não há hide/show/resize ao abrir.
 */
ipcMain.handle("collapse-idle-overlay", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    if (mainWindow.isMinimized()) return false;
  } catch (e) {
    return false;
  }
  /** Só em `small`: em fullscreen/windowed o radial ou um painel está a usar a janela. */
  if (nativeWindowSizeMode !== "small") return false;

  const cur = mainWindow.getBounds();
  const disp = screen.getPrimaryDisplay();
  const nb = smallModeBounds(disp.bounds);
  const key = JSON.stringify(nb);
  lastWindowHitShapeKey = key;
  try {
    if (typeof mainWindow.setShape === "function") mainWindow.setShape([]);
  } catch (e) {
    /* ignore */
  }
  try {
    mainWindow.setIgnoreMouseEvents(true);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (!mainWindow.isVisible()) mainWindow.showInactive();
    mainWindow.webContents.setBackgroundThrottling(true);
  } catch (e) {
    /* ignore */
  }
  if (!boundsApproxEqual(cur, nb)) {
    try {
      mainWindow.setBounds(nb);
    } catch (e) {
      /* ignore */
    }
  }
  windowBuriedPassive = false;
  diagLog("[Overlay] Repouso estável: superfície radial transparente e mouse passthrough.");
  return true;
});

/** Re-run `small` overlay (forward mouse) — refreshes Windows hit-testing after fullscreen → HUD-only. */
ipcMain.handle("reapply-small-overlay", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    if (mainWindow.isMinimized()) return false;
  } catch (e) {
    return false;
  }
  /** Widget / radial / painel — nunca regredir fullscreen|windowed → small (deixa cliques “presos” até o useEffect realinhar). */
  if (nativeWindowSizeMode === "fullscreen" || nativeWindowSizeMode === "windowed") {
    try {
      mainWindow.setIgnoreMouseEvents(false);
    } catch (e) {
      /* ignore */
    }
    return true;
  }
  /** Modo `small`: manter bounds do radial e superfície transparente estável. */
  try {
    mainWindow.setIgnoreMouseEvents(true);
    applySmallModeCollapsedBounds(undefined);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (!mainWindow.isVisible()) mainWindow.showInactive();
    mainWindow.webContents.setBackgroundThrottling(true);
  } catch (e) {
    /* ignore */
  }
  return true;
});

/**
 * Ilha: com `coordinateSpace: "screen"` encolhemos o HWND ao rect da ilha — fora disso o rato não
 * passa por uma janela topmost transparente a ecrã inteiro (cliques noutras apps deixam de “travar” o DWM).
 * Legado: coords de cliente + `setShape` em janela a ecrã inteiro.
 */
ipcMain.handle("set-window-hit-shape", (event, rects, opts = {}) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  try {
    if (mainWindow.isMinimized()) return false;
  } catch (e) {
    return false;
  }
  const coordinateSpace =
    opts && opts.coordinateSpace === "screen" ? "screen" : "client";

  try {
    if (!rects || !Array.isArray(rects) || rects.length === 0) {
      if (lastWindowHitShapeKey === "__empty__") return true;
      lastWindowHitShapeKey = "__empty__";
      if (typeof mainWindow.setShape === "function") {
        try {
          mainWindow.setShape([]);
        } catch (e) {
          /* ignore */
        }
      }
      /*
       * Só em modo `small` o rato deve reencaminhar por defeito. Em fullscreen (radial), limpar a
       * ilha compacta desmonta o HUD e envia [] — não podemos aplicar forward aqui senão o menu radial
       * fica “invisível” ao clique e parece um retângulo minúsculo atrás da ilha.
       *
       * `setImmediate`: o renderer pode enviar `set-window-size` `windowed` no mesmo tick (abrir dashboard).
       * Se expandirmos já para o monitor inteiro antes, o DWM mostra um retângulo a piscar. Adiar o expand.
       */
      try {
        if (nativeWindowSizeMode === "fullscreen" || nativeWindowSizeMode === "windowed") {
          mainWindow.setIgnoreMouseEvents(false);
        } else {
          setImmediate(() => {
            try {
              if (!mainWindow || mainWindow.isDestroyed()) return;
              if (mainWindow.isMinimized()) return;
              if (nativeWindowSizeMode !== "small") return;
              mainWindow.setIgnoreMouseEvents(true);
              applySmallModeCollapsedBounds(undefined);
              if (!mainWindow.isVisible()) mainWindow.showInactive();
            } catch (e) {
              /* ignore */
            }
          });
        }
      } catch (e) {
        /* ignore */
      }
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
      return true;
    }

    if (nativeWindowSizeMode === "small" && coordinateSpace === "screen") {
      const u = unionScreenRects(rects);
      if (!u || u.width < 3 || u.height < 3) return false;
      const center = { x: u.x + u.width / 2, y: u.y + u.height / 2 };
      const disp = screen.getDisplayNearestPoint(center);
      const nb = clampBoundsToWorkArea(u, disp.workArea);
      const key = JSON.stringify(nb);
      if (key === lastWindowHitShapeKey) return true;
      const cur = mainWindow.getBounds();
      lastWindowHitShapeKey = key;
      if (!boundsApproxEqual(cur, nb)) {
        mainWindow.setBounds(nb);
      }
      try {
        if (typeof mainWindow.setShape === "function") {
          mainWindow.setShape([]);
        }
      } catch (e) {
        /* ignore */
      }
      try {
        mainWindow.setIgnoreMouseEvents(false);
      } catch (e) {
        /* ignore */
      }
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
      return true;
    }

    if (typeof mainWindow.setShape !== "function") return false;
    const normalized = rects.map((r) => ({
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.max(1, Math.round(r.width)),
      height: Math.max(1, Math.round(r.height)),
    }));
    const key = JSON.stringify(normalized);
    if (key === lastWindowHitShapeKey) return true;
    lastWindowHitShapeKey = key;
    try {
      mainWindow.setIgnoreMouseEvents(false);
    } catch (e) {
      /* ignore */
    }
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

    // Clear both pre-rebrand profiles so a factory reset cannot migrate stale data back.
    try {
      const appData = app.getPath("appData");
      for (const legacyName of ["Zenith OS", "zenith-radial-menu"]) {
        const legacyDir = path.join(appData, legacyName);
        for (const f of ["config-v2.json", "config-v2.json.bak", "settings.json"]) {
          const legacy = path.join(legacyDir, f);
          if (fs.existsSync(legacy)) {
            fs.unlinkSync(legacy);
            diagLog(`[Reset] Deleted legacy ${f} from ${legacyName}`);
          }
        }
      }
    } catch (le) {
      diagLog(`[Reset] Legacy cleanup error (non-fatal): ${le.message}`);
    }

    // Clear Electron session storage (Local Storage, IndexedDB, Cache, etc.)
    const { session } = require('electron');
    await session.defaultSession.clearStorageData();
    diagLog("[Reset] Cleared browser session data (Local Storage, etc.)");

    // Clear internal caches
    iconCache.clear();
    markIconCacheDirty();
    gameModeConfig = {
      enabled: false,
      mode: "list",
      blockedApps: "",
      autoDetectGames: false,
    };

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

// Bump whenever extract-icon.ps1 changes how icons are produced, so cached
// entries rendered by the old pipeline are dropped instead of outliving it.
const ICON_PIPELINE_VERSION = 7;
const ICON_CACHE_MAX_ENTRIES = 600;

/**
 * Remove os ícones nativos já gravados na config em disco, para a cura os voltar a resolver.
 * Atalhos web (`http…`) mantêm o favicon: não vêm do pipeline do Windows.
 */
function stripStaleNativeIcons(configFilePath) {
  let removed = 0;
  try {
    const blob = JSON.parse(fs.readFileSync(configFilePath, "utf-8"));
    const isWebShortcut = (item) =>
      item.commandType === "url" || /^https?:/i.test(String(item.command || ""));

    const walk = (items) => {
      if (!Array.isArray(items)) return;
      for (const item of items) {
        if (item && item.customIconUrl && !isWebShortcut(item)) {
          delete item.customIconUrl;
          removed += 1;
        }
        if (item && Array.isArray(item.children)) walk(item.children);
      }
    };
    const walkWorkspaces = (workspaces) => {
      if (!Array.isArray(workspaces)) return;
      for (const ws of workspaces) walk(ws && ws.apps);
    };

    walkWorkspaces(blob.workspaces);
    walkWorkspaces(blob.config && blob.config.workspaces);
    walk(blob.apps);

    if (removed > 0) {
      const tempPath = `${configFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(blob, null, 2), "utf-8");
      fs.renameSync(tempPath, configFilePath);
    }
  } catch (e) {
    diagLog(`[Import] Não foi possível limpar ícones antigos: ${e.message}`);
  }
  return removed;
}

const loadIconCache = () => {
  try {
    if (fs.existsSync(iconCachePath)) {
      const data = JSON.parse(fs.readFileSync(iconCachePath, "utf-8"));
      if (data && data.__pipelineVersion === ICON_PIPELINE_VERSION && data.icons) {
        iconCache = new Map(Object.entries(data.icons));
        while (iconCache.size > ICON_CACHE_MAX_ENTRIES) {
          const oldest = iconCache.keys().next().value;
          if (!oldest) break;
          iconCache.delete(oldest);
        }
        diagLog(`[IconCache] Loaded ${iconCache.size} icons from disk`);
      } else {
        iconCache = new Map();
        diagLog("[IconCache] Discarded cache from an older icon pipeline");
      }
    }
  } catch (e) {
    diagLog(`[IconCache] Failed to load icon cache: ${e.message}`);
  }
};

/**
 * O cache é o maior ficheiro da app (ícones em data URL) e era reescrito por inteiro a cada
 * minuto, houvesse ou não ícones novos — só se resolvem ícones ao descobrir apps, portanto a
 * esmagadora maioria dessas escritas gravava exatamente o mesmo conteúdo.
 * Marcar como sujo custa uma atribuição; a escrita passou a assíncrona pelo mesmo motivo da config.
 */
let iconCacheDirty = false;
let iconCacheWriting = false;
let iconCacheSaveTimer = null;

const scheduleIconCacheSave = () => {
  if (!iconCacheDirty || iconCacheSaveTimer) return;
  iconCacheSaveTimer = setTimeout(() => {
    iconCacheSaveTimer = null;
    saveIconCache();
  }, 15000);
  iconCacheSaveTimer.unref?.();
};

const markIconCacheDirty = () => {
  iconCacheDirty = true;
  scheduleIconCacheSave();
};

const rememberFileIcon = (filePath, data) => {
  iconCache.delete(filePath);
  iconCache.set(filePath, { data });
  while (iconCache.size > ICON_CACHE_MAX_ENTRIES) {
    const oldest = iconCache.keys().next().value;
    if (!oldest) break;
    iconCache.delete(oldest);
  }
  markIconCacheDirty();
};

const saveIconCache = ({ sync = false } = {}) => {
  if (iconCacheWriting && !sync) return;
  if (!iconCacheDirty) return;
  if (iconCacheSaveTimer) {
    clearTimeout(iconCacheSaveTimer);
    iconCacheSaveTimer = null;
  }
  try {
    const data = {
      __pipelineVersion: ICON_PIPELINE_VERSION,
      icons: Object.fromEntries(iconCache),
    };
    const json = JSON.stringify(data);
    /** Limpo antes da escrita: um `set` que chegue durante o I/O tem de sujar outra vez. */
    iconCacheDirty = false;
    /** `will-quit`: assíncrono aqui perdia-se — o processo sai antes do callback. */
    if (sync) {
      fs.writeFileSync(iconCachePath, json);
      return;
    }
    iconCacheWriting = true;
    fs.writeFile(iconCachePath, json, (err) => {
      iconCacheWriting = false;
      if (err) {
        iconCacheDirty = true;
        diagLog(`[IconCache] Failed to save icon cache: ${err.message}`);
      }
      if (iconCacheDirty) scheduleIconCacheSave();
    });
  } catch (e) {
    iconCacheWriting = false;
    iconCacheDirty = true;
    diagLog(`[IconCache] Failed to save icon cache: ${e.message}`);
  }
};

/** In-memory favicon data URLs — hostname lowercased */
const faviconDataUrlCache = new Map();
const FAVICON_CACHE_MAX_ENTRIES = 128;

const rememberFavicon = (hostname, dataUrl) => {
  faviconDataUrlCache.delete(hostname);
  faviconDataUrlCache.set(hostname, dataUrl);
  while (faviconDataUrlCache.size > FAVICON_CACHE_MAX_ENTRIES) {
    const oldest = faviconDataUrlCache.keys().next().value;
    if (!oldest) break;
    faviconDataUrlCache.delete(oldest);
  }
};

function sniffImageMimeFromBuffer(buf) {
  if (!buf || buf.length < 4) return "image/png";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (
    buf[0] === 0x00 &&
    buf[1] === 0x00 &&
    buf[2] === 0x01 &&
    buf[3] === 0x00
  )
    return "image/x-icon";
  if (
    buf[0] === 0x00 &&
    buf[1] === 0x00 &&
    buf[2] === 0x02 &&
    buf[3] === 0x00
  )
    return "image/x-icon";
  return "image/png";
}

function fetchUrlBodyBuffer(targetUrl, maxBytes = 524288, redirectDepth = 0) {
  return new Promise((resolve) => {
    if (redirectDepth > 8) return resolve(null);
    let lib;
    try {
      const u = new URL(targetUrl);
      lib = u.protocol === "http:" ? http : https;
    } catch {
      return resolve(null);
    }
    const req = lib.get(
      targetUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Rovyl/1.0; +https://github.com)",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        timeout: 12000,
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          let next;
          try {
            next = new URL(res.headers.location, targetUrl).href;
          } catch {
            res.resume();
            return resolve(null);
          }
          res.resume();
          fetchUrlBodyBuffer(next, maxBytes, redirectDepth + 1).then(resolve);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        const chunks = [];
        let len = 0;
        res.on("data", (d) => {
          len += d.length;
          if (len > maxBytes) {
            req.destroy();
            resolve(null);
          } else chunks.push(d);
        });
        res.on("end", () => {
          if (!chunks.length) resolve(null);
          else resolve(Buffer.concat(chunks));
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

/** Evita <img src=https://…> no renderer (muitas vezes bloqueado); devolve data URL. */
ipcMain.handle("get-website-favicon-data-url", async (_event, pageUrl) => {
  try {
    let hostname;
    try {
      let s = String(pageUrl || "").trim();
      if (!s) return null;
      if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
      hostname = new URL(s).hostname;
    } catch {
      return null;
    }
    if (!hostname) return null;
    const hostKey = hostname.toLowerCase();
    if (faviconDataUrlCache.has(hostKey)) {
      return faviconDataUrlCache.get(hostKey);
    }

    const candidates = [
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`,
      `https://icons.duckduckgo.com/ip3/${encodeURIComponent(hostname)}.ico`,
    ];

    for (const u of candidates) {
      const buf = await fetchUrlBodyBuffer(u);
      if (!buf || buf.length < 16) continue;
      const mime = sniffImageMimeFromBuffer(buf);
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      rememberFavicon(hostKey, dataUrl);
      diagLog(`[Favicon] ${hostname} ok (${mime}, ${buf.length}b)`);
      return dataUrl;
    }
    diagLog(`[Favicon] no image for ${hostname}`);
    return null;
  } catch (e) {
    diagLog(`[Favicon] error: ${e.message}`);
    return null;
  }
});

// Each extraction is its own PowerShell process (~1.3s, mostly Add-Type
// compiling the interop shim). A picker showing dozens of rows would otherwise
// spawn dozens of them at once and thrash the machine.
const ICON_EXTRACTION_CONCURRENCY = 4;
let activeIconExtractions = 0;
const iconExtractionQueue = [];

const runQueuedIconExtractions = () => {
  while (
    activeIconExtractions < ICON_EXTRACTION_CONCURRENCY &&
    iconExtractionQueue.length
  ) {
    const job = iconExtractionQueue.shift();
    activeIconExtractions++;
    job()
      .then(job.resolve, job.reject)
      .finally(() => {
        activeIconExtractions--;
        runQueuedIconExtractions();
      });
  }
};

const enqueueIconExtraction = (job) =>
  new Promise((resolve, reject) => {
    job.resolve = resolve;
    job.reject = reject;
    iconExtractionQueue.push(job);
    runQueuedIconExtractions();
  });

/** Deduplicates concurrent requests for the same target. */
const inFlightIconRequests = new Map();

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

    if (inFlightIconRequests.has(filePath)) {
      return inFlightIconRequests.get(filePath);
    }
    const pending = extractIconUncached(filePath).finally(() =>
      inFlightIconRequests.delete(filePath),
    );
    inFlightIconRequests.set(filePath, pending);
    return pending;
  } catch (error) {
    diagLog(`[IconRequest] Critical error in get-file-icon for ${filePath}: ${error.message}`);
    console.error("Critical error in get-file-icon:", error);
    return null;
  }
});

async function extractIconUncached(filePath) {
  try {
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

    // 2. PowerShell extraction is the primary path for every target type.
    // app.getFileIcon returns a small, unnormalized shell icon, so mixing it in
    // for file paths made those apps render at a different size and resolution
    // than the packaged apps that always came through the script.
    // spawn + argv, so AUMIDs like Microsoft.X_y!App are not mangled by cmd.exe.
    const psScript = getAssetPath("extract-icon.ps1");
    diagLog(`[IconRequest] Trying PowerShell extraction for ${resolvedPath}`);

    const iconData = await enqueueIconExtraction(() => new Promise((resolve) => {
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
        ["-NoProfile", "-ExecutionPolicy", "RemoteSigned", "-File", psScript, "-Target", resolvedPath],
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
    }));

    if (iconData) {
      diagLog(`[IconRequest] Success via PowerShell for ${filePath}`);
      rememberFileIcon(filePath, iconData);
      return iconData;
    }

    // 3. Last resort, file paths only. An AUMID means nothing to getFileIcon —
    // it yields the generic unknown-file icon, which reads as a wrong icon
    // rather than a missing one, so let the UI draw its own placeholder.
    if (isAUMID || !isExplicitFile) {
      diagLog(`[IconRequest] No icon available for ${filePath}`);
      return null;
    }
    diagLog(`[IconRequest] Falling back to generic Native extraction for ${resolvedPath}`);
    try {
      const icon = await app.getFileIcon(resolvedPath, { size: "large" });
      const dataUrl = icon.toDataURL();
      diagLog(`[IconRequest] Final fallback success for ${resolvedPath}`);
      rememberFileIcon(filePath, dataUrl);
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
}

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

    const command = `powershell -NoProfile -ExecutionPolicy RemoteSigned -Command "${psScript
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
  /** Primeiro os helpers: enquanto viverem, o instalador não consegue tocar na pasta. */
  stopMouseHookForShutdown();
  stopRadialMouseBlocker();
  stopForegroundFocusHelper();
  saveIconCache({ sync: true });
  globalShortcut.unregisterAll();
});
