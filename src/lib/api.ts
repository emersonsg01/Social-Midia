import type { AppService, ServiceMethod } from '@/core/service'
import type { AppEvent, MediaItem } from '@/core/types'
import type { McpHostInfo } from '@/core/service'

interface DesktopBridge {
  os: string
  invoke(method: string, args: unknown[]): Promise<any>
  onEvent(cb: (e: AppEvent) => void): () => void
  onBrowserOpenTab(cb: (url: string) => void): () => void
  pickMedia(): Promise<MediaItem[]>
  openExternal(url: string): Promise<void>
  restartMcpHost(): Promise<McpHostInfo>
}

declare global {
  interface Window {
    desktop?: DesktopBridge
  }
}

export const desktop = window.desktop
export const isDesktop = !!desktop

type Api = {
  [K in ServiceMethod]: AppService[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<Awaited<R>> : never
}

// On mobile the service runs inside the WebView itself.
let local: Promise<AppService> | undefined
function localService() {
  local ??= (async () => {
    const [{ AppService }, { createMobilePlatform }] = await Promise.all([import('@/core/service'), import('@/mobile/mobilePlatform')])
    const s = new AppService(createMobilePlatform())
    await s.start()
    return s
  })()
  return local
}

export const api = new Proxy({} as Api, {
  get: (_t, method: string) => async (...args: unknown[]) => {
    if (desktop)
      return desktop.invoke(method, args).catch((e: Error) => {
        // Electron prefixes IPC errors with "Error invoking remote method ...".
        throw new Error(e.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, ''))
      })
    const s = await localService()
    return (s[method as ServiceMethod] as (...a: unknown[]) => unknown).apply(s, args)
  },
})

export function onAppEvent(cb: (e: AppEvent) => void): () => void {
  if (desktop) return desktop.onEvent(cb)
  let off = () => {}
  let cancelled = false
  void localService().then((s) => {
    if (!cancelled) off = s.on(cb) as () => void
  })
  return () => {
    cancelled = true
    off()
  }
}

export function openExternal(url: string) {
  if (desktop) return desktop.openExternal(url)
  window.open(url, '_blank')
}
