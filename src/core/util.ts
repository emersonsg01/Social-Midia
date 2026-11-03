export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const nowIso = () => new Date().toISOString()

export const todayKey = (d = new Date()) => d.toISOString().slice(0, 10)

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message)
  }
}

/** fetch wrapper that throws readable errors with the provider's message. */
export async function http<T = any>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  const headers = new Headers(rest.headers)
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
    rest.body = JSON.stringify(json)
  }
  let res: Response
  try {
    res = await fetch(url, { ...rest, headers })
  } catch (e) {
    throw new Error(`Não foi possível conectar a ${new URL(url).host}. Verifique sua internet ou se o serviço está rodando. (${errorMessage(e)})`)
  }
  const text = await res.text()
  let body: any = text
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const msg =
      body?.error?.message ??
      body?.error_description ??
      body?.detail ??
      body?.message ??
      body?.errors?.[0]?.message ??
      (typeof body?.error === 'string' ? body.error : undefined) ??
      (typeof body === 'string' && body ? body.slice(0, 300) : res.statusText)
    throw new HttpError(res.status, `${res.status}: ${msg}`, body)
  }
  return body as T
}

export const form = (data: Record<string, string | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(data)) if (v !== undefined) p.set(k, v)
  return p
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function base64Url(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
