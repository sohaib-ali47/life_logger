/* Setup — install, notifications, sections, settings, data.
   The section editor is the point of the whole architecture: adding a
   tracker is filling in a form, not writing code. */

import { useEffect, useMemo, useRef, useState } from 'react'
import Icon, { ICON_NAMES } from '../components/Icon'
import { Card, Button, IconButton, Sheet, Field, inputClass, Empty, slotVar } from '../components/ui'
import { useApp } from '../lib/store'
import { PRIMITIVES, BUILDABLE, PILLARS, slug } from '../lib/primitives'
import * as notify from '../lib/notify'
import { signInWithEmail, configError } from '../lib/supabase'
import { today } from '../lib/dates'

const blank = () => ({
  id: '',
  name: '',
  primitive: 'count',
  unit: '',
  icon: 'sparkle',
  pillar: 'body',
  slot: 1,
  weight: 1,
  countsToDay: false,
  quick: [],
  remind: [],
  variants: [],
  breakEvery: null,
  target: { period: 'day', value: 1, dir: 'atLeast' },
})

/* quick presets round-trip as "Glass:250, Bottle:500" or plain "10, 20" */
const quickToText = (quick = []) =>
  quick.map((q) => (typeof q === 'object' && q.label ? `${q.label}:${q.value}` : `${typeof q === 'object' ? q.value : q}`)).join(', ')

const textToQuick = (text) =>
  text
    .split(',')
    .map((chunk) => {
      const [a, b] = chunk.split(':').map((x) => x.trim())
      if (b !== undefined) return { label: a, value: Number(b) }
      return { value: Number(a) }
    })
    .filter((q) => Number.isFinite(q.value) && q.value > 0)

export default function Setup({ navigate, query }) {
  const app = useApp()
  const { sections, active, entries, settings, saveSection, archiveSection } = app
  const [editing, setEditing] = useState(null)
  const [perm, setPerm] = useState(notify.status())
  const fileRef = useRef(null)

  const openId = query?.edit
  useEffect(() => {
    if (!openId) return
    const s = sections.find((x) => x.id === openId)
    if (s) setEditing({ ...s })
  }, [openId, sections])

  const size = useMemo(() => new Blob([app.exportJSON()]).size, [app])
  const dayCount = useMemo(() => new Set(entries.map((e) => e.date)).size, [entries])

  const exportFile = () => {
    const blob = new Blob([app.exportJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `life-os-${today()}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    app.flash('Backup downloaded.')
  }

  const importFile = (mode) => {
    fileRef.current.onchange = async () => {
      const f = fileRef.current.files?.[0]
      if (!f) return
      try {
        const n = await app.importJSON(await f.text(), mode)
        app.flash(`Imported — ${n} entries.`)
      } catch (err) {
        app.flash(`Import failed: ${err.message}`)
      }
      fileRef.current.value = ''
    }
    fileRef.current.click()
  }

  return (
    <>
      <header className="mb-4">
        <div className="text-[11.5px] uppercase tracking-[.07em] text-ink-3 font-semibold">Setup</div>
        <h1 className="text-[21px] font-semibold tracking-tight">Install, sections, settings and your data</h1>
      </header>

      {/* ── install ────────────────────────────────────────────────── */}
      <Card title="Run it like an app" className="mb-3.5">
        {notify.isInstalled() ? (
          <p className="text-[13px] text-ink-2">
            Installed. You are running full screen with no browser chrome, and the app opens offline.
          </p>
        ) : (
          <ol className="text-[13px] text-ink-2 grid gap-1.5 list-decimal pl-4">
            <li>Open this page in Safari on your iPhone.</li>
            <li>Tap the Share button, then <strong>Add to Home Screen</strong>.</li>
            <li>Open it from the icon — full screen, no address bar, works with no signal.</li>
          </ol>
        )}
        <p className="text-[12px] text-ink-3 mt-3">
          Installing also makes your data far more durable: Safari can clear a plain website&apos;s storage after about
          a week of no use, and an installed app is not treated that way.
        </p>
      </Card>

      {/* ── sync ───────────────────────────────────────────────────── */}
      <SyncCard />

      {/* ── notifications ──────────────────────────────────────────── */}
      <Card title="Notifications" className="mb-3.5">
        <p className="text-[13px] text-ink-2">{perm.text}</p>
        {perm.level === 'ask' && (
          <Button
            className="mt-3"
            tone="primary"
            icon="bell"
            onClick={async () => {
              await notify.requestPermission()
              setPerm(notify.status())
            }}
          >
            Turn on notifications
          </Button>
        )}
        <p className="text-[12px] text-ink-3 mt-3">
          Reminders always appear inside the app on the Today screen. System notifications are a bonus on top — and on
          iPhone they only work once the app is on your Home Screen. Alerts while the app is fully closed need a small
          server, which is the next phase.
        </p>
      </Card>

      {/* ── sections ───────────────────────────────────────────────── */}
      <Card
        title="Sections"
        sub="Every tracker in the app. Nine primitives cover anything you will ever want to log."
        tools={<Button size="sm" icon="plus" onClick={() => setEditing(blank())}>New section</Button>}
        className="mb-3.5"
      >
        {PILLARS.map((p) => {
          const items = sections.filter((s) => s.pillar === p.id)
          if (!items.length) return null
          return (
            <div key={p.id} className="mb-3 last:mb-0">
              <div className="text-[11px] uppercase tracking-[.07em] text-ink-3 font-semibold mb-1.5">{p.name}</div>
              <ul className="grid gap-1">
                {items.map((s) => (
                  <li
                    key={s.id}
                    className={`flex items-center gap-3 py-2 px-2 rounded-[10px] hover:bg-surface-2 ${s.archived ? 'opacity-45' : ''}`}
                  >
                    <span
                      className="w-7 h-7 rounded-[9px] grid place-items-center shrink-0"
                      style={{ background: `color-mix(in oklab, ${slotVar(s)} 16%, transparent)`, color: slotVar(s) }}
                    >
                      <Icon name={s.icon} size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{s.name}</div>
                      <div className="text-[11.5px] text-ink-3 truncate">
                        {PRIMITIVES[s.primitive]?.name}
                        {s.variants?.length ? ` · ${s.variants.length} options` : ''}
                        {s.target
                          ? ` · ${s.target.dir === 'atMost' ? 'cap' : 'target'} ${s.target.value}${s.target.period === 'week' ? '/wk' : s.target.period === 'streak' ? ' day streak' : '/day'}`
                          : ' · no target'}
                        {s.countsToDay ? ' · fills the day' : ''}
                      </div>
                    </div>
                    <IconButton name="edit" label={`Edit ${s.name}`} size={30} onClick={() => setEditing({ ...s })} />
                    <IconButton
                      name={s.archived ? 'refresh' : 'trash'}
                      label={s.archived ? `Restore ${s.name}` : `Archive ${s.name}`}
                      size={30}
                      onClick={() => archiveSection(s.id, !s.archived)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
        {!sections.length && <Empty icon="grid">No sections yet.</Empty>}
      </Card>

      {/* ── settings ───────────────────────────────────────────────── */}
      <Card title="Settings" className="mb-3.5">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Theme">
            <select className={inputClass} value={settings.theme} onChange={(e) => app.setSetting('theme', e.target.value)}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </Field>
          <Field label="Day starts at" hint="A 01:00 session counts toward the previous day.">
            <select
              className={inputClass}
              value={settings.dayBoundaryHour}
              onChange={(e) => app.setSetting('dayBoundaryHour', Number(e.target.value))}
            >
              {[0, 2, 3, 4, 5, 6].map((h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
          </Field>
          <Field label="Week starts on">
            <select
              className={inputClass}
              value={settings.weekStartsMonday ? 'mon' : 'sun'}
              onChange={(e) => app.setSetting('weekStartsMonday', e.target.value === 'mon')}
            >
              <option value="mon">Monday</option>
              <option value="sun">Sunday</option>
            </select>
          </Field>
          <Field label="Daily score goal">
            <input
              type="number"
              min="10"
              max="100"
              className={inputClass}
              value={settings.scoreGoal}
              onChange={(e) => app.setSetting('scoreGoal', Number(e.target.value) || 80)}
            />
          </Field>
        </div>
      </Card>

      {/* ── data ───────────────────────────────────────────────────── */}
      <Card title="Your data" sub="On this device only. Nothing is sent anywhere." className="mb-3.5">
        <dl className="grid grid-cols-[1fr_auto] gap-y-2 gap-x-4 text-[13px] mb-4">
          <dt className="text-ink-2">Entries</dt><dd className="font-semibold num">{entries.length}</dd>
          <dt className="text-ink-2">Days with data</dt><dd className="font-semibold num">{dayCount}</dd>
          <dt className="text-ink-2">Sections</dt><dd className="font-semibold num">{active.length}</dd>
          <dt className="text-ink-2">Days closed</dt><dd className="font-semibold num">{(settings.closedDays || []).length}</dd>
          <dt className="text-ink-2">Backup size</dt><dd className="font-semibold num">{(size / 1024).toFixed(1)} KB</dd>
          <dt className="text-ink-2">Stored in</dt><dd className="font-semibold">IndexedDB</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button tone="primary" icon="download" onClick={exportFile}>Export JSON</Button>
          <Button icon="upload" onClick={() => importFile('replace')}>Import (replace)</Button>
          <Button icon="upload" onClick={() => importFile('merge')}>Import (merge)</Button>
        </div>
        <p className="text-[12px] text-ink-3 mt-3.5">
          The export is the only backup that survives a cleared browser. Take one weekly.
        </p>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" />
      </Card>

      <Card title="Demo data">
        <div className="flex flex-wrap gap-2">
          <Button icon="sparkle" onClick={app.loadDemo}>Load 90 days of demo data</Button>
          <Button
            tone="danger"
            icon="trash"
            onClick={() => {
              if (confirm('Erase every entry on this device? Export first if you want it back.')) app.wipeAll()
            }}
          >
            Erase everything
          </Button>
        </div>
        <p className="text-[12px] text-ink-3 mt-3.5">
          Demo data replaces what is there. It exists so you can judge the charts before committing real days to them.
        </p>
      </Card>

      <SectionEditor
        section={editing}
        onClose={() => { setEditing(null); if (openId) navigate('/setup') }}
        onSave={(s) => { saveSection(s); setEditing(null); app.flash(`${s.name} saved.`); if (openId) navigate('/setup') }}
      />
    </>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Sync — email magic link, then last-write-wins replication
   ══════════════════════════════════════════════════════════════════════ */

function SyncCard() {
  const { syncAvailable, session, syncState, sync, signOut, flash } = useApp()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!syncAvailable) {
    return (
      <Card title="Sync across devices" className="mb-3.5">
        {configError ? (
          <p className="text-[13px] text-critical">{configError}</p>
        ) : (
          <p className="text-[13px] text-ink-2">
            Not configured on this build. Everything works — it just lives on this device only.
          </p>
        )}
        <p className="text-[12px] text-ink-3 mt-3">
          To switch it on, set <code className="text-ink-2">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-ink-2">VITE_SUPABASE_ANON_KEY</code>, run the migration in{' '}
          <code className="text-ink-2">supabase/migrations</code>, and redeploy. Until then nothing leaves the phone.
        </p>
      </Card>
    )
  }

  const send = async () => {
    if (!email.trim()) return
    setBusy(true)
    try {
      await signInWithEmail(email)
      setSent(true)
    } catch (err) {
      flash(`Could not send the link: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const statusText =
    syncState.status === 'syncing' ? 'Syncing…'
      : syncState.status === 'error' ? `Last attempt failed — ${syncState.error}`
      : syncState.at ? `Last synced ${new Date(syncState.at).toLocaleTimeString()}`
      : 'Not synced yet'

  return (
    <Card title="Sync across devices" className="mb-3.5">
      {session ? (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background:
                  syncState.status === 'error' ? 'var(--critical)'
                    : syncState.status === 'syncing' ? 'var(--warning)'
                    : 'var(--good)',
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium truncate">{session.user.email}</div>
              <div className="text-[11.5px] text-ink-3 truncate">{statusText}</div>
            </div>
            <Button size="sm" icon="refresh" onClick={() => sync({ silent: false })} disabled={syncState.status === 'syncing'}>
              Sync now
            </Button>
            <Button size="sm" tone="ghost" onClick={signOut}>Sign out</Button>
          </div>
          <p className="text-[12px] text-ink-3 mt-3">
            Your phone and your laptop merge on the newest edit per record. Deletes replicate as tombstones, so removing
            something on one device does not come back from the other. Sync runs when you open the app, when the network
            returns, and a few seconds after you stop making changes.
          </p>
        </>
      ) : sent ? (
        <>
          <p className="text-[13px] text-ink-2">
            Check <strong>{email}</strong> for a sign-in link. Open it on this device.
          </p>
          <Button size="sm" tone="ghost" className="mt-3" onClick={() => setSent(false)}>Use a different address</Button>
        </>
      ) : (
        <>
          <p className="text-[13px] text-ink-2 mb-3">
            Sign in to keep this device and your phone in step. No password — you get a link by email.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
              placeholder="you@example.com"
            />
            <Button tone="primary" onClick={send} disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send link'}
            </Button>
          </div>
          <p className="text-[12px] text-ink-3 mt-3">
            Everything already on this device is uploaded on first sync. Nothing is shared with anyone — row-level
            security means the database only ever returns your own rows.
          </p>
        </>
      )}
    </Card>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   Section editor
   ══════════════════════════════════════════════════════════════════════ */

function SectionEditor({ section, onClose, onSave }) {
  const [draft, setDraft] = useState(section)
  const [seen, setSeen] = useState(null)
  const [newVariant, setNewVariant] = useState('')

  if (section && seen !== section.id + (section.name || '')) {
    setSeen(section.id + (section.name || ''))
    setDraft({ ...section, target: section.target ? { ...section.target } : null, variants: [...(section.variants || [])] })
  }

  if (!section || !draft) return <Sheet open={false} onClose={onClose} title="" />

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))
  const setTarget = (patch) =>
    setDraft((d) => ({ ...d, target: { ...(d.target || { period: 'day', value: 1, dir: 'atLeast' }), ...patch } }))
  const p = PRIMITIVES[draft.primitive]
  const isNew = !section.id

  const addVariant = () => {
    const name = newVariant.trim()
    if (!name) return
    const id = slug(name)
    if (draft.variants.some((v) => v.id === id)) { setNewVariant(''); return }
    set({ variants: [...draft.variants, { id, name }] })
    setNewVariant('')
  }

  const save = () => {
    const name = draft.name.trim()
    if (!name) return
    onSave({
      ...draft,
      id: draft.id || slug(name),
      name,
      quick: draft.quick || [],
      breakEvery: draft.breakEvery ? Number(draft.breakEvery) : null,
      countsToDay: p.countsToDay ? draft.countsToDay : false,
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? 'New section' : `Edit ${section.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" onClick={save}>Save</Button>
        </>
      }
    >
      <Field label="Name">
        <input className={inputClass} value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Cold shower" autoFocus />
      </Field>

      <Field label="What kind of thing is it?" hint={p?.blurb}>
        <select className={inputClass} value={draft.primitive} disabled={!isNew} onChange={(e) => set({ primitive: e.target.value })}>
          {BUILDABLE.map((k) => <option key={k} value={k}>{PRIMITIVES[k].name}</option>)}
        </select>
      </Field>
      {!isNew && (
        <p className="text-[11.5px] text-ink-3 -mt-2">
          The kind is fixed after creation — changing it would reinterpret every entry already logged.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Pillar">
          <select className={inputClass} value={draft.pillar} onChange={(e) => set({ pillar: e.target.value })}>
            {PILLARS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label="Unit" hint="ml, reps, kg, pages…">
          <input className={inputClass} value={draft.unit || ''} onChange={(e) => set({ unit: e.target.value })} placeholder={p?.unit || ''} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Colour">
          <div className="flex gap-1.5 flex-wrap pt-1">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Colour ${n}`}
                aria-pressed={draft.slot === n}
                onClick={() => set({ slot: n })}
                className="w-7 h-7 rounded-[9px]"
                style={{
                  background: `var(--s${n})`,
                  outline: draft.slot === n ? '2px solid var(--ink)' : 'none',
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
        </Field>
        <Field label="Icon">
          <select className={inputClass} value={draft.icon} onChange={(e) => set({ icon: e.target.value })}>
            {ICON_NAMES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
      </div>

      {/* ── variants ─────────────────────────────────────────────── */}
      {p?.variants && (
        <Field
          label={p.requiresVariants ? 'Items' : 'Options'}
          hint={
            p.requiresVariants
              ? 'The things you tick off each day — prayers, supplements, anything fixed.'
              : 'Named sub-kinds. Lunch and dinner, or which project you worked on.'
          }
        >
          <div className="grid gap-1.5">
            {draft.variants.map((v, i) => (
              <div key={v.id} className="grid grid-cols-[1fr_82px_32px] gap-1.5 items-center">
                <input
                  className={`${inputClass} h-9 text-[13px]`}
                  value={v.name}
                  onChange={(e) =>
                    set({ variants: draft.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })
                  }
                />
                <input
                  type="time"
                  aria-label={`${v.name} usual time`}
                  className={`${inputClass} h-9 text-[13px] px-2`}
                  value={v.time || ''}
                  onChange={(e) =>
                    set({ variants: draft.variants.map((x, j) => (j === i ? { ...x, time: e.target.value || undefined } : x)) })
                  }
                />
                <button
                  className="h-9 grid place-items-center rounded-[9px] text-ink-3 hover:text-critical hover:bg-surface-2"
                  aria-label={`Remove ${v.name}`}
                  onClick={() => set({ variants: draft.variants.filter((_, j) => j !== i) })}
                >
                  <Icon name="x" size={15} />
                </button>
              </div>
            ))}
            <div className="flex gap-1.5">
              <input
                className={`${inputClass} h-9 text-[13px]`}
                value={newVariant}
                onChange={(e) => setNewVariant(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVariant() } }}
                placeholder="Add another"
              />
              <Button size="sm" icon="plus" onClick={addVariant}>Add</Button>
            </div>
          </div>
          <p className="text-[11.5px] text-ink-3 mt-1.5">
            A time turns the item into a reminder on the day it is due.
          </p>
        </Field>
      )}

      {p?.variants && !p.requiresVariants && (
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Ask when starting a timer">
            <select
              className={inputClass}
              value={draft.askOnStart ? 'yes' : 'no'}
              onChange={(e) => set({ askOnStart: e.target.value === 'yes' })}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          <Field label="Let me add options as I go">
            <select
              className={inputClass}
              value={draft.userVariants ? 'yes' : 'no'}
              onChange={(e) => set({ userVariants: e.target.value === 'yes' })}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        </div>
      )}

      {/* ── exercises ────────────────────────────────────────────── */}
      {p?.sets && (
        <Field label="Exercise library" hint="Comma separated. These autocomplete when you log a session.">
          <textarea
            className={`${inputClass} h-auto min-h-[68px] py-2.5 resize-y text-[13px]`}
            value={(draft.exercises || []).join(', ')}
            onChange={(e) => set({ exercises: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })}
          />
        </Field>
      )}

      <Field label="Target">
        <div className="grid grid-cols-3 gap-2">
          <select className={inputClass} value={draft.target?.dir ?? 'atLeast'} onChange={(e) => setTarget({ dir: e.target.value })}>
            <option value="atLeast">At least</option>
            <option value="atMost">At most</option>
          </select>
          <input
            type="number"
            min="0"
            step="any"
            className={inputClass}
            value={draft.target?.value ?? ''}
            onChange={(e) => setTarget({ value: Number(e.target.value) })}
          />
          <select className={inputClass} value={draft.target?.period ?? 'day'} onChange={(e) => setTarget({ period: e.target.value })}>
            <option value="day">per day</option>
            <option value="week">per week</option>
            {draft.primitive === 'abstain' && <option value="streak">day streak</option>}
          </select>
        </div>
      </Field>

      {['duration', 'count', 'session'].includes(draft.primitive) && (
        <Field
          label="Quick-add buttons"
          hint='Comma separated. Name them with "Glass:250" so the chip says Glass, or just "20" for a plain number.'
        >
          <input
            className={inputClass}
            defaultValue={quickToText(draft.quick)}
            onBlur={(e) => set({ quick: textToQuick(e.target.value) })}
            placeholder="Glass:250, Bottle:500"
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Reminders" hint="24h times, comma separated.">
          <input
            className={inputClass}
            defaultValue={(draft.remind || []).join(', ')}
            onBlur={(e) => set({ remind: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })}
            placeholder="10:00, 16:00"
          />
        </Field>
        {p?.timed && (
          <Field label="Break reminder" hint="Minutes on the timer before it tells you to stop. Blank for none.">
            <input
              type="number"
              min="0"
              className={inputClass}
              value={draft.breakEvery ?? ''}
              onChange={(e) => set({ breakEvery: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="30"
            />
          </Field>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Score weight" hint="0 leaves it out of the Daily Score.">
          <input
            type="number"
            min="0"
            max="5"
            className={inputClass}
            value={draft.weight}
            onChange={(e) => set({ weight: Number(e.target.value) })}
          />
        </Field>
        {p?.countsToDay && (
          <Field label="Fills the 24h day" hint="Include it in the allocation chart.">
            <select
              className={inputClass}
              value={draft.countsToDay ? 'yes' : 'no'}
              onChange={(e) => set({ countsToDay: e.target.value === 'yes' })}
            >
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        )}
      </div>
    </Sheet>
  )
}
