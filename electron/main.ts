import { BrowserWindow, Menu, Tray, app, dialog, ipcMain, nativeImage, session, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { AppService, serviceMethods, type ServiceMethod } from '../src/core/service'
import type { MediaItem } from '../src/core/types'
import { createDesktopPlatform } from './desktopPlatform'
import { McpHost } from './mcpHost'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const RENDERER_DIST = path.join(__dirname, '../dist')
const DEV_URL = process.env.VITE_DEV_SERVER_URL
const BROWSER_PARTITION = 'persist:browser'

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm',
}

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let minimizeToTray = true

if (!app.requestSingleInstanceLock()) app.quit()

const service = new AppService(createDesktopPlatform())
let mcpHost: McpHost

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><circle cx="22" cy="32" r="7" fill="#fff"/><circle cx="44" cy="20" r="6" fill="#fff"/><circle cx="44" cy="44" r="6" fill="#fff"/><path d="M22 32 44 20M22 32l22 12" stroke="#fff" stroke-width="4"/></svg>`
const appIcon = () => nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(ICON_SVG).toString('base64')}`)

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0b0d12',
    title: 'Social Hub',
    icon: appIcon(),
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? true : { color: '#00000000', symbolColor: '#a1a6b4', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      webviewTag: true,
      sandbox: true,
      contextIsolation: true,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-attach-webview', (_e, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    params.partition = BROWSER_PARTITION
  })
  win.on('close', (e) => {
    if (quitting) return
    if (!minimizeToTray) return quit()
    e.preventDefault()
    win?.hide()
  })

  if (DEV_URL) void win.loadURL(DEV_URL)
  else void win.loadFile(path.join(RENDERER_DIST, 'index.html'))
}

function createTray() {
  tray = new Tray(appIcon().resize({ width: 16, height: 16 }))
  tray.setToolTip('Social Hub — agendador ativo')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir Social Hub', click: showWindow },
      { type: 'separator' },
      { label: 'Sair', click: quit },
    ]),
  )
  tray.on('click', showWindow)
}

function showWindow() {
  if (!win) createWindow()
  win?.show()
  win?.focus()
}

function quit() {
  quitting = true
  app.quit()
}

/** Strips "Electron" from the UA so sites (e.g. Google sign-in) treat the built-in browser as Chrome. */
function setupBrowserSession() {
  const ses = session.fromPartition(BROWSER_PARTITION)
  ses.setUserAgent(app.userAgentFallback.replace(/\s(Electron|social-hub|Social Hub)\/\S+/gi, ''))
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(['notifications', 'fullscreen', 'clipboard-sanitized-write', 'media'].includes(permission)))
}

function setupIpc() {
  ipcMain.handle('service', async (_e, method: ServiceMethod, args: unknown[]) => {
    if (!serviceMethods.includes(method)) throw new Error(`Método não permitido: ${method}`)
    return (service[method] as (...a: unknown[]) => unknown)(...args)
  })
  ipcMain.handle('pick-media', async () => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Imagens e vídeos', extensions: Object.keys(MIME) }],
    })
    return r.filePaths.map<MediaItem>((p) => {
      const ext = path.extname(p).slice(1).toLowerCase()
      const mime = MIME[ext] ?? 'application/octet-stream'
      return { kind: mime.startsWith('video') ? 'video' : 'image', name: path.basename(p), mime, path: p }
    })
  })
  ipcMain.handle('open-external', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url)
  })
  ipcMain.handle('restart-mcp-host', async () => {
    const s = await service.store.getSettings()
    if (s.mcpHost.enabled) await mcpHost.start(s.mcpHost.port)
    else await mcpHost.stop()
    return mcpHost.info()
  })
  service.on((event) => {
    if (event.type === 'settings-changed') void service.store.getSettings().then((s) => (minimizeToTray = s.minimizeToTray))
    win?.webContents.send('service-event', event)
  })
}

app.on('web-contents-created', (_e, contents) => {
  // Popups inside the built-in browser open as new tabs instead of new windows.
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => {
      win?.webContents.send('browser-open-tab', url)
      return { action: 'deny' }
    })
  }
})

app.on('second-instance', showWindow)
app.on('activate', showWindow)
app.on('before-quit', () => {
  quitting = true
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && quitting) app.quit()
})

app.whenReady().then(async () => {
  app.setAppUserModelId('com.socialhub.app')
  setupBrowserSession()
  setupIpc()
  mcpHost = new McpHost(service, await service.store.getMcpHostToken())
  service.hostInfo = () => mcpHost.info()
  const settings = await service.store.getSettings()
  minimizeToTray = settings.minimizeToTray
  if (settings.mcpHost.enabled) await mcpHost.start(settings.mcpHost.port)
  await service.start()
  createWindow()
  createTray()
})

app.on('will-quit', () => {
  void service.stop()
  void mcpHost?.stop()
})
