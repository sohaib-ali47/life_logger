/* Today — capture first, analysis second. Everything you do daily is
   reachable within one tap of opening the app. */

import { useEffect, useMemo, useState, useCallback } from 'react'
import Icon from '../components/Icon'
import { Card, Button, IconButton, Ring, Empty, Chip, slotVar } from '../components/ui'
import { ChartCard, Timeline, Composition, Legend } from '../components/charts'
import SectionTile from '../components/SectionTile'
import LogSheet from '../components/LogSheet'
import { VariantSheet, VariantManagerSheet, FollowUpSheet, SessionSheet } from '../components/sheets'
import NewTrackerSheet from '../components/NewTrackerSheet'
import { useApp } from '../lib/store'
import { PILLARS } from '../lib/primitives'
import * as notify from '../lib/notify'
import {
  today as todayKey, addDays, isFuture, fmtDay, relativeDay, localStamp,
  minutesFromBoundary, clockOf, MIN_PER_DAY, pad,
} from '../lib/dates'
import {
  totalsByDay, dailyScore, accountedMinutes, nudges as buildNudges,
  abstainState, streak, doneVariants,
} from '../lib/stats'
import { fmtMinutes, fmtNumber, fmtValue, fmtClock } from '../lib/format'

export default function Today({ dayKey, navigate }) {
  const app = useApp()
  const {
    active, entries, idx, settings, addEntry, deleteEntry, setEntryMeta,
    addVariant, removeVariant, addExercise, createSection, freeSlot, startTimer,
  } = app
  const key = dayKey || todayKey()
  const isToday = key === todayKey()

  const [logSheet, setLogSheet] = useState({ open: false, sectionId: null })
  const [variantSheet, setVariantSheet] = useState(null)   // { section, purpose, amount }
  const [manageSection, setManageSection] = useState(null)
  const [newTracker, setNewTracker] = useState(null)       // { preset } | null
  const [followUp, setFollowUp] = useState(null)           // { section, followUp, entryId, subtitle }
  const [sessionSheet, setSessionSheet] = useState(null)   // { section }
  const [dismissed, setDismissed] = useState(() => new Set())
  const [now, setNow] = useState(Date.now())

  /* one clock for the whole screen — the timer and the nudge rules both
     need "now", and two intervals would drift apart */
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const byDay = useMemo(() => totalsByDay(active, idx, [key]), [active, idx, key])
  const totals = byDay[key] || {}

  const dayEntries = useMemo(
    () => entries.filter((e) => e.date === key).sort((a, b) => ((a.at || '') < (b.at || '') ? -1 : 1)),
    [entries, key]
  )

  const doneBySection = useMemo(() => {
    const out = {}
    for (const s of active) {
      if (s.primitive !== 'checklist') continue
      out[s.id] = doneVariants(dayEntries.filter((e) => e.sectionId === s.id))
    }
    return out
  }, [active, dayEntries])

  const abstains = useMemo(() => {
    const out = {}
    for (const s of active) if (s.primitive === 'abstain') out[s.id] = abstainState(s, entries)
    return out
  }, [active, entries])

  const score = useMemo(() => dailyScore(active, totals, entries, key), [active, totals, entries, key])
  const accounted = accountedMinutes(active, totals)
  const noHistory = entries.length === 0

  const nudges = useMemo(
    () =>
      isToday
        ? buildNudges(active, totals, entries, new Date(now), key, {
            timer: settings.timer,
            dayEntries,
          }).filter((n) => !dismissed.has(n.id))
        : [],
    [active, totals, entries, now, key, isToday, settings.timer, dayEntries, dismissed]
  )

  /* mirror the important nudges to the OS, once each */
  useEffect(() => {
    for (const n of nudges) {
      if (!['break', 'item', 'due', 'over'].includes(n.kind)) continue
      if (notify.fire(n.id, n.text, n.detail || 'Life OS')) notify.buzz()
    }
  }, [nudges])

  const blocks = useMemo(() => {
    const out = []
    for (const e of dayEntries) {
      const s = active.find((x) => x.id === e.sectionId)
      if (!s || !s.countsToDay || !e.at) continue
      const startMin = minutesFromBoundary(e.at)
      const vName = s.variants?.find((v) => v.id === e.meta?.variant)?.name
      out.push({
        startMin,
        minutes: Math.max(4, Math.min(e.value, MIN_PER_DAY - startMin)),
        section: s,
        variant: vName,
        label: clockOf(e.at),
      })
    }
    return out.sort((a, b) => a.startMin - b.startMin)
  }, [dayEntries, active])

  const stackable = useMemo(
    () => active.filter((s) => s.countsToDay).sort((a, b) => a.slot - b.slot),
    [active]
  )
  const parts = [
    ...stackable.map((s) => ({ name: s.name, value: totals[s.id] || 0, color: slotVar(s) })),
    { name: 'Unaccounted', value: Math.max(0, MIN_PER_DAY - accounted), color: 'var(--s-none)' },
  ]

  const overallStreak = useMemo(() => {
    const anchor = active.find((s) => s.countsToDay && s.weight >= 3)
    if (!anchor) return { current: 0 }
    const keys = []
    let k = todayKey()
    for (let i = 0; i < 200; i++) { keys.unshift(k); k = addDays(k, -1) }
    return streak(anchor, totalsByDay(active, idx, keys))
  }, [active, idx])

  /* ── logging ──────────────────────────────────────────────────── */

  const commit = useCallback(
    (section, amount, meta = {}, note = '') => {
      const rec = addEntry({
        sectionId: section.id,
        date: key,
        value: amount,
        at: ['duration', 'count', 'session', 'checklist', 'note'].includes(section.primitive) && isToday
          ? localStamp()
          : null,
        meta,
        note,
      })
      if (section.followUp?.when === 'log' && amount > 0) {
        const vName = section.variants?.find((v) => v.id === meta.variant)?.name
        setFollowUp({
          section,
          followUp: section.followUp,
          entryId: rec.id,
          subtitle: `${vName || section.name} · ${fmtValue(section, amount)}`,
        })
      }
      return rec
    },
    [addEntry, key, isToday]
  )

  const quickLog = useCallback(
    (section, amount) => {
      /* a section with named variants asks which one before it records —
         "45 minutes" is not the same fact as "45 minutes of lunch" */
      if (section.variants?.length && ['duration', 'count'].includes(section.primitive)) {
        setVariantSheet({ section, purpose: 'log', amount })
        return
      }
      commit(section, amount)
    },
    [commit]
  )

  const toggleItem = useCallback(
    (section, variantId, done) => {
      if (done) {
        const hit = dayEntries.find((e) => e.sectionId === section.id && e.meta?.variant === variantId)
        if (hit) deleteEntry(hit.id)
        return
      }
      commit(section, 1, { variant: variantId })
    },
    [dayEntries, deleteEntry, commit]
  )

  const beginTimer = useCallback(
    (section) => {
      if (section.askOnStart && section.variants?.length) {
        setVariantSheet({ section, purpose: 'timer' })
        return
      }
      startTimer(section.id)
    },
    [startTimer]
  )

  return (
    <>
      {/* ── header ─────────────────────────────────────────────────── */}
      <header className="flex items-end justify-between gap-3 flex-wrap mb-4">
        <div>
          <div className="text-[11.5px] uppercase tracking-[.07em] text-ink-3 font-semibold">
            {relativeDay(key) || fmtDay(key, 'dow')}
          </div>
          <h1 className="text-[21px] font-semibold tracking-tight">{fmtDay(key, 'full')}</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <IconButton name="chevronLeft" label="Previous day" tone="bordered" onClick={() => navigate(`/today/${addDays(key, -1)}`)} />
          <IconButton
            name="chevronRight"
            label="Next day"
            tone="bordered"
            disabled={isFuture(addDays(key, 1))}
            onClick={() => navigate(`/today/${addDays(key, 1)}`)}
          />
          {!isToday && <Button size="sm" onClick={() => navigate('/today')}>Today</Button>}
          <Button size="sm" icon="plus" onClick={() => setNewTracker({})}>Tracker</Button>
          <Button
            size="sm"
            tone={app.isDayClosed(key) ? 'primary' : 'default'}
            icon={app.isDayClosed(key) ? 'check' : 'lock'}
            onClick={() => {
              const next = !app.isDayClosed(key)
              app.setDayClosed(key, next)
              app.flash(next ? 'Day closed — blanks now count as real zeros.' : 'Day reopened.')
            }}
          >
            {app.isDayClosed(key) ? 'Closed' : 'Close day'}
          </Button>
        </div>
      </header>

      {/* ── first run: a score of zero is a bad first impression, and two
             empty charts are worse. Say what to do instead. ─────────── */}
      {noHistory ? (
        <Card className="mb-3.5">
          <div className="flex gap-4 items-start">
            <span
              className="w-10 h-10 rounded-[13px] grid place-items-center shrink-0"
              style={{ background: 'color-mix(in oklab, var(--accent) 15%, transparent)', color: 'var(--accent)' }}
            >
              <Icon name="sparkle" size={19} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight">Nothing logged yet</h2>
              <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-[52ch]">
                Tap anything below to start — a glass of water, last night&apos;s sleep, a timer on whatever you are
                doing right now. The charts and the score appear as soon as there is something to draw.
              </p>
              <div className="flex flex-wrap gap-2 mt-3.5">
                <Button size="sm" icon="plus" onClick={() => setLogSheet({ open: true, sectionId: null })}>
                  Log something
                </Button>
                <Button size="sm" tone="ghost" icon="settings" onClick={() => navigate('/setup')}>
                  Add your own trackers
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : (
      <Card className="mb-3.5">
        <div className="flex items-center gap-5 flex-wrap">
          <Ring value={score.score / 100} size={92} stroke={7} tint="var(--accent)">
            <div className="text-center">
              <div className="text-[26px] font-semibold leading-none tracking-tight">{score.score}</div>
              <div className="text-[10px] text-ink-3 -mt-0.5">score</div>
            </div>
          </Ring>
          <div className="min-w-[180px] flex-1">
            <div className="text-[13px] text-ink-2 leading-snug">
              {score.score >= settings.scoreGoal
                ? 'Above your goal for the day.'
                : `${settings.scoreGoal - score.score} points under your goal of ${settings.scoreGoal}.`}
            </div>
            <div className="text-[12px] text-ink-3 mt-1.5">
              {fmtNumber(accounted / 60)}h of 24 accounted for · {Math.round((accounted / MIN_PER_DAY) * 100)}% ·{' '}
              {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}
            </div>
          </div>
          <div className="flex gap-5">
            <Figure label="Streak" value={String(overallStreak.current)} unit="days" />
            <Figure label="Unaccounted" value={fmtMinutes(MIN_PER_DAY - accounted)} />
          </div>
        </div>
      </Card>
      )}

      {/* ── nudges ─────────────────────────────────────────────────── */}
      {nudges.length > 0 && (
        <div className="grid gap-2 mb-3.5">
          {nudges.slice(0, 5).map((n) => (
            <NudgeCard
              key={n.id}
              nudge={n}
              section={active.find((x) => x.id === n.sectionId)}
              onDismiss={() => setDismissed((d) => new Set(d).add(n.id))}
              onTick={(section, variantId) => toggleItem(section, variantId, false)}
              onStart={(section, variantId) => startTimer(section.id, variantId)}
              onAnswer={(value) => setEntryMeta(n.entryId, { [n.followUp.field]: value })}
              onQuick={(section) => quickLog(section, section.quick?.[0]?.value ?? section.quick?.[0] ?? 1)}
            />
          ))}
        </div>
      )}

      {/* ── timer ──────────────────────────────────────────────────── */}
      <TimerCard now={now} onBegin={beginTimer} onFollowUp={setFollowUp} />

      {/* ── tiles by pillar ────────────────────────────────────────── */}
      {PILLARS.map((p) => {
        const items = active.filter((s) => s.pillar === p.id)
        if (!items.length) return null
        return (
          <div key={p.id}>
            <h2 className="text-[11.5px] uppercase tracking-[.07em] text-ink-3 font-semibold mt-6 mb-2.5">{p.name}</h2>
            <div className="grid gap-2.5 grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
              {items.map((s) => (
                <SectionTile
                  key={s.id}
                  section={s}
                  value={totals[s.id] || 0}
                  abstain={abstains[s.id]}
                  doneItems={doneBySection[s.id]}
                  onQuick={(v) => quickLog(s, v)}
                  onCustom={() => setLogSheet({ open: true, sectionId: s.id })}
                  onOpen={() => navigate(`/section/${s.id}`)}
                  onToggleItem={(variantId, done) => toggleItem(s, variantId, done)}
                  onSession={() => setSessionSheet({ section: s })}
                  onStartTimer={() => beginTimer(s)}
                  onManageOptions={() => setManageSection(s)}
                  onEvent={(text) => commit(s, 1, {}, text)}
                  onMiss={() =>
                    setFollowUp({
                      section: s,
                      followUp: s.followUp,
                      subtitle: `${s.name} — missed today`,
                      onSubmit: (v) => {
                        addEntry({ sectionId: s.id, date: key, value: 0, meta: { [s.followUp.field]: v } })
                        app.flash(`Logged — ${v} ${s.followUp.unit || ''} late.`)
                      },
                    })
                  }
                  onReset={() => {
                    const rec = addEntry({ sectionId: s.id, date: key, value: 1, at: localStamp(), note: 'reset' })
                    if (s.followUp?.when === 'reset') {
                      setFollowUp({
                        section: s,
                        followUp: s.followUp,
                        entryId: rec.id,
                        subtitle: 'Naming the trigger is what makes the pattern visible later.',
                      })
                    } else {
                      app.flash(`${s.name} streak reset.`)
                    }
                  }}
                />
              ))}
              <AddTile label={`Add to ${p.name}`} onClick={() => setNewTracker({ preset: { pillar: p.id } })} />
            </div>
          </div>
        )
      })}

      {/* ── day shape ──────────────────────────────────────────────── */}
      {!noHistory && (
      <>
      <h2 className="text-[11.5px] uppercase tracking-[.07em] text-ink-3 font-semibold mt-6 mb-2.5">
        The shape of the day
      </h2>
      <div className="grid gap-3.5">
        <ChartCard
          title="Timeline"
          sub={`Where the blocks landed, from ${pad(settings.dayBoundaryHour)}:00.`}
          legend={<Legend items={stackable.map((s) => ({ id: s.id, name: s.name, color: slotVar(s) }))} />}
        >
          {({ width, showTable }) =>
            blocks.length ? (
              <Timeline width={width} showTable={showTable} blocks={blocks} boundaryHour={settings.dayBoundaryHour} />
            ) : (
              <Empty icon="clock">Nothing with a start time yet. Quick-adds stamp the moment automatically.</Empty>
            )
          }
        </ChartCard>

        <ChartCard
          title="Composition"
          sub="Part-to-whole across all 24 hours, including what you never logged."
          legend={<Legend items={parts.map((p) => ({ name: p.name, color: p.color }))} />}
        >
          {({ width, showTable }) => <Composition width={width} showTable={showTable} parts={parts} />}
        </ChartCard>
      </div>
      </>
      )}

      {/* ── entries ────────────────────────────────────────────────── */}
      <h2 className="text-[11.5px] uppercase tracking-[.07em] text-ink-3 font-semibold mt-6 mb-2.5">Entries</h2>
      <Card
        title={dayEntries.length ? `${dayEntries.length} logged` : 'Nothing logged'}
        tools={<Button size="sm" icon="plus" onClick={() => setLogSheet({ open: true, sectionId: null })}>Add</Button>}
      >
        {dayEntries.length ? (
          <ul>
            {dayEntries.map((e) => {
              const s = active.find((x) => x.id === e.sectionId)
              if (!s) return null
              const vName = s.variants?.find((v) => v.id === e.meta?.variant)?.name
              const extras = []
              if (e.meta?.calories) extras.push(`${e.meta.calories} kcal`)
              if (e.meta?.trigger) extras.push(`trigger: ${e.meta.trigger}`)
              if (e.meta?.delayMin) extras.push(`${e.meta.delayMin} min late`)
              if (e.meta?.sets?.length) extras.push(`${e.meta.sets.length} sets`)
              const sub = [vName, e.note, ...extras].filter(Boolean).join(' · ')
              return (
                <li key={e.id} className="grid grid-cols-[3px_1fr_auto_auto] items-center gap-3 py-2.5 border-b border-line last:border-0">
                  <span className="w-[3px] h-6 rounded-full" style={{ background: slotVar(s) }} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate">{s.name}</div>
                    {sub && <div className="text-[12px] text-ink-3 truncate">{sub}</div>}
                  </div>
                  <div className="text-[13px] font-semibold num">
                    {s.primitive === 'note' ? '' : fmtValue(s, e.value)}
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
          <Empty>No entries for this day. Use the tiles above, or add one manually.</Empty>
        )}
      </Card>

      {/* ── sheets ─────────────────────────────────────────────────── */}
      <LogSheet
        open={logSheet.open}
        onClose={() => setLogSheet({ open: false, sectionId: null })}
        dayKey={key}
        presetSectionId={logSheet.sectionId}
      />

      <VariantSheet
        open={!!variantSheet}
        section={variantSheet?.section}
        verb={variantSheet?.purpose === 'timer' ? 'Start' : 'Log'}
        onAddVariant={addVariant}
        onClose={() => setVariantSheet(null)}
        onPick={(variantId) => {
          const v = variantSheet
          setVariantSheet(null)
          if (!v) return
          if (v.purpose === 'timer') startTimer(v.section.id, variantId)
          else commit(v.section, v.amount, variantId ? { variant: variantId } : {})
        }}
      />

      <FollowUpSheet
        open={!!followUp}
        section={followUp?.section}
        followUp={followUp?.followUp}
        subtitle={followUp?.subtitle}
        onClose={() => setFollowUp(null)}
        onSubmit={(value) => {
          const f = followUp
          setFollowUp(null)
          if (!f) return
          if (f.onSubmit) f.onSubmit(value)
          else if (f.entryId) setEntryMeta(f.entryId, { [f.followUp.field]: value })
        }}
      />

      <VariantManagerSheet
        open={!!manageSection}
        section={manageSection ? active.find((s) => s.id === manageSection.id) : null}
        onAdd={addVariant}
        onRemove={removeVariant}
        onClose={() => setManageSection(null)}
      />

      <NewTrackerSheet
        open={!!newTracker}
        preset={newTracker?.preset}
        slot={freeSlot()}
        onClose={() => setNewTracker(null)}
        onCreate={(patch) => {
          const s = createSection(patch)
          if (s) app.flash(`${s.name} added to Today.`)
        }}
      />

      <SessionSheet
        open={!!sessionSheet}
        section={sessionSheet ? active.find((s) => s.id === sessionSheet.section.id) : null}
        onAddExercise={(sectionId, name) => {
          addExercise(sectionId, name)
          app.flash(`${name} saved to your exercise list.`)
        }}
        onTrackSeparately={(name) => {
          setSessionSheet(null)
          setNewTracker({ preset: { name, kind: 'count', pillar: 'training' } })
        }}
        onClose={() => setSessionSheet(null)}
        onSave={({ minutes, variantId, sets, note }) => {
          const s = sessionSheet.section
          setSessionSheet(null)
          addEntry({
            sectionId: s.id,
            date: key,
            value: minutes,
            at: isToday ? localStamp() : null,
            meta: { variant: variantId, sets },
            note,
          })
          app.flash(`${s.name} — ${fmtMinutes(minutes)}, ${sets.length} ${sets.length === 1 ? 'set' : 'sets'} logged.`)
        }}
      />
    </>
  )
}

/* ── pieces ─────────────────────────────────────────────────────────── */

function AddTile({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="rounded-[18px] border border-dashed border-line text-ink-3 hover:text-ink hover:border-accent/50 hover:bg-surface transition-colors grid place-items-center gap-1.5 py-6 min-h-[128px]"
    >
      <span className="w-8 h-8 rounded-[10px] grid place-items-center bg-surface-2">
        <Icon name="plus" size={16} />
      </span>
      <span className="text-[12.5px] font-medium">{label}</span>
    </button>
  )
}

function Figure({ label, value, unit }) {
  return (
    <div>
      <div className="text-[11.5px] text-ink-3 font-medium">{label}</div>
      <div className="text-[19px] font-semibold tracking-tight leading-tight">
        {value}
        {unit && <span className="text-[12px] text-ink-3 font-medium ml-1">{unit}</span>}
      </div>
    </div>
  )
}

function NudgeCard({ nudge, section, onDismiss, onTick, onStart, onAnswer, onQuick }) {
  const [value, setValue] = useState('')
  const tint = section ? slotVar(section) : 'var(--warning)'
  const icon =
    nudge.kind === 'break' ? 'clock'
      : nudge.kind === 'over' ? 'target'
      : nudge.kind === 'followup' ? 'edit'
      : nudge.kind === 'evening' ? 'moon'
      : 'bell'

  return (
    <div
      className="flex items-center gap-3 bg-surface border border-line rounded-[14px] px-3.5 py-2.5 flex-wrap"
      style={{ borderLeftColor: tint, borderLeftWidth: 3 }}
    >
      <Icon name={icon} size={16} className="text-ink-3" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium truncate">{nudge.text}</div>
        {nudge.detail && <div className="text-[11.5px] text-ink-3 truncate">{nudge.detail}</div>}
      </div>

      {/* an unanswered question answers itself right here */}
      {nudge.kind === 'followup' && (
        <div className="flex gap-1.5 items-center">
          <input
            type={nudge.followUp.type === 'number' ? 'number' : 'text'}
            inputMode={nudge.followUp.type === 'number' ? 'decimal' : undefined}
            className="h-8 w-[92px] px-2.5 rounded-[9px] bg-surface-2 border border-line text-[12.5px] outline-none focus:border-accent"
            placeholder={nudge.followUp.unit || nudge.followUp.label}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || value === '') return
              onAnswer(nudge.followUp.type === 'number' ? Number(value) : value)
            }}
          />
          <Chip
            tint={tint}
            onClick={() => value !== '' && onAnswer(nudge.followUp.type === 'number' ? Number(value) : value)}
          >
            Save
          </Chip>
        </div>
      )}

      {nudge.action?.type === 'tick' && section && (
        <Chip tint={tint} onClick={() => onTick(section, nudge.variantId)}>Done</Chip>
      )}
      {nudge.action?.type === 'start' && section && (
        <Chip tint={tint} onClick={() => onStart(section, nudge.variantId)}>
          <span className="inline-flex items-center gap-1.5"><Icon name="play" size={12} /> Start</span>
        </Chip>
      )}
      {nudge.kind === 'due' && !nudge.action && section?.quick?.length > 0 && (
        <Chip tint={tint} onClick={() => onQuick(section)}>Log</Chip>
      )}

      <IconButton name="x" label="Dismiss" size={28} onClick={onDismiss} />
    </div>
  )
}

function TimerCard({ now, onBegin, onFollowUp }) {
  const { active, settings, stopTimer, flash } = useApp()
  const timer = settings.timer
  const timed = active.filter((s) => ['duration', 'session'].includes(s.primitive))

  if (timer) {
    const s = active.find((x) => x.id === timer.sectionId)
    const vName = s?.variants?.find((v) => v.id === timer.variantId)?.name
    const elapsed = now - new Date(timer.startedAt).getTime()
    const startedAt = clockOf(localStamp(new Date(timer.startedAt)))

    return (
      <Card title="Running" className="mb-3.5">
        <div className="flex items-center gap-3.5 flex-wrap">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: s ? slotVar(s) : 'var(--accent)' }} />
          <div className="text-[30px] font-semibold tracking-tight num">{fmtClock(elapsed)}</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[13px] text-ink-2">
              <Icon name={s?.icon || 'clock'} size={16} />
              {vName ? `${s?.name} · ${vName}` : s?.name}
            </div>
            <div className="text-[11.5px] text-ink-3">started {startedAt}</div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              tone="primary"
              icon="stop"
              onClick={() => {
                const r = stopTimer()
                if (!r) return
                flash(`${s?.name} — ${fmtMinutes(r.minutes)} logged.`)
                if (s?.followUp?.when === 'log') {
                  onFollowUp({
                    section: s,
                    followUp: s.followUp,
                    entryId: r.rec.id,
                    subtitle: `${vName || s.name} · ${fmtMinutes(r.minutes)}`,
                  })
                }
              }}
            >
              Stop &amp; log
            </Button>
            <Button tone="ghost" onClick={() => stopTimer(true)}>Discard</Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Timer" sub="Start one and it logs itself — with the exact moment it began — when you stop." className="mb-3.5">
      <div className="flex flex-wrap gap-1.5">
        {timed.map((s) => (
          <Chip key={s.id} tint={slotVar(s)} onClick={() => onBegin(s)}>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="play" size={12} />
              {s.name}
            </span>
          </Chip>
        ))}
      </div>
    </Card>
  )
}
