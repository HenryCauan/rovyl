const { spawn } = require("child_process");
const electron = require("electron");
const path = require("path");

// CRITICAL FIX: Unset ELECTRON_RUN_AS_NODE to prevent Electron from running as a plain Node process.
// This allows Electron to load its internal API (app, BrowserWindow, etc.) correctly.
if (process.env.ELECTRON_RUN_AS_NODE) {
  console.log("Sanitizing environment: Removing ELECTRON_RUN_AS_NODE");
  delete process.env.ELECTRON_RUN_AS_NODE;
}

const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: process.env,
  cwd: path.join(__dirname, ".."), // Ensure cwd is project root
});

child.on("close", (code) => {
  console.log(`Electron process exited with code ${code}`);
  process.exit(code);
});
