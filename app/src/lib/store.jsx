/* Store — the single source of truth.
 *
 * Everything lives in memory (a few thousand records is nothing) and is
 * written through to IndexedDB. Screens read derived values from the
 * pure functions in stats.js; nothing computes inside a component body
 * that could be memoised here instead.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import * as db from './db'
import { seedSections, withDefaults, SECTIONS_VERSION, DEFAULT_IDS, suitsAudience } from './sections'
import { configure, today, dayKeyFor, localStamp } from './dates'
import { generate } from './seed'
import { indexEntries, totalsByDay } from './stats'
import {
  isConfigured, currentSession, onAuthChange, consumeAuthRedirect, signOut as authSignOut,
} from './supabase'
import { runSync } from './sync'

const DEFAULT_SETTINGS = {
  theme: 'dark',
  dayBoundaryHour: 4,
  weekStartsMonday: true,
  scoreGoal: 80,
  sectionsVersion: 0,
  autoSync: false,
  guest: false,
  onboarded: false,
  sex: null,          /* 'male' | 'female' | 'unspecified' — scopes sections */
  timer: null,
  closedDays: [],
}

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

/* StrictMode runs effects twice in development. Sharing one boot promise
   keeps the second pass from reading a pre-seed snapshot and writing the
   demo history a second time. */
let bootPromise = null
function bootOnce() {
  bootPromise ||= (async () => {
    const [savedSettings, savedSections, savedEntries] = await Promise.all([
      db.getMeta('settings'),
      db.getAll(db.STORES.sections),
      db.getAll(db.STORES.entries),
    ])

    const s = { ...DEFAULT_SETTINGS, ...(savedSettings || {}) }
    configure(s)

    let secs = savedSections?.length ? savedSections : seedSections()
    let ents = savedEntries || []
    let settingsDirty = false

    if (!savedSections?.length) await db.putMany(db.STORES.sections, secs)

    /* The shipped sections changed shape since this device last opened
       the app. Refresh the built-in ones, keep anything the user made,
       and — only if every entry is demo data — regenerate the demo so
       the new sections are not sitting empty. Real entries are never
       touched by this. */
    if (savedSections?.length && s.sectionsVersion !== SECTIONS_VERSION) {
      const mine = savedSections.filter((x) => !DEFAULT_IDS.has(x.id))
      secs = [...seedSections(), ...mine]
      await db.clear(db.STORES.sections)
      await db.putMany(db.STORES.sections, secs)

      const allDemo = ents.length > 0 && ents.every((e) => e.source === 'demo')
      if (allDemo) {
        ents = generate(90)
        await db.clear(db.STORES.entries)
        await db.putMany(db.STORES.entries, ents)
      }
      s.sectionsVersion = SECTIONS_VERSION
      settingsDirty = true
    }

    /* Nothing is seeded automatically any more. A new account opens on a
       genuinely empty app — the sample history is a button in Setup, and
       demo entries are never uploaded. */
    if (s.sectionsVersion !== SECTIONS_VERSION) {
      s.sectionsVersion = SECTIONS_VERSION
      settingsDirty = true
    }

    if (settingsDirty) await db.setMeta('settings', s)

    return { settings: s, sections: secs, entries: ents }
  })()
  return bootPromise
}

export function AppProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [sections, setSections] = useState([])
  const [entries, setEntries] = useState([])
  const [toast, setToast] = useState(null)
  const [auth, setAuth] = useState({ ready: !isConfigured, session: null, recovery: false, notice: null })
  const [syncState, setSyncState] = useState({ status: 'idle', at: null, error: null })
  const lastDeleted = useRef(null)
  const toastTimer = useRef(null)
  const syncTimer = useRef(null)
  const syncing = useRef(false)
  const flashRef = useRef(null)
  /* the sync loop reads this rather than closing over stale state */
  const snapshotRef = useRef({ sections: [], entries: [], settings: DEFAULT_SETTINGS })

  configure(settings)

  /* ── boot ─────────────────────────────────────────────────────── */
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const boot = await bootOnce()
        if (!alive) return
        setSettings(boot.settings)
        setSections([...boot.sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
        setEntries(boot.entries)
      } catch (err) {
        console.error('Storage unavailable — running in memory only.', err)
        if (!alive) return
        setSections(seedSections())
        setEntries(generate(90))
      } finally {
        if (alive) setReady(true)
      }
    })()
    return () => { alive = false }
  }, [])

  /* ── theme ────────────────────────────────────────────────────── */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', settings.theme === 'dark' ? '#0d0d0d' : '#f9f9f7')
  }, [settings.theme])

  /* ── helpers ──────────────────────────────────────────────────── */
  const persistSettings = useCallback((next, { touch = true } = {}) => {
    const stamped = touch ? { ...next, settingsUpdatedAt: db.stamp() } : next
    setSettings(stamped)
    configure(stamped)
    db.setMeta('settings', stamped).catch(() => {})
  }, [])

  const flash = useCallback((message, action) => {
    clearTimeout(toastTimer.current)
    setToast({ message, action, at: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 5500)
  }, [])

  /* ── accounts and sync ────────────────────────────────────────── */

  /* the sync run reads from a ref so it never works against stale state */
  useEffect(() => {
    snapshotRef.current = { sections, entries, settings }
  }, [sections, entries, settings])

  /* Pick up a confirmation, magic link or recovery redirect, then follow
     the session for the rest of the app's life. */
  useEffect(() => {
    if (!isConfigured) return
    let alive = true
    ;(async () => {
      const redirect = await consumeAuthRedirect()
      const session = await currentSession()
      if (!alive) return
      setAuth({
        ready: true,
        session,
        recovery: !!redirect.recovery,
        notice: redirect.error ?? null,
      })
    })()

    const stop = onAuthChange((event, session) => {
      if (!alive) return
      setAuth((a) => ({
        ...a,
        ready: true,
        session,
        recovery: event === 'PASSWORD_RECOVERY' ? true : a.recovery,
        notice: null,
      }))
      if (event === 'SIGNED_OUT') setSyncState({ status: 'idle', at: null, error: null })
    })
    return () => { alive = false; stop() }
  }, [])

  const sync = useCallback(async ({ silent = false } = {}) => {
    const userId = auth.session?.user?.id
    if (!isConfigured || !userId || syncing.current) return null
    if (!navigator.onLine) {
      setSyncState((s) => ({ ...s, status: 'error', error: 'You are offline.' }))
      return null
    }

    syncing.current = true
    setSyncState((s) => ({ ...s, status: 'syncing', error: null }))
    try {
      const cursor = await db.getMeta('syncCursor')
      const snapshot = snapshotRef.current
      const result = await runSync({
        userId,
        sections: snapshot.sections,
        entries: snapshot.entries,
        settings: snapshot.settings,
        cursor: cursor ?? null,
      })

      await db.setMeta('syncCursor', result.cursor)
      setSections([...result.sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
      setEntries(result.entries)
      if (result.settings !== snapshot.settings) persistSettings(result.settings, { touch: false })

      const at = new Date().toISOString()
      setSyncState({ status: 'ok', at, error: null })
      if (!silent) {
        flashRef.current?.(
          result.pulled || result.pushed
            ? `Synced — ${result.pushed} up, ${result.pulled} down.`
            : 'Synced. Nothing to change.'
        )
      }
      return result
    } catch (err) {
      console.error('Sync failed', err)
      setSyncState({ status: 'error', at: new Date().toISOString(), error: err.message || String(err) })
      if (!silent) flashRef.current?.(`Sync failed: ${err.message || err}`)
      return null
    } finally {
      syncing.current = false
    }
  }, [auth.session, persistSettings])

  /* One sync on sign-in, because arriving on a new device to an empty app
     would be absurd. Everything beyond that is opt-in.
     Demo entries are cleared first: they were never uploaded, and a real
     account should not open onto somebody else's fictional history. */
  const signedInFor = useRef(null)
  const [bootstrapping, setBootstrapping] = useState(false)

  useEffect(() => {
    const uid = auth.session?.user?.id
    if (!ready || !uid || signedInFor.current === uid) return
    signedInFor.current = uid

    let alive = true
    ;(async () => {
      const snapshot = snapshotRef.current
      const demoOnly = snapshot.entries.length > 0 && snapshot.entries.every((e) => e.source === 'demo')
      if (demoOnly) {
        await db.clear(db.STORES.entries)
        if (!alive) return
        setEntries([])
        snapshotRef.current = { ...snapshotRef.current, entries: [] }
      }
      const fresh = !(await db.getMeta('syncCursor'))
      if (fresh && alive) setBootstrapping(true)
      await sync({ silent: true })
      if (alive) setBootstrapping(false)
    })()
    return () => { alive = false }
  }, [ready, auth.session, sync])

  /* Background syncing is off by default — you asked for nothing happening
     behind your back. Turn it on in Setup and it also runs on focus, on
     reconnect, and a few seconds after you stop editing. */
  useEffect(() => {
    if (!settings.autoSync || !auth.session || !ready) return
    const run = () => { if (document.visibilityState === 'visible') sync({ silent: true }) }
    document.addEventListener('visibilitychange', run)
    window.addEventListener('online', run)
    return () => {
      document.removeEventListener('visibilitychange', run)
      window.removeEventListener('online', run)
    }
  }, [settings.autoSync, auth.session, ready, sync])

  useEffect(() => {
    if (!settings.autoSync || !auth.session || !ready) return
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => sync({ silent: true }), 5000)
    return () => clearTimeout(syncTimer.current)
  }, [sections, entries, settings.autoSync, auth.session, ready, sync])

  const signOut = useCallback(async () => {
    await authSignOut()
    await db.setMeta('syncCursor', null)
    signedInFor.current = null
    flashRef.current?.('Signed out. Your data stays on this device.')
  }, [])

  const continueAsGuest = useCallback(() => {
    persistSettings({ ...snapshotRef.current.settings, guest: true })
  }, [persistSettings])

  const clearRecovery = useCallback(() => setAuth((a) => ({ ...a, recovery: false })), [])

  flashRef.current = flash

  /* ── entry actions ────────────────────────────────────────────── */
  const addEntry = useCallback((patch) => {
    const section = sections.find((s) => s.id === patch.sectionId)
    const rec = db.newEntry(patch)

    setEntries((prev) => {
      /* one-a-day primitives overwrite rather than accumulate */
      if (section && ['scale', 'measure', 'check'].includes(section.primitive)) {
        const existing = prev.find(
          (e) => e.sectionId === rec.sectionId && e.date === rec.date && !e.deletedAt
        )
        if (existing) {
          const updated = { ...existing, value: rec.value, note: rec.note || existing.note, updatedAt: db.stamp() }
          db.put(db.STORES.entries, updated).catch(() => {})
          return prev.map((e) => (e.id === existing.id ? updated : e))
        }
      }
      db.put(db.STORES.entries, rec).catch(() => {})
      return [...prev, rec]
    })
    return rec
  }, [sections])

  const updateEntry = useCallback((id, patch) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        const next = { ...e, ...patch, updatedAt: db.stamp() }
        db.put(db.STORES.entries, next).catch(() => {})
        return next
      })
    )
  }, [])

  const deleteEntry = useCallback((id) => {
    lastDeleted.current = id
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        const next = { ...e, deletedAt: db.stamp(), updatedAt: db.stamp() }
        db.put(db.STORES.entries, next).catch(() => {})
        return next
      })
    )
    flash('Entry deleted.', { label: 'Undo', run: undoDelete })
  }, [flash])

  const undoDelete = useCallback(() => {
    const id = lastDeleted.current
    if (!id) return
    lastDeleted.current = null
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        const next = { ...e, deletedAt: null, updatedAt: db.stamp() }
        db.put(db.STORES.entries, next).catch(() => {})
        return next
      })
    )
    setToast(null)
  }, [])

  /* ── section actions ──────────────────────────────────────────── */
  const saveSection = useCallback((patch) => {
    setSections((prev) => {
      const existing = prev.find((s) => s.id === patch.id)
      const next = existing
        ? { ...existing, ...patch, updatedAt: db.stamp() }
        : withDefaults({ ...patch, createdAt: db.stamp(), updatedAt: db.stamp() }, prev.length)
      db.put(db.STORES.sections, next).catch(() => {})
      return existing ? prev.map((s) => (s.id === next.id ? next : s)) : [...prev, next]
    })
  }, [])

  const archiveSection = useCallback((id, archived = true) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s
        const next = { ...s, archived, updatedAt: db.stamp() }
        db.put(db.STORES.sections, next).catch(() => {})
        return next
      })
    )
  }, [])

  /* ── timer ────────────────────────────────────────────────────── */
  const startTimer = useCallback((sectionId, variantId = null) => {
    persistSettings({
      ...settings,
      timer: { sectionId, variantId, startedAt: new Date().toISOString() },
    })
  }, [settings, persistSettings])

  const stopTimer = useCallback((discard = false) => {
    const t = settings.timer
    persistSettings({ ...settings, timer: null })
    if (!t || discard) return null
    const start = new Date(t.startedAt)
    const minutes = Math.max(1, Math.round((Date.now() - start.getTime()) / 60000))
    const rec = addEntry({
      sectionId: t.sectionId,
      date: dayKeyFor(start),
      value: minutes,
      at: localStamp(start),
      meta: t.variantId ? { variant: t.variantId } : {},
      source: 'timer',
    })
    return { rec, minutes }
  }, [settings, persistSettings, addEntry])

  /* ── follow-ups: answer a question about an entry after the fact ── */
  const setEntryMeta = useCallback((id, patch) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id) return e
        const next = { ...e, meta: { ...(e.meta || {}), ...patch }, updatedAt: db.stamp() }
        db.put(db.STORES.entries, next).catch(() => {})
        return next
      })
    )
  }, [])

  /* ── creating a tracker from anywhere in the app ────────────────── */

  /* pick the least-used palette slot so a new tracker never lands on the
     same colour as the one next to it */
  const freeSlot = useCallback(() => {
    const used = new Array(9).fill(0)
    for (const s of sections) if (s.slot >= 1 && s.slot <= 8) used[s.slot]++
    let best = 1
    for (let i = 1; i <= 8; i++) if (used[i] < used[best]) best = i
    return best
  }, [sections])

  const createSection = useCallback((patch) => {
    const name = String(patch.name || '').trim()
    if (!name) return null
    let id = patch.id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (!id) id = `s${Date.now().toString(36)}`
    if (sections.some((s) => s.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`

    const next = withDefaults(
      { slot: freeSlot(), ...patch, id, name, createdAt: db.stamp(), updatedAt: db.stamp() },
      sections.length
    )
    db.put(db.STORES.sections, next).catch(() => {})
    setSections((prev) => [...prev, next])
    return next
  }, [sections, freeSlot])

  /* ── variants: the user's own projects, skills, meals, prayers ──── */
  const addVariant = useCallback((sectionId, name) => {
    const clean = String(name).trim()
    if (!clean) return null
    const id = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `v${Date.now().toString(36)}`
    let created = null
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        if ((s.variants || []).some((v) => v.id === id)) { created = id; return s }
        created = id
        const next = { ...s, variants: [...(s.variants || []), { id, name: clean }], updatedAt: db.stamp() }
        db.put(db.STORES.sections, next).catch(() => {})
        return next
      })
    )
    return id
  }, [])

  const removeVariant = useCallback((sectionId, variantId) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        const next = { ...s, variants: (s.variants || []).filter((v) => v.id !== variantId), updatedAt: db.stamp() }
        db.put(db.STORES.sections, next).catch(() => {})
        return next
      })
    )
  }, [])

  /* the exercise library a session section autocompletes from */
  const addExercise = useCallback((sectionId, name) => {
    const clean = String(name).trim()
    if (!clean) return
    setSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s
        const list = s.exercises || []
        if (list.some((x) => x.toLowerCase() === clean.toLowerCase())) return s
        const next = { ...s, exercises: [...list, clean], updatedAt: db.stamp() }
        db.put(db.STORES.sections, next).catch(() => {})
        return next
      })
    )
  }, [])

  /* ── day close ────────────────────────────────────────────────── */
  const setDayClosed = useCallback((key, closed) => {
    const set = new Set(settings.closedDays || [])
    if (closed) set.add(key)
    else set.delete(key)
    persistSettings({ ...settings, closedDays: [...set] })
  }, [settings, persistSettings])

  /* ── data ─────────────────────────────────────────────────────── */
  const exportJSON = useCallback(
    () =>
      JSON.stringify(
        { app: 'life-os', version: 1, exportedAt: new Date().toISOString(), settings, sections, entries },
        null,
        2
      ),
    [settings, sections, entries]
  )

  const importJSON = useCallback(async (text, mode = 'replace') => {
    const raw = JSON.parse(text)
    if (!raw || !Array.isArray(raw.entries)) throw new Error('Not a Life OS backup.')
    const incomingSections = (raw.sections || []).map((s, i) => withDefaults(s, i))
    if (mode === 'merge') {
      const seen = new Set(entries.map((e) => e.id))
      const merged = [...entries, ...raw.entries.filter((e) => !seen.has(e.id))]
      await db.putMany(db.STORES.entries, raw.entries)
      setEntries(merged)
    } else {
      await db.clear(db.STORES.entries)
      await db.putMany(db.STORES.entries, raw.entries)
      setEntries(raw.entries)
      if (incomingSections.length) {
        await db.clear(db.STORES.sections)
        await db.putMany(db.STORES.sections, incomingSections)
        setSections(incomingSections)
      }
    }
    return raw.entries.length
  }, [entries])

  const loadDemo = useCallback(async ({ silent = false } = {}) => {
    const next = generate(90)
    await db.clear(db.STORES.entries)
    await db.putMany(db.STORES.entries, next)
    setEntries(next)
    if (!silent) flash(`${next.length} sample entries loaded across 90 days. They never leave this device.`)
  }, [flash])

  /* Drop sample entries without touching anything you actually logged.
     "Start empty" has to mean empty even on a device that was demoing. */
  const clearDemo = useCallback(async () => {
    const keep = snapshotRef.current.entries.filter((e) => e.source !== 'demo')
    if (keep.length === snapshotRef.current.entries.length) return 0
    const removed = snapshotRef.current.entries.length - keep.length
    await db.clear(db.STORES.entries)
    if (keep.length) await db.putMany(db.STORES.entries, keep)
    setEntries(keep)
    return removed
  }, [])

  const wipeAll = useCallback(async () => {
    await db.wipe()
    const secs = seedSections()
    await db.putMany(db.STORES.sections, secs)
    const s = { ...DEFAULT_SETTINGS, seeded: true, theme: settings.theme }
    await db.setMeta('settings', s)
    setEntries([])
    setSections(secs)
    setSettings(s)
    flash('Everything erased.')
  }, [settings.theme, flash])

  /* ── derived ──────────────────────────────────────────────────── */

  /* `visible` is everything that applies to you, archived or not — what
     Setup lists. `active` is what is actually on the Today screen. */
  const visible = useMemo(
    () => sections.filter((s) => suitsAudience(s, settings.sex)),
    [sections, settings.sex]
  )
  const active = useMemo(() => visible.filter((s) => !s.archived), [visible])
  const live = useMemo(() => entries.filter((e) => !e.deletedAt), [entries])
  const idx = useMemo(() => indexEntries(entries), [entries])

  const totalsFor = useCallback((keys) => totalsByDay(active, idx, keys), [active, idx])

  const value = {
    ready, settings, sections, visible, active, entries: live, allEntries: entries, idx, toast,
    bootstrapping,
    setSetting: (k, v) => persistSettings({ ...settings, [k]: v }),
    persistSettings, flash, dismissToast: () => setToast(null),
    addEntry, updateEntry, deleteEntry, undoDelete, setEntryMeta,
    saveSection, archiveSection, createSection, addVariant, removeVariant, addExercise, freeSlot,
    startTimer, stopTimer, setDayClosed,
    isDayClosed: (k) => (settings.closedDays || []).includes(k),
    exportJSON, importJSON, loadDemo, clearDemo, wipeAll,
    totalsFor, today,
    /* accounts and sync */
    accountsEnabled: isConfigured,
    auth,
    session: auth.session,
    user: auth.session?.user ?? null,
    syncState,
    sync, signOut, continueAsGuest, clearRecovery,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
