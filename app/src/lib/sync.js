/* Sync — local-first replication against Supabase.
 *
 * The contract:
 *   · IndexedDB is the source of truth for the UI. It is read on boot and
 *     written on every change. Sync never blocks an interaction.
 *   · Merging is last-write-wins on `updatedAt`, per record. A record the
 *     server has never seen is pushed; a record the server has a newer
 *     copy of overwrites the local one.
 *   · Deletes are tombstones, so "I deleted this" replicates like any
 *     other edit instead of being silently undone by the other device.
 *   · The cursor is the newest `updated_at` the last pull returned, minus
 *     a small overlap. Re-fetching a few rows is free; missing one
 *     because two writes shared a millisecond is not.
 *
 * Known limit, stated plainly: last-write-wins resolves by wall clock, so
 * two devices with badly skewed clocks can let an older edit win. For one
 * person moving between a phone and a laptop this is the right trade
 * against the complexity of per-field merging or a CRDT.
 */

import { supabase, isConfigured } from './supabase'
import * as db from './db'

const OVERLAP_MS = 2000

/* ── shape mapping ──────────────────────────────────────────────────── */

const SECTION_COLUMNS = new Set([
  'id', 'name', 'primitive', 'pillar', 'slot', 'order', 'archived',
  'createdAt', 'updatedAt', 'deletedAt',
])

function sectionToRow(section, userId) {
  const data = {}
  for (const [k, v] of Object.entries(section)) {
    if (!SECTION_COLUMNS.has(k)) data[k] = v
  }
  return {
    user_id: userId,
    id: section.id,
    name: section.name,
    primitive: section.primitive,
    pillar: section.pillar ?? null,
    slot: section.slot ?? null,
    sort_order: section.order ?? 0,
    archived: !!section.archived,
    data,
    created_at: section.createdAt ?? new Date().toISOString(),
    updated_at: section.updatedAt ?? new Date().toISOString(),
    deleted_at: section.deletedAt ?? null,
  }
}

function rowToSection(row) {
  return {
    ...row.data,
    id: row.id,
    name: row.name,
    primitive: row.primitive,
    pillar: row.pillar,
    slot: row.slot,
    order: row.sort_order,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

function entryToRow(entry, userId) {
  return {
    user_id: userId,
    id: entry.id,
    section_id: entry.sectionId,
    date: entry.date,
    value: Number(entry.value) || 0,
    at: entry.at ?? null,
    note: entry.note ?? '',
    meta: entry.meta ?? {},
    source: entry.source ?? 'manual',
    created_at: entry.createdAt ?? new Date().toISOString(),
    updated_at: entry.updatedAt ?? entry.createdAt ?? new Date().toISOString(),
    deleted_at: entry.deletedAt ?? null,
  }
}

function rowToEntry(row) {
  return {
    id: row.id,
    sectionId: row.section_id,
    date: row.date,
    value: row.value,
    at: row.at,
    note: row.note ?? '',
    meta: row.meta ?? {},
    source: row.source ?? 'manual',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

/* ── merge ──────────────────────────────────────────────────────────── */

const newer = (a, b) => new Date(a || 0).getTime() > new Date(b || 0).getTime()

/** returns { merged, changed } — `changed` is what the local store must adopt */
function mergeById(local, remote) {
  const byId = new Map(local.map((r) => [r.id, r]))
  const changed = []
  for (const r of remote) {
    const mine = byId.get(r.id)
    if (!mine || newer(r.updatedAt, mine.updatedAt)) {
      byId.set(r.id, r)
      changed.push(r)
    }
  }
  return { merged: [...byId.values()], changed }
}

/** everything the server has not seen, or has an older copy of */
function outbound(local, remote) {
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  return local.filter((mine) => {
    const theirs = remoteById.get(mine.id)
    return !theirs || newer(mine.updatedAt, theirs.updatedAt)
  })
}

/* ── transport ──────────────────────────────────────────────────────── */

const PAGE = 1000

async function pullAll(table, userId, since) {
  const rows = []
  let from = 0
  for (;;) {
    let q = supabase.from(table).select('*').eq('user_id', userId).order('updated_at', { ascending: true })
    if (since) q = q.gt('updated_at', since)
    const { data, error } = await q.range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

async function pushAll(table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: 'user_id,id' })
    if (error) throw error
  }
}

/* ── the run ────────────────────────────────────────────────────────── */

/**
 * @param {object} args
 * @param {string} args.userId
 * @param {Array}  args.sections  every local section, tombstones included
 * @param {Array}  args.entries   every local entry, tombstones included
 * @param {object} args.settings
 * @param {string|null} args.cursor  ISO stamp of the last successful pull
 * @returns {Promise<{sections, entries, settings, cursor, pulled, pushed}>}
 */
export async function runSync({ userId, sections, entries, settings, cursor }) {
  if (!isConfigured || !supabase || !userId) throw new Error('Sync is not available.')

  const since = cursor ? new Date(new Date(cursor).getTime() - OVERLAP_MS).toISOString() : null

  /* 1 — pull what changed since we last looked */
  const [remoteSectionRows, remoteEntryRows, settingsRes] = await Promise.all([
    pullAll('sections', userId, since),
    pullAll('entries', userId, since),
    supabase.from('settings').select('*').eq('user_id', userId).maybeSingle(),
  ])
  if (settingsRes.error) throw settingsRes.error

  const remoteSections = remoteSectionRows.map(rowToSection)
  const remoteEntries = remoteEntryRows.map(rowToEntry)

  /* 2 — merge into what we hold */
  const s = mergeById(sections, remoteSections)
  const e = mergeById(entries, remoteEntries)

  /* 3 — settings: whole-document last-write-wins */
  const remoteSettings = settingsRes.data
    ? { ...settingsRes.data.data, settingsUpdatedAt: settingsRes.data.updated_at }
    : null
  const localStamp = settings.settingsUpdatedAt ?? '1970-01-01T00:00:00.000Z'
  const useRemote = remoteSettings && newer(remoteSettings.settingsUpdatedAt, localStamp)
  const mergedSettings = useRemote ? { ...settings, ...remoteSettings } : settings

  /* 4 — push everything the server is behind on. Sections first: an
     entry referencing a section the server has never seen would arrive
     orphaned if the order were reversed. */
  const outSections = outbound(s.merged, remoteSections)
  const outEntries = outbound(e.merged, remoteEntries)

  if (outSections.length) await pushAll('sections', outSections.map((x) => sectionToRow(x, userId)))
  if (outEntries.length) await pushAll('entries', outEntries.map((x) => entryToRow(x, userId)))

  if (!useRemote) {
    const stamp = mergedSettings.settingsUpdatedAt ?? new Date().toISOString()
    const { error } = await supabase.from('settings').upsert(
      { user_id: userId, data: stripLocalOnly(mergedSettings), updated_at: stamp },
      { onConflict: 'user_id' }
    )
    if (error) throw error
  }

  /* 5 — write anything the server taught us straight to local storage */
  if (s.changed.length) await db.putMany(db.STORES.sections, s.changed)
  if (e.changed.length) await db.putMany(db.STORES.entries, e.changed)

  const stamps = [
    ...remoteSectionRows.map((r) => r.updated_at),
    ...remoteEntryRows.map((r) => r.updated_at),
  ]
  const nextCursor = stamps.length
    ? stamps.reduce((a, b) => (a > b ? a : b))
    : new Date().toISOString()

  return {
    sections: s.merged,
    entries: e.merged,
    settings: mergedSettings,
    cursor: nextCursor,
    pulled: s.changed.length + e.changed.length,
    pushed: outSections.length + outEntries.length,
  }
}

/* the running timer is per-device state; replicating it would start a
   timer on your laptop because you tapped one on your phone */
function stripLocalOnly(settings) {
  const { timer, ...rest } = settings
  void timer
  return rest
}
