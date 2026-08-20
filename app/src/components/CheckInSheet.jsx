/* "What were you doing?" — the retroactive check-in.
 *
 * Three answers cover almost every case, in the order you are most likely
 * to need them: still on the last thing, stopped at a particular time, or
 * it was something else entirely. Anything logged here is stamped with the
 * real clock time of the gap, not of the moment you answered, so the
 * timeline stays honest.
 */

import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { Sheet, Button, Field, inputClass, slotVar } from './ui'
import { fmtMinutes } from '../lib/format'
import { stampFromDayMinutes, minutesFromBoundary, pad } from '../lib/dates'

export default function CheckInSheet({ open, gap, sections, dayKey, onLog, onClose, onSkip }) {
  const [stoppedAt, setStoppedAt] = useState('')
  const [picking, setPicking] = useState(false)

  const startStamp = useMemo(
    () => (gap ? stampFromDayMinutes(dayKey, gap.startMin) : null),
    [gap, dayKey]
  )
  const endStamp = useMemo(
    () => (gap ? stampFromDayMinutes(dayKey, gap.endMin) : null),
    [gap, dayKey]
  )

  useEffect(() => {
    if (!open) return
    setPicking(false)
    setStoppedAt(endStamp ? endStamp.slice(11, 16) : '')
  }, [open, endStamp])

  if (!gap) return null

  const startClock = startStamp.slice(11, 16)
  const endClock = endStamp.slice(11, 16)
  const timed = sections.filter((s) => s.countsToDay)
  const sleep = sections.find((s) => s.id === 'sleep')
  /* A gap that begins at or near the day boundary is almost always the
     night. Demanding an explanation for the hours you were unconscious is
     the fastest way to make someone stop answering these. */
  const looksLikeNight = gap.startMin <= 60 && sleep
  const lastSection = gap.last?.section ?? null

  /* minutes from the gap start to whatever "stopped" time was typed */
  const stoppedMinutes = () => {
    if (!stoppedAt) return gap.minutes
    const [h, m] = stoppedAt.split(':').map(Number)
    if (!Number.isFinite(h)) return gap.minutes
    const target = minutesFromBoundary(`${dayKey}T${pad(h)}:${pad(m)}:00`)
    return Math.max(1, Math.min(gap.minutes, target - gap.startMin))
  }

  const log = (section, minutes) => {
    onLog({
      section,
      minutes,
      at: startStamp,
      /* carry the variant forward — "still on Life OS" means the same
         project, not just the same section */
      meta: section.id === lastSection?.id && gap.last?.entry?.meta?.variant
        ? { variant: gap.last.entry.meta.variant }
        : {},
    })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="What were you doing?"
      footer={<Button tone="ghost" onClick={onSkip}>Skip this hour</Button>}
    >
      <div
        className="rounded-[12px] px-3.5 py-3 text-[12.5px] leading-relaxed"
        style={{ background: 'var(--surface-2)', color: 'var(--ink-2)' }}
      >
        <strong className="text-ink num">{startClock} → {endClock}</strong>{' '}
        is unaccounted — {fmtMinutes(gap.minutes)}.
        {gap.capped && ' Only the last six hours are offered; earlier than that, add it by hand.'}
      </div>

      {/* the night, offered first when the gap starts at the boundary */}
      {looksLikeNight && !picking && (
        <button
          onClick={() => log(sleep, gap.minutes)}
          className="flex items-center gap-3 p-3.5 rounded-[13px] border text-left transition-colors hover:bg-surface-3"
          style={{ borderColor: slotVar(sleep), background: `color-mix(in oklab, ${slotVar(sleep)} 10%, transparent)` }}
        >
          <span
            className="w-9 h-9 rounded-[11px] grid place-items-center shrink-0"
            style={{ background: `color-mix(in oklab, ${slotVar(sleep)} 20%, transparent)`, color: slotVar(sleep) }}
          >
            <Icon name="moon" size={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-medium">I was asleep</span>
            <span className="block text-[12px] text-ink-3 mt-0.5">
              Logs {fmtMinutes(gap.minutes)} of sleep from {startClock}
            </span>
          </span>
          <Icon name="chevronRight" size={16} className="ml-auto text-ink-3" />
        </button>
      )}

      {/* still on the last thing */}
      {lastSection && !picking && (
        <button
          onClick={() => log(lastSection, gap.minutes)}
          className="flex items-center gap-3 p-3.5 rounded-[13px] border text-left transition-colors hover:bg-surface-3"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}
        >
          <span
            className="w-9 h-9 rounded-[11px] grid place-items-center shrink-0"
            style={{ background: `color-mix(in oklab, ${slotVar(lastSection)} 18%, transparent)`, color: slotVar(lastSection) }}
          >
            <Icon name={lastSection.icon} size={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-[14px] font-medium">Still on {lastSection.name}</span>
            <span className="block text-[12px] text-ink-3 mt-0.5">
              Adds {fmtMinutes(gap.minutes)} from {startClock}
            </span>
          </span>
          <Icon name="chevronRight" size={16} className="ml-auto text-ink-3" />
        </button>
      )}

      {/* stopped earlier */}
      {lastSection && !picking && (
        <div className="grid gap-2.5 p-3.5 rounded-[13px] border border-line">
          <Field label={`Stopped ${lastSection.name} earlier?`} hint="Logs up to that time and leaves the rest open.">
            <div className="flex gap-2">
              <input
                type="time"
                className={inputClass}
                value={stoppedAt}
                onChange={(e) => setStoppedAt(e.target.value)}
              />
              <Button tone="primary" onClick={() => log(lastSection, stoppedMinutes())}>
                Log {fmtMinutes(stoppedMinutes())}
              </Button>
            </div>
          </Field>
        </div>
      )}

      {/* something else */}
      {!picking ? (
        <Button icon="grid" onClick={() => setPicking(true)}>
          It was something else
        </Button>
      ) : (
        <div className="grid gap-2">
          <p className="text-[12.5px] text-ink-2">
            Attribute {fmtMinutes(gap.minutes)} from {startClock} to:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {timed.map((s) => (
              <button
                key={s.id}
                onClick={() => log(s, gap.minutes)}
                className="flex items-center gap-2.5 px-3 h-11 rounded-[12px] border border-line text-left hover:bg-surface-3 transition-colors"
              >
                <span style={{ color: slotVar(s) }}><Icon name={s.icon} size={15} /></span>
                <span className="text-[13px] font-medium truncate">{s.name}</span>
              </button>
            ))}
          </div>
          <Button tone="ghost" icon="chevronLeft" onClick={() => setPicking(false)}>Back</Button>
        </div>
      )}
    </Sheet>
  )
}
