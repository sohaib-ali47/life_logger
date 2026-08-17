import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import { Card } from './Card'
import { categoryOf } from '../lib/categories'
import { formatDayLong, formatMinutes } from '../lib/dates'

export function EntryList({ entries, onRemove }) {
  // Entries arrive newest-first, so day order falls out of insertion order.
  const groups = useMemo(() => {
    const byDay = new Map()
    for (const e of entries) {
      if (!byDay.has(e.day)) byDay.set(e.day, [])
      byDay.get(e.day).push(e)
    }
    return [...byDay.entries()].map(([day, items]) => ({
      day,
      items,
      total: items.reduce((sum, e) => sum + e.minutes, 0),
    }))
  }, [entries])

  if (!groups.length) {
    return (
      <Card className="text-center">
        <p className="text-sm text-ink-2">No entries yet.</p>
        <p className="mt-1 text-sm text-muted">Your first log will show up here.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.day}>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="text-sm font-semibold text-ink">{formatDayLong(group.day)}</h2>
            <span className="text-xs tabular-nums text-muted">
              {formatMinutes(group.total)}
            </span>
          </div>
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {group.items.map((entry) => (
                <motion.li
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.16 }}
                >
                  <EntryRow entry={entry} onRemove={onRemove} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  )
}

function EntryRow({ entry, onRemove }) {
  const category = categoryOf(entry.category)
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
      <span
        aria-hidden="true"
        className="h-8 w-1 shrink-0 rounded-full"
        style={{ background: category.color }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{entry.activity}</p>
        <p className="truncate text-xs text-muted">
          {category.label}
          {entry.note && ` · ${entry.note}`}
        </p>
      </div>
      <span className="shrink-0 text-sm tabular-nums text-ink-2">
        {formatMinutes(entry.minutes)}
      </span>
      <button
        type="button"
        onClick={() => onRemove(entry.id)}
        className="-mr-1 shrink-0 rounded-lg p-2 text-muted transition-colors hover:text-critical focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        <span className="sr-only">Delete {entry.activity}</span>
      </button>
    </div>
  )
}
