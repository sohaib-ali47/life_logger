export function Card({ children, className = '' }) {
  return (
    <section
      className={`rounded-2xl border border-line bg-surface p-4 ${className}`}
    >
      {children}
    </section>
  )
}

/** Chart cards share a title row with an optional table-view toggle. */
export function CardHeader({ title, subtitle, action }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[15px] leading-tight font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  )
}

export function TableToggle({ showing, onToggle, label }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={showing}
      className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {showing ? 'Chart' : 'Table'}
      <span className="sr-only"> view of {label}</span>
    </button>
  )
}

export function EmptyPlot({ children }) {
  return (
    <p className="flex h-[180px] items-center justify-center text-center text-sm text-muted">
      {children}
    </p>
  )
}
