/**
 * Windows launch-line parsing & canonicalization.
 * Prevents `C:\Program Files\...` from being split at the first space (→ `C:\Program` + garbage).
 */
"use strict";

const fs = require("fs");

/**
 * Split the tail of a Windows command line into argv tokens (quoted runs and space-separated words).
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

/** Quote one argv token for `cmd /c` when it contains spaces or special chars. */
function quoteWin32CmdToken(token) {
  if (token == null || token === "") return '""';
  const t = String(token);
  if (/^[a-zA-Z0-9._+=@-]+$/i.test(t)) return t;
  return `"${t.replace(/"/g, '\\"')}"`;
}

/**
 * Split unquoted Windows command lines into exe + argv without breaking at the first space in
 * `C:\Program Files\...`.
 */
function splitWin32SpawnExeAndArgs(cmd) {
  const t = (cmd || "").trim();
  if (!t) return { exe: "", args: [] };
  if (t.startsWith('"')) {
    const end = t.indexOf('"', 1);
    if (end > 0) {
      const exe = t.slice(1, end);
      const rest = t.slice(end + 1).trim();
      return { exe, args: parseWin32CommandLineArgs(rest) };
    }
    return { exe: t, args: [] };
  }
  if (!t.includes(" ")) return { exe: t, args: [] };

  const parts = t.split(" ");
  let bestExe = null;
  let bestEndIdx = 0;
  for (let i = 1; i <= parts.length; i++) {
    const candidate = parts.slice(0, i).join(" ");
    try {
      if (fs.existsSync(candidate)) {
        const st = fs.statSync(candidate);
        if (st.isFile()) {
          bestExe = candidate;
          bestEndIdx = i;
        }
      }
    } catch (_) {
      /* ignore */
    }
  }
  if (bestExe != null) {
    const rest = parts.slice(bestEndIdx).join(" ");
    return { exe: bestExe, args: parseWin32CommandLineArgs(rest) };
  }
  const sp = t.indexOf(" ");
  return {
    exe: t.slice(0, sp),
    args: parseWin32CommandLineArgs(t.slice(sp + 1)),
  };
}

/** Quote argv piece only when needed (stable disk + cmd /c). */
function quoteWin32ArgIfNeeded(s) {
  if (s == null || s === "") return "";
  let str = String(s);
  if (str.length >= 2 && str.startsWith('"') && str.endsWith('"')) {
    str = str.slice(1, -1);
  }
  if (!/[\s&()[\]{}^=!;`+,]/.test(str)) return str;
  return `"${str.replace(/"/g, '\\"')}"`;
}

/**
 * Rebuild a launch line from parsed exe+argv so paths with spaces are always quoted.
 * Idempotent for most lines; skips URLs, internal:, shell:, and obvious AUMIDs without drive paths.
 */
function canonicalizeWin32LaunchCommand(cmd) {
  if (typeof process === "undefined" || process.platform !== "win32") {
    return String(cmd || "").trim();
  }
  const t = String(cmd || "").trim();
  if (!t) return t;
  if (t.startsWith("internal:")) return t;
  if (/^https?:\/\//i.test(t) || /^(steam|discord|spotify|mailto):/i.test(t)) return t;
  if (/^shell:/i.test(t)) return t;
  // Store / protocol AUMIDs (no "X:\" path) — do not rewrite
  if (/!/.test(t) && !/^[a-zA-Z]:\\|^\\\\|^"/.test(t)) return t;

  const { exe, args } = splitWin32SpawnExeAndArgs(t);
  if (!exe) return t;
  const parts = [quoteWin32ArgIfNeeded(exe), ...args.map(quoteWin32ArgIfNeeded)].filter(Boolean);
  const out = parts.join(" ");
  return out || t;
}

function walkAppTree(apps, visitor) {
  if (!Array.isArray(apps)) return;
  for (const app of apps) {
    if (!app || typeof app !== "object") continue;
    visitor(app);
    if (Array.isArray(app.children)) walkAppTree(app.children, visitor);
  }
}

/**
 * Normalize all workspace (and legacy flat) app commands before writing config to disk
 * or after reading — keeps stored lines safe for cmd/spawn.
 */
function normalizePersistedPayloadWin32(payload) {
  if (typeof process === "undefined" || process.platform !== "win32" || !payload) {
    return payload;
  }
  const touch = (app) => {
    const cmd = app.command;
    if (!cmd || typeof cmd !== "string") return;
    const ct = app.commandType || (app.type === "url" ? "url" : "app");
    if (ct !== "app") return;
    if (cmd.startsWith("internal:")) return;
    const next = canonicalizeWin32LaunchCommand(cmd);
    if (next !== cmd) app.command = next;
  };

  if (payload.config && Array.isArray(payload.config.workspaces)) {
    for (const ws of payload.config.workspaces) {
      if (ws.apps) walkAppTree(ws.apps, touch);
    }
  }
  if (Array.isArray(payload.apps)) walkAppTree(payload.apps, touch);
  return payload;
}

module.exports = {
  parseWin32CommandLineArgs,
  quoteWin32CmdToken,
  splitWin32SpawnExeAndArgs,
  canonicalizeWin32LaunchCommand,
  normalizePersistedPayloadWin32,
};
