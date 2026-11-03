import type { Platform } from './platform'
import type { NetworkCredentials, TokenSet } from './types'
import { base64Url, form, http } from './util'

export interface OAuthSpec {
  authorizeUrl: string
  tokenUrl: string
  scopes: string[]
  scopeSeparator?: string
  pkce?: boolean
  /** Send client credentials as HTTP Basic auth instead of in the body (X requires this for confidential clients). */
  basicAuth?: boolean
  extraAuthParams?: Record<string, string>
}

async function pkcePair() {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return { verifier, challenge: base64Url(new Uint8Array(digest)) }
}

function toTokenSet(r: any, previous?: TokenSet): TokenSet {
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token ?? previous?.refreshToken,
    expiresAt: r.expires_in ? Date.now() + Number(r.expires_in) * 1000 : undefined,
    scope: Array.isArray(r.scope) ? r.scope.join(' ') : r.scope,
  }
}

function tokenRequest(spec: OAuthSpec, cred: NetworkCredentials, params: Record<string, string | undefined>) {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }
  const body = form({ ...params, client_id: cred.clientId })
  if (cred.clientSecret) {
    if (spec.basicAuth) headers.Authorization = `Basic ${btoa(`${cred.clientId}:${cred.clientSecret}`)}`
    else body.set('client_secret', cred.clientSecret)
  }
  return http(spec.tokenUrl, { method: 'POST', headers, body })
}

/** Runs the authorization-code flow (with PKCE when supported) in the system browser. */
export async function runOAuth(platform: Platform, spec: OAuthSpec, cred: NetworkCredentials, redirectUri: string) {
  const state = base64Url(crypto.getRandomValues(new Uint8Array(16)))
  const url = new URL(spec.authorizeUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', cred.clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', spec.scopes.join(spec.scopeSeparator ?? ' '))
  url.searchParams.set('state', state)
  for (const [k, v] of Object.entries(spec.extraAuthParams ?? {})) url.searchParams.set(k, v)

  let verifier: string | undefined
  if (spec.pkce) {
    const p = await pkcePair()
    verifier = p.verifier
    url.searchParams.set('code_challenge', p.challenge)
    url.searchParams.set('code_challenge_method', 'S256')
  }

  const callback = new URL(await platform.authorize(url.toString(), redirectUri))
  const error = callback.searchParams.get('error_description') ?? callback.searchParams.get('error')
  if (error) throw new Error(`Autorização recusada: ${error}`)
  if (callback.searchParams.get('state') !== state) throw new Error('Resposta OAuth inválida (state não confere).')
  const code = callback.searchParams.get('code')
  if (!code) throw new Error('A rede não retornou um código de autorização.')

  const r = await tokenRequest(spec, cred, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  })
  return toTokenSet(r)
}

export async function refreshOAuth(spec: OAuthSpec, cred: NetworkCredentials, token: TokenSet) {
  if (!token.refreshToken) throw new Error('Sessão expirada. Reconecte a conta.')
  const r = await tokenRequest(spec, cred, { grant_type: 'refresh_token', refresh_token: token.refreshToken })
  return toTokenSet(r, token)
}
