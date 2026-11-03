import { NetworkIcon } from '@/components/NetworkIcon'
import { Badge, Button, Card, EmptyState, PageHeader, cx, fmtDate, useToast } from '@/components/ui'
import type { Post, PostStatus } from '@/core/types'
import { api, openExternal } from '@/lib/api'
import { useApp } from '@/lib/state'
import { CalendarDays, ChevronLeft, ChevronRight, ExternalLink, RotateCw, Send, SquarePen, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

const statusMeta: Record<PostStatus, { label: string; tone: 'neutral' | 'green' | 'yellow' | 'red' | 'blue' | 'violet'; dot: string }> = {
  draft: { label: 'Rascunho', tone: 'neutral', dot: 'bg-muted' },
  scheduled: { label: 'Agendado', tone: 'blue', dot: 'bg-sky-400' },
  publishing: { label: 'Publicando…', tone: 'violet', dot: 'bg-accent' },
  published: { label: 'Publicado', tone: 'green', dot: 'bg-emerald-400' },
  partial: { label: 'Parcial', tone: 'yellow', dot: 'bg-amber-400' },
  failed: { label: 'Falhou', tone: 'red', dot: 'bg-red-400' },
}

const postDate = (p: Post) => p.scheduledAt ?? Object.values(p.results)[0]?.at ?? p.updatedAt
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

function PostRow({ post }: { post: Post }) {
  const { accounts, navigate } = useApp()
  const toast = useToast()
  const [busy, setBusy] = useState<string>()
  const meta = statusMeta[post.status]
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      toast('ok', ok)
    } catch (e: any) {
      toast('error', e.message)
    } finally {
      setBusy(undefined)
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel-2 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <span className="text-xs text-muted">{post.scheduledAt ? fmtDate(post.scheduledAt) : `criado ${fmtDate(post.createdAt)}`}</span>
          </div>
          <p className="line-clamp-3 whitespace-pre-wrap text-sm">{post.draft.title ? <b>{post.draft.title} · </b> : null}{post.draft.text}</p>
        </div>
        <div className="flex gap-1">
          {post.status !== 'published' && post.status !== 'publishing' && (
            <Button size="sm" variant="ghost" title="Editar" onClick={() => navigate('composer', { postId: post.id })}>
              <SquarePen className="size-3.5" />
            </Button>
          )}
          {(post.status === 'draft' || post.status === 'scheduled') && (
            <Button size="sm" variant="ghost" title="Publicar agora" loading={busy === 'pub'} onClick={() => run('pub', () => api.publishNow(post.id), 'Publicação enviada.')}>
              <Send className="size-3.5" />
            </Button>
          )}
          {(post.status === 'failed' || post.status === 'partial') && (
            <Button size="sm" variant="ghost" title="Tentar novamente as contas que falharam" loading={busy === 'retry'} onClick={() => run('retry', () => api.publishNow(post.id), 'Nova tentativa concluída.')}>
              <RotateCw className="size-3.5" />
            </Button>
          )}
          {post.status !== 'publishing' && (
            <Button size="sm" variant="ghost" title="Excluir" onClick={() => confirm('Excluir esta publicação do app? (não apaga o que já foi publicado nas redes)') && run('del', () => api.deletePost(post.id), 'Excluída.')}>
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {post.draft.accountIds.map((id) => {
          const a = accounts.find((x) => x.id === id)
          const r = post.results[id]
          return (
            <span
              key={id}
              title={r?.error}
              className={cx(
                'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs',
                r?.ok ? 'border-emerald-500/30 text-emerald-300' : r ? 'border-red-500/30 text-red-300' : 'border-line text-muted',
              )}
            >
              {a ? <NetworkIcon network={a.network} size={14} /> : null}
              <span className="truncate">{a?.name ?? 'conta removida'}</span>
              {r?.url && (
                <button className="cursor-pointer" onClick={() => openExternal(r.url!)} title="Abrir publicação">
                  <ExternalLink className="size-3" />
                </button>
              )}
            </span>
          )
        })}
      </div>
      {Object.entries(post.results).some(([, r]) => !r.ok) && (
        <ul className="mt-2 space-y-0.5 text-xs text-red-300/90">
          {Object.entries(post.results)
            .filter(([, r]) => !r.ok)
            .map(([id, r]) => (
              <li key={id}>• {accounts.find((a) => a.id === id)?.name ?? id}: {r.error}</li>
            ))}
        </ul>
      )}
    </div>
  )
}

export default function Calendar() {
  const { posts, navigate } = useApp()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selectedDay, setSelectedDay] = useState<string>()
  const [filter, setFilter] = useState<'all' | PostStatus>('all')

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>()
    for (const p of posts) {
      if (p.status === 'draft') continue
      const k = dayKey(new Date(postDate(p)))
      m.set(k, [...(m.get(k) ?? []), p])
    }
    return m
  }, [posts])

  const cells = useMemo(() => {
    const start = new Date(month)
    start.setDate(1 - start.getDay())
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [month])

  const list = posts
    .filter((p) => (filter === 'all' ? true : p.status === filter))
    .filter((p) => !selectedDay || (p.status !== 'draft' && dayKey(new Date(postDate(p))) === selectedDay))
    .sort((a, b) => postDate(b).localeCompare(postDate(a)))

  const today = dayKey(new Date())

  return (
    <>
      <PageHeader title="Calendário" subtitle="Agendamentos, rascunhos e histórico de publicações." actions={<Button variant="primary" icon={<SquarePen className="size-4" />} onClick={() => navigate('composer')}>Novo post</Button>} />

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold first-letter:uppercase">{month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelectedDay(undefined) }}>Hoje</Button>
            <Button size="sm" variant="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase text-muted">
          {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => (
            <div key={d} className="pb-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d) => {
            const k = dayKey(d)
            const items = byDay.get(k) ?? []
            const inMonth = d.getMonth() === month.getMonth()
            return (
              <button
                key={k}
                onClick={() => setSelectedDay(selectedDay === k ? undefined : k)}
                className={cx(
                  'flex min-h-16 flex-col rounded-lg border p-1.5 text-left transition cursor-pointer sm:min-h-20',
                  selectedDay === k ? 'border-accent bg-accent/8' : 'border-line/60 hover:bg-hover',
                  !inMonth && 'opacity-40',
                )}
              >
                <span className={cx('grid size-6 place-items-center rounded-full text-xs', k === today && 'bg-accent font-semibold text-white')}>{d.getDate()}</span>
                <div className="mt-auto flex flex-wrap gap-1">
                  {items.slice(0, 6).map((p) => (
                    <span key={p.id} className={cx('size-2 rounded-full', statusMeta[p.status].dot)} />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      <div className="mb-3 mt-6 flex flex-wrap items-center gap-2">
        {(['all', 'scheduled', 'draft', 'published', 'partial', 'failed'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={cx('rounded-full px-3 py-1 text-xs cursor-pointer', filter === f ? 'bg-accent text-white' : 'bg-panel-2 text-muted hover:text-fg')}>
            {f === 'all' ? 'Todos' : statusMeta[f].label}
          </button>
        ))}
        {selectedDay && (
          <Button size="sm" variant="ghost" onClick={() => setSelectedDay(undefined)}>Limpar filtro de dia</Button>
        )}
      </div>
      {list.length ? (
        <div className="space-y-3">
          {list.map((p) => (
            <PostRow key={p.id} post={p} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={<CalendarDays className="size-6" />} title="Nenhuma publicação aqui" />
        </Card>
      )}
    </>
  )
}
