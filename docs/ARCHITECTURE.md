# Architecture

Notes on the parts of Rovyl that are not obvious from reading the code, and the reasons
behind decisions that look arbitrary until you know what broke.

## Layout

```
backend/          Electron main, preload, and the PowerShell helpers
  electron-main.js      window lifecycle, IPC, licensing, updates, icon extraction
  electron-preload.js   the entire renderer-facing API surface
  mouse-blocker.ps1     captures the trigger button and blocks input outside the wheel
  foreground-focus.ps1  steals foreground when Windows refuses focus
  extract-icon.ps1      the icon pipeline
  game-detection.cjs    fullscreen/game detection for focus protection
  win32-launch.js       command parsing and quoting for launching targets
  persistence-normalize.cjs   disk-blob → renderer shape
src/              Renderer
  App.tsx               orchestration: state, persistence, IPC wiring, window modes
  components/
    RadialMenu.tsx      the wheel: layout, aiming, gestures, slices
    LicenseGate.tsx     the locked wheel shown without a license
    PrecisionSettings.tsx  the settings panel
  index.css             design tokens and every non-Tailwind style
scripts/          Build, launch and verification scripts
nsis/             Installer customisation
build/            Icon sources and generated assets
```

## Radial windowing

The wheel is a transparent, frameless, always-on-top window that is resized to fill the
monitor and then revealed. Getting this wrong on Windows produces visible flashes — the
DWM presenting a stale texture, or a black frame, or the window appearing at the previous
bounds.

The order is a handshake, not a sequence of calls:
`prepare-radial-show` → renderer paints a neutral cover → `radial-prep-paint-done` →
`open-menu` → renderer paints the wheel transparent → `radial-open-paint-done` → main
reveals → `radial-native-revealed` → the bloom animation starts.

`scripts/verify-radial-windowing.mjs` enforces the markers that keep this intact and runs
as part of `npm run build`. If it fails, the handshake was broken, not the test.

## Mouse trigger

The trigger button is captured by a `WH_MOUSE_LL` hook living in `mouse-blocker.ps1`,
which runs as a separate PowerShell process and reports `TRIGGER_DOWN` / `TRIGGER_UP` on
stdout.

It has to be a hook rather than a poll, and the reason is not obvious. An earlier version
polled `GetAsyncKeyState` every 16 ms, which only ever *observed* the button — the event
still reached the window underneath, and on any scrollable surface Windows started
autoscroll, so aiming at the wheel dragged the page behind it. Swallowing the event
requires returning 1 from a low-level hook, and a swallowed button also disappears from
`GetAsyncKeyState`. Whatever swallows the event must therefore also be what detects it.

A short, stationary press is not a gesture, so the hook synthesises a middle click back
into the window underneath — closing a browser tab still works. The synthetic events carry
a signature in `dwExtraInfo` so the hook does not re-interpret its own injection.

Left and right buttons are rejected outright: watching them globally would collide with
the primary click and the context menu.

While the button is held, Windows keeps pointer capture in whichever window received the
click, so the renderer sees no `mousemove`. The main process polls the cursor and sends
`mmb-cursor`; the renderer replays it as a real `mousemove` so aiming uses one pipeline.

## Aiming and confirmation

Two rules that cost a long debugging session, both worth preserving:

1. **Confirmation resolves from the live pointer**, never from React state. State travels
   `mousemove → rAF → setState → render → ref`; releasing mid-flight used to confirm the
   slice the pointer had already left.
2. **A slice's hit area must match its paint.** The slice wrapper is positioned at the
   slice's point and its content is centred with a transform — so the wrapper's layout box
   sits half a tile off. It is `pointer-events: none`; the visible tile takes the clicks.

Highlight and confirmation share one function, `resolveAimAtPoint`. They used to be
separate copies of the same trigonometry, and any divergence between them means lighting
up one icon and opening another — the worst possible defect in a launcher.

Targeting has two modes. `angle` picks the slice you point toward, from anywhere on
screen. `cursor` only highlights the icon actually under the pointer, and releasing away
from every icon cancels.

The centre's dead zone is `max(activationThreshold, hub box diagonal)`, and the hub also
carries a square hit target, because `border-radius` clips hit-testing and a click in the
circle's corner would otherwise fall through to a slice.

## Icons

`extract-icon.ps1` produces a normalised 256px PNG data URL. Order matters:

- **Packaged apps** — read `AppxManifest.xml`, prefer the `Square44x44Logo` family (the
  app icon) over `Square150x150Logo` (the Start-menu tile), take the largest variant, skip
  `contrast-*` (high-contrast themes), and give `altform-unplated` a modest bonus rather
  than an automatic win.
- **Desktop apps** — `IShellItemImageFactory` without `SIIGBF_SCALEUP` first, so the shell
  returns the largest native asset and only one resample happens.
- Every candidate is **measured** (`IconExtractor.Analyze`) for a white halo — the
  signature of an icon composited over a light plate and then alpha-cut. A dirty candidate
  loses to a clean one from another source.

`ICON_PIPELINE_VERSION` in `electron-main.js` must be bumped whenever this script changes;
the cache is discarded when it does not match.

## Persistence

`config-v2.json` in `userData`, written atomically, with a `.bak` and a quarantine path
for corrupt blobs. `persistence-normalize.cjs` accepts both the legacy flat shape and the
v2 nested shape and always returns `{ user, apps, config }`.

On read, the stored config is spread **over `DEFAULT_UI_CONFIG`**. Without that base, any
setting introduced after a file was written arrives as `undefined` instead of its default,
which reads as "the backup lost my settings" when they were never in the file at all.

Two rules learned the hard way: never gate a *write* on `cancelled` — cancellation exists
to stop work in flight, not to discard results already obtained — and merge asynchronous
results **by id**, never by array identity, because the config legitimately changes while
slow work is running.

## Distribution channels

The same source produces two builds, and they differ in one respect that matters.

`process.windowsStore` is set by Electron when the process runs from an MSIX package.
`isStoreBuild()` reads it, and the Store build consequently disables the self-updater —
the Store forbids one, and a submission with `autoInstallOnAppQuit` active fails
certification — and skips the license gate, because the Store collected payment before it
handed over the package.

The direct build keeps both: `electron-updater` against this repository's releases, and a
license key. There is no native update dialog — the main process emits `update-state`, the
wheel shows a badge on the hub, and Settings → Advanced offers the restart.

For direct clients to see an update, `version` in `package.json` must be higher than the
installed one, and the release must carry `latest.yml` alongside the installer. For the
Store, the version must simply be higher than the published one and end in `.0`.

## Licensing (direct channel)

The activated profile lives in `user` inside `config-v2.json`. The device identifier is
derived from the Windows `MachineGuid`, hashed with SHA-256 before it leaves the machine,
so reinstalling or resetting the profile does not consume one of the three slots.

**Known limitation:** the app trusts `isPremium` as read from disk and never revalidates
against the server after activation. Copying the persistence file to another machine
therefore carries the activation with it. Revalidation on launch, with an offline grace
period, is the fix.

## Conventions

- **Comments explain *why*, and are written in Portuguese.** A comment that restates the
  code is noise; the ones here carry the reason a line exists, usually a bug that
  motivated it. That is the single most useful thing in this codebase — read them before
  changing behaviour that looks arbitrary.
- **Design tokens live in `src/index.css`.** The radial is monochrome — white and black,
  plus the user's hover colour. Don't introduce new hues; the update badge is the single
  deliberate exception.
- **Opacity is not a de-emphasis channel** for elements that carry their own background:
  alpha multiplies the plate too, and the object stops being readable over an unknown
  desktop. Use content contrast instead.

## Release

```bash
$env:GH_TOKEN = "<token with contents:write on this repository>"
npm run dist -- --publish always
```

Always go through `scripts/run-electron-builder.mjs` — which is what `npm run dist` does —
rather than calling `electron-builder` directly. The runner picks the output directory, and
`ZENITH_BUILD_OUTPUT` overrides it. That override is the escape hatch for a real and
recurring failure: Windows security software opens `build-outwin-unpackedesourcesapp.asar`
to inspect it and does not always let go, and the next packaging run dies on
`EnsureEmptyDir` because it cannot delete a file nothing of yours is holding. Build
somewhere else and the run completes; the stale file disappears on the next reboot.

`build.publish` in `package.json` points at this repository, so the source and the builds
made from it live in one place. It must be public: the updater reads `latest.yml` from the
release assets anonymously.

The Store package is built with `npm run dist:store` and uploaded manually in Partner
Center. `build.appx` carries the identity values issued by the Store; a fork will need its
own.
