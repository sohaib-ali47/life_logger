/* /api/sync — a dumb encrypted locker.
 *
 * This endpoint stores one opaque blob per vault id and hands it back on
 * request. It cannot read anything it holds: the client encrypts with a
 * key derived from your passphrase and only ever sends ciphertext. The id
 * is derived from the same passphrase under a *different* salt, so holding
 * the id tells you nothing about the key.
 *
 * That is the whole design. No accounts, no email, no sessions, no schema
 * — and nothing that needs a payment method or a service that might not be
 * reachable where you are. It runs on the Vercel project you already have.
 *
 * The blob is written with access: 'private', so it is only readable with
 * the store's token. That is defence in depth rather than the actual
 * protection — the payload is already encrypted before it gets here.
 */

import { put, get } from '@vercel/blob'

const ID_PATTERN = /^[a-f0-9]{64}$/
const MAX_BYTES = 8 * 1024 * 1024

const pathFor = (id) => `vaults/${id}.json`

const bad = (res, code, message) => res.status(code).json({ error: message })

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return bad(
      res,
      503,
      'Storage is not connected. In Vercel → Storage, connect a Blob store to this project with "Add a read-write token env var" enabled, then redeploy.'
    )
  }

  const id = String(req.query?.id ?? '')
  if (!ID_PATTERN.test(id)) return bad(res, 400, 'Bad vault id.')

  try {
    /* ── read ─────────────────────────────────────────────────────── */
    if (req.method === 'GET') {
      /* useCache: false matters for correctness, not speed — a CDN-cached
         stale vault would let one device overwrite the other's newer
         edits without either of them noticing. */
      const found = await get(pathFor(id), { access: 'private', useCache: false })
      if (!found?.stream) return res.status(404).json({ error: 'No vault yet.' })

      const text = await new Response(found.stream).text()
      res.setHeader('Content-Type', 'application/json')
      return res.status(200).send(text)
    }

    /* ── write ────────────────────────────────────────────────────── */
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      if (!body || typeof body.payload !== 'string' || !body.payload) {
        return bad(res, 400, 'Missing payload.')
      }
      if (body.payload.length > MAX_BYTES) return bad(res, 413, 'Vault is too large.')

      const document = {
        payload: body.payload,        // base64 iv + AES-GCM ciphertext
        updatedAt: new Date().toISOString(),
        version: 1,
      }

      await put(pathFor(id), JSON.stringify(document), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
      })

      return res.status(200).json({ ok: true, updatedAt: document.updatedAt })
    }

    res.setHeader('Allow', 'GET, PUT')
    return bad(res, 405, 'Method not allowed.')
  } catch (err) {
    console.error('[sync] failed', err)
    return bad(res, 500, err?.message || 'Unexpected error.')
  }
}
