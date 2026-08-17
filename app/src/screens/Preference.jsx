/* Preference — asked once, after sign-in.
 *
 * One question, because a few trackers only apply to some people and the
 * honest way to handle that is to ask rather than show everyone
 * everything. It is stored on the account, so it follows you to every
 * device — and it has no skip, so anyone who has not answered yet gets
 * asked again on their next sign-in until they do.
 */

import { useState } from 'react'
import Icon from '../components/Icon'
import { Button } from '../components/ui'
import { useApp } from '../lib/store'
import { AUDIENCES } from '../lib/sections'

export default function Preference() {
  const { persistSettings, settings, user } = useApp()
  const [sex, setSex] = useState(null)
  const [busy, setBusy] = useState(false)

  const save = () => {
    if (!sex) return
    setBusy(true)
    persistSettings({ ...settings, sex })
  }

  const name = user?.user_metadata?.full_name

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 pt-safe">
      <div className="w-full max-w-[420px] mx-auto">
        <span
          className="rounded-[8px] block mb-7"
          style={{
            width: 26,
            height: 26,
            background: 'conic-gradient(from 210deg, var(--s1), var(--s3), var(--s4), var(--s2), var(--s1))',
          }}
        />

        <h1 className="text-[25px] font-semibold tracking-[-.02em] leading-tight">
          {name ? `One question, ${name}.` : 'One question before you start.'}
        </h1>
        <p className="text-[13.5px] text-ink-2 mt-2.5 leading-relaxed">
          A few of the trackers only make sense for some people. Your answer decides which ones you are offered —
          nothing else, and nothing is shown to anyone.
        </p>

        <div className="grid gap-2 mt-8">
          {AUDIENCES.map((a) => {
            const on = sex === a.id
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() => setSex(a.id)}
                className="flex items-center gap-3 px-4 h-14 rounded-[14px] border text-left transition-colors"
                style={{
                  background: on ? 'color-mix(in oklab, var(--accent) 10%, transparent)' : 'var(--surface)',
                  borderColor: on ? 'var(--accent)' : 'var(--line)',
                }}
              >
                <span
                  className="w-[18px] h-[18px] rounded-full border-2 grid place-items-center shrink-0"
                  style={{ borderColor: on ? 'var(--accent)' : 'var(--axis)' }}
                >
                  {on && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />}
                </span>
                <span className="text-[14.5px] font-medium">{a.label}</span>
                {on && <Icon name="check" size={16} className="ml-auto" />}
              </button>
            )
          })}
        </div>

        <Button tone="primary" size="lg" className="w-full mt-7" disabled={!sex || busy} onClick={save}>
          {busy ? 'Saving…' : 'Continue'}
        </Button>

        <p className="text-[11.5px] text-ink-3 mt-4 leading-relaxed">
          Changeable any time in Setup. &ldquo;Prefer not to say&rdquo; is a real answer — it simply keeps the scoped
          trackers hidden.
        </p>
      </div>
    </div>
  )
}
