# Feature Plan

Planned additions for Yet Another Calorie Tracker, ordered smallest → largest change (also a good build order: in-app features first, packaging last).

Validation for every item: `npm run typecheck`, plus manual checks in the browser dev page (`npm run dev` / http://localhost:5173) and an Electron dev run for IPC items.

## 1. Weekly summary line

- [x] Compute and render one line under the week chart: "avg N kcal/day".
- Average is over days that have entries.
- Files:
  - `src/renderer/src/HistoryChart.tsx` — compute from the existing `aggregateByDay` + `weekWindow` data already in hand (only when the active range is `week`).
  - `src/renderer/src/styles.css` — one small class.

## 2. Undo for deletes

- [ ] Deleting an entry shows a toast "Entry deleted — Undo" (auto-dismiss ~5 s); clicking Undo restores the exact entry (same id, amount, note, timestamp).
- Approach: delete persists immediately (no data loss if the app is closed quickly); undo re-inserts the original entry object.
- Files:
  - `src/shared/ipc.ts` — new `restoreEntry` channel.
  - `src/main/storage.ts` — `restoreEntry(entry)`: sanitize the entry (reuse `sanitizeEntries` for a single item) and insert it if its id is not already present.
  - `src/main/index.ts` — IPC handler.
  - `src/preload/index.ts` — typed wrapper on `window.api`.
  - `src/renderer/src/storage.ts` — `restoreEntry` in both backends (Electron IPC: call the API; localStorage: re-append).
  - `src/renderer/src/App.tsx` — toast state, wired into `handleDelete`.

## 3. Dark mode

- [ ] Light/dark toggle in Settings, persisted; initial default follows `prefers-color-scheme`.
- Files:
  - `src/shared/types.ts` — add `theme: 'light' | 'dark'` to `Settings` and `DEFAULT_SETTINGS`.
  - `src/main/storage.ts` — sanitize `theme` in `sanitizeSettings`.
  - `src/renderer/src/styles.css` — convert hardcoded colors to CSS variables with `:root` (light) and `[data-theme="dark"]` sets.
  - `src/renderer/src/App.tsx` — set `document.documentElement.dataset.theme`, add the toggle to the settings card.

## 4. Export / import JSON backup

- [ ] Settings gets "Export" and "Import" buttons; payload shape `{ version: 1, settings, entries }`. Import replaces all data after a confirm step.
- Files:
  - `src/shared/sanitize.ts` (new) — move `sanitizeSettings`/`sanitizeEntries` out of `src/main/storage.ts` so the browser path can validate imports too; main process keeps using them.
  - `src/shared/ipc.ts` — new channels: `exportData`, `importData`.
  - `src/main/index.ts` + `src/main/storage.ts` — `exportData`: show save dialog, write JSON, return path or null (cancelled). `importData(json)`: parse, validate with the shared sanitizers, replace all data.
  - `src/preload/index.ts` — typed wrappers.
  - `src/renderer/src/storage.ts` — browser/PWA fallback: export = Blob download; import = hidden `<input type="file">` + text read.
  - `src/renderer/src/App.tsx` — buttons in Settings, confirm before import, success/error line.

## 5. PWA (installable mobile)

- [ ] The browser build becomes an installable PWA with offline support.
- Files:
  - `src/renderer/public/manifest.webmanifest` (new) — name, standalone display, theme color, icons (copy the needed sizes from `build/icons/` into the public dir so they are served).
  - `src/renderer/public/sw.js` (new) — hand-rolled ~30-line service worker: precache `/` and runtime cache-first for same-origin GETs. No new dependencies (Vite hashes bundle names, so a static precache list isn't feasible without workbox).
  - `src/renderer/index.html` — link the manifest. CSP already allows `'self'`; no change needed.
  - `src/renderer/src/main.tsx` — register the service worker only when `location.protocol` is http(s) (skips Electron's `file://`).
- Validation: load the built renderer in a browser, verify installability and offline reload.
- Docs: update the "Can it run on mobile?" section of `README.md` to reflect that the PWA path is implemented.
