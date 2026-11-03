import { contextBridge, ipcRenderer } from 'electron'

const listen = (channel: string, cb: (payload: any) => void) => {
  const handler = (_e: unknown, payload: unknown) => cb(payload)
  ipcRenderer.on(channel, handler)
  return () => void ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('desktop', {
  os: process.platform,
  invoke: (method: string, args: unknown[]) => ipcRenderer.invoke('service', method, args),
  onEvent: (cb: (e: unknown) => void) => listen('service-event', cb),
  onBrowserOpenTab: (cb: (url: string) => void) => listen('browser-open-tab', cb),
  pickMedia: () => ipcRenderer.invoke('pick-media'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  restartMcpHost: () => ipcRenderer.invoke('restart-mcp-host'),
})
