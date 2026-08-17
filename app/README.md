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

## Accounts and sync (optional)

Real accounts, email and password, with each user's rows isolated by row-level security.
Without credentials configured the app is local-only and says so on the Setup screen.

### 1. Create the database

In a new Supabase project, open the SQL editor and run:

```
supabase/migrations/20260817000000_init.sql
```

That creates `profiles`, `sections`, `entries` and `settings`, RLS on all four keyed to
`auth.uid()`, and a trigger that creates a profile row on sign-up. There is no path that
returns another user's rows.

### 2. Configure auth

**Authentication → URL Configuration** — set **Site URL** to your deployed origin and add
it to **Redirect URLs**. Every email the app sends (confirmation, magic link, password
reset) comes back to that origin, so a mismatch here is the usual cause of a link that
lands on an error page.

Supabase's built-in email sender is rate-limited to a handful per hour, which is fine for
you and your own devices. Add SMTP under **Project Settings → Auth** before letting other
people sign up.

### 3. Set the environment variables

```bash
cp .env.example .env.local
```

```
VITE_SUPABASE_URL=https://your-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Both are safe in a client bundle — the anon key is meant to be public and RLS is what
protects the data. **Never put the `service_role` key here.** Set the same two in Vercel
before the production build; Vite inlines them at build time, so adding them afterwards
does nothing until you rebuild.

### How sync behaves

- IndexedDB stays the source of truth for the UI. Sync never blocks an interaction.
- Merging is last-write-wins per record on `updatedAt`. Deletes are tombstones, so a
  deletion replicates instead of being undone by the other device.
- It runs **once on sign-in**, and otherwise only when you press **Sync now**. Background
  syncing is a checkbox in Setup, off by default.
- The running timer is deliberately **not** synced.
- **Known limit:** last-write-wins resolves by wall clock, so two devices with badly
  skewed clocks can let an older edit win. For one person across a phone and a laptop
  that is the right trade against per-field merging or a CRDT.

<details>
<summary>Previous approach — a passphrase and no account</summary>

An earlier version synced through a Vercel serverless function with a passphrase-derived
AES-GCM key and no accounts at all. It is in the git history if you ever want it back;
`api/sync.js` and `src/lib/vault.js` were the two files.
</details>

---

## Deploying

```bash
vercel --prod
```

Set the project's **Root Directory** to `app`, and set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` in Settings → Environment Variables **before** the build. Vite
inlines them, so adding them after a deploy has no effect until you rebuild.

Vercel builds from Git, so a `vercel --prod` on an uncommitted working tree deploys the
last **pushed** commit, not what is on your disk. If a fix does not appear, check that the
bundle filename in `dist/assets/` changed — an identical hash means the same source was
built again.

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
    supabase.js     client, auth, validation — null when unconfigured
    sync.js         pull / merge / push, last-write-wins per record
  components/       Icon, ui kit, charts, tiles, sheets, ErrorBoundary
  screens/          Auth, Today, Stats, Review, SectionDetail, Setup
supabase/migrations/
  20260817000000_init.sql   tables, RLS, profile trigger
```

## Not built yet

Push notifications while the app is closed (needs a push server and VAPID keys), the iOS
Shortcuts bridge for automatic screen time and Health data, tasks, and gym session
templates.
