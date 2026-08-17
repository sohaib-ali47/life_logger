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

## Cloud sync (optional)

Without credentials the app is local-only and says so on the Setup screen. With them you
get email-link sign-in and last-write-wins replication between devices.

### 1. Create the database

In a new Supabase project, open the SQL editor and run:

```
supabase/migrations/20260817000000_init.sql
```

Or with the CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

That creates `sections`, `entries` and `settings`, each with row-level security keyed to
`auth.uid()`. There is no path that returns another user's rows.

### 2. Configure auth

Authentication → URL Configuration → set **Site URL** to your deployed origin and add it
to **Redirect URLs**. Email provider on, "Confirm email" is not required for magic links.

### 3. Set the environment variables

```bash
cp .env.example .env.local
```

```
VITE_SUPABASE_URL=https://your-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

Both are safe in a client bundle — the anon key is meant to be public and RLS is what
protects the data. **Never put the `service_role` key here**; it bypasses RLS entirely.

### How sync behaves

- IndexedDB stays the source of truth for the UI. Sync never blocks an interaction.
- Merging is last-write-wins per record on `updatedAt`.
- Deletes are tombstones, so a deletion replicates instead of being undone by the other
  device. `purge_tombstones()` clears them after 90 days — schedule it with pg_cron once
  you have two devices running.
- It runs on sign-in, when the tab regains focus, when the network returns, and about four
  seconds after you stop making changes.
- The running timer is deliberately **not** synced — starting a timer on your phone should
  not start one on your laptop.
- **Known limit:** last-write-wins resolves by wall clock, so two devices with badly skewed
  clocks can let an older edit win. For one person moving between a phone and a laptop this
  is the right trade against per-field merging or a CRDT.

---

## Deploying

```bash
npm i -g vercel     # already installed on this machine
vercel              # first run links the project
vercel --prod
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel → Settings → Environment
Variables **before** the production build, then redeploy — Vite inlines them at build time,
so adding them afterwards has no effect until you rebuild.

`vercel.json` handles the SPA rewrite, immutable caching for hashed assets, and
`must-revalidate` on `sw.js` and the manifest so an update is picked up on the next launch
rather than being pinned by the service worker.

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
    supabase.js     client, or null when unconfigured
    sync.js         pull / merge / push
  components/       Icon, ui kit, charts, tiles, sheets
  screens/          Today, Stats, Review, SectionDetail, Setup
supabase/migrations/
```

## Not built yet

Push notifications while the app is closed (needs a server and VAPID keys), the iOS
Shortcuts bridge for automatic screen time and Health data, tasks, and gym session
templates.
