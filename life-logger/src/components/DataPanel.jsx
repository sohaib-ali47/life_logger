import { useRef, useState } from 'react'
import { Download, Trash2, Upload } from 'lucide-react'
import { Card, CardHeader } from './Card'
import { exportEntries } from '../lib/storage'

export function DataPanel({ entries, onReplaceAll, onClearAll }) {
  const fileInput = useRef(null)
  const [status, setStatus] = useState(null)
  const [confirming, setConfirming] = useState(false)

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // let the same file be picked twice
    if (!file) return
    try {
      const count = onReplaceAll(JSON.parse(await file.text()))
      setStatus({ tone: 'good', text: `Restored ${count} entries.` })
    } catch (err) {
      setStatus({ tone: 'bad', text: err.message || 'That file could not be read.' })
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Your data"
          subtitle={`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} stored on this device`}
        />
        <p className="mb-4 text-sm leading-relaxed text-ink-2">
          Everything stays in this browser's storage. Nothing is uploaded and there is no
          account. Clearing your browser data, or deleting the app from your Home Screen,
          removes it — so export a backup now and then.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => exportEntries(entries)}
            disabled={!entries.length}
            className="flex items-center justify-center gap-2 rounded-xl border border-line bg-raised px-4 py-3 text-sm font-medium text-ink transition-opacity disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Download aria-hidden="true" className="size-4" /> Export backup
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl border border-line bg-raised px-4 py-3 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Upload aria-hidden="true" className="size-4" /> Restore from backup
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            className="hidden"
          />
        </div>
        {status && (
          <p
            aria-live="polite"
            className={`mt-3 text-sm ${status.tone === 'good' ? 'text-good' : 'text-critical'}`}
          >
            {status.text}
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Danger zone" />
        {confirming ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">
              Delete all {entries.length} entries? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onClearAll()
                  setConfirming(false)
                  setStatus({ tone: 'good', text: 'All entries deleted.' })
                }}
                className="flex-1 rounded-xl bg-critical px-4 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Delete everything
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 rounded-xl border border-line px-4 py-3 text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!entries.length}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-critical/40 px-4 py-3 text-sm font-medium text-critical transition-opacity disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Trash2 aria-hidden="true" className="size-4" /> Delete all entries
          </button>
        )}
      </Card>
    </div>
  )
}
