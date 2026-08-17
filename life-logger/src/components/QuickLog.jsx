import { useState } from 'react'
import { Check } from 'lucide-react'
import { Card } from './Card'
import { CATEGORIES } from '../lib/categories'
import { dayKey } from '../lib/dates'

const PRESET_MINUTES = [15, 30, 45, 60, 90, 120]

const blank = () => ({
  activity: '',
  category: 'study',
  minutes: 30,
  note: '',
  day: dayKey(),
})

export function QuickLog({ onAdd }) {
  const [draft, setDraft] = useState(blank)
  const [saved, setSaved] = useState(false)
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  const minutes = Number(draft.minutes)
  const canSave = draft.activity.trim().length > 0 && Number.isFinite(minutes) && minutes > 0

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSave) return
    onAdd({ ...draft, activity: draft.activity.trim(), minutes })
    // Keep the category and date — logging is usually a run of similar entries.
    setDraft((d) => ({ ...blank(), category: d.category, day: d.day }))
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="activity" className="mb-1.5 block text-xs text-muted">
            What did you do?
          </label>
          <input
            id="activity"
            value={draft.activity}
            onChange={(e) => set({ activity: e.target.value })}
            placeholder="Revised chapter 4"
            maxLength={120}
            autoComplete="off"
            className="w-full rounded-xl border border-line bg-raised px-3 py-2.5 text-base text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs text-muted">Category</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const on = draft.category === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => set({ category: c.id })}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    on ? 'border-transparent bg-raised text-ink' : 'border-line text-ink-2'
                  }`}
                  style={on ? { boxShadow: `inset 0 0 0 1px ${c.color}` } : undefined}
                >
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ background: c.color }}
                  />
                  {c.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-xs text-muted">How long?</legend>
          <div className="flex flex-wrap gap-2">
            {PRESET_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set({ minutes: m })}
                aria-pressed={minutes === m}
                className={`rounded-full border px-3 py-1.5 text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  minutes === m
                    ? 'border-accent bg-accent/15 text-ink'
                    : 'border-line text-ink-2'
                }`}
              >
                {m < 60 ? `${m}m` : `${m / 60}h`}
              </button>
            ))}
            <label className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 focus-within:border-accent">
              <span className="sr-only">Custom duration in minutes</span>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="1440"
                value={draft.minutes}
                onChange={(e) => set({ minutes: e.target.value })}
                className="w-14 bg-transparent text-right tabular-nums text-ink focus:outline-none"
              />
              min
            </label>
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="day" className="mb-1.5 block text-xs text-muted">
              Day
            </label>
            <input
              id="day"
              type="date"
              value={draft.day}
              max={dayKey()}
              onChange={(e) => set({ day: e.target.value || dayKey() })}
              className="w-full rounded-xl border border-line bg-raised px-3 py-2.5 text-sm text-ink focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="note" className="mb-1.5 block text-xs text-muted">
              Note <span className="text-muted/70">(optional)</span>
            </label>
            <input
              id="note"
              value={draft.note}
              onChange={(e) => set({ note: e.target.value })}
              maxLength={500}
              autoComplete="off"
              placeholder="Felt sharp"
              className="w-full rounded-xl border border-line bg-raised px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!canSave}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-base font-semibold text-white transition-opacity disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {saved ? (
            <>
              <Check aria-hidden="true" className="size-4" /> Logged
            </>
          ) : (
            'Log it'
          )}
        </button>
        <p aria-live="polite" className="sr-only">
          {saved ? 'Entry saved.' : ''}
        </p>
      </form>
    </Card>
  )
}
