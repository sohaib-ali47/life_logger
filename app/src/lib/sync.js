/* Sync — local-first replication against Supabase.
 *
 * The contract:
 *   · IndexedDB is the source of truth for the UI. It is read on boot and
 *     written on every change. Sync never blocks an interaction.
 *   · Merging is last-write-wins on `updatedAt`, per record.
 *   · Deletes are tombstones, so "I deleted this" replicates like any other
 *     edit instead of being silently undone by the other device.
 *   · The cursor is the newest `updated_at` the last pull returned, less a
 *     small overlap. Re-fetching a few rows is free; missing one because
 *     two writes shared a millisecond is not.
 *
 * Known limit, stated plainly: last-write-wins resolves by wall clock, so
 * two devices with badly skewed clocks can let an older edit win. For one
 * person moving between a phone and a laptop that is the right trade
 * against per-field merging or a CRDT.
 */

import { supabase, isConfigured } from './supabase'
import * as db from './db'

const OVERLAP_MS = 2000
const PAGE = 1000

/* ── shape mapping ──────────────────────────────────────────────────── */

const SECTION_COLUMNS = new Set([
  'id', 'name', 'primitive', 'pillar', 'slot', 'order', 'archived',
  'createdAt', 'updatedAt', 'deletedAt',
])

function sectionToRow(section, userId) {
  const data = {}
  for (const [k, v] of Object.entries(section)) if (!SECTION_COLUMNS.has(k)) data[k] = v
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

const rowToSection = (row) => ({
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
})

const entryToRow = (entry, userId) => ({
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
})

const rowToEntry = (row) => ({
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
})

/* ── merge ──────────────────────────────────────────────────────────── */

const newer = (a, b) => new Date(a || 0).getTime() > new Date(b || 0).getTime()

function mergeById(local, remote) {
  const byId = new Map(local.map((r) => [r.id, r]))
  const adopted = []
  for (const r of remote) {
    const mine = byId.get(r.id)
    if (!mine || newer(r.updatedAt, mine.updatedAt)) {
      byId.set(r.id, r)
      adopted.push(r)
    }
  }
  return { merged: [...byId.values()], adopted }
}

/** Everything the server has not seen, or holds an older copy of.
 *  Demo entries are never uploaded — sample data is a local sandbox, and
 *  pushing it would pollute a real account's history. */
function outbound(local, remote) {
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  return local.filter((mine) => {
    if (mine.source === 'demo') return false
    const theirs = remoteById.get(mine.id)
    return !theirs || newer(mine.updatedAt, theirs.updatedAt)
  })
}

/** the running timer is per-device; replicating it would start a timer on
    your laptop because you tapped one on your phone */
function shareable(settings) {
  const { timer, ...rest } = settings
  void timer
  return rest
}

/* ── transport ──────────────────────────────────────────────────────── */

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
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict: 'user_id,id' })
    if (error) throw error
  }
}

/* ── the run ────────────────────────────────────────────────────────── */

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
  const takeRemote = remoteSettings && newer(remoteSettings.settingsUpdatedAt, localStamp)
  const mergedSettings = takeRemote ? { ...settings, ...remoteSettings } : settings

  /* 4 — adopt locally before pushing, so a failed push never loses what we
     just learned */
  if (s.adopted.length) await db.putMany(db.STORES.sections, s.adopted)
  if (e.adopted.length) await db.putMany(db.STORES.entries, e.adopted)

  /* 5 — push. Sections first: an entry referencing a section the server has
     never seen would arrive orphaned the other way round. */
  const outSections = outbound(s.merged, remoteSections)
  const outEntries = outbound(e.merged, remoteEntries)

  if (outSections.length) await pushAll('sections', outSections.map((x) => sectionToRow(x, userId)))
  if (outEntries.length) await pushAll('entries', outEntries.map((x) => entryToRow(x, userId)))

  if (!takeRemote) {
    const stamp = mergedSettings.settingsUpdatedAt ?? new Date().toISOString()
    const { error } = await supabase
      .from('settings')
      .upsert({ user_id: userId, data: shareable(mergedSettings), updated_at: stamp }, { onConflict: 'user_id' })
    if (error) throw error
  }

  const stamps = [
    ...remoteSectionRows.map((r) => r.updated_at),
    ...remoteEntryRows.map((r) => r.updated_at),
  ]
  const nextCursor = stamps.length ? stamps.reduce((a, b) => (a > b ? a : b)) : new Date().toISOString()

  return {
    sections: s.merged,
    entries: e.merged,
    settings: mergedSettings,
    cursor: nextCursor,
    pulled: s.adopted.length + e.adopted.length,
    pushed: outSections.length + outEntries.length,
  }
}
