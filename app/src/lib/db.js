/* Storage — IndexedDB, wrapped thin.
 *
 * Records are written sync-ready from day one: a stable uuid, an
 * updatedAt stamp and a soft-delete tombstone. That is what a future
 * cloud sync needs, and retrofitting it later means rewriting history.
 *
 * Safari can evict a non-installed site's storage after ~7 days idle.
 * Installed to the Home Screen it is far safer — and the JSON export
 * exists because "far safer" is not "safe".
 */

const DB_NAME = 'life-os'
const DB_VERSION = 2
export const STORES = { meta: 'meta', sections: 'sections', entries: 'entries', plans: 'plans' }

let dbPromise = null

function open() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (ev) => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta)
      if (!db.objectStoreNames.contains(STORES.sections)) db.createObjectStore(STORES.sections, { keyPath: 'id' })
      /* Plans are intentions: what you said you would do, and when.
         Kept in their own store rather than as a flag on entries, because
         a plan that never happened is still a fact worth keeping — that
         gap is the whole point of comparing plan against actual. */
      if (!db.objectStoreNames.contains(STORES.plans)) {
        const s = db.createObjectStore(STORES.plans, { keyPath: 'id' })
        s.createIndex('date', 'date')
        s.createIndex('sectionId', 'sectionId')
      }
      if (!db.objectStoreNames.contains(STORES.entries)) {
        const s = db.createObjectStore(STORES.entries, { keyPath: 'id' })
        s.createIndex('date', 'date')
        s.createIndex('sectionId', 'sectionId')
      }
      void ev
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(store, mode)
        const s = t.objectStore(store)
        let result
        try {
          result = fn(s)
        } catch (err) {
          reject(err)
          return
        }
        t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : result)
        t.onerror = () => reject(t.error)
        t.onabort = () => reject(t.error)
      })
  )
}

export const getAll = (store) =>
  tx(store, 'readonly', (s) => s.getAll()).then((r) => r || [])

export const put = (store, value, key) =>
  tx(store, 'readwrite', (s) => (key === undefined ? s.put(value) : s.put(value, key)))

export const putMany = (store, values) =>
  tx(store, 'readwrite', (s) => { values.forEach((v) => s.put(v)); return values.length })

export const del = (store, key) => tx(store, 'readwrite', (s) => s.delete(key))

export const clear = (store) => tx(store, 'readwrite', (s) => s.clear())

export const getMeta = (key) => tx(STORES.meta, 'readonly', (s) => s.get(key))

export const setMeta = (key, value) => tx(STORES.meta, 'readwrite', (s) => s.put(value, key))

export const wipe = () =>
  Promise.all([clear(STORES.entries), clear(STORES.sections), clear(STORES.plans), clear(STORES.meta)])

/* ── record helpers ─────────────────────────────────────────────────── */

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export const stamp = () => new Date().toISOString()

export function newEntry(patch) {
  return {
    id: uid(),
    sectionId: patch.sectionId,
    date: patch.date,
    value: Number(patch.value) || 0,
    at: patch.at || null,
    note: patch.note || '',
    meta: patch.meta || {},
    source: patch.source || 'manual',
    createdAt: stamp(),
    updatedAt: stamp(),
    deletedAt: null,
  }
}

export function newPlan(patch) {
  return {
    id: uid(),
    sectionId: patch.sectionId,
    variantId: patch.variantId ?? null,
    date: patch.date,
    startMin: Math.max(0, Math.round(patch.startMin ?? 0)),
    minutes: Math.max(5, Math.round(patch.minutes ?? 30)),
    title: patch.title ?? '',
    remindBefore: patch.remindBefore ?? 5,   /* minutes before it starts */
    createdAt: stamp(),
    updatedAt: stamp(),
    deletedAt: null,
  }
}
