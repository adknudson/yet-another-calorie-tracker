# Yet Another Calorie Tracker

A simple calorie tracker built with **Electron**, **React**, and **TypeScript**. Data persists locally on your device — no accounts, no cloud. Runs on Windows, macOS, and Linux.

## Features

- **Daily budget** — set a daily calorie target (default: 2,000 kcal).
- **Units** — display and enter amounts in **kcal** or **kJ**; switching units converts all existing data automatically.
- **Weekday overrides** — override the budget for any day of the week (e.g. lower on Mondays); empty means "use the daily budget".
- **Entries** — log a calorie amount (required) with an optional note, stamped with the time it was added.
- **Day navigation** — browse previous/future days; each day shows its effective budget, entries, and total.
- **Local persistence only** — everything is stored on this machine.

## Data storage

| Environment | Location |
| ----------- | -------- |
| Electron (desktop) | JSON file at `<userData>/calorie-tracker.json` (e.g. `~/.config/Yet Another Calorie Tracker/calorie-tracker.json` on Linux). Writes are atomic (temp file + rename). |
| Browser / PWA fallback | `localStorage` key `calorie-tracker-data-v1` |

The renderer picks the backend automatically: it uses the Electron IPC API when available and falls back to `localStorage` in a plain browser. All amounts are stored internally as integer kcal; kJ values are converted for display (1 kcal = 4.184 kJ).

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start in development mode with hot reload
```

## Scripts

| Script            | What it does                                        |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | Launch Electron with the Vite dev server (HMR)      |
| `npm run build`   | Bundle main, preload and renderer into `out/`      |
| `npm run typecheck` | Type-check both the Node and web TypeScript projects |
| `npm run dist`    | Build + package for the current platform           |
| `npm run dist:win`  | Package a Windows NSIS installer (x64)             |
| `npm run dist:mac`  | Package macOS DMGs (x64 + arm64) — run on macOS    |
| `npm run dist:linux`| Package Linux AppImage and .deb                    |

Packaged installers are written to `dist/`.

## Project structure

```
├── src/
│   ├── main/          # Electron main process (window, IPC handlers, JSON file storage)
│   │   └── storage.ts # Persistence layer: load/save, validation, atomic writes
│   ├── preload/       # contextBridge API exposed to the renderer
│   ├── renderer/      # React UI (index.html + src/)
│   │   ├── App.tsx    # Entire UI: today card, entry form, day nav, settings
│   │   └── storage.ts # Dual-backend store (Electron IPC or localStorage)
│   └── shared/        # Types, units/conversions, and channel names shared across processes
├── build/             # Icons for electron-builder
├── electron.vite.config.ts
├── tsconfig.node.json # Main/preload/shared type-checking
└── tsconfig.web.json  # Renderer type-checking
```

## Can it run on mobile?

Electron itself does **not** run natively on iOS or Android. However, this app is structured to make that easy:

- The renderer is plain React + CSS with zero Electron-specific UI code.
- `src/renderer/src/storage.ts` already includes a `localStorage` fallback, so the exact same UI works in any modern mobile browser (verified by loading the built bundle directly in a browser).

**PWA support is implemented.** The build output (`out/renderer/`) is installable as a PWA on both iOS and Android with data kept in `localStorage`:

- `src/renderer/public/manifest.webmanifest` — app name, standalone display, theme colors, 192/512 px icons (including a maskable variant).
- `src/renderer/public/sw.js` — hand-rolled service worker that precaches the app shell and serves same-origin GETs cache-first, so the app reloads offline.
- `src/renderer/src/main.tsx` registers the service worker only when served over http(s), so Electron's `file://` protocol is unaffected.

To serve it on a phone, build (`npm run build`) and host `out/renderer/` over HTTPS — no extra tooling required.

Other option: **Capacitor** — wrap the same web build as a native app for App Store / Play Store distribution.

## Security notes

- `contextIsolation` is enabled and `nodeIntegration` is disabled in the renderer.
- The preload script exposes a minimal, typed API via `window.api` (see `src/preload/index.ts`).
- A Content-Security-Policy is set in `src/renderer/index.html`.
- External links open in the system browser, not in new Electron windows.
