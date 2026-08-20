/* Review — the screen that turns a log into a decision.
   This week against last, pro-rated to the days elapsed, plus the
   rule-based findings and every note you wrote. */

import { useMemo } from 'react'
import Icon from '../components/Icon'
import { Card, Meter, Empty, Stat, Dot, slotVar } from '../components/ui'
import { useApp } from '../lib/store'
import { weekStart, addDays, range, today, fmtDay, lastNDays } from '../lib/dates'
import {
  totalsByDay, rangeTotal, targetForDays, meetsTarget, attainment,
  dailyScore, insights as buildInsights, deltaOf,
} from '../lib/stats'
import { fmtValue } from '../lib/format'
import Achievements from '../components/Achievements'

export default function Review({ navigate }) {
  const { active, entries, idx } = useApp()

  const ws = weekStart(today())
  const thisKeys = useMemo(() => range(ws, today()), [ws])
  const lastKeys = useMemo(() => range(addDays(ws, -7), addDays(ws, -1)), [ws])
  const longKeys = useMemo(() => lastNDays(90), [])

  const thisBy = useMemo(() => totalsByDay(active, idx, thisKeys), [active, idx, thisKeys])
  const lastBy = useMemo(() => totalsByDay(active, idx, lastKeys), [active, idx, lastKeys])
  const longBy = useMemo(() => totalsByDay(active, idx, longKeys), [active, idx, longKeys])

  const n = thisKeys.length

  const rows = useMemo(
    () =>
      active
        .filter((s) => s.target && s.primitive !== 'abstain')
        .map((s) => {
          const perDay = ['scale', 'measure'].includes(s.primitive) ? 1 : n
          const cur = rangeTotal(s, thisBy, thisKeys)
          const prev = rangeTotal(s, lastBy, lastKeys)
          return {
            section: s,
            cur,
            prev,
            target: targetForDays(s, perDay),
            perDay,
            hit: meetsTarget(s, cur, perDay),
            ratio: Math.max(0, attainment(s, cur, perDay) ?? 0),
            delta: deltaOf(cur, prev, s.target.dir === 'atMost' ? 'down' : 'up'),
          }
        }),
    [active, thisBy, lastBy, thisKeys, lastKeys, n]
  )

  const scoreThis = useMemo(
    () => thisKeys.map((k) => dailyScore(active, thisBy[k], entries, k).score),
    [thisKeys, active, thisBy, entries]
  )
  const scoreLast = useMemo(
    () => lastKeys.map((k) => dailyScore(active, lastBy[k], entries, k).score),
    [lastKeys, active, lastBy, entries]
  )
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

  const findings = useMemo(
    () => buildInsights(active, longBy, longKeys, entries),
    [active, longBy, longKeys, entries]
  )

  const notes = useMemo(() => {
    const out = []
    for (const k of thisKeys) {
      for (const e of entries) {
        if (e.date === k && e.note) out.push({ key: k, entry: e })
      }
    }
    return out.reverse()
  }, [entries, thisKeys])

  const wins = rows.filter((r) => r.hit)
  const behind = rows.filter((r) => !r.hit)

  return (
    <>
      <header className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-[11.5px] uppercase tracking-[.07em] text-ink-3 font-semibold">Review</div>
          <h1 className="text-[21px] font-semibold tracking-tight">Week of {fmtDay(ws, 'short')}</h1>
        </div>
        <span className="text-[12.5px] text-ink-3">{n} of 7 days elapsed</span>
      </header>

      <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] mb-3.5">
        <Stat label="Average score" value={Math.round(mean(scoreThis))} delta={deltaOf(mean(scoreThis), mean(scoreLast), 'up')} />
        <Stat label="On target" value={`${wins.length} / ${rows.length}`} />
        <Stat label="Behind" value={String(behind.length)} />
        <Stat label="Notes written" value={String(notes.length)} />
      </div>

      <Achievements />

      {/* ── findings ───────────────────────────────────────────────── */}
      <Card
        title="What the numbers say"
        sub="Rule-based findings over the last 90 days. Association, never cause."
        className="mb-3.5"
      >
        {findings.length ? (
          <ul className="grid gap-2.5">
            {findings.map((f) => (
              <li key={f.id} className="flex gap-3 items-start">
                <span
                  className="w-6 h-6 rounded-[8px] grid place-items-center shrink-0 mt-0.5"
                  style={{
                    background:
                      f.tone === 'good'
                        ? 'color-mix(in oklab, var(--good) 16%, transparent)'
                        : f.tone === 'warn'
                          ? 'color-mix(in oklab, var(--warning) 18%, transparent)'
                          : 'var(--surface-2)',
                    color: f.tone === 'good' ? 'var(--good-text)' : f.tone === 'warn' ? 'var(--warning)' : 'var(--ink-3)',
                  }}
                >
                  <Icon name={f.tone === 'good' ? 'sparkle' : f.tone === 'warn' ? 'target' : 'compass'} size={14} />
                </span>
                <div>
                  <div className="text-[13.5px] leading-snug">{f.text}</div>
                  {f.detail && <div className="text-[11.5px] text-ink-3 mt-0.5">{f.detail}</div>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="compass">
            Not enough history yet. Findings need at least eight paired days before they mean anything.
          </Empty>
        )}
      </Card>

      {/* ── week vs week ───────────────────────────────────────────── */}
      <Card
        title="This week against last"
        sub="Targets are pro-rated to the days elapsed, so a Tuesday review is not comparing two days against seven."
        className="mb-3.5"
      >
        <div className="overflow-x-auto border border-line rounded-[12px]">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {['Section', 'This week', 'Last week', 'Target', 'Change'].map((h, i) => (
                  <th
                    key={h}
                    scope="col"
                    className={`sticky top-0 bg-surface-2 text-ink-2 font-semibold px-2.5 py-2 whitespace-nowrap ${i === 0 ? 'text-left' : 'text-right'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.section.id} className="border-t border-line">
                  <th scope="row" className="px-2.5 py-1.5 text-left font-normal">
                    <button
                      className="inline-flex items-center gap-2 hover:underline"
                      onClick={() => navigate(`/section/${r.section.id}`)}
                    >
                      <Dot tint={slotVar(r.section)} size={9} />
                      {r.section.name}
                    </button>
                  </th>
                  <td className="px-2.5 py-1.5 text-right num">{fmtValue(r.section, r.cur)}</td>
                  <td className="px-2.5 py-1.5 text-right num text-ink-3">{fmtValue(r.section, r.prev)}</td>
                  <td className="px-2.5 py-1.5 text-right num text-ink-3">{fmtValue(r.section, r.target)}</td>
                  <td className="px-2.5 py-1.5 text-right num">
                    <span
                      className={
                        r.delta.tone === 'good' ? 'text-good-text' : r.delta.tone === 'bad' ? 'text-critical' : 'text-ink-3'
                      }
                    >
                      {r.delta.text}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-3.5 md:grid-cols-2 mb-3.5">
        <Card title="On target" sub={`${wins.length} of ${rows.length}`}>
          {wins.length ? (
            <div className="grid gap-3.5">
              {wins.map((r) => (
                <Meter
                  key={r.section.id}
                  label={r.section.name}
                  tint={slotVar(r.section)}
                  ratio={r.ratio}
                  over={r.section.target.dir === 'atMost'}
                  hit={r.hit}
                  valueText={`${fmtValue(r.section, r.cur)}  /  ${fmtValue(r.section, r.target)}`}
                />
              ))}
            </div>
          ) : (
            <Empty icon="target">Nothing on target yet this week.</Empty>
          )}
        </Card>

        <Card title="Behind" sub={`${behind.length} of ${rows.length}`}>
          {behind.length ? (
            <div className="grid gap-3.5">
              {behind.map((r) => (
                <Meter
                  key={r.section.id}
                  label={r.section.name}
                  tint={slotVar(r.section)}
                  ratio={r.ratio}
                  over={r.section.target.dir === 'atMost'}
                  hit={r.hit}
                  valueText={`${fmtValue(r.section, r.cur)}  /  ${fmtValue(r.section, r.target)}`}
                />
              ))}
            </div>
          ) : (
            <Empty icon="sparkle">Everything on target. Rare.</Empty>
          )}
        </Card>
      </div>

      <Card title="Notes this week" sub={`${notes.length} entries carried a note`}>
        {notes.length ? (
          <ul>
            {notes.map(({ key, entry }) => {
              const s = active.find((x) => x.id === entry.sectionId)
              if (!s) return null
              return (
                <li key={entry.id} className="grid grid-cols-[3px_1fr_auto] items-center gap-3 py-2.5 border-b border-line last:border-0">
                  <span className="w-[3px] h-6 rounded-full" style={{ background: slotVar(s) }} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{entry.note}</div>
                    <div className="text-[12px] text-ink-3">
                      {s.name} · {fmtValue(s, entry.value)}
                    </div>
                  </div>
                  <span className="text-[12px] text-ink-3">{fmtDay(key, 'short')}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <Empty icon="edit">
            No notes yet. A note is what makes a number worth reading back in six months.
          </Empty>
        )}
      </Card>
    </>
  )
}
