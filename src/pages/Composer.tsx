import { AccountAvatar, NetworkIcon } from '@/components/NetworkIcon'
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Textarea, cx, useToast } from '@/components/ui'
import type { Post, PostDraft } from '@/core/types'
import { api, desktop } from '@/lib/api'
import { useApp } from '@/lib/state'
import { Clock, Image as ImageIcon, Link, Send, Sparkles, Trash2, Upload, Users, Video, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'

const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

const aiActions = [
  { id: 'improve', label: 'Melhorar texto', prompt: 'Reescreva o texto abaixo deixando-o mais envolvente e claro, mantendo o idioma e a intenção:' },
  { id: 'shorten', label: 'Encurtar', prompt: 'Reduza o texto abaixo para no máximo 250 caracteres mantendo a mensagem principal:' },
  { id: 'hashtags', label: 'Adicionar hashtags', prompt: 'Devolva o texto abaixo igual, acrescentando ao final de 3 a 6 hashtags relevantes:' },
  { id: 'cta', label: 'Chamada para ação', prompt: 'Devolva o texto abaixo acrescentando uma chamada para ação convincente no final:' },
]

export default function Composer() {
  const { accounts, posts, networks, editingPostId, navigate } = useApp()
  const toast = useToast()
  const editing: Post | undefined = posts.find((p) => p.id === editingPostId)
  const locked = editing && (editing.status === 'published' || editing.status === 'publishing')

  const [draft, setDraft] = useState<PostDraft>(editing?.draft ?? { text: '', media: [], accountIds: [] })
  const [when, setWhen] = useState(editing?.scheduledAt ? toLocalInput(editing.scheduledAt) : '')
  const [mediaUrl, setMediaUrl] = useState('')
  const [topic, setTopic] = useState('')
  const [busy, setBusy] = useState<string>()

  const selected = accounts.filter((a) => draft.accountIds.includes(a.id))
  const selectedNetworks = useMemo(() => [...new Set(selected.map((a) => a.network))], [selected])
  const needsTitle = selectedNetworks.some((n) => networks.find((x) => x.id === n)?.capabilities.title)
  const set = (patch: Partial<PostDraft>) => setDraft((d) => ({ ...d, ...patch }))

  const toggleAccount = (id: string) => set({ accountIds: draft.accountIds.includes(id) ? draft.accountIds.filter((x) => x !== id) : [...draft.accountIds, id] })

  const warnings = selected.flatMap((a) => {
    const caps = networks.find((n) => n.id === a.network)!.capabilities
    const text = draft.overrides?.[a.id]?.text ?? draft.text
    const w: string[] = []
    if (caps.maxLength && text.length > caps.maxLength) w.push(`${a.name}: texto passa de ${caps.maxLength} caracteres.`)
    if (caps.requiresMedia === 'video' && !draft.media.some((m) => m.kind === 'video')) w.push(`${a.name}: exige um vídeo.`)
    if (caps.requiresMedia === 'image-or-video' && !draft.media.length) w.push(`${a.name}: exige imagem ou vídeo.`)
    if (a.network === 'instagram' && draft.media.some((m) => !m.url)) w.push(`${a.name}: o Instagram só aceita mídia por URL pública.`)
    if (a.network === 'youtube' && draft.media.some((m) => m.kind === 'video' && !m.path)) w.push(`${a.name}: o YouTube precisa do arquivo de vídeo local.`)
    return w
  })

  const addMediaUrl = () => {
    if (!/^https?:\/\//.test(mediaUrl)) return toast('error', 'Informe uma URL começando com http(s)://')
    const isVideo = /\.(mp4|mov|m4v|webm)(\?|$)/i.test(mediaUrl)
    set({ media: [...draft.media, { kind: isVideo ? 'video' : 'image', url: mediaUrl, name: mediaUrl.split('/').pop()!.split('?')[0], mime: isVideo ? 'video/mp4' : 'image/jpeg' }] })
    setMediaUrl('')
  }

  const pickFiles = async () => {
    const files = await desktop!.pickMedia()
    set({ media: [...draft.media, ...files] })
  }

  const runAi = async (prompt: string, key: string) => {
    setBusy(key)
    try {
      const text = await api.generate(prompt)
      set({ text })
    } catch (e: any) {
      toast('error', e.message)
    } finally {
      setBusy(undefined)
    }
  }

  const adaptPerNetwork = async () => {
    setBusy('adapt')
    try {
      const overrides: NonNullable<PostDraft['overrides']> = { ...draft.overrides }
      for (const a of selected) {
        const caps = networks.find((n) => n.id === a.network)!
        overrides[a.id] = {
          ...overrides[a.id],
          text: await api.generate(
            `Adapte o texto abaixo para publicação no ${caps.name}, respeitando o estilo da rede${caps.capabilities.maxLength ? ` e o limite de ${caps.capabilities.maxLength} caracteres` : ''}. Responda só com o texto final.\n\n${draft.text}`,
          ),
        }
      }
      set({ overrides })
      toast('ok', 'Textos adaptados para cada rede.')
    } catch (e: any) {
      toast('error', e.message)
    } finally {
      setBusy(undefined)
    }
  }

  const save = async (mode: 'draft' | 'schedule' | 'now') => {
    if (mode === 'schedule' && !when) return toast('error', 'Escolha data e hora.')
    if (mode === 'schedule' && new Date(when).getTime() < Date.now() - 60_000) return toast('error', 'A data escolhida já passou.')
    setBusy(mode)
    try {
      const post = await api.savePost({ id: editing?.id, draft, scheduledAt: mode === 'schedule' ? new Date(when).toISOString() : null })
      if (mode === 'now') {
        const r = await api.publishNow(post.id)
        toast(r.status === 'published' ? 'ok' : 'error', r.status === 'published' ? 'Publicado com sucesso!' : 'Algumas contas falharam. Veja o Calendário.')
      } else toast('ok', mode === 'draft' ? 'Rascunho salvo.' : 'Publicação agendada.')
      navigate('calendar')
    } catch (e: any) {
      toast('error', e.message)
    } finally {
      setBusy(undefined)
    }
  }

  if (!accounts.length)
    return (
      <>
        <PageHeader title="Criar post" />
        <Card>
          <EmptyState icon={<Users className="size-6" />} title="Nenhuma conta conectada" text="Conecte ao menos uma rede para criar publicações." action={<Button variant="primary" onClick={() => navigate('accounts')}>Conectar contas</Button>} />
        </Card>
      </>
    )

  return (
    <>
      <PageHeader title={editing ? 'Editar publicação' : 'Criar post'} subtitle="Escreva uma vez, adapte para cada rede e publique agora ou depois." />
      {locked && <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">Esta publicação já foi enviada e não pode ser editada.</div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card title="Publicar em">
            <div className="flex flex-wrap gap-2">
              {accounts.map((a) => {
                const on = draft.accountIds.includes(a.id)
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAccount(a.id)}
                    className={cx('flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition cursor-pointer', on ? 'border-accent bg-accent/10' : 'border-line hover:bg-hover')}
                  >
                    <AccountAvatar name={a.name} url={a.avatarUrl} network={a.network} size={26} />
                    {a.name}
                  </button>
                )
              })}
            </div>
          </Card>

          <Card title="Conteúdo">
            <div className="space-y-4">
              {needsTitle && (
                <Field label="Título (YouTube / Twitch)">
                  <Input value={draft.title ?? ''} onChange={(e) => set({ title: e.target.value })} maxLength={100} placeholder="Título do vídeo ou da live" />
                </Field>
              )}
              <div>
                <Textarea rows={8} value={draft.text} onChange={(e) => set({ text: e.target.value })} placeholder="O que você quer compartilhar?" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedNetworks.map((n) => {
                    const max = networks.find((x) => x.id === n)?.capabilities.maxLength
                    const over = max && draft.text.length > max
                    return (
                      <span key={n} className={cx('inline-flex items-center gap-1.5 rounded-full bg-panel-2 px-2 py-0.5 text-[11px] tabular-nums', over ? 'text-red-400' : 'text-muted')}>
                        <NetworkIcon network={n} size={14} /> {draft.text.length}
                        {max ? `/${max}` : ''}
                      </span>
                    )
                  })}
                </div>
              </div>
              <Field label="Link (opcional)">
                <div className="relative">
                  <Link className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" />
                  <Input className="pl-9" value={draft.link ?? ''} onChange={(e) => set({ link: e.target.value || undefined })} placeholder="https://" />
                </div>
              </Field>

              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Mídia</p>
                {draft.media.length > 0 && (
                  <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {draft.media.map((m, i) => (
                      <div key={i} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-panel-2">
                        {m.kind === 'image' && m.url ? (
                          <img src={m.url} alt="" className="size-full object-cover" />
                        ) : (
                          <div className="grid size-full place-items-center p-2 text-center text-[11px] text-muted">
                            {m.kind === 'video' ? <Video className="mb-1 size-6" /> : <ImageIcon className="mb-1 size-6" />}
                            <span className="line-clamp-2 break-all">{m.name}</span>
                          </div>
                        )}
                        <button onClick={() => set({ media: draft.media.filter((_, j) => j !== i) })} className="absolute right-1 top-1 rounded-md bg-black/70 p-1 opacity-0 group-hover:opacity-100 cursor-pointer">
                          <Trash2 className="size-3.5 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {desktop && (
                    <Button icon={<Upload className="size-4" />} onClick={pickFiles}>
                      Arquivo do computador
                    </Button>
                  )}
                  <div className="flex min-w-60 flex-1 gap-2">
                    <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMediaUrl()} placeholder="ou cole a URL pública de uma imagem/vídeo" />
                    <Button onClick={addMediaUrl}>Adicionar</Button>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {selected.length > 1 && (
            <Card title="Texto por rede" actions={<Button size="sm" loading={busy === 'adapt'} icon={<Wand2 className="size-3.5" />} onClick={adaptPerNetwork} disabled={!draft.text}>Adaptar com IA</Button>}>
              <div className="space-y-3">
                {selected.map((a) => {
                  const o = draft.overrides?.[a.id]
                  return (
                    <div key={a.id} className="rounded-xl border border-line bg-panel-2 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <NetworkIcon network={a.network} size={18} /> {a.name}
                        </span>
                        {o?.text !== undefined ? (
                          <Button size="sm" variant="ghost" onClick={() => set({ overrides: { ...draft.overrides, [a.id]: { ...o, text: undefined } } })}>Usar texto principal</Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => set({ overrides: { ...draft.overrides, [a.id]: { ...o, text: draft.text } } })}>Personalizar</Button>
                        )}
                      </div>
                      {o?.text !== undefined ? (
                        <Textarea rows={4} value={o.text} onChange={(e) => set({ overrides: { ...draft.overrides, [a.id]: { ...o, text: e.target.value } } })} />
                      ) : (
                        <p className="line-clamp-2 text-xs text-muted">{draft.text || 'Usando o texto principal.'}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card title={<span className="flex items-center gap-2"><Sparkles className="size-4 text-accent" /> Assistente de escrita</span>}>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Sobre o que é o post?" />
                <Button
                  variant="primary"
                  loading={busy === 'topic'}
                  disabled={!topic}
                  onClick={() =>
                    runAi(
                      `Escreva um post para redes sociais${selectedNetworks.length ? ` (${selectedNetworks.join(', ')})` : ''} sobre: ${topic}. Tom profissional e envolvente, em português.`,
                      'topic',
                    )
                  }
                >
                  Gerar
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {aiActions.map((a) => (
                  <Button key={a.id} size="sm" loading={busy === a.id} disabled={!draft.text} onClick={() => runAi(`${a.prompt}\n\n${draft.text}`, a.id)}>
                    {a.label}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          <Card title={<span className="flex items-center gap-2"><Clock className="size-4 text-accent" /> Quando publicar</span>}>
            <div className="space-y-3">
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              {warnings.length > 0 && (
                <ul className="space-y-1 rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 text-xs text-amber-300">
                  {warnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              )}
              <div className="grid gap-2">
                <Button variant="primary" loading={busy === 'schedule'} disabled={locked || !when || !draft.accountIds.length} icon={<Clock className="size-4" />} onClick={() => save('schedule')}>
                  Agendar
                </Button>
                <Button loading={busy === 'now'} disabled={locked || !draft.accountIds.length} icon={<Send className="size-4" />} onClick={() => save('now')}>
                  Publicar agora
                </Button>
                <Button variant="ghost" loading={busy === 'draft'} disabled={locked || !draft.accountIds.length} onClick={() => save('draft')}>
                  Salvar rascunho
                </Button>
              </div>
              {editing && <Badge tone="violet">Editando: {editing.status}</Badge>}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

