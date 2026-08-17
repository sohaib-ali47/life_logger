/* Onboarding — two questions, once.
 *
 * The first scopes the sections you are offered: some trackers only apply
 * to some people, and the honest way to handle that is to ask rather than
 * to show everyone everything. Answer "prefer not to say" and the scoped
 * ones stay hidden.
 *
 * The second decides whether you start empty or with sample data. Empty is
 * the default, because a real account opening onto a fictional history is
 * worse than an empty one.
 */

import { useState } from 'react'
import Icon from '../components/Icon'
import { Button } from '../components/ui'
import { useApp } from '../lib/store'
import { AUDIENCES } from '../lib/sections'

export default function Onboarding() {
  const { persistSettings, settings, loadDemo, clearDemo, user } = useApp()
  const [sex, setSex] = useState(settings.sex ?? null)
  const [sample, setSample] = useState(false)
  const [busy, setBusy] = useState(false)

  const finish = async () => {
    setBusy(true)
    /* "Start empty" has to clear sample data already on the device — real
       entries are left alone either way. */
    if (sample) await loadDemo({ silent: true })
    else await clearDemo()
    persistSettings({ ...settings, sex: sex ?? 'unspecified', onboarded: true })
  }

  const name = user?.user_metadata?.full_name

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 pt-safe">
      <div className="w-full max-w-[440px] mx-auto">
        <span
          className="rounded-[8px] block mb-6"
          style={{
            width: 26,
            height: 26,
            background: 'conic-gradient(from 210deg, var(--s1), var(--s3), var(--s4), var(--s2), var(--s1))',
          }}
        />

        <h1 className="text-[26px] font-semibold tracking-[-.02em] leading-tight">
          {name ? `Welcome, ${name}.` : 'Welcome to Life OS.'}
        </h1>
        <p className="text-[13.5px] text-ink-2 mt-2 leading-relaxed">
          Two questions and you are in. Both are changeable later in Setup.
        </p>

        {/* ── audience ─────────────────────────────────────────────── */}
        <section className="mt-9">
          <h2 className="text-[14px] font-semibold">Which applies to you?</h2>
          <p className="text-[12.5px] text-ink-3 mt-1 leading-relaxed">
            A few trackers only make sense for some people. This decides which ones you are offered — nothing else.
          </p>
          <div className="grid gap-2 mt-4">
            {AUDIENCES.map((a) => {
              const on = sex === a.id
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSex(a.id)}
                  className="flex items-center gap-3 px-3.5 h-12 rounded-[13px] border text-left transition-colors"
                  style={{
                    background: on ? 'color-mix(in oklab, var(--accent) 10%, transparent)' : 'var(--surface)',
                    borderColor: on ? 'var(--accent)' : 'var(--line)',
                  }}
                >
                  <span
                    className="w-4 h-4 rounded-full border-2 grid place-items-center shrink-0"
                    style={{ borderColor: on ? 'var(--accent)' : 'var(--axis)' }}
                  >
                    {on && <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)' }} />}
                  </span>
                  <span className="text-[14px] font-medium">{a.label}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* ── starting point ───────────────────────────────────────── */}
        <section className="mt-8">
          <h2 className="text-[14px] font-semibold">How would you like to start?</h2>
          <div className="grid gap-2 mt-4">
            <Choice
              on={!sample}
              onClick={() => setSample(false)}
              icon="calendar"
              title="Start empty"
              blurb="Nothing logged. Every chart fills in as you use it."
            />
            <Choice
              on={sample}
              onClick={() => setSample(true)}
              icon="sparkle"
              title="Explore with sample data"
              blurb="90 days of made-up history so you can see the charts working. Never uploaded to your account, and erasable in one tap."
            />
          </div>
        </section>

        <Button
          tone="primary"
          size="lg"
          className="w-full mt-8"
          disabled={!sex || busy}
          onClick={finish}
        >
          {busy ? 'Setting up…' : 'Start logging'}
        </Button>

        {!sex && (
          <p className="text-[11.5px] text-ink-3 mt-3 text-center">Pick one of the three above to continue.</p>
        )}
      </div>
    </div>
  )
}

function Choice({ on, onClick, icon, title, blurb }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="flex gap-3 items-start p-3.5 rounded-[13px] border text-left transition-colors"
      style={{
        background: on ? 'color-mix(in oklab, var(--accent) 10%, transparent)' : 'var(--surface)',
        borderColor: on ? 'var(--accent)' : 'var(--line)',
      }}
    >
      <span
        className="w-8 h-8 rounded-[10px] grid place-items-center shrink-0"
        style={{
          background: on ? 'color-mix(in oklab, var(--accent) 18%, transparent)' : 'var(--surface-2)',
          color: on ? 'var(--accent)' : 'var(--ink-3)',
        }}
      >
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium">{title}</span>
        <span className="block text-[12px] text-ink-3 mt-0.5 leading-relaxed">{blurb}</span>
      </span>
    </button>
  )
}
