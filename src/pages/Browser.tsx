import { NetworkIcon } from '@/components/NetworkIcon'
import { cx } from '@/components/ui'
import { desktop } from '@/lib/api'
import { useApp } from '@/lib/state'
import { Browser as CapBrowser } from '@capacitor/browser'
import { ArrowLeft, ArrowRight, Globe, House, LoaderCircle, Lock, Plus, RotateCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface WebviewTag extends HTMLElement {
  src: string
  goBack(): void
  goForward(): void
  reload(): void
  stop(): void
  loadURL(url: string): Promise<void>
  canGoBack(): boolean
  canGoForward(): boolean
  getURL(): string
}

interface Tab {
  id: number
  url: string
  title: string
  favicon?: string
  loading: boolean
  canBack: boolean
  canForward: boolean
}

const HOME = 'https://www.google.com'
let nextId = 1

/** Turns what the user typed into a URL, falling back to a web search. */
function toUrl(input: string) {
  const v = input.trim()
  if (/^https?:\/\//i.test(v)) return v
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(v)) return `https://${v}`
  return `https://www.google.com/search?q=${encodeURIComponent(v)}`
}

function TabView({ tab, active, onUpdate, register }: { tab: Tab; active: boolean; onUpdate: (patch: Partial<Tab>) => void; register: (el: WebviewTag | null) => void }) {
  const ref = useRef<WebviewTag>(null)
  // The initial src must not change afterwards or the webview reloads.
  const [initialUrl] = useState(tab.url)

  useEffect(() => {
    const wv = ref.current
    if (!wv) return
    register(wv)
    const nav = () => onUpdate({ url: wv.getURL(), canBack: wv.canGoBack(), canForward: wv.canGoForward() })
    const handlers: [string, (e: any) => void][] = [
      ['did-start-loading', () => onUpdate({ loading: true })],
      ['did-stop-loading', () => (onUpdate({ loading: false }), nav())],
      ['did-navigate', nav],
      ['did-navigate-in-page', nav],
      ['page-title-updated', (e) => onUpdate({ title: e.title })],
      ['page-favicon-updated', (e) => onUpdate({ favicon: e.favicons?.[0] })],
    ]
    handlers.forEach(([n, h]) => wv.addEventListener(n, h))
    return () => {
      handlers.forEach(([n, h]) => wv.removeEventListener(n, h))
      register(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <webview ref={ref as any} src={initialUrl} partition="persist:browser" {...({ allowpopups: 'true' } as object)} className={cx('absolute inset-0', !active && 'invisible')} />
}

function MobileBrowser() {
  const { networks } = useApp()
  const [url, setUrl] = useState('')
  const open = (u: string) => CapBrowser.open({ url: toUrl(u) })
  return (
    <div className="mx-auto max-w-xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold">Navegador</h1>
      <form onSubmit={(e) => (e.preventDefault(), void open(url))} className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Endereço ou pesquisa" className="h-10 flex-1 rounded-lg border border-line bg-panel-2 px-3 text-sm outline-none focus:border-accent" />
      </form>
      <div className="grid grid-cols-3 gap-3">
        {networks.map((n) => (
          <button key={n.id} onClick={() => open(n.siteUrl)} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-panel p-4 text-xs">
            <NetworkIcon network={n.id} size={36} />
            {n.name}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Browser() {
  const { networks, page, browserUrl } = useApp()
  const [tabs, setTabs] = useState<Tab[]>(() => [{ id: nextId++, url: HOME, title: 'Nova aba', loading: false, canBack: false, canForward: false }])
  const [activeId, setActiveId] = useState(tabs[0].id)
  const [address, setAddress] = useState(HOME)
  const views = useRef(new Map<number, WebviewTag>())
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0]

  const update = (id: number, patch: Partial<Tab>) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  const newTab = (url = HOME) => {
    const tab: Tab = { id: nextId++, url, title: 'Carregando…', loading: true, canBack: false, canForward: false }
    setTabs((ts) => [...ts, tab])
    setActiveId(tab.id)
  }

  const closeTab = (id: number) => {
    setTabs((ts) => {
      const rest = ts.filter((t) => t.id !== id)
      if (!rest.length) return [{ id: nextId++, url: HOME, title: 'Nova aba', loading: false, canBack: false, canForward: false }]
      return rest
    })
  }

  // Keep a valid active tab after closing.
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeId)) setActiveId(tabs[tabs.length - 1].id)
  }, [tabs, activeId])

  useEffect(() => setAddress(active.url), [active.id, active.url])

  useEffect(() => desktop?.onBrowserOpenTab((url) => newTab(url)), [])

  useEffect(() => {
    if (page === 'browser' && browserUrl) newTab(browserUrl)
  }, [page, browserUrl])

  if (!desktop) return <MobileBrowser />

  const go = (url: string) => {
    const target = toUrl(url)
    void views.current.get(active.id)?.loadURL(target).catch(() => undefined)
    update(active.id, { url: target })
  }
  const view = () => views.current.get(active.id)

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex shrink-0 items-end gap-1 overflow-x-auto border-b border-line bg-panel/60 px-2 pt-2">
        {tabs.map((t) => (
          <div
            key={t.id}
            onMouseDown={(e) => e.button === 1 && closeTab(t.id)}
            onClick={() => setActiveId(t.id)}
            className={cx(
              'group flex h-9 w-52 shrink-0 cursor-pointer items-center gap-2 rounded-t-lg border border-b-0 px-3 text-xs',
              t.id === active.id ? 'border-line bg-bg' : 'border-transparent text-muted hover:bg-hover',
            )}
          >
            {t.loading ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" /> : t.favicon ? <img src={t.favicon} className="size-3.5 shrink-0" alt="" /> : <Globe className="size-3.5 shrink-0" />}
            <span className="flex-1 truncate">{t.title}</span>
            <button onClick={(e) => (e.stopPropagation(), closeTab(t.id))} className="rounded p-0.5 opacity-60 hover:bg-hover hover:opacity-100" aria-label="Fechar aba">
              <X className="size-3" />
            </button>
          </div>
        ))}
        <button onClick={() => newTab()} className="mb-1 rounded-md p-1.5 text-muted hover:bg-hover hover:text-fg" aria-label="Nova aba">
          <Plus className="size-4" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-line bg-bg px-2 py-1.5">
        <button disabled={!active.canBack} onClick={() => view()?.goBack()} className="rounded-md p-1.5 text-muted hover:bg-hover disabled:opacity-30" aria-label="Voltar">
          <ArrowLeft className="size-4" />
        </button>
        <button disabled={!active.canForward} onClick={() => view()?.goForward()} className="rounded-md p-1.5 text-muted hover:bg-hover disabled:opacity-30" aria-label="Avançar">
          <ArrowRight className="size-4" />
        </button>
        <button onClick={() => (active.loading ? view()?.stop() : view()?.reload())} className="rounded-md p-1.5 text-muted hover:bg-hover" aria-label="Recarregar">
          {active.loading ? <X className="size-4" /> : <RotateCw className="size-4" />}
        </button>
        <button onClick={() => go(HOME)} className="rounded-md p-1.5 text-muted hover:bg-hover" aria-label="Início">
          <House className="size-4" />
        </button>
        <form onSubmit={(e) => (e.preventDefault(), go(address))} className="relative mx-1 flex-1">
          <Lock className="pointer-events-none absolute left-3 top-2 size-3.5 text-muted" />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => e.target.select()}
            className="h-8 w-full rounded-full border border-line bg-panel-2 pl-8 pr-3 text-sm outline-none focus:border-accent"
          />
        </form>
        <div className="flex items-center gap-1 pl-1">
          {networks.map((n) => (
            <button key={n.id} title={n.name} onClick={() => newTab(n.siteUrl)} className="rounded-md p-1 hover:bg-hover">
              <NetworkIcon network={n.id} size={22} />
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex-1 bg-white">
        {tabs.map((t) => (
          <TabView
            key={t.id}
            tab={t}
            active={t.id === active.id}
            onUpdate={(p) => update(t.id, p)}
            register={(el) => (el ? views.current.set(t.id, el) : views.current.delete(t.id))}
          />
        ))}
      </div>
    </div>
  )
}
