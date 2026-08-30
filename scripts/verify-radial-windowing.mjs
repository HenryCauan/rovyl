/**
 * Falha se o contrato radial ↔ main (prep antes de open-menu / covers) for removido por engano.
 * Atualiza os arrays abaixo se refatorares de propósito — mantém em sync com .cursor/rules/zenith-radial-windowing.mdc
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const checks = [
  {
    file: join(root, "backend", "electron-main.js"),
    mustInclude: [
      "zenith-verify:radial-handshake-main",
      "prepare-radial-show",
      "radial-prep-paint-done",
      "open-menu",
      "radial-open-paint-done",
      "radial-native-revealed",
      "Repouso estável: superfície radial transparente",
    ],
    mustNotInclude: [
      "mainWindow.setOpacity(0.01)",
      "setImmediate(invalidatePaintSafe)",
      "IDLE_OVERLAY_COLLAPSED_SIZE",
    ],
  },
  {
    file: join(root, "backend", "electron-preload.js"),
    mustInclude: [
      "zenith-verify:radial-handshake-preload",
      "onPrepareRadialShow",
      "notifyRadialPrepPaintDone",
      "notifyRadialOpenPaintDone",
      "onRadialNativeRevealed",
    ],
  },
  {
    file: join(root, "src", "App.tsx"),
    mustInclude: [
      "zenith-verify:radial-handshake-renderer",
      "radialPreShowSolidCover",
      "onPrepareRadialShow",
      "flushNeutralFrameThenMinimize",
      "closeMenuFromTrigger",
      "radialTriggerGenerationRef",
      "closeOnly",
      "notifyRadialOpenPaintDone",
      "radialPendingPaintToken",
      "radialNativeRevealToken",
    ],
  },
  {
    file: join(root, "src", "components", "RadialMenu.tsx"),
    mustInclude: [
      "animationReady",
      "isOpen && bloom",
      "setBloom(false)",
    ],
  },
];

let failed = false;
for (const { file, mustInclude, mustNotInclude = [] } of checks) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    console.error(`verify-radial-windowing: missing file ${file}`);
    failed = true;
    continue;
  }
  for (const needle of mustInclude) {
    if (!text.includes(needle)) {
      console.error(
        `verify-radial-windowing: ${file} must include "${needle}" (radial windowing contract — see .cursor/rules/zenith-radial-windowing.mdc).`,
      );
      failed = true;
    }
  }
  for (const needle of mustNotInclude) {
    if (text.includes(needle)) {
      console.error(
        `verify-radial-windowing: ${file} must not include "${needle}" (it can expose a stale DWM frame after the painted radial handshake).`,
      );
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
