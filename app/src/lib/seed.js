/* Demo history — deterministic, so the app looks the same every load.
 *
 * Realistic weekday/weekend structure, a few days that simply never got
 * logged, an upward drift over twelve weeks, and a loose sleep → mood
 * coupling so the correlation view has something honest to find.
 * Variants, calories, prayer times and gym sets are all populated, so
 * every screen shows what it will look like once you use it for real.
 */

import { lastNDays, addDays, parse, pad } from './dates'
import { newEntry } from './db'

const rng = (seed) => {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

const pick = (r, arr) => arr[Math.floor(r() * arr.length)]

function stampAt(dayKey, hour, minute = 0, second = 0) {
  let key = dayKey
  let h = hour
  while (h >= 24) { h -= 24; key = addDays(key, 1) }
  return `${key}T${pad(h)}:${pad(Math.round(minute))}:${pad(Math.round(second))}`
}

const PUSH = ['Bench press', 'Incline dumbbell press', 'Overhead press', 'Lateral raise']
const PULL = ['Deadlift', 'Barbell row', 'Lat pulldown', 'Bicep curl']
const LEGS = ['Back squat', 'Leg press', 'Romanian deadlift', 'Calf raise']

export function generate(days = 90) {
  const r = rng(20260816)
  const keys = lastNDays(days)
  const entries = []

  const add = (sectionId, date, value, hour = null, minute = 0, extra = {}) => {
    if (value <= 0 && sectionId !== 'wakeup') return
    entries.push(
      newEntry({
        sectionId,
        date,
        value: Math.round(value * 10) / 10,
        at: hour === null ? null : stampAt(date, hour, minute, Math.floor(r() * 60)),
        note: extra.note || '',
        meta: extra.meta || {},
        source: 'demo',
      })
    )
  }

  const skillNotes = ['system design', 'algorithms', 'reading — deep work', 'course module', 'notes review', '']
  const projNotes = ['life os', 'refactor', 'shipping', 'planning', '']
  const eventTexts = [
    'Long call with the team', 'Went for coffee with M', 'Idea: batch the morning admin',
    'Family dinner', 'Booked the dentist', 'Finished the book', 'Bad news at work, shook it off',
  ]

  /* abstain resets — the current streak lands around a week */
  ;[days - 78, days - 55, days - 34, days - 15, days - 6].forEach((i) => {
    if (i >= 0 && i < days) {
      add('nofap', keys[i], 1, 23, 20, {
        note: 'reset',
        meta: { trigger: pick(r, ['Boredom', 'Stress', 'Tiredness', 'Social media', 'Late night']) },
      })
    }
  })

  let weight = 79.4
  let benchTop = 72.5

  keys.forEach((key, idx) => {
    const dow = parse(key).getDay()
    const weekend = dow === 0 || dow === 6
    const isToday = idx === keys.length - 1
    const drift = Math.min(1, Math.floor(idx / 7) / 12)

    /* a few days simply never got logged — the honest failure mode */
    if (!isToday && r() < 0.06) return

    /* ── sleep ─────────────────────────────────────────────────── */
    const sleepH = 6.1 + r() * 2.1 + (weekend ? 0.6 : 0) + drift * 0.35
    add('sleep', key, sleepH * 60, 22 + Math.floor(r() * 3), Math.floor(r() * 60))

    /* ── namaz ─────────────────────────────────────────────────── */
    const prayers = [
      ['fajr', 5, 25], ['dhuhr', 13, 20], ['asr', 16, 50], ['maghrib', 20, 15], ['isha', 21, 50],
    ]
    for (const [id, h, m] of prayers) {
      const chance = (id === 'fajr' ? 0.55 : 0.82) + drift * 0.18
      if (r() < chance) add('namaz', key, 1, h, m + Math.floor(r() * 20), { meta: { variant: id } })
    }

    /* ── eating, with calories on most meals ───────────────────── */
    const meals = [
      ['breakfast', 8, 20, 380 + r() * 220],
      ['lunch', 13, 10, 620 + r() * 320],
      ['dinner', 19, 40, 700 + r() * 380],
    ]
    for (const [variant, h, m, kcal] of meals) {
      if (variant === 'breakfast' && r() < 0.22) continue
      const mins = 15 + r() * 30
      add('eating', key, mins, h, m + Math.floor(r() * 30), {
        meta: { variant, ...(r() < 0.78 ? { calories: Math.round(kcal) } : {}) },
      })
    }
    if (r() < 0.4) {
      add('eating', key, 8 + r() * 10, 16, Math.floor(r() * 50), {
        meta: { variant: 'snack', ...(r() < 0.5 ? { calories: Math.round(120 + r() * 200) } : {}) },
      })
    }

    /* ── finance work ──────────────────────────────────────────── */
    if (!weekend) add('work', key, (6.5 + r() * 2.6) * 60, 9, Math.floor(r() * 30))
    else if (r() < 0.18) add('work', key, (1 + r() * 2) * 60, 11, 0, { note: 'catch-up' })

    /* ── gym, with sets ────────────────────────────────────────── */
    if (r() < (weekend ? 0.45 : 0.42) + drift * 0.16) {
      const kind = pick(r, ['push', 'pull', 'legs', 'full', 'cardio'])
      const pool = kind === 'push' ? PUSH : kind === 'pull' ? PULL : kind === 'legs' ? LEGS : [...PUSH, ...LEGS]
      const sets = []
      if (kind !== 'cardio') {
        const nEx = 3 + Math.floor(r() * 2)
        for (let i = 0; i < nEx; i++) {
          const exercise = pool[i % pool.length]
          const base = exercise === 'Bench press' ? benchTop : 30 + r() * 60
          for (let s = 0; s < 3; s++) {
            sets.push({
              exercise,
              reps: 6 + Math.floor(r() * 6),
              weight: Math.round((base - s * 2.5) * 2) / 2,
            })
          }
        }
        if (r() < 0.12) benchTop += 2.5
      }
      const morning = r() < 0.4
      add('gym', key, 38 + r() * 44, morning ? 7 : 18, Math.floor(r() * 40), {
        meta: { variant: kind, sets },
        note: kind === 'cardio' ? 'run' : '',
      })
    }

    /* ── calisthenics ──────────────────────────────────────────── */
    if (r() < 0.72 + drift * 0.15) {
      const bouts = 2 + Math.floor(r() * 3)
      for (let i = 0; i < bouts; i++) add('pushups', key, 15 + Math.floor(r() * 25), 7 + i * 5, Math.floor(r() * 50))
    }
    if (r() < 0.42 + drift * 0.2) add('pullups', key, 6 + Math.floor(r() * 12), 18, Math.floor(r() * 40))

    /* ── skills, by variant ────────────────────────────────────── */
    if (r() < 0.6 + drift * 0.22) {
      const mins = (weekend ? 45 : 30) + r() * (weekend ? 90 : 75) + drift * 28
      add('study', key, mins, weekend ? 10 : 19, 30 + Math.floor(r() * 25), {
        meta: { variant: pick(r, ['system-design', 'algorithms', 'finance', 'reading']) },
        note: pick(r, skillNotes),
      })
    }
    if (r() < 0.44 + drift * 0.25) add('meditation', key, 1, 21, 35)

    /* ── projects, by variant ──────────────────────────────────── */
    if (r() < (weekend ? 0.7 : 0.44) + drift * 0.16) {
      add('projects', key, 35 + r() * (weekend ? 145 : 85), weekend ? 13 : 20, 30 + Math.floor(r() * 25), {
        meta: { variant: r() < 0.7 ? 'life-os' : 'side-build' },
        note: pick(r, projNotes),
      })
    }

    /* ── life ──────────────────────────────────────────────────── */
    if (r() < 0.78) add('leisure', key, 35 + r() * (weekend ? 150 : 70), weekend ? 16 : 21, Math.floor(r() * 40))
    if (r() < 0.66 + drift * 0.2) add('outside', key, 20 + r() * (weekend ? 110 : 50), weekend ? 12 : 17, Math.floor(r() * 50))
    if (r() < 0.16) {
      add('events', key, 1, 12 + Math.floor(r() * 9), Math.floor(r() * 55), {
        note: pick(r, eventTexts),
        meta: { variant: pick(r, ['moment', 'idea', 'social', 'admin']) },
      })
    }

    /* ── screen time: an overlay, never part of the 24h ────────── */
    const tired = sleepH < 6.8 ? 1 : 0
    const screen = 95 + r() * 90 + (weekend ? 45 : 0) + tired * 35 - drift * 40
    add('screen', key, Math.max(30, screen), 12, 30)

    /* ── intake ────────────────────────────────────────────────── */
    const glasses = 4 + Math.floor(r() * 5 + drift * 1.6)
    for (let g = 0; g < glasses; g++) {
      add('water', key, pick(r, [250, 330, 500]), 8 + Math.floor(g * (13 / glasses)), Math.floor(r() * 55))
    }
    for (const supp of ['vitamin-d', 'omega-3', 'magnesium', 'creatine']) {
      if (r() < 0.62 + drift * 0.2) add('supplements', key, 1, 8, 40 + Math.floor(r() * 10), { meta: { variant: supp } })
    }

    /* ── discipline ────────────────────────────────────────────── */
    if (r() < 0.52 + drift * 0.25) add('wakeup', key, 1, 7, 0)
    else if (r() < 0.5) add('wakeup', key, 0, null, 0, { meta: { delayMin: 15 + Math.floor(r() * 75) } })

    /* ── weight, a few times a week ────────────────────────────── */
    weight += (r() - 0.55) * 0.25
    if (r() < 0.45) add('weight', key, Math.round(weight * 10) / 10)

    /* ── state, loosely following sleep and the leak ───────────── */
    if (r() < 0.87) {
      const base = 4.5 + (sleepH - 6.5) * 1.15 - (screen > 200 ? 0.8 : 0) + drift * 1.0
      const clamp = (v) => Math.max(2, Math.min(10, Math.round(v)))
      add('mood', key, clamp(base + (r() - 0.5) * 2))
      add('energy', key, clamp(base + (r() - 0.5) * 2.4 - (weekend ? -0.4 : 0.2)))
    }
  })

  return entries
}
