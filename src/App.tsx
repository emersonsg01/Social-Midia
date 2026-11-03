import { Bot, CalendarDays, ChartColumn, Globe, LayoutDashboard, LoaderCircle, PanelLeft, Settings as SettingsIcon, SquarePen, Users } from 'lucide-react'
import { useState } from 'react'
import { ToastProvider, cx } from './components/ui'
import { desktop } from './lib/api'
import { AppStateProvider, useApp, type Page } from './lib/state'
import Accounts from './pages/Accounts'
import Analytics from './pages/Analytics'
import Assistant from './pages/Assistant'
import Browser from './pages/Browser'
import Calendar from './pages/Calendar'
import Composer from './pages/Composer'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'

const nav: { id: Page; label: string; icon: typeof Bot }[] = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'composer', label: 'Criar post', icon: SquarePen },
  { id: 'calendar', label: 'Calendário', icon: CalendarDays },
  { id: 'analytics', label: 'Análises', icon: ChartColumn },
  { id: 'assistant', label: 'Assistente IA', icon: Bot },
  { id: 'browser', label: 'Navegador', icon: Globe },
  { id: 'accounts', label: 'Contas', icon: Users },
  { id: 'settings', label: 'Configurações', icon: SettingsIcon },
]

function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-accent to-accent-2 shadow-lg shadow-accent/30">
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="white" strokeWidth={2.4} strokeLinecap="round">
          <circle cx="7" cy="12" r="2.4" fill="white" />
          <circle cx="17" cy="6.5" r="2.2" fill="white" />
          <circle cx="17" cy="17.5" r="2.2" fill="white" />
          <path d="M7 12 17 6.5M7 12l10 5.5" />
        </svg>
      </div>
      {!compact && <span className="text-[15px] font-semibold tracking-tight">Social Hub</span>}
    </div>
  )
}

function Shell() {
  const app = useApp()
  const [collapsed, setCollapsed] = useState(false)
  const isMac = desktop?.os === 'darwin'

  if (!app.ready)
    return (
      <div className="grid h-full place-items-center">
        <LoaderCircle className="size-6 animate-spin text-accent" />
      </div>
    )

  const pages: Record<Exclude<Page, 'browser'>, React.ReactNode> = {
    dashboard: <Dashboard />,
    accounts: <Accounts />,
    composer: <Composer key={app.editingPostId ?? 'new'} />,
    calendar: <Calendar />,
    analytics: <Analytics />,
    assistant: <Assistant />,
    settings: <Settings />,
  }

  return (
    <div className="flex h-full flex-col">
      {/* Title bar: draggable area; Windows caption buttons are drawn by the OS on the right. */}
      {desktop && (
        <div className={cx('drag flex h-10 shrink-0 items-center gap-3 border-b border-line bg-panel/60', isMac ? 'pl-20' : 'pl-3')}>
          <button className="no-drag rounded-md p-1.5 text-muted hover:bg-hover hover:text-fg" onClick={() => setCollapsed((c) => !c)} aria-label="Recolher menu">
            <PanelLeft className="size-4" />
          </button>
          <Logo />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside
          className={cx(
            'hidden shrink-0 flex-col border-r border-line bg-panel/40 p-2.5 transition-all md:flex',
            collapsed ? 'w-[60px]' : 'w-56',
          )}
        >
          {!desktop && (
            <div className="mb-4 px-2 pt-2">
              <Logo compact={collapsed} />
            </div>
          )}
          <nav className="flex flex-col gap-0.5">
            {nav.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                title={collapsed ? label : undefined}
                onClick={() => app.navigate(id)}
                className={cx(
                  'group flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm transition cursor-pointer',
                  app.page === id ? 'bg-accent/12 text-fg font-medium' : 'text-muted hover:bg-hover hover:text-fg',
                )}
              >
                <Icon className={cx('size-[18px] shrink-0', app.page === id && 'text-accent')} />
                {!collapsed && label}
              </button>
            ))}
          </nav>
          <div className="mt-auto">
            {!collapsed && (
              <div className="rounded-xl border border-line bg-panel-2 p-3 text-xs text-muted">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-fg">
                  <span className="size-1.5 rounded-full bg-emerald-400" /> Agendador ativo
                </div>
                {app.accounts.length} conta(s) · {app.posts.filter((p) => p.status === 'scheduled').length} agendado(s)
              </div>
            )}
          </div>
        </aside>

        <main className="relative min-w-0 flex-1">
          {/* The browser stays mounted so its tabs survive navigation. */}
          <div className={cx('absolute inset-0', app.page !== 'browser' && 'invisible')}>
            <Browser />
          </div>
          {app.page !== 'browser' && (
            <div className="absolute inset-0 overflow-y-auto">
              <div key={app.page} className="animate-in mx-auto max-w-6xl px-4 py-6 pb-24 md:px-8 md:pb-8">
                {pages[app.page]}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Bottom navigation on phones. */}
      <nav className="flex shrink-0 justify-around border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden">
        {nav.filter((n) => n.id !== 'accounts').map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => app.navigate(id)} className={cx('flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]', app.page === id ? 'text-accent' : 'text-muted')}>
            <Icon className="size-5" />
            {label.split(' ')[0]}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppStateProvider>
        <Shell />
      </AppStateProvider>
    </ToastProvider>
  )
}
