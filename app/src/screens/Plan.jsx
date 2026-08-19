/* Plan — an Outlook-style day grid where intention and reality sit on the
 * same clock.
 *
 * The point of the screen is the comparison. A calendar showing only what
 * you meant to do is a wish list; a log showing only what happened gives
 * you no standard to judge it against. So both render on one timeline, in
 * the same columns, and a toggle decides which you look at.
 *
 * Planned blocks are drawn as dashed outlines — they have not happened
 * yet, and ink weight should say so. Actual blocks are filled.
 */

import { useMemo, useState } from 'react'
import { Card, Button, IconButton, Segmented, Empty, Field, inputClass, Sheet, slotVar } from '../components/ui'
import { useApp } from '../lib/store'
import {
  today as todayKey, addDays, fmtDay, relativeDay, localStamp,
  minutesFromBoundary, stampFromDayMinutes, boundary, MIN_PER_DAY,
} from '../lib/dates'
import { fmtMinutes } from '../lib/format'

const HOUR = 56 /* pixels per hour — thumb-friendly on a phone */

const VIEWS = [
  { value: 'both', label: 'Both' },
  { value: 'plan', label: 'Plan' },
  { value: 'actual', label: 'Actual' },
]

export default function Plan({ dayKey, navigate }) {
  const app = useApp()
  const { active, entries, plans, addPlan, deletePlan, startTimer, timers, settings } = app
  const key = dayKey || todayKey()
  const isToday = key === todayKey()

  const [view, setView] = useState('both')
  const [sheet, setSheet] = useState(null) /* { startMin } | { plan } */

  const dayPlans = useMemo(
    () => plans.filter((p) => p.date === key).sort((a, b) => a.startMin - b.startMin),
    [plans, key]
  )

  const dayActual = useMemo(() => {
    const out = []
    for (const e of entries) {
      if (e.date !== key || !e.at) continue
      const s = active.find((x) => x.id === e.sectionId)
      if (!s?.countsToDay) continue
      const startMin = minutesFromBoundary(e.at)
      out.push({
        id: e.id,
        section: s,
        startMin,
        minutes: Math.max(6, Math.min(e.value, MIN_PER_DAY - startMin)),
        variant: s.variants?.find((v) => v.id === e.meta?.variant)?.name ?? null,
      })
    }
    return out.sort((a, b) => a.startMin - b.startMin)
  }, [entries, key, active])

  const plannedTotal = dayPlans.reduce((a, p) => a + p.minutes, 0)
  const actualTotal = dayActual.reduce((a, b) => a + b.minutes, 0)

  /* how much of what you planned actually happened, per section */
  const adherence = useMemo(() => {
    const rows = new Map()
    for (const p of dayPlans) {
      const r = rows.get(p.sectionId) ?? { planned: 0, actual: 0 }
      r.planned += p.minutes
      rows.set(p.sectionId, r)
    }
    for (const a of dayActual) {
      const r = rows.get(a.section.id) ?? { planned: 0, actual: 0 }
      r.actual += a.minutes
      rows.set(a.section.id, r)
    }
    return [...rows.entries()]
      .map(([id, r]) => ({ section: active.find((s) => s.id === id), ...r }))
      .filter((r) => r.section)
      .sort((a, b) => b.planned - a.planned)
  }, [dayPlans, dayActual, active])

  const nowMin = isToday ? minutesFromBoundary(localStamp(new Date())) : null
  const clock = (min) => stampFromDayMinutes(key, min).slice(11, 16)

  return (
    <>
      <header className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-[11.5px] uppercase tracking-[.07em] text-ink-3 font-semibold">Plan</div>
          <h1 className="text-[21px] font-semibold tracking-tight">
            {relativeDay(key) ?? fmtDay(key, 'full')}
          </h1>
          <p className="text-[12px] text-ink-3 mt-1">
            {fmtMinutes(plannedTotal)} planned · {fmtMinutes(actualTotal)} logged
            {plannedTotal > 0 &&
              ` · ${Math.round((Math.min(actualTotal, plannedTotal) / plannedTotal) * 100)}% kept`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <IconButton
            name="chevronLeft"
            label="Previous day"
            tone="bordered"
            onClick={() => navigate(`/plan/${addDays(key, -1)}`)}
          />
          <IconButton
            name="chevronRight"
            label="Next day"
            tone="bordered"
            onClick={() => navigate(`/plan/${addDays(key, 1)}`)}
          />
          {!isToday && <Button size="sm" onClick={() => navigate('/plan')}>Today</Button>}
          <Segmented options={VIEWS} value={view} onChange={setView} label="What to show" />
          <Button
            size="sm"
            tone="primary"
            icon="plus"
            onClick={() => setSheet({ startMin: nowMin !== null ? Math.round(nowMin / 30) * 30 : 6 * 60 })}
          >
            Block
          </Button>
        </div>
      </header>

      {/* ── the grid ─────────────────────────────────────────────────── */}
      <Card className="mb-2 !p-0 overflow-hidden">
        <div className="relative overflow-y-auto" style={{ maxHeight: '70vh' }}>
          <div className="relative" style={{ height: 24 * HOUR }}>
            {Array.from({ length: 24 }, (_, i) => {
              const label = String((boundary() + i) % 24).padStart(2, '0')
              return (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-line"
                  style={{ top: i * HOUR, height: HOUR }}
                >
                  <span className="absolute -top-[7px] left-2 text-[10.5px] text-ink-3 num bg-surface px-1">
                    {label}:00
                  </span>
                  <button
                    aria-label={`Add a block at ${label}:00`}
                    className="absolute inset-y-0 right-0 left-[52px] hover:bg-surface-2 transition-colors"
                    onClick={() => setSheet({ startMin: i * 60 })}
                  />
                </div>
              )
            })}

            {/* the current moment */}
            {nowMin !== null && (
              <div
                className="absolute left-[46px] right-0 pointer-events-none z-20 flex items-center gap-1"
                style={{ top: (nowMin / 60) * HOUR }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--critical)' }} />
                <span className="flex-1 h-px" style={{ background: 'var(--critical)' }} />
              </div>
            )}

            {/* planned — dashed, left column */}
            {view !== 'actual' &&
              dayPlans.map((p) => {
                const s = active.find((x) => x.id === p.sectionId)
                if (!s) return null
                const tint = slotVar(s)
                return (
                  <button
                    key={p.id}
                    onClick={() => setSheet({ plan: p })}
                    className="absolute rounded-[9px] px-2 py-1 text-left overflow-hidden z-10"
                    style={{
                      top: (p.startMin / 60) * HOUR + 1,
                      height: Math.max(20, (p.minutes / 60) * HOUR - 2),
                      left: 52,
                      width: view === 'both' ? 'calc(50% - 56px)' : 'calc(100% - 60px)',
                      border: `1.5px dashed ${tint}`,
                      background: `color-mix(in oklab, ${tint} 8%, transparent)`,
                    }}
                  >
                    <span className="text-[11.5px] font-semibold truncate block" style={{ color: tint }}>
                      {p.title || s.name}
                    </span>
                    <span className="text-[10.5px] text-ink-3 num block">
                      {clock(p.startMin)} · {p.minutes}m
                    </span>
                  </button>
                )
              })}

            {/* actual — filled, right column */}
            {view !== 'plan' &&
              dayActual.map((a) => {
                const tint = slotVar(a.section)
                return (
                  <div
                    key={a.id}
                    className="absolute rounded-[9px] px-2 py-1 overflow-hidden z-10"
                    style={{
                      top: (a.startMin / 60) * HOUR + 1,
                      height: Math.max(20, (a.minutes / 60) * HOUR - 2),
                      left: view === 'both' ? '50%' : 52,
                      width: view === 'both' ? 'calc(50% - 8px)' : 'calc(100% - 60px)',
                      background: tint,
                    }}
                  >
                    <span className="text-[11.5px] font-semibold truncate block text-white">
                      {a.variant || a.section.name}
                    </span>
                    <span className="text-[10.5px] num block text-white/75">
                      {clock(a.startMin)} · {a.minutes}m
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      </Card>

      <p className="text-[11.5px] text-ink-3 mb-3.5">
        {view === 'both'
          ? 'Left column is what you planned, right is what you logged. Tap any hour to block out time.'
          : view === 'plan'
            ? 'Only your intentions. Tap any hour to add a block, or a block to start it.'
            : 'Only what actually happened, from your logged entries.'}
      </p>

      {/* ── kept vs missed ───────────────────────────────────────────── */}
      <Card title="Plan against actual" sub="Per section, for this day. The notch marks the plan.">
        {adherence.length ? (
          <div className="grid gap-3">
            {adherence.map((r) => {
              const tint = slotVar(r.section)
              const ratio = r.planned ? Math.min(1.25, r.actual / r.planned) : 0
              return (
                <div key={r.section.id}>
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-[12.5px] font-medium flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: tint }} />
                      {r.section.name}
                    </span>
                    <span className="text-[12px] text-ink-2 num">
                      {fmtMinutes(r.actual)} / {r.planned ? fmtMinutes(r.planned) : 'unplanned'}
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                      style={{ width: `${Math.min(100, (ratio * 100) / 1.25)}%`, background: tint }}
                    />
                    {r.planned > 0 && (
                      <div
                        className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-ink-3"
                        style={{ left: '80%' }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <Empty icon="calendar">
            Nothing planned or logged for this day. Tap an hour above to block out what you intend to do.
          </Empty>
        )}
      </Card>

      <PlanSheet
        state={sheet}
        sections={active.filter((s) => s.countsToDay)}
        onClose={() => setSheet(null)}
        onSave={(patch) => {
          addPlan({ ...patch, date: key })
          app.flash('Block added.')
        }}
        onDelete={(id) => {
          deletePlan(id)
          app.flash('Block removed.')
        }}
        onStart={(plan) => {
          startTimer(plan.sectionId, plan.variantId)
          app.flash('Timer started.')
          setSheet(null)
        }}
        running={timers}
        clock={clock}
        boundaryHour={settings.dayBoundaryHour}
      />
    </>
  )
}

/* ── add or open a block ──────────────────────────────────────────────── */

function PlanSheet({ state, sections, onClose, onSave, onDelete, onStart, clock, boundaryHour }) {
  const editing = state?.plan ?? null
  const [sectionId, setSectionId] = useState('')
  const [variantId, setVariantId] = useState('')
  const [title, setTitle] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [minutes, setMinutes] = useState(60)
  const [seen, setSeen] = useState(null)

  /* re-seed whenever a different slot or block is opened */
  const stamp = state ? editing?.id ?? `new:${state.startMin}` : null
  if (state && seen !== stamp) {
    setSeen(stamp)
    if (editing) {
      setSectionId(editing.sectionId)
      setVariantId(editing.variantId ?? '')
      setTitle(editing.title ?? '')
      setStartTime(clock(editing.startMin))
      setMinutes(editing.minutes)
    } else {
      setSectionId(sections[0]?.id ?? '')
      setVariantId('')
      setTitle('')
      setStartTime(clock(state.startMin))
      setMinutes(60)
    }
  }

  if (!state) return <Sheet open={false} onClose={onClose} title="" />

  const section = sections.find((s) => s.id === sectionId)

  /* a wall-clock time back into minutes-from-boundary */
  const toDayMin = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(Number)
    if (!Number.isFinite(h)) return 0
    return (((h - boundaryHour) + 24) % 24) * 60 + (m || 0)
  }

  const save = () => {
    if (!sectionId) return
    onSave({
      sectionId,
      variantId: variantId || null,
      title: title.trim(),
      startMin: toDayMin(startTime),
      minutes: Number(minutes),
    })
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={editing ? 'Planned block' : 'Block out time'}
      footer={
        editing ? (
          <>
            <Button tone="danger" icon="trash" onClick={() => { onDelete(editing.id); onClose() }}>
              Delete
            </Button>
            <Button tone="primary" icon="play" onClick={() => onStart(editing)}>Start now</Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button tone="primary" onClick={save} disabled={!sectionId}>Add block</Button>
          </>
        )
      }
    >
      {editing ? (
        <>
          <p className="text-[13px] text-ink-2">
            <strong className="text-ink">{editing.title || section?.name}</strong> at{' '}
            <span className="num">{clock(editing.startMin)}</span> for {editing.minutes} minutes.
          </p>
          <p className="text-[12px] text-ink-3">
            Starting it here begins a timer, so the actual block records itself against this plan.
          </p>
        </>
      ) : (
        <>
          <Field label="What">
            <select
              className={inputClass}
              value={sectionId}
              onChange={(e) => { setSectionId(e.target.value); setVariantId('') }}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>

          {section?.variants?.length > 0 && (
            <Field label={section.variantLabel || 'Which one'}>
              <select className={inputClass} value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                <option value="">Not specified</option>
                {section.variants.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Starts">
              <input
                type="time"
                className={inputClass}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </Field>
            <Field label="Minutes">
              <input
                type="number"
                min="5"
                step="5"
                className={inputClass}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Label" hint="Optional — what specifically, so the block still means something later.">
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ship the sync fix"
            />
          </Field>
        </>
      )}
    </Sheet>
  )
}
