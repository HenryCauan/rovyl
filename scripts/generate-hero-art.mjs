/**
 * Super hero art (16:9, 1920x1080) para o topo da listagem da Microsoft Store.
 *
 * Regras que a documentação impõe e que estas variantes respeitam: sem texto nem título, sem
 * mostrar a interface da app, o essencial ao centro, nada importante no terço inferior (a Store
 * aplica lá um gradiente), e espaço vazio minimizado.
 *
 * A primeira versão era o ícone ampliado sobre um gradiente — cumpria as regras e não dizia nada.
 * Estas evocam o gesto: um alvo ao centro e destinos em órbita.
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
/** Centro ligeiramente acima do meio: o terço inferior é coberto por um gradiente da Store. */
const CX = W / 2;
const CY = H * 0.45;

const warmBackdrop = `
  <radialGradient id="bg" cx="14%" cy="86%" r="108%">
    <stop offset="0%" stop-color="#ff9a00"/>
    <stop offset="24%" stop-color="#f04a00"/>
    <stop offset="50%" stop-color="#8f1200"/>
    <stop offset="76%" stop-color="#2a0500"/>
    <stop offset="100%" stop-color="#050506"/>
  </radialGradient>`;

/** A — órbita: anéis concêntricos e destinos distribuídos, com um deles em destaque. */
function orbit() {
  const slots = 8;
  const R = 300;
  const dots = Array.from({ length: slots }, (_, i) => {
    const a = ((i * (360 / slots)) - 90) * (Math.PI / 180);
    const x = CX + R * Math.cos(a);
    const y = CY + R * Math.sin(a);
    const on = i === 1;
    return `<rect x="${x - 44}" y="${y - 44}" width="88" height="88" rx="26"
      fill="${on ? "#ffffff" : "rgba(255,255,255,.10)"}"
      stroke="${on ? "#ffffff" : "rgba(255,255,255,.26)"}" stroke-width="2"/>`;
  }).join("");
  const aim = `<line x1="${CX}" y1="${CY}" x2="${CX + R * Math.cos(-Math.PI / 4)}" y2="${CY + R * Math.sin(-Math.PI / 4)}"
      stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linecap="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${warmBackdrop}</defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="2"/>
    <circle cx="${CX}" cy="${CY}" r="${R + 96}" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="2" stroke-dasharray="10 16"/>
    ${aim}${dots}</svg>`;
}

/** B — setores: a roda lida como fatias, com uma acesa, sem desenhar um único ícone. */
function sectors() {
  const slots = 10;
  const inner = 150;
  const outer = 380;
  const step = 360 / slots;
  const wedge = (i) => {
    const a0 = ((i * step) - 90 + 3) * (Math.PI / 180);
    const a1 = (((i + 1) * step) - 90 - 3) * (Math.PI / 180);
    const p = (r, a) => `${(CX + r * Math.cos(a)).toFixed(1)} ${(CY + r * Math.sin(a)).toFixed(1)}`;
    const on = i === 2;
    return `<path d="M ${p(inner, a0)} L ${p(outer, a0)} A ${outer} ${outer} 0 0 1 ${p(outer, a1)} L ${p(inner, a1)} A ${inner} ${inner} 0 0 0 ${p(inner, a0)} Z"
      fill="${on ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.09)"}"
      stroke="rgba(255,255,255,.20)" stroke-width="1.5"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${warmBackdrop}</defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${Array.from({ length: slots }, (_, i) => wedge(i)).join("")}</svg>`;
}

/** C — sóbria: fundo escuro, um só anel de luz e a marca contida. Menos ruído, mais produto. */
function halo() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>
      <radialGradient id="dark" cx="50%" cy="45%" r="80%">
        <stop offset="0%" stop-color="#2a0d05"/>
        <stop offset="55%" stop-color="#120504"/>
        <stop offset="100%" stop-color="#050506"/>
      </radialGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%">
        <stop offset="60%" stop-color="rgba(255,110,0,0)"/>
        <stop offset="88%" stop-color="rgba(255,120,10,.55)"/>
        <stop offset="100%" stop-color="rgba(255,150,30,0)"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#dark)"/>
    <circle cx="${CX}" cy="${CY}" r="330" fill="url(#glow)"/>
    <circle cx="${CX}" cy="${CY}" r="300" fill="none" stroke="rgba(255,255,255,.20)" stroke-width="2" stroke-dasharray="4 14"/>
  </svg>`;
}

const variants = [
  ["HeroArt-A-orbit.png", orbit(), 300],
  ["HeroArt-B-sectors.png", sectors(), 190],
  ["HeroArt-C-halo.png", halo(), 260],
];

for (const [name, svg, markSize] of variants) {
  const mark = await sharp(source).resize(markSize, markSize, { fit: "contain" }).png().toBuffer();
  await sharp(Buffer.from(svg))
    .composite([{ input: mark, left: Math.round(CX - markSize / 2), top: Math.round(CY - markSize / 2) }])
    .png()
    .toFile(join(outDir, name));
  console.log(`  ${name}  ${W}x${H}  (marca ${markSize}px)`);
}

console.log(`\ngenerate-hero-art: wrote ${outDir}`);
