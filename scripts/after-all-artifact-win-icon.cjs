/**
 * O target `portable` gera um .exe à parte do win-unpacked — esse wrapper também precisa de rcedit,
 * senão mantém o ícone do Electron na pesquisa/atalhos quando o utilizador usa só o portable.
 */
const fs = require("fs");
const path = require("path");
const rcedit = require("rcedit");

module.exports = async function afterAllArtifactWinIcon(buildResult) {
  if (process.platform !== "win32") return;

  const iconPath = path.join(__dirname, "..", "build", "icon.ico");
  if (!fs.existsSync(iconPath)) {
    console.warn("after-all-artifact-win-icon: skip — build/icon.ico missing");
    return;
  }

  const raw =
    buildResult?.artifactPaths ||
    buildResult?.artifactPathsResolved ||
    /** @type {any} */ (buildResult)?.artifacts;
  const fromHook = Array.isArray(raw) ? raw.filter((p) => typeof p === "string") : [];

  const outDir = typeof buildResult?.outDir === "string" ? buildResult.outDir : null;
  const fromDir = [];
  if (outDir && fs.existsSync(outDir)) {
    try {
      for (const f of fs.readdirSync(outDir)) {
        if (!f.endsWith(".exe")) continue;
        const lower = f.toLowerCase();
        if (lower.includes("setup")) continue;
        fromDir.push(path.join(outDir, f));
      }
    } catch {
      /* ignore */
    }
  }

  const toPatch = [...new Set([...fromHook, ...fromDir])];

  for (const artifactPath of toPatch) {
    if (!artifactPath.endsWith(".exe")) continue;
    const base = path.basename(artifactPath).toLowerCase();
    if (base.includes("setup") || base.includes("installer")) continue;
    try {
      await rcedit(artifactPath, { icon: iconPath });
      console.log(`after-all-artifact-win-icon: patched ${artifactPath}`);
    } catch (e) {
      console.warn(`after-all-artifact-win-icon: ${artifactPath}: ${e.message}`);
    }
  }
};
