import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const projectRoot = process.cwd();
const explicitOutput = process.env.ZENITH_BUILD_OUTPUT;
const defaultLocalBase =
  process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");

const outputDir =
  explicitOutput ||
  (projectRoot.toLowerCase().includes("onedrive")
    ? path.join(defaultLocalBase, "Zenith OS", "build-out")
    : path.join(projectRoot, "build-out"));

console.log(`electron-builder output: ${outputDir}`);

const child = spawn(
  process.execPath,
  [
    path.join(projectRoot, "node_modules", "electron-builder", "cli.js"),
    `--config.directories.output=${outputDir}`,
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
