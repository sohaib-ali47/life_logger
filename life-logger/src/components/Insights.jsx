import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardHeader, EmptyPlot, TableToggle } from './Card'
import { ChartTooltip, DataTable } from './charts'
import { CHROME, axisTick, tickMinutes } from '../lib/chartTheme'
import { formatMinutes } from '../lib/dates'
import { categoryTotals, dailyTotals, summary, weeklyTotals } from '../lib/stats'

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]

export function Insights({ entries }) {
  const [days, setDays] = useState(7)

  const daily = useMemo(() => dailyTotals(entries, days), [entries, days])
  const byCategory = useMemo(() => categoryTotals(entries, days), [entries, days])
  const weekly = useMemo(() => weeklyTotals(entries, 8), [entries])
  const stats = useMemo(() => summary(entries, days), [entries, days])

  if (!entries.length) {
    return (
      <Card className="text-center">
        <p className="text-sm text-ink-2">Nothing logged yet.</p>
        <p className="mt-1 text-sm text-muted">
          Add a few entries on the Log tab and your graphs will build themselves.
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* One filter row, above everything it scopes. */}
      <div
        role="group"
        aria-label="Time range"
        className="flex gap-1 rounded-xl border border-line bg-surface p-1"
      >
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            onClick={() => setDays(r.days)}
            aria-pressed={days === r.days}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              days === r.days ? 'bg-raised text-ink' : 'text-muted hover:text-ink-2'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <StatRow stats={stats} days={days} />
      <DailyChart data={daily} days={days} />
      <CategoryBreakdown rows={byCategory} days={days} />
      <WeeklyTrend data={weekly} />
    </div>
  )
}

function StatRow({ stats, days }) {
  const tiles = [
    { label: `Logged in ${days} days`, value: formatMinutes(stats.total) },
    { label: 'Average active day', value: formatMinutes(stats.average) },
    { label: 'Day streak', value: String(stats.streak) },
    { label: 'Top focus', value: stats.topCategory ?? '—' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl border border-line bg-surface p-3">
          <p className="text-xs text-muted">{t.label}</p>
          {/* Proportional figures — tabular-nums would look loose at this size. */}
          <p className="mt-1 truncate text-xl font-semibold text-ink">{t.value}</p>
        </div>
      ))}
    </div>
  )
}

function DailyChart({ data, days }) {
  const [table, setTable] = useState(false)
  const empty = data.every((d) => d.minutes === 0)
  // Thin the ticks so labels never collide on the longer ranges.
  const interval = days <= 7 ? 0 : days <= 30 ? 4 : 14

  return (
    <Card>
      <CardHeader
        title="Time logged each day"
        subtitle={`Last ${days} days`}
        action={
          <TableToggle
            showing={table}
            onToggle={() => setTable((v) => !v)}
            label="time logged each day"
          />
        }
      />
      {table ? (
        <DataTable caption={`Time logged each day over the last ${days} days`} rows={data} />
      ) : empty ? (
        <EmptyPlot>No entries in this range.</EmptyPlot>
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke={CHROME.grid} />
              <XAxis
                dataKey="label"
                interval={interval}
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: CHROME.axis }}
                minTickGap={4}
              />
              <YAxis
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                tickFormatter={tickMinutes}
                width={46}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                content={<ChartTooltip swatch={CHROME.accent} />}
              />
              <Bar
                dataKey="minutes"
                fill={CHROME.accent}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

/**
 * Ranked horizontal bars rather than a donut: eight slices would put the
 * palette past its all-pairs cap, and close values are hard to compare in a
 * ring. Every row is direct-labelled, so colour is never the only channel.
 */
function CategoryBreakdown({ rows, days }) {
  const [table, setTable] = useState(false)
  const max = rows.length ? rows[0].minutes : 0

  return (
    <Card>
      <CardHeader
        title="Where the time went"
        subtitle={`By category, last ${days} days`}
        action={
          <TableToggle
            showing={table}
            onToggle={() => setTable((v) => !v)}
            label="time by category"
          />
        }
      />
      {!rows.length ? (
        <EmptyPlot>No entries in this range.</EmptyPlot>
      ) : table ? (
        <DataTable
          caption={`Time by category over the last ${days} days`}
          rows={rows.map((r) => ({ ...r, key: r.id }))}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: row.color }}
                  />
                  <span className="truncate text-ink">{row.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-ink-2">
                  {formatMinutes(row.minutes)}
                  <span className="ml-1.5 text-muted">{Math.round(row.share * 100)}%</span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${max ? Math.max(2, (row.minutes / max) * 100) : 0}%`,
                    background: row.color,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function WeeklyTrend({ data }) {
  const [table, setTable] = useState(false)
  const empty = data.every((d) => d.minutes === 0)

  return (
    <Card>
      <CardHeader
        title="Weekly total"
        subtitle="Last 8 weeks, from each Monday"
        action={
          <TableToggle
            showing={table}
            onToggle={() => setTable((v) => !v)}
            label="weekly totals"
          />
        }
      />
      {table ? (
        <DataTable
          caption="Total time logged per week over the last 8 weeks"
          rows={data.map((d) => ({ ...d, label: `Week of ${d.label}` }))}
        />
      ) : empty ? (
        <EmptyPlot>No entries in the last 8 weeks.</EmptyPlot>
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke={CHROME.grid} />
              <XAxis
                dataKey="label"
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: CHROME.axis }}
                minTickGap={8}
              />
              <YAxis
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                tickFormatter={tickMinutes}
                width={46}
              />
              <Tooltip
                cursor={{ stroke: CHROME.axis, strokeWidth: 1 }}
                content={<ChartTooltip swatch={CHROME.accent} />}
                labelFormatter={(l) => `Week of ${l}`}
              />
              <Line
                type="monotone"
                dataKey="minutes"
                stroke={CHROME.accent}
                strokeWidth={2}
                // 8px marker; the 2px surface ring keeps it legible where the
                // line doubles back over itself.
                dot={{ r: 4, fill: CHROME.accent, stroke: CHROME.surface, strokeWidth: 2 }}
                activeDot={{ r: 6, fill: CHROME.accent, stroke: CHROME.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
