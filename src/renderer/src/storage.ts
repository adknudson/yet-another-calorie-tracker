import { DEFAULT_SETTINGS } from '../../shared/types'
import type { AppData, EditEntryInput, Entry, NewEntryInput, Settings } from '../../shared/types'

/**
 * Persistence for the calorie tracker.
 *
 * In Electron this goes through IPC to a JSON file in the user-data folder;
 * in a plain browser (e.g. when previewing the renderer or later shipping it
 * as a PWA) it falls back to localStorage with the same data shape.
 */
export interface DataStore {
  load(): Promise<AppData>
  updateSettings(settings: Settings): Promise<Settings>
  addEntry(input: NewEntryInput): Promise<Entry>
  editEntry(id: string, input: EditEntryInput): Promise<Entry>
  deleteEntry(id: string): Promise<void>
  restoreEntry(entry: Entry): Promise<void>
  clearEntries(): Promise<void>
  resetSettings(): Promise<Settings>
  clearAllData(): Promise<Settings>
}

const LOCAL_STORAGE_KEY = 'calorie-tracker-data-v1'

function isElectron(): boolean {
  return typeof window !== 'undefined' && window.api != null
}

class ElectronStore implements DataStore {
  load(): Promise<AppData> {
    return window.api!.getAllData()
  }

  updateSettings(settings: Settings): Promise<Settings> {
    return window.api!.updateSettings(settings)
  }

  addEntry(input: NewEntryInput): Promise<Entry> {
    return window.api!.addEntry(input)
  }

  editEntry(id: string, input: EditEntryInput): Promise<Entry> {
    return window.api!.editEntry(id, input)
  }

  deleteEntry(id: string): Promise<void> {
    return window.api!.deleteEntry(id)
  }

  restoreEntry(entry: Entry): Promise<void> {
    return window.api!.restoreEntry(entry)
  }

  clearEntries(): Promise<void> {
    return window.api!.clearEntries()
  }

  resetSettings(): Promise<Settings> {
    return window.api!.resetSettings()
  }

  clearAllData(): Promise<Settings> {
    return window.api!.clearAllData()
  }
}

class LocalStorageStore implements DataStore {
  private read(): AppData {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (raw != null) {
        const parsed = JSON.parse(raw) as Partial<AppData>
        return {
          settings: normalizeSettings(parsed.settings),
          entries: Array.isArray(parsed.entries) ? parsed.entries : []
        }
      }
    } catch {
      // Corrupt data — start fresh.
    }
    return { settings: { ...DEFAULT_SETTINGS }, entries: [] }
  }

  private write(data: AppData): void {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data))
  }

  async load(): Promise<AppData> {
    return this.read()
  }

  async updateSettings(settings: Settings): Promise<Settings> {
    const data = this.read()
    const next = normalizeSettings(settings)
    this.write({ ...data, settings: next })
    return next
  }

  async addEntry(input: NewEntryInput): Promise<Entry> {
    if (typeof input.amountKcal !== 'number' || !Number.isFinite(input.amountKcal) || input.amountKcal <= 0) {
      throw new Error('Entry amount must be a positive number')
    }
    const data = this.read()
    const entry: Entry = {
      id: crypto.randomUUID(),
      amountKcal: Math.round(input.amountKcal),
      note: (input.note ?? '').trim().slice(0, 500),
      createdAt: new Date().toISOString()
    }
    this.write({ ...data, entries: [...data.entries, entry] })
    return entry
  }

  async editEntry(id: string, input: EditEntryInput): Promise<Entry> {
    if (typeof input.amountKcal !== 'number' || !Number.isFinite(input.amountKcal) || input.amountKcal <= 0) {
      throw new Error('Entry amount must be a positive number')
    }
    const data = this.read()
    const index = data.entries.findIndex((e) => e.id === id)
    if (index === -1) {
      throw new Error('Entry not found')
    }
    const entry: Entry = {
      id,
      amountKcal: Math.round(input.amountKcal),
      note: (input.note ?? '').trim().slice(0, 500),
      createdAt: data.entries[index].createdAt
    }
    const entries = [...data.entries]
    entries[index] = entry
    this.write({ ...data, entries })
    return entry
  }

  async deleteEntry(id: string): Promise<void> {
    const data = this.read()
    this.write({ ...data, entries: data.entries.filter((e) => e.id !== id) })
  }

  async restoreEntry(entry: Entry): Promise<void> {
    const data = this.read()
    if (data.entries.some((e) => e.id === entry.id)) return
    this.write({ ...data, entries: [...data.entries, entry] })
  }

  async clearEntries(): Promise<void> {
    const data = this.read()
    this.write({ ...data, entries: [] })
  }

  async resetSettings(): Promise<Settings> {
    const data = this.read()
    const settings = { ...DEFAULT_SETTINGS }
    this.write({ ...data, settings })
    return settings
  }

  async clearAllData(): Promise<Settings> {
    const settings = { ...DEFAULT_SETTINGS }
    this.write({ settings, entries: [] })
    return settings
  }
}

function normalizeSettings(input: unknown): Settings {
  const obj = (input ?? {}) as Partial<Settings>
  const budget =
    typeof obj.dailyBudgetKcal === 'number' && Number.isFinite(obj.dailyBudgetKcal) && obj.dailyBudgetKcal > 0
      ? Math.round(obj.dailyBudgetKcal)
      : DEFAULT_SETTINGS.dailyBudgetKcal

  const weekStartsOnDay: Settings['weekStartsOnDay'] =
    obj.weekStartsOnDay === 0 || obj.weekStartsOnDay === 1 ? obj.weekStartsOnDay : DEFAULT_SETTINGS.weekStartsOnDay

  return {
    dailyBudgetKcal: budget,
    units: obj.units === 'kJ' || obj.units === 'kcal' ? obj.units : DEFAULT_SETTINGS.units,
    weekdayOverridesKcal: Array.from({ length: 7 }, (_, i) => {
      const value = Array.isArray(obj.weekdayOverridesKcal) ? obj.weekdayOverridesKcal[i] : undefined
      if (value == null) return null
      const n = Number(value)
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
    }),
    weekStartsOnDay
  }
}

export function createDataStore(): DataStore {
  return isElectron() ? new ElectronStore() : new LocalStorageStore()
}
