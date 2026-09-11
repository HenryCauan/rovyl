<div align="center">

# Rovyl

**One gesture. Any destination.**

A radial launcher for Windows. Hold the middle mouse button anywhere, aim, release.

[![Microsoft Store](https://img.shields.io/badge/Microsoft%20Store-Get%20it-0067b8?style=flat-square&logo=microsoft)](https://apps.microsoft.com/detail/9N03SVPMXSV1)
![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078d4?style=flat-square)

</div>

---

https://github.com/user-attachments/assets/16e57138-9344-42d8-a33e-cd66cb92dadc

## Features

- **Opens under your cursor** — over any window, including fullscreen apps
- **Launch anything** — applications, folders, files, websites, custom commands
- **Automatic discovery** — reads your Start Menu and extracts real app icons
- **Workspaces** — separate wheels for work, games, streaming; switch with a number key
- **Your trigger** — middle mouse button, a side button, or a global hotkey
- **Two aiming modes** — by direction for speed, or by pointer for precision
- **Focus protection** — stays out of the way while you are in a fullscreen game
- **Fully offline** — no account, no telemetry, no ads, nothing leaves your machine

## Building

Requires **Windows 10 or 11** and **Node 20+**. Windows-only by design: the trigger, the
icon pipeline and the window handling all depend on Win32 behaviour.

```bash
git clone https://github.com/HenryCauan/rovyl
cd rovyl
npm install
npm start
```

`npm start` brings up Vite and waits for it before launching Electron. To run the halves
separately, use `npm run dev` and `npm run electron`.

Google sign-in needs credentials of your own — copy `.env.example` to `.env.local` and
fill in a client ID from your own Google Cloud project. There is deliberately no default,
so a fork never inherits someone else's OAuth client.

> The dev app and the packaged app share `%APPDATA%\Rovyl`, because Electron derives it
> from `productName`. A dev session therefore reads and writes your real configuration.
> Pass `--user-data-dir` to work against a clean profile.

<details>
<summary><b>All scripts</b></summary>

| Command | What it does |
| --- | --- |
| `npm start` | Dev server + Electron |
| `npm run dev` | Vite only |
| `npm run electron` | Electron only, waits for port 5173 |
| `npm run build` | `tsc` → Vite build → radial verification → icon generation |
| `npm run dist` | `build` + electron-builder, installer in `build-out/` |
| `npm run dist:store` | `build` + electron-builder, MSIX package for the Store |
| `npm run verify:radial-windowing` | Checks the radial handshake invariants |
| `npm run test:win32-launch` | Command parsing and quoting |
| `npm run test:persistence-shape` | Persistence blob normalisation |

</details>

## Contributing

Issues and pull requests are welcome. Before changing anything that looks arbitrary, read
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — most of it exists because something
broke, and the reason is written down.

Two things worth knowing up front: the code comments are in Portuguese and explain *why*
rather than *what*, and `npm run build` runs a verification script that enforces the
window-handshake invariants. If it fails, the handshake was broken, not the test.

## Links

- **Microsoft Store** — [Rovyl](https://apps.microsoft.com/detail/9N03SVPMXSV1)
- **Website and docs** — [rovyl-red.vercel.app](https://rovyl-red.vercel.app)
- **Releases** — [github.com/HenryCauan/rovyl/releases](https://github.com/HenryCauan/rovyl/releases)
- **Privacy policy** — [rovyl-red.vercel.app/privacy](https://rovyl-red.vercel.app/privacy)

## License

Copyright © 2026 Henry Cauan.

Rovyl is free software, licensed under the **GNU General Public License v3.0** — see
[LICENSE](LICENSE). You may use, study, modify and share it. If you distribute a modified
version, you have to release its source under the same licence.

The copyright holder is not bound by that outbound licence, so the build sold on the
Microsoft Store is distributed under Microsoft's standard terms. Both are the same code.
