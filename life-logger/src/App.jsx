import { useMemo, useState } from 'react'
import { BarChart3, Database, PenLine } from 'lucide-react'
import { QuickLog } from './components/QuickLog'
import { EntryList } from './components/EntryList'
import { Insights } from './components/Insights'
import { DataPanel } from './components/DataPanel'
import { useEntries } from './lib/storage'
import { dayKey, formatMinutes } from './lib/dates'

const TABS = [
  { id: 'log', label: 'Log', icon: PenLine },
  { id: 'graphs', label: 'Graphs', icon: BarChart3 },
  { id: 'data', label: 'Data', icon: Database },
]

export default function App() {
  const [tab, setTab] = useState('log')
  const { entries, error, addEntry, removeEntry, replaceAll, clearAll } = useEntries()

  const todayMinutes = useMemo(() => {
    const today = dayKey()
    return entries.reduce((sum, e) => (e.day === today ? sum + e.minutes : sum), 0)
  }, [entries])

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col">
      <header className="flex items-baseline justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="text-lg font-semibold text-ink">Life Logger</h1>
        <p className="text-sm text-muted">
          Today{' '}
          <span className="tabular-nums text-ink-2">{formatMinutes(todayMinutes)}</span>
        </p>
      </header>

      {error && (
        <p role="alert" className="mx-4 mb-3 rounded-xl border border-critical/40 px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      <main className="flex-1 space-y-4 px-4 pb-6">
        {tab === 'log' && (
          <>
            <QuickLog onAdd={addEntry} />
            <EntryList entries={entries} onRemove={removeEntry} />
          </>
        )}
        {tab === 'graphs' && <Insights entries={entries} />}
        {tab === 'data' && (
          <DataPanel entries={entries} onReplaceAll={replaceAll} onClearAll={clearAll} />
        )}
      </main>

      {/* Bottom bar: thumb-reachable, and clear of the iPhone home indicator. */}
      <nav
        aria-label="Sections"
        className="sticky bottom-0 border-t border-line bg-plane/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="mx-auto flex max-w-2xl">
          {TABS.map(({ id, label, icon: Icon }) => {
            const on = tab === id
            return (
              <li key={id} className="flex-1">
                <button
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={on ? 'page' : undefined}
                  className={`flex w-full flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                    on ? 'text-accent' : 'text-muted'
                  }`}
                >
                  <Icon aria-hidden="true" className="size-5" />
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
