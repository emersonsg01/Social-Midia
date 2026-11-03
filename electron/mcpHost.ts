import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import http from 'node:http'
import type { AppService, McpHostInfo } from '../src/core/service'
import { errorMessage } from '../src/core/util'

/**
 * Local MCP server (Streamable HTTP, stateless) exposing the app's tools so external
 * AIs — Claude Desktop/Code, ChatGPT, Gemini CLI, LM Studio, Ollama clients — can use them.
 */
export class McpHost {
  private server?: http.Server
  private port = 0
  private error?: string

  constructor(
    private service: AppService,
    private token: string,
  ) {}

  info(): McpHostInfo {
    return { running: !!this.server?.listening, url: `http://127.0.0.1:${this.port}/mcp`, token: this.token, error: this.error }
  }

  private buildServer() {
    const tools = this.service.localTools()
    const server = new Server({ name: 'social-hub', version: '0.1.0' }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tools.map((t) => ({ name: t.def.name, description: t.def.description, inputSchema: t.def.parameters as any })),
    }))
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const tool = tools.find((t) => t.def.name === req.params.name)
      if (!tool) return { isError: true, content: [{ type: 'text', text: `Ferramenta desconhecida: ${req.params.name}` }] }
      try {
        const result = await tool.run(req.params.arguments ?? {})
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }] }
      } catch (e) {
        return { isError: true, content: [{ type: 'text', text: errorMessage(e) }] }
      }
    })
    return server
  }

  private authorized(req: http.IncomingMessage) {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '')
    // Blocks DNS-rebinding: only loopback host names are accepted.
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return false
    const header = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    const query = new URL(req.url ?? '/', 'http://x').searchParams.get('key')
    return header === this.token || query === this.token
  }

  async start(port: number) {
    await this.stop()
    this.port = port
    this.error = undefined
    const server = http.createServer(async (req, res) => {
      const { pathname } = new URL(req.url ?? '/', 'http://x')
      if (pathname !== '/mcp') return void res.writeHead(404).end()
      if (!this.authorized(req)) return void res.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"unauthorized"}')
      if (req.method !== 'POST') return void res.writeHead(405, { Allow: 'POST' }).end()
      try {
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        const mcp = this.buildServer()
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
        res.on('close', () => {
          void transport.close()
          void mcp.close()
        })
        await mcp.connect(transport)
        await transport.handleRequest(req, res, body)
      } catch (e) {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: errorMessage(e) }))
      }
    })
    await new Promise<void>((resolve) => {
      server.once('error', (e) => {
        this.error = `Não foi possível abrir a porta ${port}: ${e.message}`
        resolve()
      })
      server.listen(port, '127.0.0.1', () => resolve())
    })
    if (!this.error) this.server = server
  }

  async stop() {
    const s = this.server
    this.server = undefined
    if (s) await new Promise((r) => s.close(() => r(undefined)))
  }
}
