/* New tracker — the fast path.
 *
 * Adding "Hammer curls" should take a name, a tap and a save, not a trip
 * through a settings screen. Everything else is pre-filled from the kind
 * you picked and tucked behind "More options".
 */

import { useEffect, useState } from 'react'
import Icon, { ICON_NAMES } from './Icon'
import { Sheet, Field, Button, inputClass, slotVar } from './ui'
import { PILLARS } from '../lib/primitives'

const KINDS = [
  {
    id: 'count', name: 'Count', icon: 'flame',
    blurb: 'How many. Reps, glasses, pages.',
    defaults: { unit: 'reps', icon: 'flame', target: { period: 'day', value: 50, dir: 'atLeast' }, quick: [{ value: 10 }, { value: 15 }, { value: 20 }] },
  },
  {
    id: 'duration', name: 'Time', icon: 'clock',
    blurb: 'How long you spent on it.',
    defaults: { icon: 'clock', countsToDay: true, target: { period: 'day', value: 30, dir: 'atLeast' }, quick: [{ label: '15m', value: 15 }, { label: '30m', value: 30 }, { label: '1h', value: 60 }] },
  },
  {
    id: 'check', name: 'Yes / no', icon: 'check',
    blurb: 'Did it today, or did not.',
    defaults: { icon: 'check', target: { period: 'day', value: 1, dir: 'atLeast' } },
  },
  {
    id: 'checklist', name: 'Checklist', icon: 'grid',
    blurb: 'A set of items ticked off daily.',
    defaults: { icon: 'grid', target: { period: 'day', value: 1, dir: 'atLeast' } },
  },
  {
    id: 'scale', name: 'Score', icon: 'smile',
    blurb: 'Rate the day from 1 to 10.',
    defaults: { icon: 'smile', target: { period: 'day', value: 7, dir: 'atLeast' } },
  },
  {
    id: 'measure', name: 'Measure', icon: 'scale',
    blurb: 'A number that moves. Weight, resting heart rate.',
    defaults: { icon: 'scale', unit: 'kg', target: null },
  },
  {
    id: 'abstain', name: 'Streak', icon: 'shield',
    blurb: 'Days clean since the last reset.',
    defaults: { icon: 'shield', target: { period: 'streak', value: 30, dir: 'atLeast' } },
  },
  {
    id: 'session', name: 'Workout', icon: 'dumbbell',
    blurb: 'Time plus the sets, reps and weight.',
    defaults: { icon: 'dumbbell', countsToDay: true, target: { period: 'week', value: 180, dir: 'atLeast' }, exercises: [] },
  },
  {
    id: 'note', name: 'Event', icon: 'inbox',
    blurb: 'Anything, in your own words.',
    defaults: { icon: 'inbox', target: null, weight: 0 },
  },
]

const kindOf = (id) => KINDS.find((k) => k.id === id) ?? KINDS[0]

export default function NewTrackerSheet({ open, onClose, onCreate, preset, slot = 1 }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState('count')
  const [unit, setUnit] = useState('reps')
  const [targetValue, setTargetValue] = useState(50)
  const [period, setPeriod] = useState('day')
  const [dir, setDir] = useState('atLeast')
  const [quickText, setQuickText] = useState('10, 15, 20')
  const [items, setItems] = useState('')
  const [pillar, setPillar] = useState('training')
  const [icon, setIcon] = useState('flame')
  const [colour, setColour] = useState(slot)
  const [more, setMore] = useState(false)

  const applyKind = (id, keepName = true) => {
    const k = kindOf(id)
    setKind(id)
    setUnit(k.defaults.unit ?? '')
    setIcon(k.defaults.icon ?? 'sparkle')
    setPeriod(k.defaults.target?.period ?? 'day')
    setDir(k.defaults.target?.dir ?? 'atLeast')
    setTargetValue(k.defaults.target?.value ?? 0)
    setQuickText((k.defaults.quick ?? []).map((q) => (q.label ? `${q.label}:${q.value}` : q.value)).join(', '))
    if (!keepName) setName('')
  }

  useEffect(() => {
    if (!open) return
    setMore(false)
    setColour(slot)
    setPillar(preset?.pillar ?? 'training')
    applyKind(preset?.kind ?? 'count')
    setName(preset?.name ?? '')
    setItems('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preset, slot])

  const k = kindOf(kind)
  const showUnit = ['count', 'measure'].includes(kind)
  const showQuick = ['count', 'duration', 'session'].includes(kind)
  const showItems = kind === 'checklist'
  const showTarget = kind !== 'note' && kind !== 'measure'

  const parseQuick = (text) =>
    text
      .split(',')
      .map((chunk) => {
        const [a, b] = chunk.split(':').map((x) => x.trim())
        return b !== undefined ? { label: a, value: Number(b) } : { value: Number(a) }
      })
      .filter((q) => Number.isFinite(q.value) && q.value > 0)

  const save = () => {
    const clean = name.trim()
    if (!clean) return
    const variants = showItems
      ? items.split(',').map((x) => x.trim()).filter(Boolean).map((n) => ({ id: n.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: n }))
      : []

    onCreate({
      name: clean,
      primitive: kind,
      unit: showUnit ? unit.trim() : '',
      icon,
      pillar,
      slot: colour,
      weight: k.defaults.weight ?? 1,
      countsToDay: !!k.defaults.countsToDay,
      quick: showQuick ? parseQuick(quickText) : [],
      variants,
      exercises: kind === 'session' ? [] : undefined,
      userVariants: true,
      askOnStart: kind === 'duration' || kind === 'session' ? false : undefined,
      target: showTarget && targetValue > 0
        ? { period: showItems ? 'day' : period, value: showItems ? (variants.length || 1) : Number(targetValue), dir }
        : null,
    })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New tracker"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" onClick={save} disabled={!name.trim()}>Add to Today</Button>
        </>
      }
    >
      <Field label="What are you tracking?">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Hammer curls"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) save() }}
        />
      </Field>

      <Field label="What kind of thing is it?" hint={k.blurb}>
        <div className="grid grid-cols-3 gap-1.5">
          {KINDS.map((x) => {
            const on = kind === x.id
            return (
              <button
                key={x.id}
                type="button"
                aria-pressed={on}
                onClick={() => applyKind(x.id)}
                className="rounded-[12px] px-2 py-2.5 grid justify-items-center gap-1 transition-colors border"
                style={{
                  background: on ? `color-mix(in oklab, var(--s${colour}) 14%, transparent)` : 'var(--surface-2)',
                  borderColor: on ? `var(--s${colour})` : 'transparent',
                  color: on ? 'var(--ink)' : 'var(--ink-2)',
                }}
              >
                <Icon name={x.icon} size={16} />
                <span className="text-[11.5px] font-medium leading-tight text-center">{x.name}</span>
              </button>
            )
          })}
        </div>
      </Field>

      {showItems && (
        <Field label="Items" hint="Comma separated. Each one gets its own tick box.">
          <input
            className={inputClass}
            value={items}
            onChange={(e) => setItems(e.target.value)}
            placeholder="Vitamin D, Omega 3, Magnesium"
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {showUnit && (
          <Field label="Unit">
            <input className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="reps" />
          </Field>
        )}
        {showTarget && !showItems && (
          <Field label="Target">
            <div className="flex gap-1.5">
              <input
                type="number"
                min="0"
                className={inputClass}
                value={targetValue}
                onChange={(e) => setTargetValue(Number(e.target.value))}
              />
              <select className={`${inputClass} w-[104px]`} value={period} onChange={(e) => setPeriod(e.target.value)}>
                <option value="day">/ day</option>
                <option value="week">/ week</option>
                {kind === 'abstain' && <option value="streak">streak</option>}
              </select>
            </div>
          </Field>
        )}
      </div>

      {showQuick && (
        <Field label="One-tap buttons" hint='Comma separated. Name one with "Glass:250" if you want a word instead of a number.'>
          <input className={inputClass} value={quickText} onChange={(e) => setQuickText(e.target.value)} />
        </Field>
      )}

      <button
        type="button"
        onClick={() => setMore((v) => !v)}
        className="text-[12.5px] text-ink-2 hover:text-ink inline-flex items-center gap-1.5 justify-self-start"
      >
        <Icon name={more ? 'chevronUp' : 'chevronDown'} size={14} />
        {more ? 'Fewer options' : 'More options'}
      </button>

      {more && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Group it under">
              <select className={inputClass} value={pillar} onChange={(e) => setPillar(e.target.value)}>
                {PILLARS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Icon">
              <select className={inputClass} value={icon} onChange={(e) => setIcon(e.target.value)}>
                {ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Colour">
            <div className="flex gap-1.5 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Colour ${n}`}
                  aria-pressed={colour === n}
                  onClick={() => setColour(n)}
                  className="w-7 h-7 rounded-[9px]"
                  style={{
                    background: `var(--s${n})`,
                    outline: colour === n ? '2px solid var(--ink)' : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </Field>

          {showTarget && (
            <Field label="Direction">
              <select className={inputClass} value={dir} onChange={(e) => setDir(e.target.value)}>
                <option value="atLeast">At least this much — more is better</option>
                <option value="atMost">At most this much — it is a cap</option>
              </select>
            </Field>
          )}
        </>
      )}

      <p className="text-[11.5px] text-ink-3">
        It appears on Today straight away, under {PILLARS.find((p) => p.id === pillar)?.name}. Everything here is
        editable later in Setup.
      </p>
    </Sheet>
  )
}

export { KINDS }
