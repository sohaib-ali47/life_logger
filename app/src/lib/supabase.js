/* Supabase — client and auth.
 *
 * Accounts are optional. With no credentials configured the app is exactly
 * what it was: local-first, offline, nothing leaves the device. A missing
 * or malformed env var must degrade to "no accounts", never to a dead app —
 * an import-time throw here would take the whole bundle down before React
 * mounts, which reads as a black screen with no cause.
 */

import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

function validOrigin(value) {
  if (!value) return null
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.origin : null
  } catch {
    return null
  }
}

const url = validOrigin(rawUrl)

/* Name exactly which variable failed to arrive. "Sign-in is off" without
   saying why turns a two-minute dashboard fix into an afternoon of
   guessing — and the most common cause is a variable that exists but is
   not enabled for the Production environment, which looks identical to
   one that was never added. */
export let configError = null
if (!rawUrl && !anonKey) {
  configError =
    'Neither VITE_SUPABASE_URL nor VITE_SUPABASE_ANON_KEY reached this build. If they are set in your host, check they are enabled for the Production environment and redeploy without the build cache.'
} else if (rawUrl && !url) {
  configError = `VITE_SUPABASE_URL arrived but is not a valid URL: "${rawUrl}". It must be exactly https://your-ref.supabase.co — no quotes, no trailing slash, no spaces.`
} else if (url && !anonKey) {
  configError = 'VITE_SUPABASE_URL arrived but VITE_SUPABASE_ANON_KEY did not. Check the key name for a typo or a trailing space.'
} else if (!rawUrl && anonKey) {
  configError = 'VITE_SUPABASE_ANON_KEY arrived but VITE_SUPABASE_URL did not. Check the URL name for a typo or a trailing space.'
}

let client = null
if (url && anonKey) {
  try {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'life-os-auth',
      },
      global: { headers: { 'x-application-name': 'life-os' } },
    })
  } catch (err) {
    configError = `Supabase client could not start: ${err.message}`
    client = null
  }
}
if (configError) console.error('[life-os] accounts disabled —', configError)

export const supabase = client
export const isConfigured = Boolean(client)

/* ── session ────────────────────────────────────────────────────────── */

export async function currentSession() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  return error ? null : (data.session ?? null)
}

export function onAuthChange(handler) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((event, session) => handler(event, session))
  return () => data?.subscription?.unsubscribe()
}

/* ── the four ways in ───────────────────────────────────────────────── */

const need = () => {
  if (!supabase) throw new Error('Accounts are not configured on this build.')
}

/** Returns { needsConfirmation } — Supabase withholds a session until the
 *  address is confirmed, unless confirmation is turned off in the project. */
export async function signUp({ email, password, name }) {
  need()
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: name ? { full_name: name.trim() } : undefined,
      emailRedirectTo: `${window.location.origin}/`,
    },
  })
  if (error) throw error
  return { needsConfirmation: !data.session }
}

export async function signIn({ email, password }) {
  need()
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw error
}

export async function sendMagicLink(email) {
  need()
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: `${window.location.origin}/` },
  })
  if (error) throw error
}

export async function sendPasswordReset(email) {
  need()
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: `${window.location.origin}/`,
  })
  if (error) throw error
}

export async function updatePassword(password) {
  need()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}

/* ── redirect handling ──────────────────────────────────────────────── */

/* A confirmation, magic link or recovery link comes back with ?code= or
   #access_token=. The client consumes it; we then scrub the address bar so
   a bookmarked or shared URL never carries a live token. */
export async function consumeAuthRedirect() {
  if (!supabase) return { handled: false, recovery: false }

  const here = new URL(window.location.href)
  const hasCode = here.searchParams.has('code')
  const hasHashToken = window.location.hash.includes('access_token=')
  const recovery =
    here.searchParams.get('type') === 'recovery' || window.location.hash.includes('type=recovery')

  if (!hasCode && !hasHashToken) {
    const err = here.searchParams.get('error_description')
    return { handled: false, recovery: false, error: err ? decodeURIComponent(err) : null }
  }

  let error = null
  try {
    if (hasCode) await supabase.auth.exchangeCodeForSession(window.location.href)
  } catch (err) {
    error = err.message || 'That link has expired or was already used.'
  }

  here.search = ''
  here.hash = '#/today'
  window.history.replaceState({}, '', here.toString())
  return { handled: true, recovery, error }
}

/* ── validation shared with the auth screen ─────────────────────────── */

export const emailLooksValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value).trim())

export function passwordProblem(value) {
  const v = String(value ?? '')
  if (v.length < 8) return 'Use at least 8 characters.'
  if (!/[a-zA-Z]/.test(v) || !/[0-9]/.test(v)) return 'Mix in at least one letter and one number.'
  return null
}

/** 0–4, for the strength meter */
export function passwordScore(value) {
  const v = String(value ?? '')
  if (!v) return 0
  let score = 0
  if (v.length >= 8) score++
  if (v.length >= 14) score++
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++
  if (/[0-9]/.test(v) && /[^a-zA-Z0-9]/.test(v)) score++
  return Math.min(4, score)
}
