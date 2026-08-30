<div align="center">

<img src="docs/media/banner.png" alt="" width="720">

# Rovyl

**One gesture. Any destination.**

A radial launcher for Windows. Hold the middle mouse button anywhere, aim, release.

[![Microsoft Store](https://img.shields.io/badge/Microsoft%20Store-Get%20it-0067b8?style=flat-square&logo=microsoft)](https://apps.microsoft.com/detail/9N03SVPMXSV1)
![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078d4?style=flat-square)
![Electron](https://img.shields.io/badge/Electron-28-47848f?style=flat-square&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react&logoColor=white)

</div>

---

## Why

Every launcher asks you to stop what you are doing. Open a window, type a few letters,
read a list, pick a row. It is fast, but it is still an interruption — and your hand
leaves the mouse.

Rovyl takes a different bet: **you already know where your things are.** Hold the middle
mouse button and a wheel blooms under your cursor. Move toward what you want. Release.
The whole thing takes less than a second, happens wherever you already were, and never
puts a window between you and your work.

<div align="center">
<img src="docs/media/wheel.png" alt="The Rovyl wheel open over the desktop" width="620">
</div>

## Features

- **Opens under your cursor** — over any window, including fullscreen apps
- **Launch anything** — applications, folders, files, websites, custom commands
- **Automatic discovery** — reads your Start Menu and extracts real app icons
- **Workspaces** — separate wheels for work, games, streaming; switch with a number key
- **Your trigger** — middle mouse button, a side button, or a global hotkey
- **Two aiming modes** — by direction for speed, or by pointer for precision
- **Focus protection** — stays out of the way while you are in a fullscreen game
- **Fully offline** — no account, no telemetry, no ads, nothing leaves your machine

## Install

**From the Microsoft Store** — [apps.microsoft.com](https://apps.microsoft.com/detail/9N03SVPMXSV1).
Installs and updates automatically, no security warnings.

**From source** — see [Building](#building) below.

## How it works

<table>
<tr>
<td width="50%" valign="top">

**Hold**

Press and hold the middle mouse button anywhere in Windows. The wheel appears centred on
your cursor — you never move to reach it.

</td>
<td width="50%" valign="top">

**Aim**

Move toward the shortcut you want. In direction mode the slice you point at lights up from
anywhere on screen; in pointer mode only the icon under the cursor does.

</td>
</tr>
<tr>
<td valign="top">

**Release**

The target opens and the wheel disappears. Release in the centre, or press Escape, to
cancel without launching anything.

</td>
<td valign="top">

**Switch**

Number keys move between workspaces while the wheel is open, or use the picker in the hub.

</td>
</tr>
</table>

## Screenshots

<div align="center">
<img src="docs/media/workspaces.png" alt="Workspace cards, each previewing its own wheel" width="440">
<img src="docs/media/settings.png" alt="Activation settings" width="440">
</div>

## Building

Requires **Windows 10 or 11** and **Node 20+**. Windows-only by design: the trigger, the
icon pipeline and the window handling all depend on Win32 behaviour.

```bash
git clone https://github.com/HenryCauan/zenith-app
cd zenith-app
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
- **Releases and issues** — [HenryCauan/rovylapp](https://github.com/HenryCauan/rovylapp)
- **Privacy policy** — [rovyl-red.vercel.app/privacy](https://rovyl-red.vercel.app/privacy)

## License

See [LICENSE](LICENSE).
