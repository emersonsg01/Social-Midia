import type { Platform } from './platform'
import type { Account, Conversation, NetworkCredentials, NetworkId, Post, Settings, Snapshot, TokenSet } from './types'

export const defaultSettings: Settings = {
  theme: 'dark',
  providers: [],
  mcpServers: [],
  mcpHost: { enabled: true, port: 3917 },
  oauthPort: 53682,
  linkedinVersion: '202510',
  minimizeToTray: true,
  configuredNetworks: [],
}

/** Typed repository over the platform's storage and secret vault. */
export class Store {
  constructor(private platform: Platform) {}

  private async list<T>(key: string) {
    return (await this.platform.storage.get<T[]>(key)) ?? []
  }

  async getSettings(): Promise<Settings> {
    const s = await this.platform.storage.get<Partial<Settings>>('settings')
    return { ...defaultSettings, ...s, mcpHost: { ...defaultSettings.mcpHost, ...s?.mcpHost } }
  }
  saveSettings = (s: Settings) => this.platform.storage.set('settings', s)

  getAccounts = () => this.list<Account>('accounts')
  saveAccounts = (a: Account[]) => this.platform.storage.set('accounts', a)

  getPosts = () => this.list<Post>('posts')
  savePosts = (p: Post[]) => this.platform.storage.set('posts', p)

  getSnapshots = () => this.list<Snapshot>('snapshots')
  saveSnapshots = (s: Snapshot[]) => this.platform.storage.set('snapshots', s)

  getConversations = () => this.list<Conversation>('conversations')
  saveConversations = (c: Conversation[]) => this.platform.storage.set('conversations', c)

  async getToken(accountId: string): Promise<TokenSet | undefined> {
    const raw = await this.platform.secrets.get(`token:${accountId}`)
    return raw ? JSON.parse(raw) : undefined
  }
  setToken = (accountId: string, t: TokenSet | undefined) =>
    this.platform.secrets.set(`token:${accountId}`, t ? JSON.stringify(t) : undefined)

  async getCredentials(network: NetworkId): Promise<NetworkCredentials | undefined> {
    const raw = await this.platform.secrets.get(`cred:${network}`)
    return raw ? JSON.parse(raw) : undefined
  }
  setCredentials = (network: NetworkId, c: NetworkCredentials | undefined) =>
    this.platform.secrets.set(`cred:${network}`, c ? JSON.stringify(c) : undefined)

  getApiKey = (providerId: string) => this.platform.secrets.get(`ai:${providerId}`)
  setApiKey = (providerId: string, key: string | undefined) => this.platform.secrets.set(`ai:${providerId}`, key)

  async getMcpHostToken() {
    let t = await this.platform.secrets.get('mcp-host-token')
    if (!t) {
      const bytes = crypto.getRandomValues(new Uint8Array(24))
      t = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
      await this.platform.secrets.set('mcp-host-token', t)
    }
    return t
  }
}
