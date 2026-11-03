import type { NetworkInfo } from '@/core/networks'
import type { Account, Post, Settings } from '@/core/types'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, onAppEvent } from './api'

export type Page = 'dashboard' | 'accounts' | 'composer' | 'calendar' | 'analytics' | 'assistant' | 'browser' | 'settings'

interface AppState {
  ready: boolean
  platform: 'desktop' | 'mobile'
  settings: Settings
  accounts: Account[]
  posts: Post[]
  networks: NetworkInfo[]
  page: Page
  /** Post being edited in the composer (undefined = new post). */
  editingPostId?: string
  /** URL the built-in browser should open next. */
  browserUrl?: string
  navigate(page: Page, opts?: { postId?: string; url?: string }): void
  reload(): Promise<void>
}

const Ctx = createContext<AppState>(null!)
export const useApp = () => useContext(Ctx)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AppState, 'navigate' | 'reload' | 'page' | 'editingPostId' | 'browserUrl'>>({
    ready: false,
    platform: 'desktop',
    settings: undefined!,
    accounts: [],
    posts: [],
    networks: [],
  })
  const [nav, setNav] = useState<{ page: Page; editingPostId?: string; browserUrl?: string }>({ page: 'dashboard' })

  const reload = useCallback(async () => {
    const s = await api.getState()
    setState({ ready: true, ...s })
  }, [])

  useEffect(() => {
    void reload()
    return onAppEvent((e) => {
      if (e.type === 'posts-changed' || e.type === 'accounts-changed' || e.type === 'settings-changed') void reload()
    })
  }, [reload])

  // Applies the theme to <html>.
  useEffect(() => {
    const theme = state.settings?.theme ?? 'dark'
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.classList.toggle('light', !dark)
    }
    apply()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [state.settings?.theme])

  const navigate = useCallback((page: Page, opts?: { postId?: string; url?: string }) => {
    setNav({ page, editingPostId: opts?.postId, browserUrl: opts?.url })
  }, [])

  return <Ctx.Provider value={{ ...state, ...nav, navigate, reload }}>{children}</Ctx.Provider>
}
