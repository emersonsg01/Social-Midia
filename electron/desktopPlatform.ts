import { Notification, app, safeStorage, shell } from 'electron'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import type { Platform } from '../src/core/platform'

const dataDir = () => path.join(app.getPath('userData'), 'data')

/** JSON file per key, cached in memory, written atomically. */
class JsonFiles {
  private cache = new Map<string, unknown>()
  private writes = new Map<string, Promise<void>>()

  private file = (key: string) => path.join(dataDir(), `${key.replace(/[^a-z0-9_-]/gi, '_')}.json`)

  async get<T>(key: string): Promise<T | undefined> {
    if (this.cache.has(key)) return structuredClone(this.cache.get(key)) as T
    try {
      const value = JSON.parse(await fs.readFile(this.file(key), 'utf8'))
      this.cache.set(key, value)
      return structuredClone(value)
    } catch {
      return undefined
    }
  }

  async set(key: string, value: unknown) {
    this.cache.set(key, structuredClone(value))
    const prev = this.writes.get(key) ?? Promise.resolve()
    const next = prev.then(async () => {
      await fs.mkdir(dataDir(), { recursive: true })
      const tmp = `${this.file(key)}.tmp`
      await fs.writeFile(tmp, JSON.stringify(value))
      await fs.rename(tmp, this.file(key))
    })
    this.writes.set(key, next.catch(() => undefined))
    await next
  }
}

const SUCCESS_PAGE = (ok: boolean) => `<!doctype html><meta charset="utf-8"><title>Social Hub</title>
<body style="font-family:system-ui;background:#0b0d12;color:#e6e8ee;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><div style="font-size:48px">${ok ? '✅' : '⚠️'}</div>
<h2>${ok ? 'Conta autorizada!' : 'Autorização não concluída'}</h2><p style="opacity:.7">Você já pode fechar esta aba e voltar ao Social Hub.</p></div></body>`

/** Listens on the loopback redirect URI until the provider redirects back with the code. */
function waitForRedirect(redirectUri: string, timeoutMs = 5 * 60_000): { ready: Promise<void>; result: Promise<string> } {
  const target = new URL(redirectUri)
  const port = Number(target.port || 80)
  const servers: http.Server[] = []
  let resolveResult!: (v: string) => void
  let rejectResult!: (e: Error) => void
  const result = new Promise<string>((res, rej) => ((resolveResult = res), (rejectResult = rej)))

  const close = () => servers.forEach((s) => s.close())
  const timer = setTimeout(() => {
    close()
    rejectResult(new Error('Tempo esgotado aguardando a autorização no navegador.'))
  }, timeoutMs)

  const handler: http.RequestListener = (req, res) => {
    const url = new URL(req.url ?? '/', redirectUri)
    if (url.pathname !== target.pathname) {
      res.writeHead(404).end()
      return
    }
    const ok = url.searchParams.has('code')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(SUCCESS_PAGE(ok))
    clearTimeout(timer)
    close()
    resolveResult(url.toString())
  }

  // "localhost" may resolve to IPv4 or IPv6 in the browser, so listen on both loopbacks.
  const hosts = ['127.0.0.1', '::1']
  const ready = Promise.all(
    hosts.map(
      (host, i) =>
        new Promise<void>((res, rej) => {
          const s = http.createServer(handler)
          servers.push(s)
          s.once('error', (e: NodeJS.ErrnoException) => (i === 0 ? rej(new Error(`Porta ${port} indisponível para o login OAuth: ${e.message}`)) : res()))
          s.listen(port, host, () => res())
        }),
    ),
  ).then(() => undefined)
  ready.catch((e) => {
    clearTimeout(timer)
    close()
    rejectResult(e)
  })
  return { ready, result }
}

export function createDesktopPlatform(): Platform {
  const files = new JsonFiles()

  let vaultLock: Promise<void> = Promise.resolve()
  const readVault = async () => (await files.get<Record<string, string>>('vault')) ?? {}

  return {
    name: 'desktop',
    storage: { get: (k) => files.get(k), set: (k, v) => files.set(k, v) },
    secrets: {
      async get(key) {
        const enc = (await readVault())[key]
        if (!enc) return undefined
        const buf = Buffer.from(enc, 'base64')
        return (await safeStorage.isAsyncEncryptionAvailable()) ? (await safeStorage.decryptStringAsync(buf)).result : buf.toString('utf8')
      },
      // Serialized so concurrent writes don't overwrite each other's keys.
      set(key, value) {
        const write = vaultLock.then(async () => {
          const vault = await readVault()
          if (value === undefined) delete vault[key]
          else
            vault[key] = ((await safeStorage.isAsyncEncryptionAvailable()) ? await safeStorage.encryptStringAsync(value) : Buffer.from(value, 'utf8')).toString('base64')
          await files.set('vault', vault)
        })
        vaultLock = write.catch(() => undefined)
        return write
      },
    },
    async authorize(authUrl, redirectUri) {
      const { ready, result } = waitForRedirect(redirectUri)
      await ready
      await shell.openExternal(authUrl)
      return result
    },
    readFile: async (p) => new Uint8Array(await fs.readFile(p)),
    notify(title, body) {
      if (Notification.isSupported()) new Notification({ title, body }).show()
    },
    createMcpTransport(config) {
      if (config.transport === 'stdio') {
        if (!config.command) throw new Error('Informe o comando do servidor MCP.')
        return new StdioClientTransport({
          command: config.command,
          args: config.args ?? [],
          env: { ...(process.env as Record<string, string>), ...config.env },
          stderr: 'ignore',
        })
      }
      if (!config.url) throw new Error('Informe a URL do servidor MCP.')
      return new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } })
    },
  }
}
