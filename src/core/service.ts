import { complete, listModels, providerPresets, type LlmMessage, type ToolDef } from './ai'
import { McpClients } from './mcpClients'
import { connectors, defaultRedirectUri, networkList } from './networks'
import type { ResolvedPost } from './networks/types'
import { refreshOAuth, runOAuth } from './oauth'
import type { Platform } from './platform'
import { Store } from './store'
import { buildTools } from './tools'
import type {
  Account,
  AIProviderConfig,
  AnalyticsReport,
  AppEvent,
  ChatMessage,
  Conversation,
  McpServerConfig,
  NetworkId,
  Post,
  PostDraft,
  PublishResult,
  Settings,
} from './types'
import { errorMessage, nowIso, todayKey, uid } from './util'

export interface McpHostInfo {
  running: boolean
  url: string
  token: string
  error?: string
}

export interface NetworkSetup {
  network: NetworkId
  clientId: string
  hasSecret: boolean
  redirectUri: string
  defaultRedirectUri: string
}

const SCHEDULER_INTERVAL = 30_000
const ANALYTICS_INTERVAL = 6 * 60 * 60_000

const SYSTEM_PROMPT = `Você é o assistente do Social Hub, um app que gerencia as redes sociais do usuário (LinkedIn, Facebook, Instagram, YouTube, Twitch e X).
Responda em português do Brasil, de forma objetiva. Use as ferramentas para consultar contas, métricas e publicações em vez de inventar dados.
Ao criar conteúdo, adapte o tom e o tamanho a cada rede. Nunca publique imediatamente sem que o usuário tenha pedido isso de forma explícita — prefira criar rascunhos ou agendamentos.
Data e hora atuais: {now}.`

/** The whole application logic. UI talks to it through IPC (desktop) or directly (mobile). */
export class AppService {
  readonly store: Store
  readonly mcp: McpClients
  private listeners = new Set<(e: AppEvent) => void>()
  private analyticsCache = new Map<string, AnalyticsReport>()
  private postsLock: Promise<unknown> = Promise.resolve()
  private timers: ReturnType<typeof setInterval>[] = []
  private publishing = new Set<string>()
  /** Set by the desktop host, which runs the local MCP server. */
  hostInfo?: () => McpHostInfo

  constructor(readonly platform: Platform) {
    this.store = new Store(platform)
    this.mcp = new McpClients(platform, () => this.emit({ type: 'settings-changed' }))
  }

  // ---------- lifecycle & events ----------

  async start() {
    const settings = await this.store.getSettings()
    void this.mcp.sync(settings.mcpServers)
    // Posts left "publishing" by a crash go back to the queue.
    await this.mutatePosts((posts) => posts.map((p) => (p.status === 'publishing' ? { ...p, status: 'scheduled' as const } : p)))
    this.timers.push(setInterval(() => void this.runDuePosts(), SCHEDULER_INTERVAL))
    this.timers.push(setInterval(() => void this.refreshAllAnalytics(), ANALYTICS_INTERVAL))
    void this.runDuePosts()
    setTimeout(() => void this.refreshAllAnalytics(), 10_000)
  }

  async stop() {
    this.timers.forEach(clearInterval)
    await this.mcp.closeAll()
  }

  on(listener: (e: AppEvent) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(e: AppEvent) {
    this.listeners.forEach((l) => l(e))
  }

  // ---------- state & settings ----------

  async getState() {
    const [settings, accounts, posts] = await Promise.all([this.store.getSettings(), this.store.getAccounts(), this.store.getPosts()])
    return { platform: this.platform.name, settings, accounts, posts, networks: networkList }
  }

  async updateSettings(patch: Partial<Settings>) {
    const next = { ...(await this.store.getSettings()), ...patch }
    await this.store.saveSettings(next)
    if (patch.mcpServers) await this.mcp.sync(next.mcpServers)
    this.emit({ type: 'settings-changed' })
    return next
  }

  // ---------- networks & accounts ----------

  async getNetworkSetup(network: NetworkId): Promise<NetworkSetup> {
    const [cred, settings] = await Promise.all([this.store.getCredentials(network), this.store.getSettings()])
    const def = defaultRedirectUri(network, settings)
    return { network, clientId: cred?.clientId ?? '', hasSecret: !!cred?.clientSecret, redirectUri: cred?.redirectUri || def, defaultRedirectUri: def }
  }

  /** `clientSecret` undefined keeps the stored secret; empty string clears it. */
  async setNetworkSetup(network: NetworkId, input: { clientId: string; clientSecret?: string; redirectUri?: string }) {
    const prev = await this.store.getCredentials(network)
    const clientSecret = input.clientSecret === undefined ? prev?.clientSecret : input.clientSecret || undefined
    const settings = await this.store.getSettings()
    if (!input.clientId) {
      await this.store.setCredentials(network, undefined)
    } else {
      await this.store.setCredentials(network, { clientId: input.clientId.trim(), clientSecret: clientSecret?.trim(), redirectUri: input.redirectUri?.trim() || undefined })
    }
    const configured = new Set(settings.configuredNetworks)
    if (input.clientId) configured.add(network)
    else configured.delete(network)
    await this.updateSettings({ configuredNetworks: [...configured] })
  }

  async connect(network: NetworkId): Promise<Account[]> {
    const connector = connectors[network]
    const [cred, settings] = await Promise.all([this.store.getCredentials(network), this.store.getSettings()])
    if (!cred?.clientId) throw new Error(`Configure o app de desenvolvedor do ${connector.info.name} antes de conectar.`)
    if (connector.info.needsSecret && !cred.clientSecret) throw new Error(`O ${connector.info.name} exige o Client Secret.`)
    const redirectUri = cred.redirectUri || defaultRedirectUri(network, settings)
    const token = await runOAuth(this.platform, connector.oauth(settings), cred, redirectUri)
    const found = await connector.discover(token, { platform: this.platform, settings, credentials: cred })

    const accounts = await this.store.getAccounts()
    const added: Account[] = []
    for (const { account, token: accountToken } of found) {
      const existing = accounts.find((a) => a.network === network && a.externalId === account.externalId)
      const full: Account = { ...account, id: existing?.id ?? uid(), connectedAt: nowIso() }
      await this.store.setToken(full.id, accountToken)
      if (existing) accounts.splice(accounts.indexOf(existing), 1, full)
      else accounts.push(full)
      added.push(full)
    }
    await this.store.saveAccounts(accounts)
    this.emit({ type: 'accounts-changed' })
    void Promise.all(added.map((a) => this.getAnalytics(a.id, true).catch(() => undefined)))
    return added
  }

  async disconnect(accountId: string) {
    const accounts = await this.store.getAccounts()
    await this.store.saveAccounts(accounts.filter((a) => a.id !== accountId))
    await this.store.setToken(accountId, undefined)
    this.analyticsCache.delete(accountId)
    this.emit({ type: 'accounts-changed' })
  }

  private async account(accountId: string) {
    const a = (await this.store.getAccounts()).find((x) => x.id === accountId)
    if (!a) throw new Error(`Conta não encontrada: ${accountId}`)
    return a
  }

  /** Builds the connector context, refreshing the access token when it is about to expire. */
  private async context(account: Account) {
    const connector = connectors[account.network]
    const [settings, cred] = await Promise.all([this.store.getSettings(), this.store.getCredentials(account.network)])
    if (!cred) throw new Error(`Credenciais do ${connector.info.name} não configuradas.`)
    let token = await this.store.getToken(account.id)
    if (!token) throw new Error(`Conta ${account.name} sem sessão. Reconecte-a.`)
    if (token.expiresAt && token.expiresAt - 120_000 < Date.now()) {
      if (!connector.refreshable || !token.refreshToken) throw new Error(`A sessão de ${account.name} (${connector.info.name}) expirou. Reconecte a conta.`)
      token = await refreshOAuth(connector.oauth(settings), cred, token)
      await this.store.setToken(account.id, token)
    }
    return { platform: this.platform, settings, credentials: cred, accessToken: token.accessToken }
  }

  // ---------- analytics ----------

  async getAnalytics(accountId: string, refresh = false): Promise<AnalyticsReport> {
    const cached = this.analyticsCache.get(accountId)
    if (cached && !refresh) return cached
    const account = await this.account(accountId)
    const data = await connectors[account.network].analytics(account, await this.context(account))
    const report: AnalyticsReport = { ...data, accountId, fetchedAt: nowIso() }
    this.analyticsCache.set(accountId, report)
    await this.saveSnapshot(report)
    return report
  }

  private async saveSnapshot(r: AnalyticsReport) {
    const date = todayKey()
    const snaps = (await this.store.getSnapshots()).filter((s) => !(s.accountId === r.accountId && s.date === date))
    snaps.push({ accountId: r.accountId, date, followers: r.followers, metrics: Object.fromEntries(r.metrics.map((m) => [m.label, m.value])) })
    await this.store.saveSnapshots(snaps.slice(-5000))
  }

  async getSnapshots(accountId?: string) {
    const snaps = await this.store.getSnapshots()
    return accountId ? snaps.filter((s) => s.accountId === accountId) : snaps
  }

  async refreshAllAnalytics() {
    const accounts = await this.store.getAccounts()
    const results = await Promise.allSettled(accounts.map((a) => this.getAnalytics(a.id, true)))
    return results.map((r, i) => ({ accountId: accounts[i].id, ok: r.status === 'fulfilled', error: r.status === 'rejected' ? errorMessage(r.reason) : undefined }))
  }

  // ---------- posts & scheduler ----------

  private mutatePosts<T>(fn: (posts: Post[]) => Post[] | Promise<Post[]>, result?: (posts: Post[]) => T): Promise<T> {
    const run = this.postsLock.then(async () => {
      const next = await fn(await this.store.getPosts())
      await this.store.savePosts(next)
      this.emit({ type: 'posts-changed' })
      return result?.(next) as T
    })
    this.postsLock = run.catch(() => undefined)
    return run
  }

  listPosts = () => this.store.getPosts()

  /** Creates or updates a post. `scheduledAt` null keeps it as a draft. */
  async savePost(input: { id?: string; draft: PostDraft; scheduledAt: string | null }): Promise<Post> {
    if (!input.draft.accountIds.length) throw new Error('Escolha ao menos uma conta.')
    if (!input.draft.text.trim() && !input.draft.media.length && !input.draft.title) throw new Error('A publicação está vazia.')
    const id = input.id ?? uid()
    return this.mutatePosts(
      (posts) => {
        const prev = posts.find((p) => p.id === id)
        if (prev && (prev.status === 'publishing' || prev.status === 'published')) throw new Error('Esta publicação já foi enviada.')
        const post: Post = {
          id,
          draft: input.draft,
          scheduledAt: input.scheduledAt,
          status: input.scheduledAt ? 'scheduled' : 'draft',
          results: prev?.results ?? {},
          createdAt: prev?.createdAt ?? nowIso(),
          updatedAt: nowIso(),
        }
        return prev ? posts.map((p) => (p.id === id ? post : p)) : [...posts, post]
      },
      (posts) => posts.find((p) => p.id === id)!,
    )
  }

  deletePost = (id: string) => this.mutatePosts((posts) => posts.filter((p) => p.id !== id || p.status === 'publishing'))

  async publishNow(id: string): Promise<Post> {
    if (this.publishing.has(id)) throw new Error('Esta publicação já está sendo enviada.')
    this.publishing.add(id)
    try {
      const post = await this.mutatePosts(
        (posts) => posts.map((p) => (p.id === id ? { ...p, status: 'publishing' as const, updatedAt: nowIso() } : p)),
        (posts) => posts.find((p) => p.id === id),
      )
      if (!post) throw new Error('Publicação não encontrada.')
      // Only accounts that haven't succeeded yet — lets "retry" skip the ones that worked.
      const pending = post.draft.accountIds.filter((aid) => !post.results[aid]?.ok)
      const results: Record<string, PublishResult> = { ...post.results }
      for (const accountId of pending) results[accountId] = await this.publishToAccount(post.draft, accountId)

      const oks = post.draft.accountIds.filter((aid) => results[aid]?.ok).length
      const status = oks === post.draft.accountIds.length ? 'published' : oks ? 'partial' : 'failed'
      const updated = await this.mutatePosts(
        (posts) => posts.map((p) => (p.id === id ? { ...p, results, status, updatedAt: nowIso() } : p)),
        (posts) => posts.find((p) => p.id === id)!,
      )
      const failures = Object.values(results).filter((r) => !r.ok).length
      this.platform.notify(
        status === 'published' ? 'Publicação enviada' : 'Problema ao publicar',
        status === 'published' ? `Publicado em ${oks} conta(s).` : `${oks} ok, ${failures} com erro. Veja os detalhes no Calendário.`,
      )
      return updated
    } finally {
      this.publishing.delete(id)
    }
  }

  private async publishToAccount(draft: PostDraft, accountId: string): Promise<PublishResult> {
    try {
      const account = await this.account(accountId)
      const connector = connectors[account.network]
      const o = draft.overrides?.[accountId]
      const post: ResolvedPost = { text: o?.text ?? draft.text, title: o?.title ?? draft.title, link: draft.link, media: draft.media }
      const caps = connector.info.capabilities
      if (caps.requiresMedia === 'video' && !post.media.some((m) => m.kind === 'video')) throw new Error(`${connector.info.name} exige um vídeo.`)
      if (caps.requiresMedia === 'image-or-video' && !post.media.length) throw new Error(`${connector.info.name} exige imagem ou vídeo.`)
      if (caps.maxLength && post.text.length > caps.maxLength) throw new Error(`Texto excede ${caps.maxLength} caracteres no ${connector.info.name}.`)
      const r = await connector.publish(account, post, await this.context(account))
      return { ok: true, ...r, at: nowIso() }
    } catch (e) {
      return { ok: false, error: errorMessage(e), at: nowIso() }
    }
  }

  private async runDuePosts() {
    const now = Date.now()
    const due = (await this.store.getPosts()).filter((p) => p.status === 'scheduled' && p.scheduledAt && Date.parse(p.scheduledAt) <= now)
    for (const p of due) await this.publishNow(p.id).catch(() => undefined)
  }

  // ---------- AI providers ----------

  async saveProvider(config: Omit<AIProviderConfig, 'id' | 'hasApiKey'> & { id?: string }, apiKey?: string) {
    const settings = await this.store.getSettings()
    const id = config.id ?? uid()
    if (apiKey !== undefined) await this.store.setApiKey(id, apiKey || undefined)
    const hasApiKey = !!(await this.store.getApiKey(id))
    const provider: AIProviderConfig = { ...config, id, hasApiKey }
    const providers = settings.providers.some((p) => p.id === id) ? settings.providers.map((p) => (p.id === id ? provider : p)) : [...settings.providers, provider]
    await this.updateSettings({ providers, defaultProviderId: settings.defaultProviderId ?? id })
    return provider
  }

  async deleteProvider(id: string) {
    const settings = await this.store.getSettings()
    await this.store.setApiKey(id, undefined)
    const providers = settings.providers.filter((p) => p.id !== id)
    await this.updateSettings({ providers, defaultProviderId: settings.defaultProviderId === id ? providers[0]?.id : settings.defaultProviderId })
  }

  /** Lists models of a saved provider, or of an unsaved one being edited (with a key typed in the form). */
  async listModels(config: AIProviderConfig, apiKey?: string) {
    return listModels(config, apiKey || (await this.store.getApiKey(config.id)))
  }

  private async provider(providerId?: string) {
    const settings = await this.store.getSettings()
    const p = settings.providers.find((x) => x.id === (providerId ?? settings.defaultProviderId)) ?? settings.providers[0]
    if (!p) throw new Error('Nenhuma IA configurada. Adicione uma em Configurações > IA.')
    if (providerPresets[p.kind].needsKey && !p.hasApiKey) throw new Error(`Informe a chave de API de "${p.name}".`)
    return { provider: p, key: await this.store.getApiKey(p.id) }
  }

  /** One-shot text generation, used by the composer's "write with AI" actions. */
  async generate(prompt: string, providerId?: string) {
    const { provider, key } = await this.provider(providerId)
    const system = 'Você é um redator especialista em redes sociais. Responda apenas com o texto final pedido, sem comentários, aspas ou explicações.'
    const r = await complete(provider, key, system, [{ role: 'user', content: prompt }])
    return r.text.trim()
  }

  // ---------- assistant chat ----------

  /** Tools available to the in-app assistant: the app's own tools plus every connected MCP server's tools. */
  private allTools(): { defs: ToolDef[]; run: (name: string, args: any) => Promise<string> } {
    const local = buildTools(this)
    return {
      defs: [...local.map((t) => t.def), ...this.mcp.toolDefs()],
      run: async (name, args) => {
        const t = local.find((x) => x.def.name === name)
        if (t) return JSON.stringify(await t.run(args ?? {}), null, 1)
        if (this.mcp.owns(name)) return this.mcp.call(name, args)
        throw new Error(`Ferramenta desconhecida: ${name}`)
      },
    }
  }

  listConversations = async () =>
    (await this.store.getConversations()).map(({ id, title, updatedAt, providerId }) => ({ id, title, updatedAt, providerId }))

  getConversation = async (id: string) => (await this.store.getConversations()).find((c) => c.id === id)

  async deleteConversation(id: string) {
    await this.store.saveConversations((await this.store.getConversations()).filter((c) => c.id !== id))
  }

  async sendChat(input: { conversationId?: string; text: string; providerId?: string }): Promise<Conversation> {
    const { provider, key } = await this.provider(input.providerId)
    const all = await this.store.getConversations()
    const conv: Conversation = all.find((c) => c.id === input.conversationId) ?? {
      id: uid(),
      title: input.text.slice(0, 60),
      messages: [],
      updatedAt: nowIso(),
    }
    conv.providerId = provider.id
    const push = (m: Omit<ChatMessage, 'id' | 'createdAt'>) => {
      conv.messages.push({ ...m, id: uid(), createdAt: nowIso() })
      this.emit({ type: 'chat-progress', payload: conv })
    }
    push({ role: 'user', content: input.text })

    const tools = this.allTools()
    const system = SYSTEM_PROMPT.replace('{now}', new Date().toString())
    try {
      for (let step = 0; step < 10; step++) {
        const history: LlmMessage[] = conv.messages.map(({ role, content, toolCalls, toolCallId, toolName }) => ({ role, content, toolCalls, toolCallId, toolName }))
        const r = await complete(provider, key, system, history, tools.defs)
        push({ role: 'assistant', content: r.text, toolCalls: r.toolCalls.length ? r.toolCalls : undefined })
        if (!r.toolCalls.length) break
        for (const call of r.toolCalls) {
          let content: string
          try {
            content = await tools.run(call.name, call.args)
          } catch (e) {
            content = `Erro: ${errorMessage(e)}`
          }
          push({ role: 'tool', content: content.slice(0, 20_000), toolCallId: call.id, toolName: call.name })
        }
      }
    } catch (e) {
      push({ role: 'assistant', content: `⚠️ ${errorMessage(e)}` })
    }
    conv.updatedAt = nowIso()
    const latest = await this.store.getConversations()
    await this.store.saveConversations([conv, ...latest.filter((c) => c.id !== conv.id)].slice(0, 200))
    return conv
  }

  // ---------- MCP ----------

  mcpStatus() {
    return { servers: this.mcp.statuses(), host: this.hostInfo?.() }
  }

  async saveMcpServer(config: Omit<McpServerConfig, 'id'> & { id?: string }) {
    const settings = await this.store.getSettings()
    const server: McpServerConfig = { ...config, id: config.id ?? uid() }
    const mcpServers = settings.mcpServers.some((s) => s.id === server.id)
      ? settings.mcpServers.map((s) => (s.id === server.id ? server : s))
      : [...settings.mcpServers, server]
    await this.updateSettings({ mcpServers })
    return server
  }

  async deleteMcpServer(id: string) {
    const settings = await this.store.getSettings()
    await this.updateSettings({ mcpServers: settings.mcpServers.filter((s) => s.id !== id) })
  }

  reconnectMcpServer = (id: string) => this.mcp.reconnect(id)

  /** Exposed so the MCP host can serve the same tools to Claude, ChatGPT, LM Studio, etc. */
  localTools = () => buildTools(this)
}

/** Methods the UI is allowed to call over IPC. */
export const serviceMethods = [
  'getState',
  'updateSettings',
  'getNetworkSetup',
  'setNetworkSetup',
  'connect',
  'disconnect',
  'getAnalytics',
  'getSnapshots',
  'refreshAllAnalytics',
  'listPosts',
  'savePost',
  'deletePost',
  'publishNow',
  'saveProvider',
  'deleteProvider',
  'listModels',
  'generate',
  'listConversations',
  'getConversation',
  'deleteConversation',
  'sendChat',
  'mcpStatus',
  'saveMcpServer',
  'deleteMcpServer',
  'reconnectMcpServer',
] as const satisfies readonly (keyof AppService)[]

export type ServiceMethod = (typeof serviceMethods)[number]
