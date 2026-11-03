import { AccountAvatar } from '@/components/NetworkIcon'
import { Badge, Button, Card, EmptyState, PageHeader, fmtDate, fmtNumber } from '@/components/ui'
import type { AnalyticsReport, Snapshot } from '@/core/types'
import { api } from '@/lib/api'
import { useApp } from '@/lib/state'
import { CalendarDays, CircleCheck, Clock, SquarePen, TrendingUp, TriangleAlert, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function useAllAnalytics() {
  const { accounts } = useApp()
  const [reports, setReports] = useState<Record<string, AnalyticsReport | { error: string }>>({})
  useEffect(() => {
    accounts.forEach((a) =>
      api
        .getAnalytics(a.id)
        .then((r) => setReports((s) => ({ ...s, [a.id]: r })))
        .catch((e) => setReports((s) => ({ ...s, [a.id]: { error: String(e.message ?? e) } }))),
    )
  }, [accounts])
  return reports
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-center gap-3">
        <div className={`grid size-10 place-items-center rounded-xl ${tone}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted">{label}</p>
          <p className="text-xl font-semibold tabular-nums">{value}</p>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { accounts, posts, navigate } = useApp()
  const reports = useAllAnalytics()
  const [snaps, setSnaps] = useState<Snapshot[]>([])
  useEffect(() => void api.getSnapshots().then(setSnaps), [reports])

  const totalFollowers = Object.values(reports).reduce((n, r) => n + (('followers' in r && r.followers) || 0), 0)
  const scheduled = posts.filter((p) => p.status === 'scheduled').sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))
  const published = posts.filter((p) => p.status === 'published' || p.status === 'partial')
  const failed = posts.filter((p) => p.status === 'failed' || p.status === 'partial')

  const growth = useMemo(() => {
    const byDate = new Map<string, number>()
    for (const s of snaps) byDate.set(s.date, (byDate.get(s.date) ?? 0) + (s.followers ?? 0))
    return [...byDate.entries()].sort().slice(-30).map(([date, followers]) => ({ date: date.slice(5).split('-').reverse().join('/'), followers }))
  }, [snaps])

  return (
    <>
      <PageHeader
        title="Visão geral"
        subtitle="Tudo o que acontece nas suas redes, em um só lugar."
        actions={
          <Button variant="primary" icon={<SquarePen className="size-4" />} onClick={() => navigate('composer')}>
            Novo post
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Users className="size-5" />} label="Seguidores (total)" value={fmtNumber(totalFollowers)} tone="bg-accent/12 text-accent" />
        <Stat icon={<Clock className="size-5" />} label="Agendados" value={String(scheduled.length)} tone="bg-sky-500/12 text-sky-400" />
        <Stat icon={<CircleCheck className="size-5" />} label="Publicados" value={String(published.length)} tone="bg-emerald-500/12 text-emerald-400" />
        <Stat icon={<TriangleAlert className="size-5" />} label="Com falha" value={String(failed.length)} tone="bg-red-500/12 text-red-400" />
      </div>

      {!accounts.length ? (
        <Card className="mt-6">
          <EmptyState
            icon={<Users className="size-6" />}
            title="Conecte sua primeira rede"
            text="LinkedIn, Facebook, Instagram, YouTube, Twitch e X. Depois disso você verá métricas e poderá agendar posts."
            action={<Button variant="primary" onClick={() => navigate('accounts')}>Conectar contas</Button>}
          />
        </Card>
      ) : (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" title={<span className="flex items-center gap-2"><TrendingUp className="size-4 text-accent" /> Crescimento de seguidores</span>}>
            {growth.length > 1 ? (
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={growth} margin={{ left: -10, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#7c5cff" stopOpacity={0.35} />
                        <stop offset="1" stopColor="#7c5cff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={fmtNumber} />
                    <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10 }} formatter={(v) => fmtNumber(Number(v))} />
                    <Area type="monotone" dataKey="followers" name="Seguidores" stroke="#7c5cff" strokeWidth={2} fill="url(#gf)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-16 text-center text-sm text-muted">O gráfico aparece a partir do segundo dia de coleta de métricas.</p>
            )}
          </Card>

          <Card title={<span className="flex items-center gap-2"><CalendarDays className="size-4 text-accent" /> Próximas publicações</span>} actions={<Button size="sm" variant="ghost" onClick={() => navigate('calendar')}>Ver tudo</Button>}>
            {scheduled.length ? (
              <ul className="space-y-3">
                {scheduled.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <button onClick={() => navigate('composer', { postId: p.id })} className="w-full rounded-xl border border-line bg-panel-2 p-3 text-left hover:border-accent/50 cursor-pointer">
                      <p className="line-clamp-2 text-sm">{p.draft.text || p.draft.title}</p>
                      <p className="mt-1.5 text-xs text-muted">{fmtDate(p.scheduledAt!)} · {p.draft.accountIds.length} conta(s)</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-10 text-center text-sm text-muted">Nada agendado.</p>
            )}
          </Card>

          <Card className="lg:col-span-3" title="Contas">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((a) => {
                const r = reports[a.id]
                return (
                  <button key={a.id} onClick={() => navigate('analytics')} className="flex items-center gap-3 rounded-xl border border-line bg-panel-2 p-3 text-left hover:border-accent/50 cursor-pointer">
                    <AccountAvatar name={a.name} url={a.avatarUrl} network={a.network} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="truncate text-xs text-muted">{a.handle}</p>
                    </div>
                    {!r ? (
                      <Badge>…</Badge>
                    ) : 'error' in r ? (
                      <Badge tone="red">erro</Badge>
                    ) : r.followers !== undefined ? (
                      <span className="text-sm font-semibold tabular-nums">{fmtNumber(r.followers)}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
