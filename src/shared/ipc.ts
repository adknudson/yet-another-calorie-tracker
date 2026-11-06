import type { AppData, EditEntryInput, Entry, ExportPayload, NewEntryInput, Settings } from './types'

/** Channel names shared between the main process, preload script and renderer. */
export const IpcChannels = {
  getAppInfo: 'app:get-info',
  ping: 'system:ping',
  getAllData: 'calories:get-all',
  updateSettings: 'settings:update',
  addEntry: 'entry:add',
  editEntry: 'entry:edit',
  deleteEntry: 'entry:delete',
  restoreEntry: 'entry:restore',
  clearEntries: 'entries:clear',
  resetSettings: 'settings:reset',
  clearAllData: 'data:clear-all',
  exportData: 'data:export',
  importData: 'data:import'
} as const

/** Payload types for the calorie-tracker IPC channels. */
export type { AppData, EditEntryInput, Entry, ExportPayload, NewEntryInput, Settings }

/** Application metadata returned by the main process. */
export interface AppInfo {
  name: string
  version: string
  platform: string
  electronVersion: string
  nodeVersion: string
  chromeVersion: string
}
