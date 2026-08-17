/* Auth — sign in, create an account, magic link, password reset.
 *
 * The visual on the left is the product's own day-allocation stack, not
 * stock decoration: the same eight palette hues, in the same slot order,
 * so the first thing you see is what the app is actually for.
 *
 * Every mode lives in one component because they share the same email
 * field, the same error surface and the same submit state. Splitting them
 * would duplicate all three.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { Button, inputClass } from '../components/ui'
import {
  signIn, signUp, sendMagicLink, sendPasswordReset, updatePassword,
  emailLooksValid, passwordProblem, passwordScore, configError,
} from '../lib/supabase'

const MODES = {
  signin:   { title: 'Welcome back',        blurb: 'Sign in to pick up where you left off.' },
  signup:   { title: 'Create your account', blurb: 'Your history syncs to every device you sign in on.' },
  magic:    { title: 'Sign in by email',    blurb: 'No password — we send a link that signs you straight in.' },
  forgot:   { title: 'Reset your password',  blurb: 'We will email you a link to set a new one.' },
  recovery: { title: 'Set a new password',   blurb: 'Choose something you have not used elsewhere.' },
}

export default function Auth({ initialMode = 'signin', notice, onGuest, onDone }) {
  const [mode, setMode] = useState(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(notice ?? null)
  const [done, setDone] = useState(null)   // 'confirm' | 'magic' | 'reset' | 'password'
  const [touched, setTouched] = useState({})
  const emailRef = useRef(null)

  useEffect(() => { setMode(initialMode) }, [initialMode])
  useEffect(() => { if (mode !== 'recovery') emailRef.current?.focus() }, [mode])

  const copy = MODES[mode]
  const needsPassword = mode === 'signin' || mode === 'signup' || mode === 'recovery'
  const needsEmail = mode !== 'recovery'

  const emailError = touched.email && email && !emailLooksValid(email) ? 'That does not look like an email address.' : null
  const passError = touched.password && (mode === 'signup' || mode === 'recovery') ? passwordProblem(password) : null

  const canSubmit = useMemo(() => {
    if (busy) return false
    if (needsEmail && !emailLooksValid(email)) return false
    if (mode === 'signin' && !password) return false
    if ((mode === 'signup' || mode === 'recovery') && passwordProblem(password)) return false
    return true
  }, [busy, needsEmail, email, mode, password])

  async function submit(e) {
    e?.preventDefault()
    setTouched({ email: true, password: true })
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signin') {
        await signIn({ email, password })
        /* the auth listener in the store takes it from here */
      } else if (mode === 'signup') {
        const { needsConfirmation } = await signUp({ email, password, name })
        if (needsConfirmation) setDone('confirm')
      } else if (mode === 'magic') {
        await sendMagicLink(email)
        setDone('magic')
      } else if (mode === 'forgot') {
        await sendPasswordReset(email)
        setDone('reset')
      } else if (mode === 'recovery') {
        await updatePassword(password)
        setDone('password')
      }
    } catch (err) {
      setError(friendly(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <BrandPanel />

      <main className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-14 pt-safe">
        <div className="w-full max-w-[400px] mx-auto">
          {/* compact mark on phones, where the brand panel is collapsed */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <Mark size={22} />
            <span className="font-semibold text-[15px] tracking-tight">Life OS</span>
          </div>

          {done ? (
            <Sent
              kind={done}
              email={email}
              onBack={() => {
                if (done === 'password' && onDone) { onDone(); return }
                setDone(null)
                setMode('signin')
              }}
            />
          ) : (
            <>
              <h1 className="text-[26px] font-semibold tracking-[-.02em] leading-tight">{copy.title}</h1>
              <p className="text-[13.5px] text-ink-2 mt-2 leading-relaxed">{copy.blurb}</p>

              {(mode === 'signin' || mode === 'signup') && (
                <div className="mt-6 grid grid-cols-2 p-[3px] gap-[2px] bg-surface-2 border border-line rounded-[12px]">
                  {[['signin', 'Sign in'], ['signup', 'Create account']].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={mode === id}
                      onClick={() => { setMode(id); setError(null); setTouched({}) }}
                      className={`h-9 rounded-[9px] text-[13px] font-medium transition-colors ${
                        mode === id ? 'bg-surface text-ink' : 'text-ink-3 hover:text-ink'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {configError && (
                <Alert tone="bad" className="mt-5">
                  {configError}
                </Alert>
              )}

              <form onSubmit={submit} className="grid gap-4 mt-6" noValidate>
                {mode === 'signup' && (
                  <Labelled label="Name" hint="Optional — it is only used to greet you.">
                    <input
                      className={inputClass}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      placeholder="Sohaib"
                    />
                  </Labelled>
                )}

                {needsEmail && (
                  <Labelled label="Email" error={emailError}>
                    <input
                      ref={emailRef}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      spellCheck="false"
                      className={`${inputClass} ${emailError ? '!border-critical' : ''}`}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                      placeholder="you@example.com"
                      aria-invalid={!!emailError}
                    />
                  </Labelled>
                )}

                {needsPassword && (
                  <Labelled
                    label={mode === 'recovery' ? 'New password' : 'Password'}
                    error={passError}
                    action={
                      mode === 'signin' ? (
                        <button
                          type="button"
                          className="text-[12px] text-ink-3 hover:text-ink"
                          onClick={() => { setMode('forgot'); setError(null) }}
                        >
                          Forgot?
                        </button>
                      ) : null
                    }
                  >
                    <div className="relative">
                      <input
                        type={showPass ? 'text' : 'password'}
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        className={`${inputClass} pr-[76px] ${passError ? '!border-critical' : ''}`}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                        placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'}
                        aria-invalid={!!passError}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass((v) => !v)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 px-2.5 rounded-[8px] text-[12px] font-medium text-ink-3 hover:text-ink hover:bg-surface-3"
                      >
                        {showPass ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {(mode === 'signup' || mode === 'recovery') && password && <Strength value={password} />}
                  </Labelled>
                )}

                {error && <Alert tone="bad">{error}</Alert>}

                <Button
                  type="submit"
                  tone="primary"
                  size="lg"
                  disabled={!canSubmit}
                  className="w-full mt-1"
                >
                  {busy ? 'Working…' : submitLabel(mode)}
                </Button>
              </form>

              <div className="mt-5 grid gap-2 text-[12.5px]">
                {mode === 'signin' && (
                  <button className="text-ink-2 hover:text-ink inline-flex items-center gap-1.5 justify-self-start"
                          onClick={() => { setMode('magic'); setError(null) }}>
                    <Icon name="bell" size={14} /> Email me a link instead
                  </button>
                )}
                {(mode === 'magic' || mode === 'forgot') && (
                  <button className="text-ink-2 hover:text-ink inline-flex items-center gap-1.5 justify-self-start"
                          onClick={() => { setMode('signin'); setError(null) }}>
                    <Icon name="chevronLeft" size={14} /> Back to sign in
                  </button>
                )}
              </div>

              {onGuest && mode !== 'recovery' && (
                <>
                  <div className="flex items-center gap-3 my-7">
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-[11.5px] text-ink-3">or</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <button
                    onClick={onGuest}
                    className="w-full h-11 rounded-[10px] border border-line bg-surface hover:bg-surface-3 text-[13px] font-medium transition-colors"
                  >
                    Use it without an account
                  </button>
                  <p className="text-[11.5px] text-ink-3 mt-3 leading-relaxed">
                    Everything works offline on this device. You can create an account later and your existing history
                    uploads on the first sync.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

/* ── pieces ─────────────────────────────────────────────────────────── */

const submitLabel = (mode) =>
  ({
    signin: 'Sign in',
    signup: 'Create account',
    magic: 'Send me a link',
    forgot: 'Send reset link',
    recovery: 'Save new password',
  })[mode]

function Labelled({ label, hint, error, action, children }) {
  return (
    <label className="grid gap-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-2">{label}</span>
        {action}
      </span>
      {children}
      {error ? (
        <span className="text-[11.5px] text-critical" role="alert">{error}</span>
      ) : hint ? (
        <span className="text-[11.5px] text-ink-3">{hint}</span>
      ) : null}
    </label>
  )
}

function Alert({ tone = 'bad', children, className = '' }) {
  const bad = tone === 'bad'
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex gap-2.5 items-start rounded-[11px] px-3 py-2.5 text-[12.5px] leading-relaxed ${className}`}
      style={{
        background: bad ? 'color-mix(in oklab, var(--critical) 12%, transparent)' : 'var(--surface-2)',
        color: bad ? 'var(--critical)' : 'var(--ink-2)',
      }}
    >
      <Icon name={bad ? 'target' : 'sparkle'} size={15} className="mt-px shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function Strength({ value }) {
  const score = passwordScore(value)
  const label = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score]
  const colour = ['var(--critical)', 'var(--critical)', 'var(--warning)', 'var(--s3)', 'var(--good)'][score]
  return (
    <div className="mt-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: i < score ? colour : 'var(--surface-3)' }}
          />
        ))}
      </div>
      <span className="text-[11.5px] text-ink-3 mt-1 inline-block">{label}</span>
    </div>
  )
}

function Sent({ kind, email, onBack }) {
  const copy = {
    confirm: {
      title: 'Confirm your email',
      body: 'We sent a confirmation link. Open it on this device and you will be signed straight in.',
    },
    magic: {
      title: 'Check your inbox',
      body: 'We sent a sign-in link. It only works once, and only on the device you open it on.',
    },
    reset: {
      title: 'Reset link sent',
      body: 'Open the link and you will be able to set a new password.',
    },
    password: {
      title: 'Password updated',
      body: 'You can sign in with it from now on.',
    },
  }[kind]

  return (
    <div>
      <div
        className="w-12 h-12 rounded-[15px] grid place-items-center mb-5"
        style={{ background: 'color-mix(in oklab, var(--good) 15%, transparent)', color: 'var(--good-text)' }}
      >
        <Icon name={kind === 'password' ? 'check' : 'inbox'} size={22} />
      </div>
      <h1 className="text-[24px] font-semibold tracking-[-.02em] leading-tight">{copy.title}</h1>
      <p className="text-[13.5px] text-ink-2 mt-2 leading-relaxed">{copy.body}</p>
      {email && kind !== 'password' && (
        <p className="text-[13px] mt-4 px-3 py-2.5 rounded-[10px] bg-surface-2 border border-line break-all">{email}</p>
      )}
      {kind === 'password' ? (
        <Button tone="primary" size="lg" className="w-full mt-6" onClick={onBack}>Continue</Button>
      ) : (
        <button onClick={onBack} className="text-[12.5px] text-ink-2 hover:text-ink inline-flex items-center gap-1.5 mt-6">
          <Icon name="chevronLeft" size={14} /> Back to sign in
        </button>
      )}
    </div>
  )
}

function Mark({ size = 26 }) {
  return (
    <span
      className="rounded-[7px] shrink-0 block"
      style={{
        width: size,
        height: size,
        background: 'conic-gradient(from 210deg, var(--s1), var(--s3), var(--s4), var(--s2), var(--s1))',
      }}
    />
  )
}

/* The brand panel: the app's own allocation stack, at rest. Same eight
   hues in the same slot order the charts use. */
function BrandPanel() {
  const columns = [
    [30, 8, 14, 10, 6, 12, 9, 11],
    [26, 12, 18, 8, 10, 9, 7, 10],
    [31, 6, 11, 16, 12, 8, 6, 10],
    [28, 10, 16, 12, 8, 11, 5, 10],
    [33, 5, 13, 9, 14, 10, 8, 8],
    [27, 14, 10, 11, 9, 13, 7, 9],
    [29, 9, 15, 13, 7, 10, 9, 8],
  ]

  return (
    <aside
      className="hidden lg:flex flex-col justify-between p-14 relative overflow-hidden border-r border-line"
      style={{ background: 'var(--plane)' }}
    >
      <div
        aria-hidden="true"
        className="absolute -top-40 -left-32 w-[520px] h-[520px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, color-mix(in oklab, var(--s1) 16%, transparent), transparent 68%)' }}
      />

      <div className="relative flex items-center gap-2.5">
        <Mark />
        <span className="font-semibold text-[15px] tracking-tight">Life OS</span>
      </div>

      <div className="relative">
        <h2 className="text-[30px] font-semibold tracking-[-.025em] leading-[1.15] max-w-[19ch]">
          Know where your life actually goes.
        </h2>
        <p className="text-[14px] text-ink-2 mt-4 max-w-[38ch] leading-relaxed">
          Every day is twenty-four hours. Log the parts that matter, and the parts you would rather not look at, and
          let the numbers tell you the truth.
        </p>

        <svg
          viewBox="0 0 340 150"
          className="w-full max-w-[380px] mt-10"
          role="img"
          aria-label="Illustration of the daily allocation chart"
        >
          {columns.map((stack, i) => {
            const x = i * 48 + 4
            let y = 146
            return (
              <g key={i} opacity={0.42 + i * 0.055}>
                {stack.map((h, slot) => {
                  const height = h * 1.15
                  y -= height
                  const top = slot === stack.length - 1
                  return (
                    <rect
                      key={slot}
                      x={x}
                      y={y + 1}
                      width={26}
                      height={Math.max(2, height - 2)}
                      rx={top ? 4 : 1.5}
                      fill={`var(--s${slot + 1})`}
                    />
                  )
                })}
              </g>
            )
          })}
          <line x1="0" y1="147.5" x2="340" y2="147.5" stroke="var(--axis)" strokeWidth="1" />
        </svg>
      </div>

      <p className="relative text-[12px] text-ink-3 max-w-[42ch] leading-relaxed">
        Your data is stored on your device first and synced to your account so it follows you between devices. Nobody
        else can read it.
      </p>
    </aside>
  )
}

/* ── error copy ─────────────────────────────────────────────────────── */

function friendly(err) {
  const raw = String(err?.message || err || '')
  const m = raw.toLowerCase()
  if (m.includes('invalid login credentials')) return 'That email and password do not match an account.'
  if (m.includes('email not confirmed')) return 'Confirm your email first — check your inbox for the link.'
  if (m.includes('user already registered')) return 'There is already an account with that email. Try signing in.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Wait a minute and try again.'
  if (m.includes('password should be')) return 'That password is too short for this project’s policy.'
  if (m.includes('failed to fetch') || m.includes('networkerror')) return 'Could not reach the server. Check your connection.'
  return raw || 'Something went wrong. Try again.'
}
