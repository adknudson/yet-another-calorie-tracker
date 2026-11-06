import type { AppInfo, AppData, EditEntryInput, Entry, NewEntryInput, Settings } from '../../shared/ipc'

interface ExposedApi {
  getAppInfo: () => Promise<AppInfo>
  ping: () => Promise<string>
  getAllData: () => Promise<AppData>
  updateSettings: (settings: Settings) => Promise<Settings>
  addEntry: (input: NewEntryInput) => Promise<Entry>
  editEntry: (id: string, input: EditEntryInput) => Promise<Entry>
  deleteEntry: (id: string) => Promise<void>
  restoreEntry: (entry: Entry) => Promise<void>
  clearEntries: () => Promise<void>
  resetSettings: () => Promise<Settings>
  clearAllData: () => Promise<Settings>
  exportData: () => Promise<string | null>
  importData: (json: string) => Promise<Entry[]>
}

declare global {
  interface Window {
    api: ExposedApi
  }
}

export {}
