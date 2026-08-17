import { formatMinutes } from '../lib/dates'

export function ChartTooltip({ active, payload, label, swatch }) {
  if (!active || !payload?.length) return null
  const value = payload[0].value
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2 shadow-lg">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
        {swatch && (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ background: swatch }}
          />
        )}
        {value > 0 ? formatMinutes(value) : 'Nothing logged'}
      </p>
    </div>
  )
}

/**
 * Every chart ships a table twin — the WCAG-clean way to read the same values
 * without relying on hover or on colour.
 */
export function DataTable({ caption, rows, unitHeader = 'Time' }) {
  return (
    <div className="max-h-[240px] overflow-y-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface">
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="py-1.5 font-medium">
              Period
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              {unitHeader}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line/60 last:border-0">
              <th scope="row" className="py-1.5 text-left font-normal text-ink-2">
                {row.label}
              </th>
              <td className="py-1.5 text-right tabular-nums text-ink">
                {row.minutes > 0 ? formatMinutes(row.minutes) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
