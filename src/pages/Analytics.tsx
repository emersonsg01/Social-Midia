import { AccountAvatar } from '@/components/NetworkIcon'
import { Button, Card, EmptyState, PageHeader, cx, fmtDate, fmtNumber, useToast } from '@/components/ui'
import type { AnalyticsReport, Snapshot } from '@/core/types'
import { api, openExternal } from '@/lib/api'
import { useApp } from '@/lib/state'
import { ChartColumn, ExternalLink, Globe, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const tooltipStyle = { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10 }

export default function Analytics() {
  const { accounts, navigate } = useApp()
  const toast = useToast()
  const [accountId, setAccountId] = useState(accounts[0]?.id)
  const [report, setReport] = useState<AnalyticsReport>()
  const [error, setError] = useState<string>()
  const [snaps, setSnaps] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(false)
  const account = accounts.find((a) => a.id === accountId)

  const load = async (refresh = false) => {
    if (!accountId) return
    setLoading(true)
    setError(undefined)
    try {
      setReport(await api.getAnalytics(accountId, refresh))
      setSnaps(await api.getSnapshots(accountId))
      if (refresh) toast('ok', 'Métricas atualizadas.')
    } catch (e: any) {
      setError(e.message)
      setReport(undefined)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setReport(undefined)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId])

  if (!accounts.length)
    return (
      <>
        <PageHeader title="Análises" />
        <Card>
          <EmptyState icon={<ChartColumn className="size-6" />} title="Conecte uma conta para ver métricas" action={<Button variant="primary" onClick={() => navigate('accounts')}>Conectar</Button>} />
        </Card>
      </>
    )

  const growth = snaps.map((s) => ({ date: s.date.slice(5).split('-').reverse().join('/'), followers: s.followers ?? 0 }))
  const metricKeys = report?.recent[0]?.metrics.map((m) => m.label) ?? []
  const engagement = (report?.recent ?? [])
    .slice()
    .reverse()
    .map((r, i) => ({ name: r.createdAt ? fmtDate(r.createdAt, { day: '2-digit', month: '2-digit' }) : `#${i + 1}`, ...Object.fromEntries(r.metrics.map((m) => [m.label, m.value])) }))
  const colors = ['#7c5cff', '#22d3ee', '#f472b6', '#facc15']

  return (
    <>
      <PageHeader
        title="Análises"
        subtitle="Métricas atualizadas automaticamente a cada 6 horas."
        actions={
          <Button icon={<RefreshCw className={cx('size-4', loading && 'animate-spin')} />} onClick={() => load(true)} disabled={loading}>
            Atualizar
          </Button>
        }
      />

      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {accounts.map((a) => (
          <button
            key={a.id}
            onClick={() => setAccountId(a.id)}
            className={cx('flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm cursor-pointer', a.id === accountId ? 'border-accent bg-accent/10' : 'border-line hover:bg-hover')}
          >
            <AccountAvatar name={a.name} url={a.avatarUrl} network={a.network} size={26} />
            {a.name}
          </button>
        ))}
      </div>

      {error && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">{error}</div>}

      {report && account && (
        <div className="space-y-5">
          {report.metrics.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {report.metrics.map((m) => (
                <div key={m.label} className="rounded-2xl border border-line bg-panel p-4">
                  <p className="text-xs text-muted">{m.label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtNumber(m.value)}</p>
                </div>
              ))}
            </div>
          )}
          {report.notes?.map((n) => (
            <div key={n} className="rounded-xl border border-line bg-panel-2 p-3 text-sm text-muted">
              {n}
            </div>
          ))}

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Seguidores ao longo do tempo">
              {growth.length > 1 ? (
                <div className="h-60">
                  <ResponsiveContainer>
                    <LineChart data={growth} margin={{ left: -10, right: 8, top: 8 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtNumber} domain={['auto', 'auto']} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line type="monotone" dataKey="followers" name="Seguidores" stroke="#7c5cff" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-16 text-center text-sm text-muted">O histórico é montado com uma coleta por dia.</p>
              )}
            </Card>
            <Card title="Engajamento dos posts recentes">
              {engagement.length ? (
                <div className="h-60">
                  <ResponsiveContainer>
                    <BarChart data={engagement} margin={{ left: -10, right: 8, top: 8 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtNumber} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--hover)' }} />
                      {metricKeys.filter((k) => k !== 'Impressões' && k !== 'Views').slice(0, 4).map((k, i) => (
                        <Bar key={k} dataKey={k} stackId="a" fill={colors[i]} radius={i === 0 ? [0, 0, 0, 0] : undefined} />
                      ))}
                      {(metricKeys.includes('Views') && metricKeys.length === 1) && <Bar dataKey="Views" fill={colors[0]} />}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-16 text-center text-sm text-muted">Sem posts recentes disponíveis pela API.</p>
              )}
            </Card>
          </div>

          {report.recent.length > 0 && (
            <Card title="Publicações recentes" actions={<span className="text-xs text-muted">atualizado {fmtDate(report.fetchedAt)}</span>}>
              <div className="divide-y divide-line">
                {report.recent.map((r) => (
                  <div key={r.id} className="flex items-center gap-4 py-3">
                    {r.thumbnailUrl ? <img src={r.thumbnailUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover" referrerPolicy="no-referrer" /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm">{r.text || '(sem texto)'}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        {r.createdAt && <span>{fmtDate(r.createdAt)}</span>}
                        {r.metrics.map((m) => (
                          <span key={m.label}>
                            <b className="text-fg tabular-nums">{fmtNumber(m.value)}</b> {m.label.toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                    {r.url && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" title="Abrir no navegador do app" onClick={() => navigate('browser', { url: r.url })}>
                          <Globe className="size-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" title="Abrir no navegador padrão" onClick={() => openExternal(r.url!)}>
                          <ExternalLink className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
