/**
 * Hero art da Microsoft Store: a roda do Rovyl desenhada de raiz, a 1920x1080 nativos.
 *
 * A versão anterior era um recorte de uma captura, ampliado 2,57x — lia-se como cortado porque
 * era. Aqui a cena é composta à medida do quadro: o gradiente ocupa-o inteiro, a roda tem a
 * escala que um banner pede, e nada é interpolado.
 *
 * Regras da Store respeitadas: sem texto de espécie alguma, detalhe ao centro, nada de essencial
 * no terço inferior (a Store aplica lá um gradiente), e espaço vazio minimizado.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public", "icon.png");
const outDir = process.argv[2] || join(root, "build", "hero");
mkdirSync(outDir, { recursive: true });

const W = 1920;
const H = 1080;
const CX = W / 2;
const CY = H * 0.44;

const TILE = 96;
const RADIUS = 214;
const HUB = 136;

/** Glifos de contorno, no espaço 24x24 do Lucide, desenhados centrados em cada mosaico. */
const GLYPHS = [
  "M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z",
  "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z",
  "m4 17 6-6-6-6M12 19h8",
  "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z",
  "M6 12h4m-2-2v4m7 1h.01M18 10h.01M17.32 5H6.68a4 4 0 0 0-3.98 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258A4 4 0 0 0 17.32 5Z",
];

const tiles = GLYPHS.map((d, i) => {
  const angle = ((i * (360 / GLYPHS.length)) - 90) * (Math.PI / 180);
  const x = CX + RADIUS * Math.cos(angle);
  const y = CY + RADIUS * Math.sin(angle);
  const scale = TILE / 24 * 0.46;
  return `
    <g>
      <rect x="${x - TILE / 2}" y="${y - TILE / 2}" width="${TILE}" height="${TILE}" rx="27"
        fill="#141416" stroke="rgba(255,255,255,.16)" stroke-width="1.5"/>
      <g transform="translate(${x - 12 * scale} ${y - 12 * scale}) scale(${scale})"
         fill="none" stroke="#f2f2f0" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="${d}"/>
      </g>
    </g>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="bg" cx="10%" cy="88%" r="112%">
      <stop offset="0%" stop-color="#ffab08"/>
      <stop offset="18%" stop-color="#ff6a00"/>
      <stop offset="38%" stop-color="#d02200"/>
      <stop offset="58%" stop-color="#6e0d00"/>
      <stop offset="78%" stop-color="#1d0300"/>
      <stop offset="100%" stop-color="#050506"/>
    </radialGradient>
    <radialGradient id="dim" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(0,0,0,.55)"/>
      <stop offset="62%" stop-color="rgba(0,0,0,.32)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="42%" stop-color="rgba(255,255,255,.30)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${CX}" cy="${CY}" r="470" fill="url(#dim)"/>
  ${tiles}
  <circle cx="${CX}" cy="${CY}" r="${HUB * 0.86}" fill="url(#halo)"/>
  <circle cx="${CX}" cy="${CY}" r="${HUB / 2}" fill="#ffffff"/>
</svg>`;

/**
 * O hub é branco com a marca escura, como na app quando está aceso.
 *
 * Inverter o ícone inteiro não serve: o fundo escuro vira cinzento-claro, não branco, e desenha
 * um quadrado visível dentro do círculo. Aqui usa-se a LUMINÂNCIA do ficheiro como canal alfa de
 * uma tinta escura — onde a marca é clara fica opaca, onde o fundo é escuro fica transparente.
 * O patamar corta o resto do fundo, que de outro modo deixaria o hub sujo.
 */
const markSize = Math.round(HUB * 0.58);
const { data: luma } = await sharp(source)
  .resize(markSize, markSize, { fit: "contain" })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const FLOOR = 70;
const rgba = Buffer.alloc(markSize * markSize * 4);
for (let i = 0; i < luma.length; i += 1) {
  const alpha = Math.max(0, Math.min(255, Math.round(((luma[i] - FLOOR) * 255) / (255 - FLOOR))));
  rgba[i * 4] = 0x0d;
  rgba[i * 4 + 1] = 0x0d;
  rgba[i * 4 + 2] = 0x10;
  rgba[i * 4 + 3] = alpha;
}
const hubMark = await sharp(rgba, { raw: { width: markSize, height: markSize, channels: 4 } })
  .png()
  .toBuffer();

const out = join(outDir, "HeroArt-F-wheel.png");
await sharp(Buffer.from(svg))
  .composite([{ input: hubMark, left: Math.round(CX - markSize / 2), top: Math.round(CY - markSize / 2) }])
  .png()
  .toFile(out);

const meta = await sharp(out).metadata();
console.log(`HeroArt-F-wheel.png  ${meta.width}x${meta.height}  (roda ${RADIUS * 2 + TILE}px de diâmetro, sem ampliação)`);
