import { app, dialog, type BrowserWindow, type SaveDialogOptions } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseExportPayload, sanitizeEntries } from '../shared/sanitize'
import { DEFAULT_SETTINGS } from '../shared/types'
import type { AppData, EditEntryInput, Entry, ExportPayload, NewEntryInput, Settings } from '../shared/types'

const DATA_FILE_NAME = 'calorie-tracker.json'

let cache: AppData | null = null

function dataFilePath(): string {
  return join(app.getPath('userData'), DATA_FILE_NAME)
}

function loadFromDisk(): AppData {
  const file = dataFilePath()
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<AppData>
      return {
        settings: sanitizeSettings(parsed.settings),
        entries: sanitizeEntries(parsed.entries)
      }
    } catch {
      // Corrupt file — start fresh rather than crash on launch.
    }
  }
  return { settings: { ...DEFAULT_SETTINGS }, entries: [] }
}

function getData(): AppData {
  if (cache === null) {
    cache = loadFromDisk()
  }
  return cache
}

function saveData(data: AppData): void {
  cache = data
  const file = dataFilePath()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmp, file)
}

/** Validate a settings object, falling back to current values for bad fields. */
function sanitizeSettings(input: unknown): Settings {
  const current = cache?.settings ?? DEFAULT_SETTINGS
  const obj = (input ?? {}) as Partial<Settings>

  let dailyBudgetKcal = current.dailyBudgetKcal
  if (typeof obj.dailyBudgetKcal === 'number' && Number.isFinite(obj.dailyBudgetKcal) && obj.dailyBudgetKcal > 0) {
    dailyBudgetKcal = Math.round(obj.dailyBudgetKcal)
  }

  const units: Settings['units'] = obj.units === 'kJ' || obj.units === 'kcal' ? obj.units : current.units

  const weekdayOverridesKcal: (number | null)[] = Array.from({ length: 7 }, (_, i) => {
    const value = Array.isArray(obj.weekdayOverridesKcal) ? obj.weekdayOverridesKcal[i] : undefined
    if (value == null) return null
    const n = Number(value)
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
  })

  const weekStartsOnDay: Settings['weekStartsOnDay'] =
    obj.weekStartsOnDay === 0 || obj.weekStartsOnDay === 1 ? obj.weekStartsOnDay : current.weekStartsOnDay
  const theme: Settings['theme'] =
    obj.theme === 'light' || obj.theme === 'dark' || obj.theme === 'system' ? obj.theme : current.theme

  return { dailyBudgetKcal, units, weekdayOverridesKcal, weekStartsOnDay, theme }
}

/** Return a copy of all persisted data. */
export function getAllData(): AppData {
  const data = getData()
  return { settings: { ...data.settings }, entries: [...data.entries] }
}

/** Replace settings (validated) and persist. Returns the sanitized result. */
export function updateSettings(input: Settings): Settings {
  const data = getData()
  const settings = sanitizeSettings(input)
  saveData({ ...data, settings })
  return settings
}

/** Add a calorie entry and persist. Throws on invalid input. */
export function addEntry(input: NewEntryInput): Entry {
  const data = getData()
  const amountKcal = Math.round(toPositiveNumber(input.amountKcal))
  const note = (input.note ?? '').trim().slice(0, 500)

  const entry: Entry = {
    id: randomUUID(),
    amountKcal,
    note,
    createdAt: new Date().toISOString()
  }
  saveData({ ...data, entries: [...data.entries, entry] })
  return entry
}

/** Edit an entry by id and persist. Throws if the entry is missing or invalid. */
export function editEntry(id: string, input: EditEntryInput): Entry {
  const data = getData()
  const index = data.entries.findIndex((e) => e.id === id)
  if (index === -1) {
    throw new Error('Entry not found')
  }

  const amountKcal = Math.round(toPositiveNumber(input.amountKcal))
  const note = (input.note ?? '').trim().slice(0, 500)

  const entry: Entry = {
    id,
    amountKcal,
    note,
    createdAt: data.entries[index].createdAt
  }
  const entries = [...data.entries]
  entries[index] = entry
  saveData({ ...data, entries })
  return entry
}

/** Delete an entry by id and persist. */
export function deleteEntry(id: string): void {
  const data = getData()
  saveData({ ...data, entries: data.entries.filter((e) => e.id !== id) })
}

/** Re-insert a previously deleted entry (exact same object). No-op if its id already exists. */
export function restoreEntry(entry: Entry): void {
  const data = getData()
  if (data.entries.some((e) => e.id === entry.id)) return
  const sanitized = sanitizeEntries([entry])
  if (sanitized.length === 0) return
  saveData({ ...data, entries: [...data.entries, sanitized[0]] })
}

/** Remove all entries (settings are kept) and persist. */
export function clearEntries(): void {
  const data = getData()
  saveData({ ...data, entries: [] })
}

/** Reset settings to defaults (entries are kept) and persist. Returns the new settings. */
export function resetSettings(): Settings {
  const data = getData()
  const settings = { ...DEFAULT_SETTINGS }
  saveData({ ...data, settings })
  return settings
}

/** Reset everything to defaults (entries cleared, settings reset) and persist. */
export function clearAllData(): Settings {
  const settings = { ...DEFAULT_SETTINGS }
  saveData({ settings, entries: [] })
  return settings
}

/** Show a save dialog and write the exported entries as JSON. Returns the written path, or null if cancelled. */
export async function exportData(parent?: BrowserWindow | null): Promise<string | null> {
  const data = getData()
  const payload: ExportPayload = { version: 1, entries: [...data.entries] }

  const options: SaveDialogOptions = {
    title: 'Export entries',
    defaultPath: join(app.getPath('documents'), 'calorie-tracker-entries.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  }
  const result =
    parent != null ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (result.canceled || result.filePath == null) return null

  writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8')
  return result.filePath
}

/** Replace all entries with the given exported payload and persist. Returns the imported entries. */
export function importData(json: string): Entry[] {
  const payload = parseExportPayload(json)
  const data = getData()
  saveData({ ...data, entries: payload.entries })
  return payload.entries
}

function toPositiveNumber(value: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error('Entry amount must be a positive number')
  }
  return value
}
