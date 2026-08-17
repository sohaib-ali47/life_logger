/* Store — the single source of truth.
 *
 * Everything lives in memory (a few thousand records is nothing) and is
 * written through to IndexedDB. Screens read derived values from the
 * pure functions in stats.js; nothing computes inside a component body
 * that could be memoised here instead.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import * as db from './db'
import { seedSections, withDefaults, SECTIONS_VERSION, DEFAULT_IDS } from './sections'
import { configure, today, dayKeyFor, localStamp } from './dates'
import { generate } from './seed'
import { indexEntries, totalsByDay } from './stats'
import { supabase, isConfigured, currentSession, consumeAuthRedirect, signOut as sbSignOut } from './supabase'
import { runSync } from './sync'

const DEFAULT_SETTINGS = {
  theme: 'dark',
  dayBoundaryHour: 4,
  weekStartsMonday: true,
  scoreGoal: 80,
  seeded: false,
  sectionsVersion: 0,
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

    /* first open: seed a demo history so nothing is an empty state */
    if (!s.seeded && !ents.length) {
      ents = generate(90)
      await db.putMany(db.STORES.entries, ents)
      s.seeded = true
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
  const [session, setSession] = useState(null)
  const [syncState, setSyncState] = useState({ status: isConfigured ? 'idle' : 'off', at: null, error: null })
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

  /* ── cloud sync ───────────────────────────────────────────────── */

  /* the loop reads from a ref so it never runs against stale state */
  useEffect(() => {
    snapshotRef.current = { sections, entries, settings }
  }, [sections, entries, settings])

  /* a cheap fingerprint of local state — if it has not moved since the
     last run there is nothing to push, and re-running would loop */
  const lastSignature = useRef('')
  const signatureOf = useCallback((secs, ents) => {
    let newest = ''
    for (const r of ents) if (r.updatedAt > newest) newest = r.updatedAt
    for (const r of secs) if (r.updatedAt > newest) newest = r.updatedAt
    return `${secs.length}:${ents.length}:${newest}`
  }, [])

  const sync = useCallback(async ({ silent = true } = {}) => {
    const userId = session?.user?.id
    if (!isConfigured || !userId || syncing.current || !navigator.onLine) return null

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

      lastSignature.current = signatureOf(result.sections, result.entries)
      setSyncState({ status: 'ok', at: new Date().toISOString(), error: null })
      if (!silent) flashRef.current?.(`Synced — ${result.pushed} up, ${result.pulled} down.`)
      return result
    } catch (err) {
      console.error('Sync failed', err)
      setSyncState({ status: 'error', at: new Date().toISOString(), error: err.message || String(err) })
      if (!silent) flashRef.current?.(`Sync failed: ${err.message || err}`)
      return null
    } finally {
      syncing.current = false
    }
  }, [session, persistSettings, signatureOf])

  /* auth: pick up a magic-link redirect, then follow the session */
  useEffect(() => {
    if (!isConfigured) return
    let alive = true
    ;(async () => {
      await consumeAuthRedirect()
      const s = await currentSession()
      if (alive) setSession(s)
    })()
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => { alive = false; data?.subscription?.unsubscribe() }
  }, [])

  /* sync when signed in, when the tab comes back, and when the network does */
  useEffect(() => {
    if (!session || !ready) return
    sync()
    const onVisible = () => { if (document.visibilityState === 'visible') sync() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onVisible)
    }
  }, [session, ready, sync])

  /* and shortly after you stop making changes */
  useEffect(() => {
    if (!session || !ready) return
    const sig = signatureOf(sections, entries)
    if (sig === lastSignature.current) return
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => sync(), 4000)
    return () => clearTimeout(syncTimer.current)
  }, [sections, entries, session, ready, sync, signatureOf])

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

  const loadDemo = useCallback(async () => {
    const next = generate(90)
    await db.clear(db.STORES.entries)
    await db.putMany(db.STORES.entries, next)
    setEntries(next)
    flash(`${next.length} demo entries loaded across 90 days.`)
  }, [flash])

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
  const active = useMemo(() => sections.filter((s) => !s.archived), [sections])
  const live = useMemo(() => entries.filter((e) => !e.deletedAt), [entries])
  const idx = useMemo(() => indexEntries(entries), [entries])

  const totalsFor = useCallback((keys) => totalsByDay(active, idx, keys), [active, idx])

  const value = {
    ready, settings, sections, active, entries: live, allEntries: entries, idx, toast,
    setSetting: (k, v) => persistSettings({ ...settings, [k]: v }),
    persistSettings, flash, dismissToast: () => setToast(null),
    addEntry, updateEntry, deleteEntry, undoDelete, setEntryMeta,
    saveSection, archiveSection, createSection, addVariant, removeVariant, addExercise, freeSlot,
    startTimer, stopTimer, setDayClosed,
    isDayClosed: (k) => (settings.closedDays || []).includes(k),
    exportJSON, importJSON, loadDemo, wipeAll,
    totalsFor, today,
    /* cloud */
    syncAvailable: isConfigured,
    session,
    syncState,
    sync,
    signOut: async () => {
      await sbSignOut()
      await db.setMeta('syncCursor', null)
      setSession(null)
      setSyncState({ status: 'idle', at: null, error: null })
      flash('Signed out. Your data stays on this device.')
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
