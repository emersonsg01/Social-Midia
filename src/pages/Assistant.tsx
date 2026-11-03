import { Button, EmptyState, Select, Textarea, cx } from '@/components/ui'
import type { ChatMessage, Conversation } from '@/core/types'
import { api, onAppEvent } from '@/lib/api'
import { useApp } from '@/lib/state'
import { Bot, LoaderCircle, MessageSquare, Plus, Send, Trash2, Wrench } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type ConvSummary = Pick<Conversation, 'id' | 'title' | 'updatedAt'>

const suggestions = [
  'Resuma o desempenho das minhas contas nesta semana',
  'Crie 3 ideias de post para o LinkedIn sobre produtividade',
  'Quais publicações estão agendadas?',
  'Escreva um post para todas as redes anunciando uma live amanhã às 20h e agende como rascunho',
]

function ToolCall({ m, result }: { m: NonNullable<ChatMessage['toolCalls']>[number]; result?: ChatMessage }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-line bg-panel-2 text-xs">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-1.5 text-muted cursor-pointer">
        <Wrench className="size-3.5" />
        <span className="font-mono">{m.name}</span>
        {!result && <LoaderCircle className="size-3 animate-spin" />}
        <span className="ml-auto">{open ? 'ocultar' : 'detalhes'}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-line p-3">
          <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-muted">{JSON.stringify(m.args, null, 2)}</pre>
          {result && <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-[11px]">{result.content}</pre>}
        </div>
      )}
    </div>
  )
}

export default function Assistant() {
  const { settings, navigate } = useApp()
  const [convs, setConvs] = useState<ConvSummary[]>([])
  const [conv, setConv] = useState<Conversation>()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [providerId, setProviderId] = useState(settings.defaultProviderId)
  const bottom = useRef<HTMLDivElement>(null)

  const loadList = () => api.listConversations().then(setConvs)
  useEffect(() => void loadList(), [])
  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [conv?.messages.length])

  // Live updates while the assistant calls tools.
  useEffect(
    () =>
      onAppEvent((e) => {
        if (e.type === 'chat-progress') {
          const c = e.payload as Conversation
          setConv((cur) => (!cur || cur.id === c.id || cur.id === 'pending' ? structuredClone(c) : cur))
        }
      }),
    [],
  )

  const send = async (msg = text) => {
    if (!msg.trim() || sending) return
    setText('')
    setSending(true)
    if (!conv) setConv({ id: 'pending', title: msg, messages: [], updatedAt: '' })
    try {
      const c = await api.sendChat({ conversationId: conv?.id === 'pending' ? undefined : conv?.id, text: msg, providerId })
      setConv(c)
      void loadList()
    } finally {
      setSending(false)
    }
  }

  const open = async (id: string) => setConv(await api.getConversation(id))

  const remove = async (id: string) => {
    await api.deleteConversation(id)
    if (conv?.id === id) setConv(undefined)
    void loadList()
  }

  if (!settings.providers.length)
    return (
      <EmptyState
        icon={<Bot className="size-6" />}
        title="Configure uma IA"
        text="Conecte Claude, ChatGPT, Gemini ou um modelo local (Ollama / LM Studio) para conversar com o assistente."
        action={<Button variant="primary" onClick={() => navigate('settings')}>Ir para Configurações</Button>}
      />
    )

  const messages = conv?.messages ?? []
  const toolResults = new Map(messages.filter((m) => m.role === 'tool').map((m) => [m.toolCallId, m]))

  return (
    <div className="-my-6 flex h-[calc(100vh-40px)] gap-5 py-6 max-md:h-[calc(100vh-64px)]">
      <aside className="hidden w-60 shrink-0 flex-col lg:flex">
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setConv(undefined)}>
          Nova conversa
        </Button>
        <div className="mt-3 flex-1 space-y-0.5 overflow-y-auto">
          {convs.map((c) => (
            <div key={c.id} className={cx('group flex items-center rounded-lg', conv?.id === c.id ? 'bg-accent/10' : 'hover:bg-hover')}>
              <button onClick={() => open(c.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left text-sm cursor-pointer">
                <MessageSquare className="size-3.5 shrink-0 text-muted" />
                <span className="truncate">{c.title}</span>
              </button>
              <button onClick={() => remove(c.id)} className="p-2 text-muted opacity-0 hover:text-red-400 group-hover:opacity-100 cursor-pointer" aria-label="Excluir">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-line bg-panel">
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <span className="truncate text-sm font-medium">{conv?.title ?? 'Nova conversa'}</span>
          <Select className="!h-8 w-auto max-w-56 text-xs" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            {settings.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.model}
              </option>
            ))}
          </Select>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
          {!messages.length && (
            <div className="mx-auto max-w-xl pt-8 text-center">
              <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2">
                <Bot className="size-6 text-white" />
              </div>
              <h2 className="text-lg font-semibold">Como posso ajudar com suas redes?</h2>
              <p className="mt-1 text-sm text-muted">O assistente consulta métricas, cria rascunhos e agenda posts usando as ferramentas do app e dos seus servidores MCP.</p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-xl border border-line bg-panel-2 p-3 text-left text-sm hover:border-accent/50 cursor-pointer">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages
            .filter((m) => m.role !== 'tool')
            .map((m) => (
              <div key={m.id} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[85%] space-y-2', m.role === 'user' && 'rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-white')}>
                  {m.content && <div className="prose-chat whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>}
                  {m.toolCalls?.map((t) => <ToolCall key={t.id} m={t} result={toolResults.get(t.id)} />)}
                </div>
              </div>
            ))}
          {sending && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <LoaderCircle className="size-4 animate-spin" /> pensando…
            </div>
          )}
          <div ref={bottom} />
        </div>

        <div className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <Textarea
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder="Pergunte algo ou peça para criar/agendar posts… (Enter envia)"
              className="max-h-40 min-h-10"
            />
            <Button variant="primary" className="h-10" onClick={() => send()} loading={sending} aria-label="Enviar">
              <Send className="size-4" />
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
