import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Textarea, Toggle, cx, useToast } from '@/components/ui'
import { providerPresets } from '@/core/ai'
import type { McpServerStatus } from '@/core/mcpClients'
import type { McpHostInfo } from '@/core/service'
import type { AIProviderConfig, AIProviderKind, McpServerConfig } from '@/core/types'
import { api, desktop } from '@/lib/api'
import { useApp } from '@/lib/state'
import { Bot, Copy, Eye, EyeOff, Pencil, Plug, Plus, RefreshCw, Server, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

// ---------- AI providers ----------

function ProviderModal({ initial, onClose }: { initial?: AIProviderConfig; onClose: () => void }) {
  const toast = useToast()
  const [p, setP] = useState<Omit<AIProviderConfig, 'id'> & { id?: string }>(
    initial ?? { kind: 'anthropic', name: providerPresets.anthropic.label, model: providerPresets.anthropic.model },
  )
  const [key, setKey] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [busy, setBusy] = useState<string>()
  const preset = providerPresets[p.kind]

  const setKind = (kind: AIProviderKind) => setP({ ...p, kind, name: providerPresets[kind].label, model: providerPresets[kind].model, baseUrl: undefined })

  const loadModels = async () => {
    setBusy('models')
    try {
      const list = await api.listModels({ ...p, id: p.id ?? 'new' } as AIProviderConfig, key || undefined)
      setModels(list)
      if (!list.length) toast('info', 'Nenhum modelo retornado.')
      else if (!p.model || !list.includes(p.model)) setP((x) => ({ ...x, model: list[0] }))
    } catch (e: any) {
      toast('error', `Não foi possível listar modelos: ${e.message}`)
    } finally {
      setBusy(undefined)
    }
  }

  const save = async () => {
    setBusy('save')
    try {
      await api.saveProvider(p, key || undefined)
      toast('ok', `${p.name} salvo.`)
      onClose()
    } catch (e: any) {
      toast('error', e.message)
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? 'Editar IA' : 'Adicionar IA'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(providerPresets) as AIProviderKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cx('rounded-xl border p-2.5 text-left text-xs cursor-pointer', p.kind === k ? 'border-accent bg-accent/10' : 'border-line hover:bg-hover')}
            >
              <span className="font-medium">{providerPresets[k].label}</span>
              {providerPresets[k].local && <span className="block text-muted">roda no seu PC</span>}
            </button>
          ))}
        </div>
        <Field label="Nome">
          <Input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
        </Field>
        {(preset.needsKey || p.kind === 'openai-compatible') && (
          <Field label={`Chave de API${preset.needsKey ? '' : ' (opcional)'}`} hint={p.hasApiKey ? 'Já existe uma chave salva. Deixe vazio para mantê-la.' : 'Guardada criptografada neste dispositivo.'}>
            <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={p.hasApiKey ? '••••••••••' : p.kind === 'anthropic' ? 'sk-ant-…' : 'sk-…'} />
          </Field>
        )}
        <Field label="Endereço da API" hint={preset.local ? 'Certifique-se de que o servidor local está rodando.' : undefined}>
          <Input value={p.baseUrl ?? ''} onChange={(e) => setP({ ...p, baseUrl: e.target.value || undefined })} placeholder={preset.baseUrl} />
        </Field>
        <Field label="Modelo">
          <div className="flex gap-2">
            {models.length ? (
              <Select value={p.model} onChange={(e) => setP({ ...p, model: e.target.value })}>
                {models.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            ) : (
              <Input value={p.model} onChange={(e) => setP({ ...p, model: e.target.value })} placeholder="nome do modelo" />
            )}
            <Button onClick={loadModels} loading={busy === 'models'} icon={<RefreshCw className="size-4" />}>
              Listar
            </Button>
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={busy === 'save'} disabled={!p.name || !p.model}>Salvar</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------- external MCP servers ----------

function McpServerModal({ initial, onClose }: { initial?: McpServerConfig; onClose: () => void }) {
  const toast = useToast()
  const [s, setS] = useState<Omit<McpServerConfig, 'id'> & { id?: string }>(initial ?? { name: '', enabled: true, transport: desktop ? 'stdio' : 'http' })
  const [envText, setEnvText] = useState(Object.entries(initial?.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n'))
  const [headersText, setHeadersText] = useState(Object.entries(initial?.headers ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'))

  const parse = (text: string, sep: string) =>
    Object.fromEntries(
      text
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => [l.slice(0, l.indexOf(sep)).trim(), l.slice(l.indexOf(sep) + 1).trim()]),
    )

  const save = async () => {
    try {
      await api.saveMcpServer({ ...s, name: s.name.trim(), env: parse(envText, '='), headers: parse(headersText, ':') })
      toast('ok', 'Servidor MCP salvo.')
      onClose()
    } catch (e: any) {
      toast('error', e.message)
    }
  }

  return (
    <Modal open onClose={onClose} title={initial ? 'Editar servidor MCP' : 'Adicionar servidor MCP'}>
      <div className="space-y-4">
        <Field label="Nome" hint="Usado como prefixo das ferramentas (ex.: canva, notion, filesystem).">
          <Input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
        </Field>
        <Field label="Tipo de conexão">
          <Select value={s.transport} onChange={(e) => setS({ ...s, transport: e.target.value as 'stdio' | 'http' })}>
            {desktop && <option value="stdio">Comando local (stdio)</option>}
            <option value="http">HTTP (Streamable HTTP)</option>
          </Select>
        </Field>
        {s.transport === 'stdio' ? (
          <>
            <Field label="Comando">
              <Input value={s.command ?? ''} onChange={(e) => setS({ ...s, command: e.target.value })} placeholder="npx" />
            </Field>
            <Field label="Argumentos (um por linha)">
              <Textarea rows={3} value={(s.args ?? []).join('\n')} onChange={(e) => setS({ ...s, args: e.target.value.split('\n').filter(Boolean) })} placeholder={'-y\n@modelcontextprotocol/server-filesystem\nC:\\Users\\voce\\Imagens'} />
            </Field>
            <Field label="Variáveis de ambiente (CHAVE=valor por linha)">
              <Textarea rows={2} value={envText} onChange={(e) => setEnvText(e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <Field label="URL">
              <Input value={s.url ?? ''} onChange={(e) => setS({ ...s, url: e.target.value })} placeholder="https://exemplo.com/mcp" />
            </Field>
            <Field label="Cabeçalhos (Nome: valor por linha)">
              <Textarea rows={2} value={headersText} onChange={(e) => setHeadersText(e.target.value)} placeholder="Authorization: Bearer …" />
            </Field>
          </>
        )}
        <Toggle checked={s.enabled} onChange={(enabled) => setS({ ...s, enabled })} label="Ativado" />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={save} disabled={!s.name.trim()}>Salvar</Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------- local MCP host (this app as an MCP server) ----------

function McpHostCard({ host }: { host?: McpHostInfo }) {
  const { settings } = useApp()
  const toast = useToast()
  const [show, setShow] = useState(false)
  const [client, setClient] = useState<'claude-desktop' | 'claude-code' | 'lmstudio' | 'gemini'>('claude-desktop')
  const [port, setPort] = useState(String(settings.mcpHost.port))

  const apply = async (patch: Partial<typeof settings.mcpHost>) => {
    await api.updateSettings({ mcpHost: { ...settings.mcpHost, ...patch } })
    const info = await desktop!.restartMcpHost()
    if (info.error) toast('error', info.error)
    else toast('ok', info.running ? 'Servidor MCP ativo.' : 'Servidor MCP desligado.')
  }

  if (!desktop)
    return (
      <Card title="Servidor MCP do Social Hub">
        <p className="text-sm text-muted">Disponível na versão para computador: permite que Claude, ChatGPT, Gemini e LM Studio controlem o app.</p>
      </Card>
    )

  const url = host?.url ?? `http://127.0.0.1:${settings.mcpHost.port}/mcp`
  const token = host?.token ?? ''
  const shown = show ? token : '•'.repeat(24)
  const snippets = {
    'claude-desktop': {
      label: 'Claude Desktop',
      where: 'Configurações > Desenvolvedor > Editar configuração (claude_desktop_config.json)',
      code: JSON.stringify({ mcpServers: { 'social-hub': { command: 'npx', args: ['-y', 'mcp-remote', `${url}?key=${shown}`, '--allow-http'] } } }, null, 2),
    },
    'claude-code': {
      label: 'Claude Code',
      where: 'Terminal',
      code: `claude mcp add --transport http social-hub ${url} --header "Authorization: Bearer ${shown}"`,
    },
    lmstudio: {
      label: 'LM Studio',
      where: 'Aba Program > Install > Edit mcp.json',
      code: JSON.stringify({ mcpServers: { 'social-hub': { url, headers: { Authorization: `Bearer ${shown}` } } } }, null, 2),
    },
    gemini: {
      label: 'Gemini CLI',
      where: '~/.gemini/settings.json',
      code: JSON.stringify({ mcpServers: { 'social-hub': { httpUrl: url, headers: { Authorization: `Bearer ${shown}` } } } }, null, 2),
    },
  }
  const snip = snippets[client]

  return (
    <Card
      title={<span className="flex items-center gap-2"><Server className="size-4 text-accent" /> Servidor MCP do Social Hub</span>}
      actions={host?.running ? <Badge tone="green">ativo</Badge> : <Badge tone={host?.error ? 'red' : 'neutral'}>{host?.error ? 'erro' : 'desligado'}</Badge>}
    >
      <p className="mb-4 text-sm text-muted">
        Permite que IAs externas (Claude, ChatGPT, Gemini, LM Studio, Ollama via clientes MCP) leiam suas métricas e criem/agendem posts por este app. Só aceita conexões deste computador e exige o token.
      </p>
      {host?.error && <p className="mb-3 text-sm text-red-400">{host.error}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <Toggle checked={settings.mcpHost.enabled} onChange={(enabled) => apply({ enabled })} label="Ativado" />
        <div className="w-28">
          <Field label="Porta">
            <Input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} onBlur={() => Number(port) !== settings.mcpHost.port && apply({ port: Number(port) })} />
          </Field>
        </div>
        <div className="min-w-60 flex-1">
          <Field label="Token">
            <div className="flex gap-2">
              <Input readOnly value={shown} className="font-mono text-xs" />
              <Button onClick={() => setShow(!show)} aria-label="Mostrar token">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button>
            </div>
          </Field>
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {Object.entries(snippets).map(([k, v]) => (
            <button key={k} onClick={() => setClient(k as typeof client)} className={cx('rounded-full px-3 py-1 text-xs cursor-pointer', client === k ? 'bg-accent text-white' : 'bg-panel-2 text-muted hover:text-fg')}>
              {v.label}
            </button>
          ))}
        </div>
        <p className="mb-2 text-xs text-muted">{snip.where}</p>
        <div className="relative">
          <pre className="overflow-x-auto rounded-xl border border-line bg-panel-2 p-3 text-xs">{snip.code}</pre>
          <Button
            size="sm"
            className="absolute right-2 top-2"
            icon={<Copy className="size-3.5" />}
            onClick={() => navigator.clipboard.writeText(snip.code.replaceAll(shown, token)).then(() => toast('info', 'Copiado com o token.'))}
          >
            Copiar
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted">ChatGPT (modo desenvolvedor) só aceita servidores MCP públicos via HTTPS — para usá-lo, exponha esta URL com um túnel seguro.</p>
      </div>
    </Card>
  )
}

// ---------- page ----------

export default function Settings() {
  const { settings } = useApp()
  const toast = useToast()
  const [providerModal, setProviderModal] = useState<{ initial?: AIProviderConfig }>()
  const [mcpModal, setMcpModal] = useState<{ initial?: McpServerConfig }>()
  const [mcp, setMcp] = useState<{ servers: McpServerStatus[]; host?: McpHostInfo }>({ servers: [] })
  const [linkedinVersion, setLinkedinVersion] = useState(settings.linkedinVersion)
  const [oauthPort, setOauthPort] = useState(String(settings.oauthPort))

  useEffect(() => void api.mcpStatus().then(setMcp), [settings])

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="space-y-5">
        <Card title="Geral">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex gap-1 rounded-lg bg-panel-2 p-1">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button key={t} onClick={() => api.updateSettings({ theme: t })} className={cx('rounded-md px-3 py-1 text-sm cursor-pointer', settings.theme === t ? 'bg-panel shadow text-fg' : 'text-muted')}>
                  {t === 'dark' ? 'Escuro' : t === 'light' ? 'Claro' : 'Sistema'}
                </button>
              ))}
            </div>
            {desktop && (
              <Toggle checked={settings.minimizeToTray} onChange={(v) => api.updateSettings({ minimizeToTray: v })} label="Ao fechar, manter na bandeja (o agendador continua rodando)" />
            )}
          </div>
        </Card>

        <Card
          title={<span className="flex items-center gap-2"><Bot className="size-4 text-accent" /> Inteligência artificial</span>}
          actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setProviderModal({})}>Adicionar</Button>}
        >
          {settings.providers.length ? (
            <ul className="space-y-2">
              {settings.providers.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {p.name} {settings.defaultProviderId === p.id && <Badge tone="violet">padrão</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted">{providerPresets[p.kind].label} · {p.model}</p>
                  </div>
                  {settings.defaultProviderId !== p.id && (
                    <Button size="sm" variant="ghost" title="Tornar padrão" onClick={() => api.updateSettings({ defaultProviderId: p.id })}>
                      <Star className="size-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" title="Editar" onClick={() => setProviderModal({ initial: p })}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" title="Remover" onClick={() => confirm(`Remover ${p.name}?`) && api.deleteProvider(p.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Adicione Claude, ChatGPT, Gemini ou um modelo local (Ollama / LM Studio) para usar o assistente e a escrita com IA.</p>
          )}
        </Card>

        <McpHostCard host={mcp.host} />

        <Card
          title={<span className="flex items-center gap-2"><Plug className="size-4 text-accent" /> Servidores MCP externos</span>}
          actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setMcpModal({})}>Adicionar</Button>}
        >
          <p className="mb-3 text-sm text-muted">Ferramentas desses servidores ficam disponíveis para o Assistente IA (ex.: Canva, Notion, arquivos locais, banco de imagens).</p>
          <ul className="space-y-2">
            {settings.mcpServers.map((cfg) => {
              const st = mcp.servers.find((x) => x.id === cfg.id)
              return (
                <li key={cfg.id} className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {cfg.name}
                      {st?.state === 'connected' && <Badge tone="green">{st.tools.length} ferramenta(s)</Badge>}
                      {st?.state === 'connecting' && <Badge tone="blue">conectando…</Badge>}
                      {st?.state === 'error' && <Badge tone="red">erro</Badge>}
                      {st?.state === 'disabled' && <Badge>desativado</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted">{st?.error ?? (cfg.transport === 'stdio' ? `${cfg.command} ${(cfg.args ?? []).join(' ')}` : cfg.url)}</p>
                  </div>
                  <Button size="sm" variant="ghost" title="Reconectar" onClick={() => api.reconnectMcpServer(cfg.id).then(() => api.mcpStatus().then(setMcp))}>
                    <RefreshCw className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" title="Editar" onClick={() => setMcpModal({ initial: cfg })}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" title="Remover" onClick={() => confirm(`Remover ${cfg.name}?`) && api.deleteMcpServer(cfg.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              )
            })}
          </ul>
        </Card>

        <Card title="Avançado">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Porta do login OAuth" hint="Faz parte das URLs de redirecionamento cadastradas nas redes.">
              <Input value={oauthPort} onChange={(e) => setOauthPort(e.target.value.replace(/\D/g, ''))} onBlur={() => Number(oauthPort) !== settings.oauthPort && api.updateSettings({ oauthPort: Number(oauthPort) }).then(() => toast('ok', 'Porta atualizada. Atualize as Redirect URIs nas redes.'))} />
            </Field>
            <Field label="Versão da API do LinkedIn (AAAAMM)" hint="O LinkedIn desativa versões com mais de 1 ano.">
              <Input value={linkedinVersion} onChange={(e) => setLinkedinVersion(e.target.value)} onBlur={() => linkedinVersion !== settings.linkedinVersion && api.updateSettings({ linkedinVersion })} />
            </Field>
          </div>
        </Card>
      </div>

      {providerModal && <ProviderModal initial={providerModal.initial} onClose={() => setProviderModal(undefined)} />}
      {mcpModal && <McpServerModal initial={mcpModal.initial} onClose={() => setMcpModal(undefined)} />}
    </>
  )
}
