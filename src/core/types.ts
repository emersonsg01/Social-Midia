export type NetworkId = 'x' | 'linkedin' | 'facebook' | 'instagram' | 'youtube' | 'twitch'

export interface TokenSet {
  accessToken: string
  refreshToken?: string
  /** Epoch ms. Undefined means the token does not expire (or we don't know). */
  expiresAt?: number
  scope?: string
}

/** OAuth app credentials the user registers on each network's developer portal. */
export interface NetworkCredentials {
  clientId: string
  clientSecret?: string
  redirectUri?: string
}

/** A profile, page or channel the user can publish to and analyze. */
export interface Account {
  id: string
  network: NetworkId
  externalId: string
  name: string
  handle?: string
  avatarUrl?: string
  profileUrl?: string
  /** Network-specific data (e.g. the Facebook page an Instagram account belongs to). */
  meta?: Record<string, string>
  connectedAt: string
}

export interface MediaItem {
  kind: 'image' | 'video'
  name: string
  mime: string
  /** Local file path (desktop). Required for uploads such as YouTube videos. */
  path?: string
  /** Public URL. Instagram only accepts media by public URL. */
  url?: string
}

export interface PostDraft {
  text: string
  /** Video title (YouTube) or stream title (Twitch). */
  title?: string
  link?: string
  media: MediaItem[]
  accountIds: string[]
  /** Per-account text overrides. */
  overrides?: Record<string, { text?: string; title?: string }>
}

export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'partial' | 'failed'

export interface PublishResult {
  ok: boolean
  url?: string
  externalId?: string
  error?: string
  at: string
}

export interface Post {
  id: string
  draft: PostDraft
  /** ISO date. Null for drafts. */
  scheduledAt: string | null
  status: PostStatus
  results: Record<string, PublishResult>
  createdAt: string
  updatedAt: string
}

export interface Metric {
  label: string
  value: number
}

export interface RecentItem {
  id: string
  text: string
  url?: string
  createdAt?: string
  thumbnailUrl?: string
  metrics: Metric[]
}

export interface AnalyticsReport {
  accountId: string
  fetchedAt: string
  followers?: number
  /** Headline numbers shown as cards. */
  metrics: Metric[]
  recent: RecentItem[]
  /** API limitations worth telling the user about. */
  notes?: string[]
}

/** Daily snapshot used to draw growth charts. */
export interface Snapshot {
  accountId: string
  date: string // YYYY-MM-DD
  followers?: number
  metrics: Record<string, number>
}

export type AIProviderKind = 'anthropic' | 'openai' | 'gemini' | 'ollama' | 'lmstudio' | 'openai-compatible'

export interface AIProviderConfig {
  id: string
  kind: AIProviderKind
  name: string
  model: string
  baseUrl?: string
  /** Stored in the secret vault, never in plain settings. */
  hasApiKey?: boolean
}

export interface McpServerConfig {
  id: string
  name: string
  enabled: boolean
  transport: 'stdio' | 'http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
}

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  defaultProviderId?: string
  providers: AIProviderConfig[]
  mcpServers: McpServerConfig[]
  /** Local MCP server so Claude, ChatGPT, LM Studio etc. can drive this app. */
  mcpHost: { enabled: boolean; port: number }
  oauthPort: number
  linkedinVersion: string
  minimizeToTray: boolean
  /** Networks whose credentials are filled in (secrets themselves live in the vault). */
  configuredNetworks: NetworkId[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: { id: string; name: string; args: unknown }[]
  toolCallId?: string
  toolName?: string
  createdAt: string
}

export interface Conversation {
  id: string
  title: string
  providerId?: string
  messages: ChatMessage[]
  updatedAt: string
}

export interface AppEvent {
  type: 'posts-changed' | 'accounts-changed' | 'settings-changed' | 'chat-progress' | 'notification'
  payload?: unknown
}
