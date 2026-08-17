/* One tile per section. The control is decided by the primitive, which
   is why adding a section never needs new UI code. */

import { useState } from 'react'
import Icon from './Icon'
import { Chip, Ring, IconButton, Button, slotVar } from './ui'
import { splitValue, fmtQuick, quickHint, quickValue, fmtValue } from '../lib/format'
import { dailyTarget, attainment, meetsTarget } from '../lib/stats'

export default function SectionTile({
  section, value, abstain, doneItems, onQuick, onCustom, onOpen, onReset,
  onToggleItem, onSession, onEvent, onMiss, onStartTimer, onManageOptions,
}) {
  const hasOptions = ['checklist', 'duration', 'count', 'session', 'note'].includes(section.primitive)
  const tint = slotVar(section)
  const target = dailyTarget(section)
  const over = section.target?.dir === 'atMost'
  const hit = section.primitive === 'abstain' ? true : meetsTarget(section, value, 1)
  const ratio =
    section.primitive === 'abstain'
      ? Math.min(1, (abstain?.current ?? 0) / (section.target?.value || 30))
      : Math.max(0, attainment(section, value, 1) ?? 0)

  const shown = section.primitive === 'abstain' ? abstain?.current ?? 0 : value
  const { text, unit } = splitValue(section, shown)

  const meta =
    section.primitive === 'abstain'
      ? `best ${abstain?.longest ?? 0} days`
      : section.target
        ? `${over ? 'cap' : 'target'} ${fmtValue(section, target)}${section.target.period === 'week' ? '/day' : ''}`
        : section.primitive === 'note'
          ? 'anything worth recording'
          : 'no target'

  return (
    <div
      className="bg-surface border rounded-[18px] p-3.5 grid gap-3 transition-colors"
      style={{
        '--tint': tint,
        borderColor: hit && !over && section.target ? `color-mix(in oklab, ${tint} 42%, var(--line))` : 'var(--line)',
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="w-8 h-8 rounded-[10px] grid place-items-center shrink-0"
          style={{ background: `color-mix(in oklab, ${tint} 16%, transparent)`, color: tint }}
        >
          <Icon name={section.icon} size={16} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold tracking-tight truncate">{section.name}</div>
          <div className="text-[11.5px] text-ink-3 truncate">{meta}</div>
        </div>
        <div className="ml-auto flex items-center">
          {hasOptions && onManageOptions && (
            <IconButton
              name="grid"
              label={`Manage ${section.name} options`}
              size={30}
              onClick={onManageOptions}
            />
          )}
          <IconButton name="external" label={`Open ${section.name}`} size={30} onClick={onOpen} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-baseline gap-1">
          <span className="text-[23px] font-semibold tracking-tight leading-none">{text}</span>
          {unit && <span className="text-[12px] text-ink-3">{unit}</span>}
        </div>
        <div className="ml-auto">
          <Ring value={ratio} size={40} tint={tint} />
        </div>
      </div>

      <Control
        section={section}
        value={value}
        abstain={abstain}
        doneItems={doneItems}
        tint={tint}
        onQuick={onQuick}
        onCustom={onCustom}
        onReset={onReset}
        onToggleItem={onToggleItem}
        onSession={onSession}
        onEvent={onEvent}
        onMiss={onMiss}
        onStartTimer={onStartTimer}
        onManageOptions={onManageOptions}
      />
    </div>
  )
}

function Control({
  section, value, abstain, doneItems, tint,
  onQuick, onCustom, onReset, onToggleItem, onSession, onEvent, onMiss, onStartTimer, onManageOptions,
}) {
  const [eventText, setEventText] = useState('')

  switch (section.primitive) {
    /* ── a fixed set of items, each ticked off ────────────────────── */
    case 'checklist':
      return (
        <div className="flex flex-wrap gap-1.5">
          {(section.variants || []).map((v) => {
            const done = doneItems?.has(v.id)
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={!!done}
                onClick={() => onToggleItem(v.id, !!done)}
                className="h-8 px-2.5 rounded-[9px] text-[12.5px] font-medium inline-flex items-center gap-1.5 transition-colors"
                style={
                  done
                    ? { background: tint, color: '#fff' }
                    : { background: 'var(--surface-2)', color: 'var(--ink-2)' }
                }
              >
                <Icon name={done ? 'check' : 'plus'} size={12} />
                {v.name}
              </button>
            )
          })}
          {onManageOptions && (
            <button
              type="button"
              onClick={onManageOptions}
              aria-label={`Add an item to ${section.name}`}
              className="h-8 px-2 rounded-[9px] text-[12.5px] bg-surface-2 text-ink-3 hover:text-ink transition-colors"
            >
              <Icon name="plus" size={13} />
            </button>
          )}
        </div>
      )

    /* ── a workout: duration plus the sets ────────────────────────── */
    case 'session':
      return (
        <div className="flex flex-wrap gap-1.5">
          <Chip tint={tint} onClick={onSession}>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="plus" size={12} /> Log session
            </span>
          </Chip>
          <Chip tint={tint} onClick={onStartTimer}>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="play" size={12} /> Timer
            </span>
          </Chip>
        </div>
      )

    /* ── anything worth recording, in words ───────────────────────── */
    case 'note':
      return (
        <div className="flex gap-1.5">
          <input
            className="h-8 px-2.5 rounded-[9px] bg-surface-2 border border-line text-[12.5px] w-full outline-none focus:border-accent"
            value={eventText}
            onChange={(e) => setEventText(e.target.value)}
            placeholder="What happened?"
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !eventText.trim()) return
              onEvent(eventText.trim())
              setEventText('')
            }}
          />
          <Chip
            tint={tint}
            aria-label="Add event"
            onClick={() => {
              if (!eventText.trim()) return
              onEvent(eventText.trim())
              setEventText('')
            }}
          >
            <Icon name="plus" size={13} />
          </Chip>
        </div>
      )

    case 'scale':
      return (
        <div className="flex gap-[3px]">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={value === n}
              aria-label={`${section.name} ${n} out of 10`}
              onClick={() => onQuick(n)}
              className="flex-1 h-7 rounded-[6px] text-[10.5px] grid place-items-center transition-colors"
              style={
                value === n
                  ? { background: tint, color: '#fff', fontWeight: 600 }
                  : { background: 'var(--surface-2)', color: 'var(--ink-3)' }
              }
            >
              {n}
            </button>
          ))}
        </div>
      )

    /* ── done / missed, with "how late" when it matters ───────────── */
    case 'check':
      return (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onQuick(value ? 0 : 1)}
            aria-pressed={!!value}
            className="flex-1 h-9 rounded-[10px] text-[13px] font-medium inline-flex items-center justify-center gap-2 transition-colors"
            style={value ? { background: tint, color: '#fff' } : { background: 'var(--surface-2)', color: 'var(--ink-2)' }}
          >
            <Icon name={value ? 'check' : 'plus'} size={15} />
            {value ? 'Done today' : 'Mark done'}
          </button>
          {section.followUp?.when === 'miss' && !value && (
            <Chip tint={tint} onClick={onMiss}>Missed</Chip>
          )}
        </div>
      )

    case 'abstain':
      return (
        <div className="flex items-center gap-2">
          <div className="text-[11.5px] text-ink-3 flex-1 truncate">
            {abstain?.lastReset ? `last reset ${abstain.lastReset}` : 'no reset recorded'}
          </div>
          <Chip onClick={onReset} tint={tint}>Log reset</Chip>
        </div>
      )

    case 'measure':
      return (
        <input
          type="number"
          step="0.1"
          inputMode="decimal"
          defaultValue={value || ''}
          placeholder={`Today's ${section.unit || 'value'}`}
          aria-label={`${section.name} value`}
          className="h-8 px-2.5 rounded-[9px] bg-surface-2 border border-line text-[13px] w-full outline-none focus:border-accent"
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            const v = Number(e.currentTarget.value)
            if (v > 0) { onQuick(v); e.currentTarget.blur() }
          }}
          onBlur={(e) => {
            const v = Number(e.currentTarget.value)
            if (v > 0 && v !== value) onQuick(v)
          }}
        />
      )

    /* ── duration and count: named presets, then the escape hatch ─── */
    default: {
      const timed = ['duration', 'session'].includes(section.primitive)
      return (
        <div className="flex flex-wrap gap-1.5">
          {timed && (
            <Chip tint={tint} onClick={onStartTimer}>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="play" size={12} /> Timer
              </span>
            </Chip>
          )}
          {(section.quick || []).map((q, i) => {
            const hint = quickHint(section, q)
            return (
              <Chip
                key={`${quickValue(q)}-${i}`}
                tint={tint}
                title={hint || undefined}
                onClick={() => onQuick(quickValue(q))}
              >
                {fmtQuick(section, q)}
              </Chip>
            )
          })}
          <Chip tint={tint} onClick={onCustom} aria-label="Custom amount">
            <Icon name="plus" size={13} />
          </Chip>
        </div>
      )
    }
  }
}
