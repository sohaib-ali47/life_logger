/* App shell — hash routing, navigation, the toast host.
   No router dependency: four routes do not need one. */

import { useCallback, useEffect, useState } from 'react'
import Icon from './components/Icon'
import { Toast, IconButton } from './components/ui'
import { TipProvider } from './components/charts'
import { AppProvider, useApp } from './lib/store'
import { configError } from './lib/supabase'
import Today from './screens/Today'
import Stats from './screens/Stats'
import Review from './screens/Review'
import Setup from './screens/Setup'
import SectionDetail from './screens/SectionDetail'
import Auth from './screens/Auth'
import Preference from './screens/Preference'

const NAV = [
  { id: 'today', label: 'Today', icon: 'calendar', path: '/today' },
  { id: 'stats', label: 'Stats', icon: 'chart', path: '/stats' },
  { id: 'review', label: 'Review', icon: 'check', path: '/review' },
  { id: 'setup', label: 'Setup', icon: 'settings', path: '/setup' },
]

function parseHash() {
  const raw = (window.location.hash || '#/today').replace(/^#\/?/, '')
  const [pathPart, queryPart] = raw.split('?')
  const parts = pathPart.split('/').filter(Boolean)
  const query = {}
  if (queryPart) {
    for (const kv of queryPart.split('&')) {
      const [k, v] = kv.split('=')
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v ?? '')
    }
  }
  return { name: parts[0] || 'today', arg: parts[1] || null, query }
}

export default function App() {
  return (
    <AppProvider>
      <TipProvider>
        <Shell />
      </TipProvider>
    </AppProvider>
  )
}

function Shell() {
  const app = useApp()
  const [route, setRoute] = useState(parseHash)

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) window.location.hash = '#/today'
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const navigate = useCallback((path) => {
    window.location.hash = `#${path.startsWith('/') ? path : `/${path}`}`
  }, [])

  const activeTab = route.name === 'section' ? 'stats' : route.name

  useEffect(() => {
    const tab = NAV.find((n) => n.id === activeTab)
    document.title = tab ? `${tab.label} · Life OS` : 'Life OS'
  }, [activeTab])

  /* the context is briefly null while the provider remounts on a hot
     reload — render nothing rather than crashing the whole shell */
  if (!app?.ready || (app.accountsEnabled && !app.auth.ready) || app.bootstrapping) {
    return (
      <div className="min-h-full grid place-items-center text-ink-3 text-[13px]">
        <div className="grid gap-3 justify-items-center">
          <div className="w-9 h-9 rounded-[12px] bg-surface-2 grid place-items-center animate-pulse">
            <Icon name="compass" size={18} />
          </div>
          Loading your data…
        </div>
      </div>
    )
  }

  /* A recovery link signs you in with the sole purpose of setting a new
     password, so it takes precedence over everything else. */
  if (app.accountsEnabled && app.auth.recovery) {
    return <Auth initialMode="recovery" onDone={app.clearRecovery} />
  }

  /* Sign in first. No bypass — the session is cached, so this is asked
     once per device and not again until you sign out. */
  if (app.accountsEnabled && !app.session) {
    return <Auth notice={app.auth.notice} />
  }

  /* Then the one preference, if it has never been answered. Gating on the
     answer itself rather than a "seen it" flag is what makes it reappear
     on the next sign-in for anyone who has not set it — and vanish for
     good the moment they do, on every device, because it syncs. */
  if (!app.settings.sex) {
    return <Preference />
  }

  return (
    <div className="md:grid md:grid-cols-[210px_1fr] min-h-full">
      {/* ── rail (desktop) ─────────────────────────────────────────── */}
      <nav className="hidden md:flex flex-col gap-1 p-4 border-r border-line sticky top-0 h-screen" aria-label="Main">
        <div className="flex items-center gap-2.5 px-2.5 pb-5">
          <span
            className="w-4.5 h-4.5 rounded-[6px] shrink-0"
            style={{
              width: 18,
              height: 18,
              background: 'conic-gradient(from 210deg, var(--s1), var(--s3), var(--s4), var(--s2), var(--s1))',
            }}
          />
          <span className="font-semibold text-[13.5px] tracking-tight">Life OS</span>
        </div>
        {NAV.map((n) => (
          <a
            key={n.id}
            href={`#${n.path}`}
            aria-current={activeTab === n.id ? 'page' : undefined}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-[10px] text-[13.5px] font-medium transition-colors ${
              activeTab === n.id ? 'bg-surface text-ink' : 'text-ink-2 hover:bg-surface-3 hover:text-ink'
            }`}
          >
            <Icon name={n.icon} size={17} className={activeTab === n.id ? 'text-accent' : ''} />
            {n.label}
          </a>
        ))}
        <div className="mt-auto px-1">
          <IconButton
            name={app.settings.theme === 'dark' ? 'sun' : 'moon'}
            label="Toggle theme"
            onClick={() => app.setSetting('theme', app.settings.theme === 'dark' ? 'light' : 'dark')}
          />
        </div>
      </nav>

      {/* ── screen ─────────────────────────────────────────────────── */}
      <main className="px-4 md:px-7 pt-5 md:pt-6 pb-28 md:pb-16 max-w-[1160px] w-full pt-safe">
        {/* Silently skipping the login screen because an env var is absent
            is a trap. Say so, on every screen, until it is fixed. */}
        {!app.accountsEnabled && (
          <div
            className="flex items-start gap-2.5 rounded-[12px] px-3.5 py-2.5 mb-4 text-[12.5px] leading-relaxed"
            style={{
              background: 'color-mix(in oklab, var(--warning) 14%, transparent)',
              color: 'var(--ink)',
            }}
          >
            <Icon name="lock" size={15} className="mt-px shrink-0" />
            <span>
              <strong>Sign-in is off on this build.</strong>{' '}
              {configError || 'Environment variables were not readable at build time.'} Until then this device is
              local-only.
            </span>
          </div>
        )}
        {route.name === 'stats' && <Stats navigate={navigate} />}
        {route.name === 'review' && <Review navigate={navigate} />}
        {route.name === 'setup' && <Setup navigate={navigate} query={route.query} />}
        {route.name === 'section' && <SectionDetail sectionId={route.arg} navigate={navigate} />}
        {(route.name === 'today' || !NAV.some((n) => n.id === route.name) && route.name !== 'section') && (
          <Today dayKey={route.arg} navigate={navigate} />
        )}
      </main>

      {/* ── tab bar (mobile) ───────────────────────────────────────── */}
      <nav
        className="md:hidden fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-line pb-safe"
        style={{ background: 'color-mix(in oklab, var(--plane) 88%, transparent)', backdropFilter: 'blur(14px)' }}
        aria-label="Main"
      >
        {NAV.map((n) => (
          <a
            key={n.id}
            href={`#${n.path}`}
            aria-current={activeTab === n.id ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[10.5px] font-medium ${
              activeTab === n.id ? 'text-ink' : 'text-ink-3'
            }`}
          >
            <Icon name={n.icon} size={19} className={activeTab === n.id ? 'text-accent' : ''} />
            {n.label}
          </a>
        ))}
      </nav>

      <Toast toast={app.toast} onDismiss={app.dismissToast} />
    </div>
  )
}
