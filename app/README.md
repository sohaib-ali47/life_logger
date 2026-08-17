# Life OS

A personal operating system. Log every part of your life, hit your targets, and see the
patterns between them. Local-first, installable on an iPhone, with optional cloud sync.

```bash
npm install
npm run dev          # http://localhost:5180
npm run dev:lan      # same, reachable from your phone on the same Wi-Fi
npm run build        # production bundle in dist/
```

Open it with no configuration at all and it works completely: everything lives in
IndexedDB on the device, nothing is sent anywhere, and 90 days of demo data is seeded on
first run so no chart starts empty.

---

## The architecture in one paragraph

Every tracker in the app is one of nine **primitives**. Adding "Hammer curls" or "Cold
showers" means filling in a form, not writing code — which is the difference between a
system and a pile of hardcoded screens.

| Primitive | What it captures |
|---|---|
| `duration` | a block of time — sleep, gym, eating, work |
| `count` | units that add up — water, reps, pages |
| `check` | did it or did not, once a day |
| `checklist` | a fixed set of items ticked daily — prayers, supplements |
| `abstain` | days clean since the last reset, with the trigger recorded |
| `scale` | a 1–10 score for the day — mood, energy |
| `measure` | a value that moves — weight, resting heart rate |
| `session` | a workout: duration plus exercises, reps and weight |
| `note` | anything, in your own words, stamped with the time |

Three features any primitive can opt into: **variants** (which meal, which project),
**follow-ups** (calories after eating, the trigger after a reset, how late you woke),
and **break reminders** while a timer runs.

## Design rules worth keeping

**Day keys, not timestamps.** The unit of account is `"2026-08-17"`. A configurable
boundary (default 04:00) means a 01:20 session belongs to the previous day, and no total
ever moves because of DST or a timezone change.

**Zero is not the same as null.** "Close day" marks a day finished so blanks count as
real zeros. Without it a skipped gym session and an unlogged one are indistinguishable,
and every streak becomes fiction.

**Unaccounted time is the headline.** Every day is 24 hours; whatever you did not log
shows as a neutral band on every stack.

**Screen time is an overlay, not a slice.** You are on a screen *during* work and
leisure, so it deliberately does not count toward the 24h — counting it would inflate the
day past what it holds.

**Charts are hand-rolled SVG.** No chart library. The categorical palette is validated in
both light and dark for lightness band, chroma floor, colourblind separation and contrast.
Every chart has a table view, so no value is reachable only by hovering.

---

## Running it as an app on your iPhone

1. Deploy it (below) — the PWA needs HTTPS for offline and notifications. A LAN address
   will install and run full screen, but the service worker will not register.
2. Open the URL in Safari on the phone.
3. Share → **Add to Home Screen**.

Installed, it runs with no browser chrome, opens offline, and its storage stops being
subject to Safari's seven-day eviction of unused websites.

**Notifications, honestly:** reminders always appear in-app on the Today screen. System
notifications work on desktop and Android immediately, and on iPhone only once installed
to the Home Screen (iOS 16.4+). Alerts delivered while the app is fully closed need a push
server, which this build does not include.

---

## Sync (optional) — a passphrase, no account

Sync needs no third-party service, no account, no email and no API keys. It runs on a
serverless function in your own Vercel project and stores one encrypted blob.

**How it works.** You type the same passphrase on your phone and your laptop. From it the
app derives two things under different salts: an AES-GCM key that never leaves the device,
and a vault id that is all the server ever sees. So the server holds ciphertext it cannot
read, addressed by an id that reveals nothing about the key.

**Setup, once:**

1. Vercel dashboard → **Storage** → Create Database → **Blob**
2. Connect it to this project, then **redeploy** (`BLOB_READ_WRITE_TOKEN` is injected
   automatically)
3. Open **Setup → Sync across devices**, type a passphrase of 12+ characters, press
   Connect, then **Sync now**
4. Do the same on the other device with the same passphrase

**It is manual on purpose.** Nothing syncs on a timer, on focus, or when the network
returns. You press the button; it pulls, merges and pushes.

- Merging is last-write-wins per record on `updatedAt`, so an edit on either device wins
  by recency rather than by which one synced last.
- Deletes are tombstones, so removing something on one device does not come back from the
  other.
- The running timer is deliberately **not** synced — starting one on your phone should not
  start one on your laptop.

**Two things to be clear about:**

- **Lose the passphrase and the vault is unrecoverable.** There is no reset link, because
  nobody is holding a key. Write it down.
- If two devices push in the same moment, the later write takes the whole document. Manual
  sync makes that very unlikely, but the local JSON export remains the real backup.

Encryption requires a secure context, so sync is available on your `https://` deployment
and on `localhost`, but not over a plain LAN IP. `vite dev` does not run the serverless
function either — use `vercel dev` if you need to test sync locally.

---

## Deploying

```bash
vercel --prod
```

Set the project's **Root Directory** to `app`. There are no build-time environment
variables to configure — the only one sync uses, `BLOB_READ_WRITE_TOKEN`, is added by
Vercel when you connect a Blob store and is read at request time by the function, not
inlined into the bundle.

`vercel.json` sets immutable caching for hashed assets and `must-revalidate` on `sw.js`
and the manifest, so a new deploy is picked up on next launch instead of being pinned by
the old service worker.

**If a deploy shows a blank page**, the boot fallback in `index.html` prints the actual
error and offers a *Clear cache and reload* button, which unregisters the service worker
and drops its caches. That is the fix for a stale build; anything else, the error text
names the cause.

---

## Layout

```
src/
  lib/
    primitives.js   the nine primitives and their behaviour
    sections.js     default trackers — seed data, all editable in-app
    dates.js        day keys, boundary, ranges, local stamps
    db.js           IndexedDB, sync-ready records, soft deletes
    store.jsx       single source of truth + all actions
    stats.js        aggregation, targets, streaks, score, nudges, insights
    format.js       every number's display form, in one place
    seed.js         deterministic demo history
    notify.js       Notification API, honest about the iOS limits
    vault.js        passphrase → key + id, encrypt, merge, push / pull
  components/       Icon, ui kit, charts, tiles, sheets, ErrorBoundary
  screens/          Today, Stats, Review, SectionDetail, Setup
api/
  sync.js           the serverless locker — stores ciphertext, reads it back
```

## Not built yet

Push notifications while the app is closed (needs a push server and VAPID keys), the iOS
Shortcuts bridge for automatic screen time and Health data, tasks, and gym session
templates.
