import type { OAuthSpec } from '../oauth'
import type { Platform } from '../platform'
import type { Account, AnalyticsReport, MediaItem, NetworkCredentials, NetworkId, Settings, TokenSet } from '../types'

export interface NetworkInfo {
  id: NetworkId
  name: string
  color: string
  siteUrl: string
  developerUrl: string
  /** Shown in Settings so the user knows how to register their developer app. */
  setupSteps: string[]
  needsSecret: boolean
  redirectHost: 'localhost' | '127.0.0.1'
  capabilities: {
    text: boolean
    image: boolean
    video: boolean
    link: boolean
    title?: boolean
    maxLength?: number
    /** The network cannot publish without this kind of media. */
    requiresMedia?: 'image-or-video' | 'video'
    note?: string
  }
}

export interface ConnectorContext {
  platform: Platform
  settings: Settings
  credentials: NetworkCredentials
  accessToken: string
}

/** The text and media that should be published to one specific account. */
export interface ResolvedPost {
  text: string
  title?: string
  link?: string
  media: MediaItem[]
}

export interface DiscoveredAccount {
  account: Omit<Account, 'id' | 'connectedAt'>
  token: TokenSet
}

export interface Connector {
  info: NetworkInfo
  oauth(settings: Settings): OAuthSpec
  /** Called once after OAuth. May exchange tokens and return several accounts (e.g. Facebook pages). */
  discover(token: TokenSet, ctx: Omit<ConnectorContext, 'accessToken'>): Promise<DiscoveredAccount[]>
  publish(account: Account, post: ResolvedPost, ctx: ConnectorContext): Promise<{ url?: string; externalId?: string }>
  analytics(account: Account, ctx: ConnectorContext): Promise<Omit<AnalyticsReport, 'accountId' | 'fetchedAt'>>
  /** Whether stored tokens can be refreshed with the OAuth refresh grant. */
  refreshable: boolean
}

export async function readMedia(platform: Platform, item: MediaItem): Promise<Blob> {
  if (item.path) {
    if (!platform.readFile) throw new Error('Envio de arquivos locais não é suportado nesta plataforma. Use uma URL pública.')
    const bytes = await platform.readFile(item.path)
    return new Blob([bytes as BlobPart], { type: item.mime })
  }
  if (item.url) {
    const res = await fetch(item.url)
    if (!res.ok) throw new Error(`Não foi possível baixar a mídia: ${item.url}`)
    return await res.blob()
  }
  throw new Error(`Mídia sem arquivo ou URL: ${item.name}`)
}
