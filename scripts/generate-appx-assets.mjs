/**
 * Tiles do pacote MSIX. O electron-builder tem assets por omissão, mas são placeholders vazios —
 * quem instalasse ficava com um quadrado branco no Menu Iniciar, e a ficha na Microsoft Store
 * mostra o ícone tirado DO PACOTE, não das imagens da listagem.
 *
 * Gera build/appx/* a partir de public/icon.png antes do electron-builder correr.
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public", "icon.png");
const outDir = join(root, "build", "appx");

if (!existsSync(source)) {
  console.error(`generate-appx-assets: missing ${source}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

/** Igual ao `backgroundColor` em build.appx — o tile largo precisa de preencher o que sobra. */
const BACKGROUND = { r: 0x10, g: 0x10, b: 0x14, alpha: 1 };

/** Quadrados: o ícone já traz a sua própria moldura, por isso vai de bordo a bordo. */
const squares = [
  ["Square44x44Logo.png", 44],
  ["Square71x71Logo.png", 71],
  ["Square150x150Logo.png", 150],
  ["Square310x310Logo.png", 310],
  ["StoreLogo.png", 50],
];

/**
 * Tiles largos: o ícone é quadrado, portanto centra-se sobre o fundo em vez de ser esticado.
 * Deixa-se margem para o ícone não encostar às arestas.
 */
const wides = [
  ["Wide310x150Logo.png", 310, 150],
];

for (const [name, size] of squares) {
  await sharp(source).resize(size, size, { fit: "contain", background: BACKGROUND }).png().toFile(join(outDir, name));
  console.log(`generate-appx-assets: ${name} (${size}x${size})`);
}

for (const [name, width, height] of wides) {
  const inner = Math.round(height * 0.72);
  const icon = await sharp(source).resize(inner, inner, { fit: "contain", background: BACKGROUND }).png().toBuffer();
  await sharp({ create: { width, height, channels: 4, background: BACKGROUND } })
    .composite([{ input: icon, gravity: "centre" }])
    .png()
    .toFile(join(outDir, name));
  console.log(`generate-appx-assets: ${name} (${width}x${height}, ícone ${inner}px centrado)`);
}

console.log(`generate-appx-assets: wrote ${outDir}`);
