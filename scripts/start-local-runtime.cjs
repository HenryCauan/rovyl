const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const localBase = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const runtimeRoot = path.join(localBase, 'ZenithRadialMenu', 'deps');
const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npmCommand = fs.existsSync(npmCli) ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const npmPrefixArgs = fs.existsSync(npmCli) ? [npmCli] : [];
const lockPath = path.join(projectRoot, 'package-lock.json');
const lockHash = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex');
const stampPath = path.join(runtimeRoot, '.zenith-lock-hash');

fs.mkdirSync(runtimeRoot, { recursive: true });

const copyFile = (name) => {
  fs.copyFileSync(path.join(projectRoot, name), path.join(runtimeRoot, name));
};

const copyDirectory = (name) => {
  const source = path.join(projectRoot, name);
  const destination = path.join(runtimeRoot, name);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
};

for (const file of ['package.json', 'package-lock.json', 'index.html', 'tsconfig.json', 'vite.config.mjs']) {
  copyFile(file);
}

for (const directory of ['src', 'backend', 'public', 'resources', 'scripts']) {
  copyDirectory(directory);
}

const installedVite = path.join(runtimeRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const installedHash = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, 'utf8').trim() : '';
if (!fs.existsSync(installedVite) || installedHash !== lockHash) {
  console.log('[Zenith] Instalando dependências fora do OneDrive...');
  const install = spawnSync(npmCommand, [...npmPrefixArgs, 'ci'], {
    cwd: runtimeRoot,
    stdio: 'inherit',
    shell: false,
  });
  if (install.error) {
    console.error('[Zenith] Falha ao iniciar npm:', install.error.message);
    process.exit(1);
  }
  if (install.status !== 0) process.exit(install.status || 1);
  fs.writeFileSync(stampPath, lockHash);
}

console.log(`[Zenith] Runtime local: ${runtimeRoot}`);

// Keep frontend edits flowing to the local runtime so Vite HMR still works while the repository
// itself remains inside OneDrive. Backend/config changes continue to require the usual restart.
const watchers = [];
for (const directory of ['src', 'public']) {
  const sourceRoot = path.join(projectRoot, directory);
  const destinationRoot = path.join(runtimeRoot, directory);
  watchers.push(fs.watch(sourceRoot, { recursive: true }, (_event, relativeName) => {
    if (!relativeName) return;
    const relativePath = String(relativeName);
    const source = path.join(sourceRoot, relativePath);
    const destination = path.join(destinationRoot, relativePath);
    try {
      if (!fs.existsSync(source)) {
        fs.rmSync(destination, { recursive: true, force: true });
      } else if (fs.statSync(source).isFile()) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
      }
    } catch (error) {
      console.warn(`[Zenith] Não foi possível sincronizar ${relativePath}: ${error.message}`);
    }
  }));
}

const child = spawn(npmCommand, [...npmPrefixArgs, 'run', 'start:runtime'], {
  cwd: runtimeRoot,
  stdio: 'inherit',
  shell: false,
  env: process.env,
});

let stopping = false;
const stopRuntimeTree = () => {
  if (stopping || child.exitCode !== null) return;
  stopping = true;

  // On Windows, killing only the npm wrapper can leave Vite/Electron descendants alive.
  // Those stale overlay processes stack up and can make the system pointer feel delayed.
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  child.kill('SIGTERM');
};
process.on('SIGINT', stopRuntimeTree);
process.on('SIGTERM', stopRuntimeTree);
child.on('exit', (code, signal) => {
  for (const watcher of watchers) watcher.close();
  process.exit(code ?? (signal ? 1 : 0));
});
