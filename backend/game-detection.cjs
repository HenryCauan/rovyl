"use strict";

const fs = require("fs");
const path = require("path");

const GAME_PATH_MARKERS = [
  "\\steamapps\\common\\",
  "\\epic games\\",
  "\\gog galaxy\\games\\",
  "\\gog games\\",
  "\\xboxgames\\",
  "\\riot games\\",
  "\\ea games\\",
  "\\ubisoft game launcher\\games\\",
];

const LAUNCHER_EXECUTABLES = new Set([
  "steam.exe",
  "epicgameslauncher.exe",
  "goggalaxy.exe",
  "galaxyclient.exe",
  "battle.net.exe",
  "riotclientservices.exe",
  "riotclientux.exe",
  "eadesktop.exe",
  "ealauncher.exe",
  "ubisoftconnect.exe",
  "upc.exe",
  "uplay.exe",
  "xboxapp.exe",
  "gamingservices.exe",
]);

const ENGINE_MARKER_FILES = [
  "steam_api64.dll",
  "steam_api.dll",
  "UnityPlayer.dll",
  "GameAssembly.dll",
  "EOSSDK-Win64-Shipping.dll",
  "EOSSDK-Win32-Shipping.dll",
  "Galaxy64.dll",
  "Galaxy.dll",
];

function normalizedWindowsPath(value) {
  return String(value || "").trim().replace(/\//g, "\\").toLowerCase();
}

function hasEngineMarkerNearExecutable(exePath) {
  if (!exePath || !path.isAbsolute(exePath)) return false;
  let dir = path.dirname(exePath);
  for (let depth = 0; depth < 3; depth += 1) {
    for (const marker of ENGINE_MARKER_FILES) {
      try {
        if (fs.existsSync(path.join(dir, marker))) return true;
      } catch (_) {
        // Access denied in protected install folders is a normal negative result.
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

function detectGameExecutable({ exePath, cmdline = "" } = {}) {
  const normalized = normalizedWindowsPath(exePath);
  if (!normalized || !normalized.endsWith(".exe")) return false;

  const base = path.win32.basename(normalized);
  if (LAUNCHER_EXECUTABLES.has(base)) return false;

  if (GAME_PATH_MARKERS.some((marker) => normalized.includes(marker))) return true;
  if (/\\engine\\binaries\\win(?:32|64)\\/.test(normalized)) return true;
  if (/(?:-win(?:32|64)-shipping|\.win(?:32|64)\.shipping)\.exe$/.test(base)) return true;

  const command = String(cmdline || "").toLowerCase();
  if (
    command.includes("steam_appid") ||
    command.includes("-epicapp=") ||
    command.includes("-epicportal") ||
    command.includes("-fromfl=eac")
  ) {
    return true;
  }

  return hasEngineMarkerNearExecutable(exePath);
}

module.exports = {
  detectGameExecutable,
  normalizedWindowsPath,
};
