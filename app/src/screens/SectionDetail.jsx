/* One section, in depth. The chart set is chosen by the primitive —
   an abstain section gets a streak chart, a scale gets a trend. */

import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { Card, Stat, Button, IconButton, Segmented, Empty, slotVar } from '../components/ui'
import { ChartCard, Trend, Hours, Heatmap, HeatScale, StreakChart, Ranked, Legend } from '../components/charts'
import { useApp } from '../lib/store'
import { lastNDays, addDays, fmtDay, today, clockOf } from '../lib/dates'
import {
  totalsByDay, series, rangeTotal, streak, abstainState, abstainOn,
  meetsTarget, deltaOf, byVariant,
} from '../lib/stats'
import { fmtValue, fmtNumber, axisUnit, chartDivisor } from '../lib/format'

const RANGES = [
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 365, label: '1y' },
]

export default function SectionDetail({ sectionId, navigate }) {
  const { active, entries, idx, deleteEntry } = useApp()
  const [days, setDays] = useState(90)
  const section = active.find((s) => s.id === sectionId)

  const keys = useMemo(() => lastNDays(days), [days])
  const prevKeys = useMemo(() => lastNDays(days, addDays(keys[0], -1)), [days, keys])
  const byDay = useMemo(() => totalsByDay(active, idx, keys), [active, idx, keys])
  const prevByDay = useMemo(() => totalsByDay(active, idx, prevKeys), [active, idx, prevKeys])
  const longKeys = useMemo(() => lastNDays(200), [])
  const longByDay = useMemo(() => totalsByDay(active, idx, longKeys), [active, idx, longKeys])

  const abst = useMemo(
    () => (section?.primitive === 'abstain' ? abstainState(section, entries, keys[0]) : null),
    [section, entries, keys]
  )

  const recent = useMemo(
    () =>
      entries
        .filter((e) => e.sectionId === sectionId && keys.includes(e.date))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 60),
    [entries, sectionId, keys]
  )

  /* every hook must run before any early return — this one included */
  const hourCounts = useMemo(() => {
    if (!section) return new Array(24).fill(0)
    const c = new Array(24).fill(0)
    for (const e of entries) {
      if (e.sectionId !== sectionId || !e.at || !keys.includes(e.date)) continue
      c[Number(e.at.slice(11, 13))] += e.value
    }
    return chartDivisor(section) === 60 ? c.map((v) => v / 60) : c
  }, [entries, sectionId, keys, section])

  /* how the total splits across the section's own options */
  const variantRows = useMemo(() => {
    if (!section?.variants?.length) return []
    const totals = byVariant(section, entries, keys)
    return section.variants
      .map((v) => ({
        id: v.id,
        name: v.name,
        value: totals.get(v.id) ?? 0,
        color: slotVar(section),
        display: fmtValue(section, totals.get(v.id) ?? 0),
      }))
      .filter((row) => row.value > 0)
  }, [section, entries, keys])

  /* personal records per exercise, and the set that produced each */
  const records = useMemo(() => {
    if (section?.primitive !== 'session') return []
    const best = new Map()
    for (const e of entries) {
      if (e.sectionId !== sectionId || e.deletedAt) continue
      for (const s of e.meta?.sets || []) {
        if (!s.weight) continue
        const cur = best.get(s.exercise)
        if (!cur || s.weight > cur.weight) best.set(s.exercise, { ...s, date: e.date })
      }
    }
    return [...best.values()].sort((a, b) => b.weight - a.weight)
  }, [entries, sectionId, section])

  if (!section) {
    return (
      <Empty icon="compass">
        That section no longer exists.{' '}
        <button className="underline" onClick={() => navigate('/stats')}>Back to stats</button>
      </Empty>
    )
  }

  const tint = slotVar(section)
  const points = series(section, byDay, keys)
  const total = rangeTotal(section, byDay, keys)
  const prev = rangeTotal(section, prevByDay, prevKeys)
  const active_days = points.filter((p) => p.value > 0).length
  const st = streak(section, longByDay)
  const hits = points.filter((p) => meetsTarget(section, p.value, 1)).length
  const goodDir = section.target?.dir === 'atMost' ? 'down' : 'up'

  const isAbstain = section.primitive === 'abstain'
  const showHours = ['duration', 'count', 'session'].includes(section.primitive)

  return (
    <>
      <header className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div>
          <button
            className="text-[12px] text-ink-3 hover:text-ink inline-flex items-center gap-1 mb-1"
            onClick={() => navigate('/stats')}
          >
            <Icon name="chevronLeft" size={14} /> Stats
          </button>
          <h1 className="text-[21px] font-semibold tracking-tight flex items-center gap-2.5">
            <span
              className="w-8 h-8 rounded-[10px] grid place-items-center"
              style={{ background: `color-mix(in oklab, ${tint} 16%, transparent)`, color: tint }}
            >
              <Icon name={section.icon} size={17} />
            </span>
            {section.name}
          </h1>
        </div>
        <Segmented options={RANGES} value={days} onChange={setDays} label="Date range" />
      </header>

      <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] mb-3.5">
        {isAbstain ? (
          <>
            <Stat label="Current streak" value={String(abst.current)} unit="days" />
            <Stat label="Longest" value={String(abst.longest)} unit="days" />
            <Stat label="Resets in range" value={String(abst.resets.filter((r) => keys.includes(r)).length)} />
            <Stat label="Target" value={String(section.target?.value ?? '—')} unit="days" />
          </>
        ) : (
          <>
            <Stat
              label="Total"
              value={fmtValue(section, ['scale', 'measure'].includes(section.primitive) ? total : total)}
              delta={deltaOf(total, prev, goodDir)}
            />
            <Stat
              label={['scale', 'measure'].includes(section.primitive) ? 'Days logged' : 'Per day'}
              value={
                ['scale', 'measure'].includes(section.primitive)
                  ? String(active_days)
                  : fmtValue(section, total / days)
              }
            />
            <Stat label="Target hit" value={`${hits} / ${days}`} unit="days" />
            <Stat label="Streak" value={String(st.current)} unit="days" delta={{ tone: 'flat', arrow: 'flat', text: `best ${st.longest}` }} />
          </>
        )}
      </div>

      <div className="grid gap-3.5">
        {isAbstain ? (
          <ChartCard
            title="Streak length over time"
            sub="Each bar is the streak as it stood that day. Red marks a logged reset."
          >
            {({ width, showTable }) => (
              <StreakChart
                width={width}
                showTable={showTable}
                keys={keys}
                resets={abst.resets}
                valueOf={(k) => abstainOn(abst, k, keys[0])}
                color={tint}
              />
            )}
          </ChartCard>
        ) : (
          <ChartCard
            title={`${section.name} over time`}
            sub={`Daily ${axisUnit(section)} with the 7-day mean and the daily target.`}
            legend={
              <Legend
                items={[
                  { name: 'Daily', color: tint },
                  { name: '7-day mean', color: tint, shape: 'line' },
                ]}
              />
            }
          >
            {({ width, showTable }) => (
              <Trend width={width} showTable={showTable} section={section} points={points} />
            )}
          </ChartCard>
        )}

        <div className="grid gap-3.5 md:grid-cols-2">
          {showHours && (
            <ChartCard title="When you do it" sub="Total by hour of day, across the range.">
              {({ width, showTable }) => (
                <Hours
                  width={width}
                  showTable={showTable}
                  counts={hourCounts}
                  color={tint}
                  format={(v) => (chartDivisor(section) === 60 ? `${fmtNumber(v)} h` : `${fmtNumber(v, 0)} ${section.unit}`)}
                />
              )}
            </ChartCard>
          )}

          <ChartCard title="Consistency" sub="Every day of the last 12 weeks." legend={<HeatScale />}>
            {({ showTable }) => (
              <Heatmap
                showTable={showTable}
                keys={lastNDays(84)}
                valueOf={(k) =>
                  isAbstain ? abstainOn(abst, k, addDays(today(), -84)) : longByDay[k]?.[section.id] ?? 0
                }
                metric={section.name}
                format={(v) => (isAbstain ? `${v} days` : fmtValue(section, v))}
                onPickDay={(k) => navigate(`/today/${k}`)}
              />
            )}
          </ChartCard>
        </div>

        {variantRows.length > 0 && (
          <ChartCard
            title={section.variantLabel ? section.variantLabel.replace(/\?$/, '') : 'By option'}
            sub="How the total splits across this section's own options."
          >
            {({ width, showTable }) => (
              <Ranked width={width} showTable={showTable} rows={variantRows} metric="Total" />
            )}
          </ChartCard>
        )}

        {records.length > 0 && (
          <Card title="Personal records" sub="Heaviest set logged for each exercise.">
            <ul>
              {records.slice(0, 10).map((rec) => (
                <li key={rec.exercise} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2 border-b border-line last:border-0">
                  <span className="text-[13px] font-medium truncate">{rec.exercise}</span>
                  <span className="text-[13px] font-semibold num">
                    {rec.weight} kg × {rec.reps}
                  </span>
                  <span className="text-[12px] text-ink-3 w-[62px] text-right">{fmtDay(rec.date, 'short')}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card title="Recent entries" sub={`${recent.length} in range`}>
          {recent.length ? (
            <ul>
              {recent.map((e) => {
                const vName = section.variants?.find((v) => v.id === e.meta?.variant)?.name
                const extras = []
                if (e.meta?.calories) extras.push(`${e.meta.calories} kcal`)
                if (e.meta?.trigger) extras.push(`trigger: ${e.meta.trigger}`)
                if (e.meta?.delayMin) extras.push(`${e.meta.delayMin} min late`)
                if (e.meta?.sets?.length) extras.push(`${e.meta.sets.length} sets`)
                const sub = [vName, e.note, ...extras].filter(Boolean).join(' · ')
                return (
                  <li key={e.id} className="grid grid-cols-[3px_1fr_auto_auto] items-center gap-3 py-2.5 border-b border-line last:border-0">
                    <span className="w-[3px] h-6 rounded-full" style={{ background: tint }} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{fmtDay(e.date)}</div>
                      {sub && <div className="text-[12px] text-ink-3 truncate">{sub}</div>}
                    </div>
                    <div className="text-[13px] font-semibold num">
                      {section.primitive === 'note' ? '' : fmtValue(section, e.value)}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[12px] text-ink-3 num w-[42px] text-right">{clockOf(e.at)}</span>
                      <IconButton name="trash" label="Delete entry" size={30} onClick={() => deleteEntry(e.id)} />
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty>Nothing logged for {section.name} in this range.</Empty>
          )}
        </Card>

        <Card title="Settings for this section">
          <div className="flex flex-wrap gap-2">
            <Button icon="edit" onClick={() => navigate(`/setup?edit=${section.id}`)}>Edit section</Button>
            <Button icon="calendar" onClick={() => navigate('/today')}>Log for today</Button>
          </div>
        </Card>
      </div>
    </>
  )
}
