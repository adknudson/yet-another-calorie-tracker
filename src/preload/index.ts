import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels, type AppInfo, type AppData, type EditEntryInput, type Entry, type NewEntryInput, type Settings } from '../shared/ipc'

/** API surface exposed to the renderer via `window.api`. */
const api = {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannels.getAppInfo),
  ping: (): Promise<string> => ipcRenderer.invoke(IpcChannels.ping),
  getAllData: (): Promise<AppData> => ipcRenderer.invoke(IpcChannels.getAllData),
  updateSettings: (settings: Settings): Promise<Settings> => ipcRenderer.invoke(IpcChannels.updateSettings, settings),
  addEntry: (input: NewEntryInput): Promise<Entry> => ipcRenderer.invoke(IpcChannels.addEntry, input),
  editEntry: (id: string, input: EditEntryInput): Promise<Entry> =>
    ipcRenderer.invoke(IpcChannels.editEntry, id, input),
  deleteEntry: (id: string): Promise<void> => ipcRenderer.invoke(IpcChannels.deleteEntry, id),
  restoreEntry: (entry: Entry): Promise<void> => ipcRenderer.invoke(IpcChannels.restoreEntry, entry),
  clearEntries: (): Promise<void> => ipcRenderer.invoke(IpcChannels.clearEntries),
  resetSettings: (): Promise<Settings> => ipcRenderer.invoke(IpcChannels.resetSettings),
  clearAllData: (): Promise<Settings> => ipcRenderer.invoke(IpcChannels.clearAllData),
  exportData: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.exportData),
  importData: (json: string): Promise<Entry[]> => ipcRenderer.invoke(IpcChannels.importData, json)
}

contextBridge.exposeInMainWorld('api', api)
