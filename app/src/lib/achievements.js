/* Achievements — tiered, earned, and impossible to game.
 *
 * Every one is computed from your actual entries, so there is no separate
 * state to drift out of sync and nothing to award by accident. Tiers exist
 * because a single binary badge stops mattering the moment you get it:
 * bronze is reachable in a week, platinum takes months.
 *
 * The rule for the copy: name what you did, not how it felt. "31 days
 * without missing a prayer" lands; "Amazing job!" does not.
 */

import { today, addDays, lastNDays } from './dates'
import { totalsByDay, meetsTarget, abstainState, doneVariants } from './stats'

export const TIERS = [
  { id: 'bronze', name: 'Bronze', colour: 'var(--s2)' },
  { id: 'silver', name: 'Silver', colour: 'var(--ink-3)' },
  { id: 'gold', name: 'Gold', colour: 'var(--s4)' },
  { id: 'platinum', name: 'Platinum', colour: 'var(--s7)' },
]

/* ── the catalogue ──────────────────────────────────────────────────────
   Each definition returns a raw number; tiers are thresholds on it. A
   definition that needs a section absent from your setup is skipped, so
   nobody is chasing a badge for a tracker they do not use.            */

const DEFS = [
  {
    id: 'streak-overall',
    name: 'Kept the habit',
    unit: 'days',
    blurb: 'Consecutive days with something logged.',
    icon: 'flame',
    tiers: [3, 14, 45, 120],
    value: ({ byDay, keys }) => {
      let run = 0
      for (let i = keys.length - 1; i >= 0; i--) {
        if (Object.keys(byDay[keys[i]] ?? {}).length) run++
        else break
      }
      return run
    },
  },
  {
    id: 'accounted',
    name: 'Nothing unaccounted',
    unit: 'days',
    blurb: 'Days where you logged at least 18 of the 24 hours.',
    icon: 'target',
    tiers: [1, 7, 30, 90],
    value: ({ byDay, keys, sections }) =>
      keys.filter((k) => {
        let sum = 0
        for (const s of sections) if (s.countsToDay) sum += byDay[k]?.[s.id] ?? 0
        return sum >= 18 * 60
      }).length,
  },
  {
    id: 'deep-work',
    name: 'Deep work',
    unit: 'hours',
    blurb: 'Total hours on Skills and Projects.',
    icon: 'book',
    needs: ['study'],
    tiers: [10, 50, 200, 500],
    value: ({ byDay, keys }) =>
      Math.floor(keys.reduce((a, k) => a + ((byDay[k]?.study ?? 0) + (byDay[k]?.projects ?? 0)), 0) / 60),
  },
  {
    id: 'gym-sessions',
    name: 'Under the bar',
    unit: 'sessions',
    blurb: 'Gym sessions logged.',
    icon: 'dumbbell',
    needs: ['gym'],
    tiers: [5, 25, 75, 200],
    value: ({ entries }) => entries.filter((e) => e.sectionId === 'gym' && !e.deletedAt).length,
  },
  {
    id: 'pushups',
    name: 'Press on',
    unit: 'reps',
    blurb: 'Total push-ups.',
    icon: 'flame',
    needs: ['pushups'],
    tiers: [500, 5000, 25000, 100000],
    value: ({ entries }) =>
      Math.round(entries.filter((e) => e.sectionId === 'pushups' && !e.deletedAt).reduce((a, e) => a + e.value, 0)),
  },
  {
    id: 'namaz-full',
    name: 'All five',
    unit: 'days',
    blurb: 'Days with every prayer logged.',
    icon: 'lotus',
    needs: ['namaz'],
    tiers: [1, 10, 40, 120],
    value: ({ entries, keys, sections }) => {
      const s = sections.find((x) => x.id === 'namaz')
      const need = s?.variants?.length ?? 5
      const set = new Set(keys)
      const byDate = new Map()
      for (const e of entries) {
        if (e.sectionId !== 'namaz' || e.deletedAt || !set.has(e.date)) continue
        if (!byDate.has(e.date)) byDate.set(e.date, [])
        byDate.get(e.date).push(e)
      }
      let n = 0
      for (const list of byDate.values()) if (doneVariants(list).size >= need) n++
      return n
    },
  },
  {
    id: 'hydrated',
    name: 'Hydrated',
    unit: 'days',
    blurb: 'Days you hit your water target.',
    icon: 'droplet',
    needs: ['water'],
    tiers: [3, 20, 60, 180],
    value: ({ byDay, keys, sections }) => {
      const s = sections.find((x) => x.id === 'water')
      if (!s) return 0
      return keys.filter((k) => meetsTarget(s, byDay[k]?.water ?? 0, 1)).length
    },
  },
  {
    id: 'early',
    name: 'Up before the world',
    unit: 'days',
    blurb: 'Days you were up on time.',
    icon: 'alarm',
    needs: ['wakeup'],
    tiers: [3, 20, 60, 180],
    value: ({ byDay, keys }) => keys.filter((k) => (byDay[k]?.wakeup ?? 0) > 0).length,
  },
  {
    id: 'clean-streak',
    name: 'Held the line',
    unit: 'days',
    blurb: 'Longest run without a reset.',
    icon: 'shield',
    needs: ['nofap'],
    tiers: [7, 30, 90, 365],
    value: ({ entries, sections }) => {
      const s = sections.find((x) => x.id === 'nofap')
      if (!s) return 0
      return abstainState(s, entries, addDays(today(), -400)).longest
    },
  },
  {
    id: 'plan-kept',
    name: 'Did what you said',
    unit: 'blocks',
    blurb: 'Planned blocks you actually logged against.',
    icon: 'calendar',
    tiers: [5, 30, 100, 300],
    value: ({ plans, byDay }) =>
      plans.filter((p) => !p.deletedAt && (byDay[p.date]?.[p.sectionId] ?? 0) > 0).length,
  },
  {
    id: 'notes',
    name: 'Wrote it down',
    unit: 'notes',
    blurb: 'Entries carrying a note — the ones worth reading back.',
    icon: 'edit',
    tiers: [5, 30, 120, 400],
    value: ({ entries }) => entries.filter((e) => e.note && !e.deletedAt).length,
  },
  {
    id: 'leak-controlled',
    name: 'Put the phone down',
    unit: 'days',
    blurb: 'Days you stayed under your screen-time cap.',
    icon: 'phone',
    needs: ['screen'],
    tiers: [3, 20, 60, 180],
    value: ({ byDay, keys, sections }) => {
      const s = sections.find((x) => x.id === 'screen')
      if (!s) return 0
      return keys.filter((k) => (k in byDay) && meetsTarget(s, byDay[k]?.screen ?? 0, 1)).length
    },
  },
]

/** which tier a raw value has reached: -1 = none yet */
function tierOf(def, value) {
  let reached = -1
  for (let i = 0; i < def.tiers.length; i++) if (value >= def.tiers[i]) reached = i
  return reached
}

/**
 * @returns [{ id, name, blurb, icon, unit, value, tier, tierName, colour,
 *             next, progress, earned }]
 */
export function evaluate({ sections, entries, plans = [], days = 400 }) {
  const keys = lastNDays(days)
  const idx = {}
  for (const e of entries) {
    if (e.deletedAt) continue
    ;(idx[e.date] ||= {})[e.sectionId] ||= []
    idx[e.date][e.sectionId].push(e)
  }
  const byDay = totalsByDay(sections, idx, keys)
  const have = new Set(sections.map((s) => s.id))
  const ctx = { sections, entries, plans, keys, byDay }

  return DEFS.filter((d) => !d.needs || d.needs.every((id) => have.has(id)))
    .map((d) => {
      const value = Math.max(0, Math.round(d.value(ctx) || 0))
      const tier = tierOf(d, value)
      const nextIdx = tier + 1
      const next = nextIdx < d.tiers.length ? d.tiers[nextIdx] : null
      const floor = tier >= 0 ? d.tiers[tier] : 0
      return {
        id: d.id,
        name: d.name,
        blurb: d.blurb,
        icon: d.icon,
        unit: d.unit,
        value,
        tier,
        tierName: tier >= 0 ? TIERS[tier].name : null,
        colour: tier >= 0 ? TIERS[tier].colour : 'var(--ink-3)',
        next,
        /* progress toward the next tier, 0..1 */
        progress: next ? Math.min(1, (value - floor) / Math.max(1, next - floor)) : 1,
        earned: tier >= 0,
      }
    })
    .sort((a, b) => (b.tier - a.tier) || (b.progress - a.progress))
}

/** a stable signature per earned tier, for spotting a new one */
export const badgeKey = (a) => `${a.id}:${a.tier}`

/** total points, for a single headline number */
export const score = (list) => list.reduce((a, x) => a + (x.tier >= 0 ? (x.tier + 1) * 10 : 0), 0)
