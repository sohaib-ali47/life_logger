/* Supabase client.
 *
 * Cloud sync is optional. With no credentials the app is exactly what it
 * was — local-first, offline, nothing leaves the device — and every call
 * site here returns a null client that the sync layer knows to skip.
 * That is deliberate: a missing env var should degrade to "no sync",
 * never to a broken app.
 */

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const isConfigured = Boolean(url && anonKey)

export const supabase = isConfigured
  ? createClient(url, anonKey, {
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
  : null

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
