import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Preferences } from '@capacitor/preferences'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { Platform } from '@/core/platform'

/**
 * Platform for Android/iOS (Capacitor) and for running the UI in a plain browser.
 * Secrets use Preferences (app-private storage); fetch goes through native HTTP (no CORS).
 */
export function createMobilePlatform(): Platform {
  const prefs = {
    async get(key: string) {
      return (await Preferences.get({ key })).value ?? undefined
    },
    async set(key: string, value: string | undefined) {
      if (value === undefined) await Preferences.remove({ key })
      else await Preferences.set({ key, value })
    },
  }

  return {
    name: 'mobile',
    storage: {
      async get<T>(key: string) {
        const raw = await prefs.get(`data:${key}`)
        return raw ? (JSON.parse(raw) as T) : undefined
      },
      set: (key, value) => prefs.set(`data:${key}`, JSON.stringify(value)),
    },
    secrets: { get: (k) => prefs.get(`secret:${k}`), set: (k, v) => prefs.set(`secret:${k}`, v) },
    async authorize(authUrl, redirectUri) {
      // The redirect URI must be a deep link registered for the app (e.g. com.socialhub.app://oauth).
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Tempo esgotado aguardando a autorização.')), 5 * 60_000)
        void App.addListener('appUrlOpen', ({ url }) => {
          if (!url.startsWith(redirectUri)) return
          clearTimeout(timer)
          void Browser.close()
          resolve(url)
        })
        void Browser.open({ url: authUrl })
      })
    },
    notify(title, body) {
      if ('Notification' in globalThis && Notification.permission === 'granted') new Notification(title, { body })
    },
    createMcpTransport(config) {
      if (config.transport !== 'http' || !config.url) throw new Error('No celular, apenas servidores MCP via HTTP são suportados.')
      return new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } })
    },
  }
}
