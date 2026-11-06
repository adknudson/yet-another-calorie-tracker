import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IpcChannels, type AppInfo, type EditEntryInput, type NewEntryInput, type Settings } from '../shared/ipc'
import * as storage from './storage'

let mainWindow: BrowserWindow | null = null

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 700,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Open external links in the default browser instead of a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.getAppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    electronVersion: process.versions.electron ?? '',
    nodeVersion: process.versions.node ?? '',
    chromeVersion: process.versions.chrome ?? ''
  }))

  ipcMain.handle(IpcChannels.ping, () => 'pong')

  ipcMain.handle(IpcChannels.getAllData, () => {
    return storage.getAllData()
  })

  ipcMain.handle(IpcChannels.updateSettings, (_event, settings: Settings) => {
    return storage.updateSettings(settings)
  })

  ipcMain.handle(IpcChannels.addEntry, (_event, input: NewEntryInput) => {
    return storage.addEntry(input)
  })

  ipcMain.handle(IpcChannels.editEntry, (_event, id: string, input: EditEntryInput) => {
    return storage.editEntry(id, input)
  })

  ipcMain.handle(IpcChannels.deleteEntry, (_event, id: string) => {
    storage.deleteEntry(id)
  })

  ipcMain.handle(IpcChannels.clearEntries, () => {
    storage.clearEntries()
  })

  ipcMain.handle(IpcChannels.resetSettings, () => {
    return storage.resetSettings()
  })

  ipcMain.handle(IpcChannels.clearAllData, () => {
    return storage.clearAllData()
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

// Quit on every platform except macOS, which keeps the app alive until Cmd+Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
