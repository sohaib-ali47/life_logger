/* Supabase client.
 *
 * Cloud sync is optional. With no credentials the app is exactly what it
 * was — local-first, offline, nothing leaves the device — and every call
 * site here returns a null client that the sync layer knows to skip.
 * That is deliberate: a missing env var should degrade to "no sync",
 * never to a broken app.
 */

import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

/* A malformed URL makes createClient throw at import time, which kills the
   whole bundle before React mounts — a black screen with no clue why. So
   the URL is validated first, and construction is guarded. A bad env var
   must degrade to "no sync", never to a dead app. */
function validUrl(value) {
  if (!value) return null
  try {
    const u = new URL(value)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return u.origin
  } catch {
    return null
  }
}

const url = validUrl(rawUrl)

export let configError = null
if (rawUrl && !url) {
  configError = `VITE_SUPABASE_URL is not a valid URL ("${rawUrl}"). It should look like https://your-ref.supabase.co`
} else if (url && !anonKey) {
  configError = 'VITE_SUPABASE_URL is set but VITE_SUPABASE_ANON_KEY is missing.'
} else if (!url && anonKey) {
  configError = 'VITE_SUPABASE_ANON_KEY is set but VITE_SUPABASE_URL is missing.'
}

let client = null
if (url && anonKey) {
  try {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // the magic link lands back on the app with the token in the URL
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
if (configError) console.error('[life-os] sync disabled —', configError)

export const supabase = client
export const isConfigured = Boolean(client)

export async function currentSession() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) return null
  return data.session ?? null
}

export async function signInWithEmail(email) {
  if (!supabase) throw new Error('Sync is not configured on this build.')
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}

/* The magic link returns with ?code= or #access_token= in the URL. The
   client consumes it, and we scrub the address bar so a shared or
   bookmarked link never carries a live token. */
export async function consumeAuthRedirect() {
  if (!supabase) return false
  const url = new URL(window.location.href)
  const hasCode = url.searchParams.has('code')
  const hasHashToken = window.location.hash.includes('access_token=')
  if (!hasCode && !hasHashToken) return false

  try {
    if (hasCode) await supabase.auth.exchangeCodeForSession(window.location.href)
  } catch {
    /* an expired or already-used link — the sign-in card will say so */
  }

  url.search = ''
  if (hasHashToken) url.hash = '#/today'
  window.history.replaceState({}, '', url.toString())
  return true
}
