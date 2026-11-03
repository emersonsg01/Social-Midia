import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { ToolDef } from './ai'
import type { Platform } from './platform'
import type { McpServerConfig } from './types'
import { errorMessage } from './util'

export interface McpServerStatus {
  id: string
  name: string
  state: 'disabled' | 'connecting' | 'connected' | 'error'
  error?: string
  tools: string[]
}

interface Entry {
  config: McpServerConfig
  client?: Client
  status: McpServerStatus
  tools: { def: ToolDef; remoteName: string }[]
}

const safeName = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)

/** Connects to the user's external MCP servers so the in-app assistant can use their tools. */
export class McpClients {
  private entries = new Map<string, Entry>()

  constructor(
    private platform: Platform,
    private onChange: () => void,
  ) {}

  async sync(configs: McpServerConfig[]) {
    for (const [id, e] of this.entries) {
      const next = configs.find((c) => c.id === id)
      if (!next || JSON.stringify(next) !== JSON.stringify(e.config)) {
        await e.client?.close().catch(() => {})
        this.entries.delete(id)
      }
    }
    await Promise.all(configs.filter((c) => !this.entries.has(c.id)).map((c) => this.connect(c)))
  }

  async reconnect(id: string) {
    const e = this.entries.get(id)
    if (!e) return
    await e.client?.close().catch(() => {})
    this.entries.delete(id)
    await this.connect(e.config)
  }

  private async connect(config: McpServerConfig) {
    const entry: Entry = { config, tools: [], status: { id: config.id, name: config.name, state: 'connecting', tools: [] } }
    this.entries.set(config.id, entry)
    if (!config.enabled) {
      entry.status.state = 'disabled'
      return
    }
    this.onChange()
    try {
      const client = new Client({ name: 'social-hub', version: '0.1.0' })
      await client.connect(this.platform.createMcpTransport(config))
      const { tools } = await client.listTools()
      entry.client = client
      entry.tools = tools.map((t) => ({
        remoteName: t.name,
        def: {
          name: safeName(`${config.name}__${t.name}`),
          description: `[${config.name}] ${t.description ?? ''}`.trim(),
          parameters: (t.inputSchema as Record<string, unknown>) ?? { type: 'object', properties: {} },
        },
      }))
      entry.status = { ...entry.status, state: 'connected', tools: tools.map((t) => t.name), error: undefined }
    } catch (e) {
      entry.status = { ...entry.status, state: 'error', error: errorMessage(e) }
    }
    this.onChange()
  }

  statuses = () => [...this.entries.values()].map((e) => e.status)

  toolDefs = () => [...this.entries.values()].flatMap((e) => e.tools.map((t) => t.def))

  owns = (toolName: string) => [...this.entries.values()].some((e) => e.tools.some((t) => t.def.name === toolName))

  async call(toolName: string, args: unknown) {
    for (const e of this.entries.values()) {
      const t = e.tools.find((x) => x.def.name === toolName)
      if (!t || !e.client) continue
      const r: any = await e.client.callTool({ name: t.remoteName, arguments: (args ?? {}) as Record<string, unknown> })
      const text = (r.content ?? []).map((c: any) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n')
      if (r.isError) throw new Error(text || 'Erro na ferramenta MCP')
      return text || JSON.stringify(r.structuredContent ?? {})
    }
    throw new Error(`Ferramenta MCP não encontrada: ${toolName}`)
  }

  async closeAll() {
    await Promise.all([...this.entries.values()].map((e) => e.client?.close().catch(() => {})))
    this.entries.clear()
  }
}
