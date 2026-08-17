/* Vault — manual, end-to-end encrypted sync.
 *
 * You type the same passphrase on your phone and your laptop. From it the
 * app derives two things under different salts:
 *
 *   · an AES-GCM key, which never leaves the device
 *   · a vault id, which is all the server ever sees
 *
 * The server therefore stores ciphertext it cannot read, addressed by an
 * id that reveals nothing about the key. No account, no email, no session
 * to expire.
 *
 * Sync is manual on purpose. You press the button, it pulls, merges and
 * pushes. Nothing happens behind your back.
 *
 * Two things to be clear about:
 *   · Lose the passphrase and the data in the vault is unrecoverable.
 *     There is no reset link, because there is nobody holding a key.
 *   · If two devices push at the same moment, the later write wins the
 *     whole document. Manual sync makes that vanishingly unlikely, but it
 *     is not impossible, so the local JSON export stays the real backup.
 */

import * as db from './db'

const ITERATIONS = 250_000
const KEY_SALT = 'life-os/vault-key/v1'
const ID_SALT = 'life-os/vault-id/v1'
const ENDPOINT = '/api/sync'

const enc = new TextEncoder()
const dec = new TextDecoder()

export const cryptoAvailable = () =>
  typeof globalThis.crypto?.subtle?.deriveKey === 'function'

/* ── key derivation ─────────────────────────────────────────────────── */

async function baseKey(passphrase) {
  return crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveBits', 'deriveKey'])
}

const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

/** { key, id } — the id is safe to send, the key never is */
export async function derive(passphrase) {
  if (!cryptoAvailable()) throw new Error('This browser cannot encrypt — sync needs a secure (https) page.')
  const base = await baseKey(passphrase)

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(KEY_SALT), iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )

  const idBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(ID_SALT), iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    256
  )

  return { key, id: hex(idBits) }
}

/* ── payload crypto ─────────────────────────────────────────────────── */

const toB64 = (bytes) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

async function seal(key, object) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const body = enc.encode(JSON.stringify(object))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, body)
  const out = new Uint8Array(iv.length + cipher.byteLength)
  out.set(iv, 0)
  out.set(new Uint8Array(cipher), iv.length)
  return toB64(out)
}

async function open(key, payload) {
  const bytes = fromB64(payload)
  const iv = bytes.slice(0, 12)
  const cipher = bytes.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
  return JSON.parse(dec.decode(plain))
}

/* ── merge ──────────────────────────────────────────────────────────── */

const newer = (a, b) => new Date(a || 0).getTime() > new Date(b || 0).getTime()

/** last-write-wins per record; returns { merged, adopted } */
function mergeById(local, remote) {
  const byId = new Map(local.map((r) => [r.id, r]))
  const adopted = []
  for (const r of remote || []) {
    const mine = byId.get(r.id)
    if (!mine || newer(r.updatedAt, mine.updatedAt)) {
      byId.set(r.id, r)
      adopted.push(r)
    }
  }
  return { merged: [...byId.values()], adopted }
}

/** the running timer is per-device; replicating it would start a timer on
    your laptop because you tapped one on your phone */
function shareableSettings(settings) {
  const { timer, ...rest } = settings
  void timer
  return rest
}

/* ── transport ──────────────────────────────────────────────────────── */

async function fetchVault(id) {
  const res = await fetch(`${ENDPOINT}?id=${id}`, { method: 'GET', cache: 'no-store' })
  if (res.status === 404) return null
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Read failed (${res.status})`)
  return res.json()
}

async function storeVault(id, payload) {
  const res = await fetch(`${ENDPOINT}?id=${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Write failed (${res.status})`)
  return res.json()
}

/* ── the run ────────────────────────────────────────────────────────── */

/**
 * Pull, merge, push. Called only when you press the button.
 *
 * @returns {Promise<{sections, entries, settings, pulled, pushed, remoteAt}>}
 */
export async function syncVault({ key, id, sections, entries, settings }) {
  const remoteDoc = await fetchVault(id)

  let remote = null
  if (remoteDoc?.payload) {
    try {
      remote = await open(key, remoteDoc.payload)
    } catch {
      throw new Error('That passphrase does not match the vault on the server.')
    }
  }

  const s = mergeById(sections, remote?.sections)
  const e = mergeById(entries, remote?.entries)

  /* settings: whole-document last-write-wins */
  const localStamp = settings.settingsUpdatedAt ?? '1970-01-01T00:00:00.000Z'
  const remoteStamp = remote?.settings?.settingsUpdatedAt ?? null
  const takeRemote = remoteStamp && newer(remoteStamp, localStamp)
  const mergedSettings = takeRemote ? { ...settings, ...remote.settings } : settings

  /* adopt anything the vault taught us, locally first so a failed push
     never loses what we just learned */
  if (s.adopted.length) await db.putMany(db.STORES.sections, s.adopted)
  if (e.adopted.length) await db.putMany(db.STORES.entries, e.adopted)

  const document = {
    version: 1,
    sections: s.merged,
    entries: e.merged,
    settings: shareableSettings(mergedSettings),
    writtenAt: new Date().toISOString(),
  }

  const pushed =
    s.merged.length - (remote?.sections?.length ?? 0) +
    (e.merged.length - (remote?.entries?.length ?? 0))

  const saved = await storeVault(id, await seal(key, document))

  return {
    sections: s.merged,
    entries: e.merged,
    settings: mergedSettings,
    pulled: s.adopted.length + e.adopted.length,
    pushed: Math.max(0, pushed),
    remoteAt: saved.updatedAt,
  }
}

/** a rough strength read, so a two-word passphrase gets called out */
export function passphraseHint(value) {
  const v = String(value || '')
  if (v.length < 12) return { ok: false, text: 'Too short — use at least 12 characters.' }
  const words = v.trim().split(/\s+/).length
  if (words >= 4 || v.length >= 20) return { ok: true, text: 'Good. Write it down somewhere safe.' }
  return { ok: true, text: 'Workable. Four random words would be stronger.' }
}
