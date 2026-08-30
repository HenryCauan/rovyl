/**
 * Publica uma release do Rovyl, verificando primeiro tudo o que pode correr mal.
 *
 * O `electron-builder --publish always` só descobre os problemas no FIM: compila dez minutos,
 * empacota, carrega os ficheiros — e só então falha porque o repositório está vazio, ou porque o
 * token não chega, ou porque a versão já existe. Todas essas condições são verificáveis em
 * segundos, antes de gastar o build.
 *
 *   node scripts/release.mjs           publica
 *   node scripts/release.mjs --check   só valida, não compila
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
const { owner, repo } = pkg.build.publish;
const version = pkg.version;
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const checkOnly = process.argv.includes("--check");

const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg, hint) => {
  console.error(`  ✗ ${msg}`);
  if (hint) console.error(`    ${hint}`);
  process.exit(1);
};

async function api(pathname, init = {}) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "rovyl-release",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  return response;
}

console.log(`\nRovyl ${version} → ${owner}/${repo}\n`);

/* ── 1. Token ─────────────────────────────────────────────────────────────── */
if (!token) {
  fail(
    "GH_TOKEN não está definido.",
    'PowerShell:  $env:GH_TOKEN = "<token>"',
  );
}
ok("GH_TOKEN presente");

/* ── 2. Acesso ao repositório, e permissão de escrita ─────────────────────── */
const repoResponse = await api(`/repos/${owner}/${repo}`);
if (repoResponse.status === 404) {
  fail(
    `Sem acesso a ${owner}/${repo}.`,
    "O token tem de incluir este repositório em Repository access.",
  );
}
if (!repoResponse.ok) fail(`GitHub devolveu ${repoResponse.status} ao ler o repositório.`);

const repoInfo = await repoResponse.json();
if (!repoInfo.permissions?.push) {
  fail(
    "O token não tem permissão de escrita.",
    "Repository permissions → Contents: Read and write.",
  );
}
ok("token com escrita no repositório");

if (repoInfo.private) {
  console.warn(
    "  ! repositório privado — o updater dos clientes não consegue ler releases sem token",
  );
}

/* ── 3. O repositório tem de ter histórico ────────────────────────────────── */
const commits = await api(`/repos/${owner}/${repo}/commits?per_page=1`);
if (commits.status === 409) {
  fail(
    "O repositório está vazio.",
    "O GitHub não cria release sem tag, e não há tag sem commit. Cria um README primeiro.",
  );
}
if (!commits.ok) fail(`GitHub devolveu ${commits.status} ao verificar commits.`);
ok("repositório com histórico");

/* ── 4. A versão tem de ser nova, e maior que a publicada ─────────────────── */
const existing = await api(`/repos/${owner}/${repo}/releases/tags/v${version}`);
if (existing.ok) {
  fail(
    `A release v${version} já existe.`,
    "Sobe `version` no package.json antes de publicar.",
  );
}
ok(`v${version} ainda não existe`);

const latest = await api(`/repos/${owner}/${repo}/releases/latest`);
if (latest.ok) {
  const latestTag = (await latest.json()).tag_name?.replace(/^v/, "") ?? "0.0.0";
  const compare = (a, b) => {
    const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
    const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
    }
    return 0;
  };
  if (compare(version, latestTag) <= 0) {
    fail(
      `v${version} não é superior à publicada (v${latestTag}).`,
      "Nenhum cliente veria esta atualização.",
    );
  }
  ok(`v${version} é superior à publicada (v${latestTag})`);
} else {
  ok("primeira release deste repositório");
}

if (checkOnly) {
  console.log("\nTudo pronto. Corre sem --check para publicar.\n");
  process.exit(0);
}

/* ── 5. Compilar e publicar ───────────────────────────────────────────────── */
const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: "inherit", shell: true });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} saiu com ${code}`)),
    );
  });

console.log("\n→ build\n");
await run("npm", ["run", "build"]);

console.log("\n→ empacotar e publicar\n");
await run("npx", ["electron-builder", "--win", "--publish", "always"]);

/* ── 6. Confirmar o que ficou lá ──────────────────────────────────────────── */
const published = await api(`/repos/${owner}/${repo}/releases/tags/v${version}`);
if (!published.ok) {
  fail("A release não apareceu no GitHub. Lê o output acima.");
}
const assets = (await published.json()).assets.map((a) => a.name);
console.log(`\nRelease v${version} publicada com: ${assets.join(", ")}`);

/** Sem `latest.yml` o instalador está lá mas nenhum cliente o encontra. */
if (!assets.includes("latest.yml")) {
  console.error(
    "\n  ! FALTA latest.yml — os clientes não vão ver esta atualização.\n" +
      "    Carrega-o à mão a partir de build-out/latest.yml.",
  );
  process.exit(1);
}
console.log("latest.yml presente: os clientes vão receber a atualização.\n");
