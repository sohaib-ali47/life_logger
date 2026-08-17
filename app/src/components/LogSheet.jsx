/* Manual entry — the escape hatch behind every quick-add chip.
   The time is pre-filled with now, because that is the answer nine times
   out of ten; you only touch it when you are backfilling a missed day. */

import { useEffect, useState } from 'react'
import { Sheet, Field, Button, inputClass } from './ui'
import { useApp } from '../lib/store'
import { primitiveOf } from '../lib/primitives'
import { axisUnit } from '../lib/format'
import { today as todayKey, pad } from '../lib/dates'

const nowHHMM = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function LogSheet({ open, onClose, dayKey, presetSectionId }) {
  const { active, addEntry, flash } = useApp()
  const [sectionId, setSectionId] = useState(presetSectionId || active[0]?.id || '')
  const [date, setDate] = useState(dayKey)
  const [time, setTime] = useState('')
  const [variant, setVariant] = useState('')
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setSectionId(presetSectionId || active[0]?.id || '')
    setDate(dayKey)
    /* today defaults to the current clock; a past day starts blank
       because "now" would be a lie about when it happened */
    setTime(dayKey === todayKey() ? nowHHMM() : '')
    setVariant('')
    setValue('')
    setNote('')
  }, [open, presetSectionId, dayKey, active])

  const section = active.find((s) => s.id === sectionId)
  const p = section ? primitiveOf(section) : null
  const hasVariants = !!section?.variants?.length

  const hint = !section
    ? ''
    : section.primitive === 'duration' || section.primitive === 'session'
      ? 'Minutes.'
      : section.primitive === 'scale'
        ? 'A score from 1 to 10.'
        : section.primitive === 'check'
          ? 'Use 1 for done, 0 for not done.'
          : section.primitive === 'checklist'
            ? 'Pick the item above; the value is 1.'
            : section.primitive === 'abstain'
              ? 'Logs a reset on this date and restarts the streak.'
              : section.primitive === 'note'
                ? 'Write what happened in the note field.'
                : `Amount in ${section.unit || axisUnit(section)}.`

  const needsValue = section && !['abstain', 'note', 'checklist'].includes(section.primitive)

  const submit = () => {
    if (!section) return
    const v = needsValue ? Number(value) : 1
    if (needsValue && !(v > 0)) return
    if (section.primitive === 'note' && !note.trim()) return
    addEntry({
      sectionId: section.id,
      date,
      value: v,
      at: time ? `${date}T${time}:00` : null,
      meta: variant ? { variant } : {},
      note: note.trim(),
    })
    flash(`${section.name} logged.`)
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add entry"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" onClick={submit}>Log it</Button>
        </>
      }
    >
      <Field label="Section">
        <select className={inputClass} value={sectionId} onChange={(e) => { setSectionId(e.target.value); setVariant('') }}>
          {active.map((s) => (
            <option key={s.id} value={s.id}>{s.name} · {s.primitive}</option>
          ))}
        </select>
      </Field>

      {hasVariants && (
        <Field label={section.variantLabel || 'Which one?'}>
          <select className={inputClass} value={variant} onChange={(e) => setVariant(e.target.value)}>
            <option value="">Not set</option>
            {section.variants.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Day">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time" hint={p?.timed ? 'Pre-filled with now.' : 'Not used for this kind.'}>
          <input
            type="time"
            className={inputClass}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            disabled={!p?.timed}
          />
        </Field>
      </div>

      {needsValue && (
        <Field label="Value" hint={hint}>
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            className={inputClass}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Amount"
            autoFocus
          />
        </Field>
      )}
      {!needsValue && <p className="text-[12.5px] text-ink-2">{hint}</p>}

      <Field label="Note">
        <textarea
          className={`${inputClass} h-auto min-h-[68px] py-2.5 resize-y`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={section?.primitive === 'note' ? 'What happened?' : 'Optional'}
        />
      </Field>
    </Sheet>
  )
}
