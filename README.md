# Yet Another Calorie Tracker

A simple calorie tracker built with **Electron**, **React**, and **TypeScript**. Data persists locally on your device — no accounts, no cloud. Runs on Windows, macOS, and Linux.

**It just counts calories.** No nutrition breakdowns, no macros, no judgement — just the number. It exists to help you reach your daily caloric intake goal and nothing more. Especially useful for anyone following a **Calories In Calories Out (CICO)** diet.

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

### Deploying to GitHub Pages

The build is host-agnostic (relative asset paths, relative manifest `start_url`/`scope`, service worker resolves its base from its own URL), so it works at the root of a domain **or** under a GitHub Pages subpath like `https://<user>.github.io/<repo>/`.

1. Build and publish the static output to a `gh-pages` branch:

   ```bash
   npm run build
   npx gh-pages -d out/renderer
   ```

   (`npx gh-pages` clones, commits `out/renderer/` to `gh-pages`, and pushes — no manual push needed. Git must be able to authenticate to GitHub, e.g. via a stored credential or personal access token.)

2. In the repo, go to **Settings → Pages** and set **Source** to *Deploy from a branch* with branch `gh-pages` and folder `/` (root). The first deploy takes about a minute.

3. Open `https://<user>.github.io/<repo>/` on your phone:
   - **Android (Chrome):** ⋮ menu → **Install app**.
   - **iOS (Safari):** Share → **Add to Home Screen**.

After the first load, the service worker precaches the app shell and the app reloads — and stays usable — offline.

> **Note:** entries are stored in per-origin `localStorage` (`calorie-tracker-data-v1`). Data entered on one origin (e.g. GitHub Pages) is not visible from another (desktop, localhost). Use the export/import feature to move entries between origins.

To republish after a code change, rerun `npm run build && npx gh-pages -d out/renderer`.

Other option: **Capacitor** — wrap the same web build as a native app for App Store / Play Store distribution.

## Security notes

The app makes **no network connections at all** — no accounts, telemetry, or analytics — and all data stays on your device. Because an Electron window is both a web page *and* a desktop app, these settings stop any script running in the window from touching your disk or shell:

- **`contextIsolation: true` + `nodeIntegration: false`** — the renderer's JavaScript has no access to Node.js and can only talk to the app through the preload bridge.
- **`sandbox: true`** — the preload script itself runs sandboxed with a minimal API surface (`contextBridge`, `ipcRenderer`).
- **Minimal typed preload API** — `window.api` (see `src/preload/index.ts`) exposes only the app's own operations, never raw IPC or Node modules.
- **Content-Security-Policy** — the page may only load scripts from its own origin, so injected content can't fetch or run external code.
- **External links open in the system browser** — all `window.open` / `target="_blank"` navigation is denied in-app; only `http(s)` URLs are handed to your default browser.

**What you should be aware of:**

- **Nothing is backed up** — losing your device or its data directory means losing your entries unless you've exported them.
- **The main risk is local, not remote** — other software on the same machine can read your data, so keep your OS and Electron up to date.
- **In browser/PWA mode** there is no Node layer at all; it's just a static site plus `localStorage`.

## Disclaimer: this was vibe coded

This app is entirely vibe coded and it may very well be AI slop.

That doesn't matter. The goal was never to build a robust piece of software; it was to avoid using a spreadsheet on my phone. I needed a simple calorie tracker: type a number, see what's left of the day's budget, done. If it does that job (including offline), it is working as intended.

If you find something broken or odd, open an issue, or fork the repo and host your own calorie tracker with GitHub pages.

### Coding setup

VS Code using the Copilot harness, running a local language model via Unsloth.

System:

- Ryzen 9 3900X
- 7900 XTX
- 32 GB DDR4

Model:

- [ISTA-DASLab/Qwen3.8-27B-GSQ-RCO-GGUF:IQ3_S](https://huggingface.co/ISTA-DASLab/Qwen3.8-27B-GSQ-RCO-GGUF)
- Context length: 145664
- KV cache type: q8_0
