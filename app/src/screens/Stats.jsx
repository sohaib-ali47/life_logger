/* Stats — the range filter scopes everything below it, so every number
   on the screen is always describing the same slice of time. */

import { useMemo, useState } from 'react'
import { Card, Stat, Segmented, Meter, slotVar } from '../components/ui'
import {
  ChartCard, Allocation, Composition, Ranked, Heatmap, HeatScale, Trend, Legend, Sparkline,
} from '../components/charts'
import { useApp } from '../lib/store'
import { lastNDays, addDays, MIN_PER_DAY } from '../lib/dates'
import {
  totalsByDay, rangeTotal, accountedMinutes, dailyScore, series,
  targetForDays, meetsTarget, attainment, deltaOf,
} from '../lib/stats'
import { fmtMinutes, fmtNumber, fmtValue } from '../lib/format'

const RANGES = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 365, label: '1y' },
]

export default function Stats({ navigate }) {
  const { active, entries, idx } = useApp()
  const [days, setDays] = useState(30)
  const [hidden, setHidden] = useState({})

  const keys = useMemo(() => lastNDays(days), [days])
  const prevKeys = useMemo(() => lastNDays(days, addDays(keys[0], -1)), [days, keys])

  const byDay = useMemo(() => totalsByDay(active, idx, keys), [active, idx, keys])
  const prevByDay = useMemo(() => totalsByDay(active, idx, prevKeys), [active, idx, prevKeys])

  const accounted = useMemo(
    () => keys.reduce((a, k) => a + accountedMinutes(active, byDay[k]), 0),
    [keys, active, byDay]
  )
  const prevAccounted = useMemo(
    () => prevKeys.reduce((a, k) => a + accountedMinutes(active, prevByDay[k]), 0),
    [prevKeys, active, prevByDay]
  )

  const scores = useMemo(
    () => keys.map((k) => dailyScore(active, byDay[k], entries, k).score),
    [keys, active, byDay, entries]
  )
  const prevScores = useMemo(
    () => prevKeys.map((k) => dailyScore(active, prevByDay[k], entries, k).score),
    [prevKeys, active, prevByDay, entries]
  )
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

  const get = (id) => active.find((s) => s.id === id)
  const total = (id) => {
    const s = get(id)
    return s ? rangeTotal(s, byDay, keys) : 0
  }
  const prevTotal = (id) => {
    const s = get(id)
    return s ? rangeTotal(s, prevByDay, prevKeys) : 0
  }

  const deep = total('study') + total('projects')
  const prevDeep = prevTotal('study') + prevTotal('projects')

  const stackable = active.filter((s) => s.countsToDay).sort((a, b) => a.slot - b.slot)
  const legendItems = [
    ...stackable.map((s) => ({ id: s.id, name: s.name, color: slotVar(s), off: !!hidden[s.id] })),
    { id: '__unlogged', name: 'Unaccounted', color: 'var(--s-none)', off: !!hidden.__unlogged },
  ]

  const parts = [
    ...stackable.map((s) => ({ name: s.name, value: rangeTotal(s, byDay, keys), color: slotVar(s) })),
    { name: 'Unaccounted', value: Math.max(0, days * MIN_PER_DAY - accounted), color: 'var(--s-none)' },
  ]

  const mood = get('mood')

  /* the heatmap always shows 12 weeks regardless of the range filter,
     computed once rather than per-cell */
  const heatKeys = useMemo(() => lastNDays(84), [])
  const heatBy = useMemo(() => totalsByDay(active, idx, heatKeys), [active, idx, heatKeys])

  return (
    <>
      <header className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-[11.5px] uppercase tracking-[.07em] text-ink-3 font-semibold">Stats</div>
          <h1 className="text-[21px] font-semibold tracking-tight">How you are spending your life</h1>
        </div>
        <Segmented options={RANGES} value={days} onChange={setDays} label="Date range" />
      </header>

      <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] mb-3.5">
        <Stat
          label="Average score"
          value={Math.round(mean(scores))}
          delta={deltaOf(mean(scores), mean(prevScores), 'up')}
        >
          <Sparkline values={scores} color="var(--accent)" />
        </Stat>
        <Stat
          label="Accounted for"
          value={`${Math.round((accounted / (days * MIN_PER_DAY)) * 100)}%`}
          delta={deltaOf(accounted, prevAccounted, 'up')}
        >
          <Sparkline values={keys.map((k) => accountedMinutes(active, byDay[k]) / 60)} color="var(--s1)" />
        </Stat>
        <Stat
          label="Deep work"
          value={fmtNumber(deep / 60)}
          unit="h"
          delta={deltaOf(deep, prevDeep, 'up')}
        >
          <Sparkline
            values={keys.map((k) => ((byDay[k]?.study ?? 0) + (byDay[k]?.projects ?? 0)) / 60)}
            color="var(--s3)"
          />
        </Stat>
        <Stat
          label="Screen time"
          value={fmtNumber(total('screen') / 60 / days)}
          unit="h/day"
          delta={deltaOf(total('screen'), prevTotal('screen'), 'down')}
        >
          <Sparkline values={keys.map((k) => (byDay[k]?.screen ?? 0) / 60)} color="var(--s7)" />
        </Stat>
      </div>

      <div className="grid gap-3.5">
        <ChartCard
          title="Daily allocation"
          sub={
            days > 45
              ? 'Average hours per day, bucketed by week. Tap a legend item to drop a section.'
              : 'Every day of the range, all 24 hours. Tap a bar to open that day.'
          }
          legend={<Legend items={legendItems} onToggle={(id) => setHidden((h) => ({ ...h, [id]: !h[id] }))} />}
          note={
            stackable.length > 8
              ? 'Sections past the eighth share a neutral band — the palette never invents a ninth hue.'
              : undefined
          }
        >
          {({ width, showTable }) => (
            <Allocation
              width={width}
              showTable={showTable}
              keys={keys}
              sections={active}
              byDay={byDay}
              hidden={hidden}
              onPickDay={(k) => navigate(`/today/${k}`)}
            />
          )}
        </ChartCard>

        <div className="grid gap-3.5 md:grid-cols-2">
          <ChartCard title="Where the time goes" sub="Total across the range, ranked.">
            {({ width, showTable }) => (
              <Ranked
                width={width}
                showTable={showTable}
                onPick={(id) => navigate(`/section/${id}`)}
                rows={stackable.map((s) => {
                  const v = rangeTotal(s, byDay, keys)
                  return {
                    id: s.id,
                    name: s.name,
                    value: v,
                    color: slotVar(s),
                    display: fmtMinutes(v),
                    sub: { name: 'per day', value: fmtMinutes(v / days) },
                  }
                })}
              />
            )}
          </ChartCard>

          <ChartCard
            title="Life composition"
            sub="The whole range as one bar, unaccounted time included."
            legend={<Legend items={parts.map((p) => ({ name: p.name, color: p.color }))} />}
          >
            {({ width, showTable }) => <Composition width={width} showTable={showTable} parts={parts} />}
          </ChartCard>
        </div>

        <Card title="Targets" sub="Actual against target for the whole range. The notch marks 100%.">
          <div className="grid gap-3.5">
            {active
              .filter((s) => s.target && s.primitive !== 'abstain')
              .map((s) => {
                const actual = rangeTotal(s, byDay, keys)
                const n = ['scale', 'measure'].includes(s.primitive) ? 1 : days
                return (
                  <Meter
                    key={s.id}
                    label={s.name}
                    tint={slotVar(s)}
                    over={s.target.dir === 'atMost'}
                    hit={meetsTarget(s, actual, n)}
                    ratio={Math.max(0, attainment(s, actual, n) ?? 0)}
                    valueText={`${fmtValue(s, actual)}  /  ${fmtValue(s, targetForDays(s, n))}`}
                  />
                )
              })}
          </div>
        </Card>

        <div className="grid gap-3.5 md:grid-cols-2">
          <ChartCard
            title="Consistency"
            sub="Hours accounted for, every day of the last 12 weeks. Tap a square to open that day."
            legend={<HeatScale />}
          >
            {({ showTable }) => (
              <Heatmap
                showTable={showTable}
                keys={heatKeys}
                valueOf={(k) => accountedMinutes(active, heatBy[k]) / 60}
                metric="Accounted"
                format={(v) => `${fmtNumber(v)} h`}
                onPickDay={(k) => navigate(`/today/${k}`)}
              />
            )}
          </ChartCard>

          {mood && (
            <ChartCard
              title="Mood"
              sub="Daily score with its 7-day mean."
              legend={
                <Legend
                  items={[
                    { name: 'Daily score', color: slotVar(mood) },
                    { name: '7-day mean', color: slotVar(mood), shape: 'line' },
                  ]}
                />
              }
            >
              {({ width, showTable }) => (
                <Trend width={width} showTable={showTable} section={mood} points={series(mood, byDay, keys)} height={150} />
              )}
            </ChartCard>
          )}
        </div>
      </div>
    </>
  )
}
