import { useCallback, useEffect, useState } from 'react'
import { CATEGORIES } from './categories'
import { dayKey } from './dates'

const KEY = 'life-logger/entries/v1'

/**
 * Entry shape:
 * { id, day: 'YYYY-MM-DD', category: <category id>, activity, minutes, note, createdAt }
 */

const validCategories = new Set(CATEGORIES.map((c) => c.id))

function sanitise(raw) {
  if (!raw || typeof raw !== 'object') return null
  const minutes = Number(raw.minutes)
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  if (typeof raw.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.day)) return null
  return {
    id: typeof raw.id === 'string' ? raw.id : newId(),
    day: raw.day,
    category: validCategories.has(raw.category) ? raw.category : 'other',
    activity: String(raw.activity ?? '').slice(0, 120) || 'Untitled',
    minutes: Math.min(24 * 60, Math.round(minutes)),
    note: String(raw.note ?? '').slice(0, 500),
    createdAt: Number(raw.createdAt) || 0,
  }
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `e_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map(sanitise).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Entries live in localStorage — no account, no server, nothing to pay for.
 * Newest first so the list renders without re-sorting.
 */
export function useEntries() {
  const [entries, setEntries] = useState(read)
  const [error, setError] = useState(null)

  // Keep multiple open tabs in sync.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY) setEntries(read())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /**
   * Write-through: every mutation persists and updates state together, so a
   * failed write surfaces immediately instead of on a later render pass.
   */
  const commit = useCallback((next) => {
    const sorted = [...next].sort(byRecency)
    try {
      localStorage.setItem(KEY, JSON.stringify(sorted))
      setError(null)
    } catch {
      setError('Could not save — device storage is full.')
    }
    setEntries(sorted)
    return sorted
  }, [])

  const addEntry = useCallback(
    (draft) => {
      const entry = sanitise({ ...draft, id: newId(), createdAt: Date.now() })
      if (!entry) return false
      commit([entry, ...entries])
      return true
    },
    [commit, entries],
  )

  const removeEntry = useCallback(
    (id) => commit(entries.filter((e) => e.id !== id)),
    [commit, entries],
  )

  const replaceAll = useCallback(
    (raw) => {
      if (!Array.isArray(raw)) throw new Error('File does not contain a list of entries.')
      const clean = raw.map(sanitise).filter(Boolean)
      if (!clean.length) throw new Error('No valid entries found in that file.')
      commit(clean)
      return clean.length
    },
    [commit],
  )

  const clearAll = useCallback(() => commit([]), [commit])

  return { entries, error, addEntry, removeEntry, replaceAll, clearAll }
}

const byRecency = (a, b) => (a.day === b.day ? b.createdAt - a.createdAt : b.day < a.day ? -1 : 1)

export function exportEntries(entries) {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `life-logger-${dayKey()}.json`
  a.click()
  URL.revokeObjectURL(url)
}
