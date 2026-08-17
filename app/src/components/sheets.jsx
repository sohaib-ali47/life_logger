/* The three sheets that make logging specific rather than generic:
   which variant, the question asked afterwards, and a full gym session. */

import { useEffect, useState } from 'react'
import Icon from './Icon'
import { Sheet, Field, Button, Chip, inputClass, slotVar } from './ui'
import { fmtMinutes } from '../lib/format'

/* ══════════════════════════════════════════════════════════════════════
   Variant picker — "which meal", "which project", "which session"
   ══════════════════════════════════════════════════════════════════════ */

export function VariantSheet({ open, section, onPick, onClose, onAddVariant, verb = 'Start' }) {
  const [adding, setAdding] = useState('')
  useEffect(() => { if (open) setAdding('') }, [open])
  if (!section) return null

  const tint = slotVar(section)
  /* always offer the add box — it is your app, and the alternative is a
     trip to Setup every time you start something new */
  const canAdd = !!onAddVariant

  return (
    <Sheet open={open} onClose={onClose} title={section.variantLabel || `${section.name} — pick one`}>
      <div className="grid gap-2">
        {(section.variants || []).map((v) => (
          <button
            key={v.id}
            onClick={() => onPick(v.id)}
            className="flex items-center gap-3 px-3.5 py-3 rounded-[13px] bg-surface-2 hover:bg-surface-3 text-left transition-colors"
          >
            <span
              className="w-8 h-8 rounded-[10px] grid place-items-center shrink-0"
              style={{ background: `color-mix(in oklab, ${tint} 18%, transparent)`, color: tint }}
            >
              <Icon name={section.icon} size={15} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-medium">{v.name}</span>
              {v.time && <span className="block text-[11.5px] text-ink-3">usually around {v.time}</span>}
            </span>
            <Icon name="chevronRight" size={16} className="text-ink-3" />
          </button>
        ))}

        <button
          onClick={() => onPick(null)}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-[13px] text-ink-3 hover:text-ink hover:bg-surface-2 text-left text-[13px] transition-colors"
        >
          <Icon name="dash" size={15} />
          {verb} without picking
        </button>
      </div>

      {canAdd && (
        <Field label="Add a new one">
          <div className="flex gap-2">
            <input
              className={inputClass}
              value={adding}
              onChange={(e) => setAdding(e.target.value)}
              placeholder="Name"
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !adding.trim()) return
                const id = onAddVariant(section.id, adding)
                if (id) onPick(id)
              }}
            />
            <Button
              tone="primary"
              icon="plus"
              disabled={!adding.trim()}
              onClick={() => {
                const id = onAddVariant(section.id, adding)
                if (id) onPick(id)
              }}
            >
              Add
            </Button>
          </div>
        </Field>
      )}
    </Sheet>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Variant manager — add and remove a section's options in place
   ══════════════════════════════════════════════════════════════════════ */

export function VariantManagerSheet({ open, section, onAdd, onRemove, onClose }) {
  const [adding, setAdding] = useState('')
  useEffect(() => { if (open) setAdding('') }, [open])
  if (!section) return null

  const tint = slotVar(section)
  const list = section.variants || []
  const noun = section.primitive === 'checklist' ? 'item' : 'option'

  const submit = () => {
    if (!adding.trim()) return
    onAdd(section.id, adding)
    setAdding('')
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${section.name} — ${noun}s`}
      footer={<Button tone="primary" onClick={onClose}>Done</Button>}
    >
      <div className="flex gap-2">
        <input
          className={inputClass}
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          placeholder={section.primitive === 'checklist' ? 'Creatine' : 'New project'}
          autoFocus
        />
        <Button tone="primary" icon="plus" onClick={submit} disabled={!adding.trim()}>Add</Button>
      </div>

      {list.length ? (
        <ul className="grid gap-1">
          {list.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-2.5 py-2 rounded-[10px] bg-surface-2">
              <span className="w-2 h-2 rounded-[3px]" style={{ background: tint }} />
              <span className="flex-1 text-[13px] font-medium truncate">{v.name}</span>
              {v.time && <span className="text-[11.5px] text-ink-3">{v.time}</span>}
              <button
                className="w-7 h-7 grid place-items-center rounded-[8px] text-ink-3 hover:text-critical hover:bg-surface-3"
                aria-label={`Remove ${v.name}`}
                onClick={() => onRemove(section.id, v.id)}
              >
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-ink-3">No {noun}s yet. Add the first one above.</p>
      )}

      <p className="text-[11.5px] text-ink-3">
        Removing an {noun} leaves past entries alone — they keep the name they were logged under.
      </p>
    </Sheet>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Follow-up — the question asked after the fact
   ══════════════════════════════════════════════════════════════════════ */

export function FollowUpSheet({ open, section, followUp, subtitle, onSubmit, onClose }) {
  const [value, setValue] = useState('')
  const [other, setOther] = useState('')

  useEffect(() => { if (open) { setValue(''); setOther('') } }, [open])
  if (!followUp) return null

  const submit = (v) => {
    const final = v === 'Other' ? other.trim() || 'Other' : v
    if (final === '' || final === null || final === undefined) return
    onSubmit(followUp.type === 'number' ? Number(final) : final)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={followUp.label}
      footer={
        followUp.type === 'choice' ? (
          <Button onClick={onClose}>Skip</Button>
        ) : (
          <>
            <Button onClick={onClose}>Skip</Button>
            <Button tone="primary" onClick={() => submit(value)} disabled={value === ''}>Save</Button>
          </>
        )
      }
    >
      {subtitle && <p className="text-[12.5px] text-ink-3 -mt-1">{subtitle}</p>}

      {followUp.type === 'choice' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {(followUp.options || []).map((o) => (
              <Chip
                key={o}
                tint={section ? slotVar(section) : undefined}
                onClick={() => (o === 'Other' ? setValue('Other') : submit(o))}
              >
                {o}
              </Chip>
            ))}
          </div>
          {value === 'Other' && (
            <Field label="In your words">
              <div className="flex gap-2">
                <input className={inputClass} value={other} onChange={(e) => setOther(e.target.value)} autoFocus />
                <Button tone="primary" onClick={() => submit('Other')}>Save</Button>
              </div>
            </Field>
          )}
        </>
      ) : (
        <Field label={followUp.unit ? `Value in ${followUp.unit}` : 'Value'}>
          <input
            type={followUp.type === 'number' ? 'number' : 'text'}
            inputMode={followUp.type === 'number' ? 'decimal' : undefined}
            className={inputClass}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(value) }}
            autoFocus
          />
        </Field>
      )}

      <p className="text-[11.5px] text-ink-3">
        Skipping is fine — it stays on the Today screen as a reminder until you answer or the day ends.
      </p>
    </Sheet>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Session — duration plus the sets you actually did
   ══════════════════════════════════════════════════════════════════════ */

const blankSet = () => ({ exercise: '', reps: '', weight: '' })

export function SessionSheet({ open, section, initial, onSave, onClose, onAddExercise, onTrackSeparately }) {
  const [minutes, setMinutes] = useState('')
  const [variantId, setVariantId] = useState('')
  const [note, setNote] = useState('')
  const [sets, setSets] = useState([blankSet()])

  useEffect(() => {
    if (!open) return
    setMinutes(initial?.minutes ? String(initial.minutes) : '')
    setVariantId(initial?.variantId || '')
    setNote('')
    setSets(initial?.sets?.length ? initial.sets : [blankSet()])
  }, [open, initial])

  if (!section) return null
  const tint = slotVar(section)

  const update = (i, patch) => setSets((s) => s.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  const addRow = () => setSets((s) => [...s, blankSet()])
  const removeRow = (i) => setSets((s) => (s.length === 1 ? [blankSet()] : s.filter((_, j) => j !== i)))

  const clean = () =>
    sets
      .filter((s) => s.exercise.trim() && Number(s.reps) > 0)
      .map((s) => ({
        exercise: s.exercise.trim(),
        reps: Number(s.reps),
        weight: s.weight === '' ? null : Number(s.weight),
      }))

  const volume = clean().reduce((a, s) => a + s.reps * (s.weight || 0), 0)

  const library = new Set((section.exercises || []).map((x) => x.toLowerCase()))
  const unknown = [
    ...new Set(
      sets
        .map((s) => s.exercise.trim())
        .filter((n) => n && !library.has(n.toLowerCase()))
    ),
  ]

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Log ${section.name.toLowerCase()} session`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={!(Number(minutes) > 0)}
            onClick={() => onSave({ minutes: Number(minutes), variantId: variantId || null, sets: clean(), note: note.trim() })}
          >
            Save session
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Duration" hint="minutes">
          <input
            type="number"
            inputMode="numeric"
            min="1"
            className={inputClass}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            placeholder="60"
            autoFocus
          />
        </Field>
        <Field label={section.variantLabel || 'Type'}>
          <select className={inputClass} value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            <option value="">Not set</option>
            {(section.variants || []).map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[12px] text-ink-2 font-medium">Exercises</span>
          {volume > 0 && <span className="text-[11.5px] text-ink-3 num">volume {Math.round(volume)} kg</span>}
        </div>

        <div className="grid gap-2">
          {sets.map((row, i) => (
            <div key={i} className="grid grid-cols-[1fr_58px_66px_32px] gap-1.5 items-center">
              <input
                list={`ex-${section.id}`}
                className={`${inputClass} h-9 text-[13px]`}
                value={row.exercise}
                onChange={(e) => update(i, { exercise: e.target.value })}
                placeholder="Exercise"
              />
              <input
                type="number"
                inputMode="numeric"
                className={`${inputClass} h-9 text-[13px] px-2`}
                value={row.reps}
                onChange={(e) => update(i, { reps: e.target.value })}
                placeholder="reps"
                aria-label="Reps"
              />
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                className={`${inputClass} h-9 text-[13px] px-2`}
                value={row.weight}
                onChange={(e) => update(i, { weight: e.target.value })}
                placeholder="kg"
                aria-label="Weight in kilograms"
              />
              <button
                className="h-9 grid place-items-center rounded-[9px] text-ink-3 hover:text-critical hover:bg-surface-2"
                aria-label="Remove set"
                onClick={() => removeRow(i)}
              >
                <Icon name="x" size={15} />
              </button>
            </div>
          ))}
        </div>

        <datalist id={`ex-${section.id}`}>
          {(section.exercises || []).map((e) => <option key={e} value={e} />)}
        </datalist>

        <button
          onClick={addRow}
          className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-medium"
          style={{ color: tint }}
        >
          <Icon name="plus" size={14} /> Add set
        </button>

        {/* anything you typed that is not in the library yet */}
        {unknown.length > 0 && (
          <div className="mt-3 grid gap-2">
            {unknown.map((name) => (
              <div key={name} className="text-[11.5px] text-ink-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-ink-2 font-medium">{name}</span>
                <span>is new.</span>
                {onAddExercise && (
                  <button className="font-medium" style={{ color: tint }} onClick={() => onAddExercise(section.id, name)}>
                    Save to my list
                  </button>
                )}
                {onTrackSeparately && (
                  <>
                    <span>·</span>
                    <button className="font-medium" style={{ color: tint }} onClick={() => onTrackSeparately(name)}>
                      Give it its own tile
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Field label="Note">
        <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Felt strong, bumped the bench" />
      </Field>

      {Number(minutes) > 0 && (
        <p className="text-[11.5px] text-ink-3">
          {fmtMinutes(Number(minutes))} · {clean().length} {clean().length === 1 ? 'set' : 'sets'} recorded
        </p>
      )}
    </Sheet>
  )
}
