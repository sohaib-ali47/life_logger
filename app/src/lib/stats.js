/* The engine — aggregation, targets, streaks, the Daily Score,
 * nudges, correlations and the insight rules.
 *
 * Everything here is pure: it takes sections + entries + day keys and
 * returns numbers. No storage, no React.
 */

import { MIN_PER_DAY, addDays, today, diffDays, parse, range, weekStart } from './dates'
import { primitiveOf } from './primitives'

/* ── indexing ───────────────────────────────────────────────────────── */

/** { [date]: { [sectionId]: Entry[] } } — one pass over the entry list */
export function indexEntries(entries) {
  const idx = {}
  for (const e of entries) {
    if (e.deletedAt) continue
    ;(idx[e.date] ||= {})[e.sectionId] ||= []
    idx[e.date][e.sectionId].push(e)
  }
  return idx
}

/** which checklist items were ticked on a day */
export function doneVariants(list) {
  const set = new Set()
  for (const e of list || []) if (e.value > 0 && e.meta?.variant) set.add(e.meta.variant)
  return set
}

/** how one day's entries collapse into a single value */
export function dayValue(section, list) {
  if (!list || !list.length) return 0
  const p = primitiveOf(section)
  switch (p.agg) {
    case 'sum': return list.reduce((a, e) => a + e.value, 0)
    case 'max': return list.reduce((a, e) => Math.max(a, e.value), 0)
    case 'count':
      /* a checklist counts distinct items ticked; an event log counts entries */
      return section.primitive === 'checklist' ? doneVariants(list).size : list.length
    case 'last': {
      const sorted = [...list].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      return sorted[sorted.length - 1].value
    }
    default: return 0
  }
}

/** totals split by variant across a range — "which project got the hours" */
export function byVariant(section, entries, keys) {
  const inRange = new Set(keys)
  const out = new Map()
  for (const e of entries) {
    if (e.sectionId !== section.id || e.deletedAt || !inRange.has(e.date)) continue
    const id = e.meta?.variant ?? '__none'
    out.set(id, (out.get(id) ?? 0) + e.value)
  }
  return out
}

/** { [date]: { [sectionId]: value } } */
export function totalsByDay(sections, idx, keys) {
  const out = {}
  for (const k of keys) {
    const day = {}
    const raw = idx[k]
    if (raw) {
      for (const s of sections) {
        if (raw[s.id]) day[s.id] = dayValue(s, raw[s.id])
      }
    }
    out[k] = day
  }
  return out
}

/** total across a range, respecting how the primitive combines days */
export function rangeTotal(section, byDay, keys) {
  const p = primitiveOf(section)
  const vals = keys.map((k) => byDay[k]?.[section.id]).filter((v) => v !== undefined)
  if (!vals.length) return 0
  switch (p.rangeAgg) {
    case 'sum': return vals.reduce((a, v) => a + v, 0)
    case 'avg': {
      const seen = vals.filter((v) => v > 0)
      return seen.length ? seen.reduce((a, v) => a + v, 0) / seen.length : 0
    }
    case 'last': return vals[vals.length - 1]
    default: return 0
  }
}

/** [{ key, value, logged }] daily series */
export function series(section, byDay, keys) {
  return keys.map((k) => ({
    key: k,
    value: byDay[k]?.[section.id] ?? 0,
    logged: byDay[k] ? section.id in byDay[k] : false,
  }))
}

/** trailing mean; null until the window is full. Ignores blanks for
    primitives where an unlogged day is missing data, not a zero. */
export function rollingMean(points, window, ignoreZeros = false) {
  const out = []
  for (let i = 0; i < points.length; i++) {
    if (i < window - 1) { out.push(null); continue }
    let sum = 0, n = 0
    for (let j = i - window + 1; j <= i; j++) {
      if (ignoreZeros && !points[j].value) continue
      sum += points[j].value
      n++
    }
    out.push(n ? sum / n : null)
  }
  return out
}

/* ── targets ────────────────────────────────────────────────────────── */

export function dailyTarget(section) {
  const t = section.target
  if (!t) return null
  if (t.period === 'week') return t.value / 7
  if (t.period === 'streak') return null
  return t.value
}

export function targetForDays(section, nDays) {
  if (section.primitive === 'scale' || section.primitive === 'measure') return section.target?.value ?? null
  const d = dailyTarget(section)
  return d === null ? null : d * nDays
}

/** 0..n — 1 means on target. atMost inverts, so less is better. */
export function attainment(section, actual, nDays = 1) {
  const t = targetForDays(section, nDays)
  if (!t) return null
  if (section.target.dir === 'atMost') return actual <= t ? 1 : t / Math.max(actual, 1e-6)
  return actual / t
}

export function meetsTarget(section, actual, nDays = 1) {
  const t = targetForDays(section, nDays)
  if (!t) return false
  return section.target.dir === 'atMost' ? actual <= t : actual >= t
}

/* ── streaks ────────────────────────────────────────────────────────── */

/** consecutive days meeting the daily-equivalent target, ending today */
export function streak(section, byDay) {
  if (section.primitive === 'abstain') return { current: 0, longest: 0 }
  const keys = Object.keys(byDay).sort()
  let longest = 0, run = 0
  for (const k of keys) {
    if (meetsTarget(section, byDay[k]?.[section.id] ?? 0, 1)) { run++; longest = Math.max(longest, run) }
    else run = 0
  }
  let cur = 0
  let k = today()
  if (!meetsTarget(section, byDay[k]?.[section.id] ?? 0, 1)) k = addDays(k, -1)
  while (byDay[k] && meetsTarget(section, byDay[k][section.id] ?? 0, 1)) { cur++; k = addDays(k, -1) }
  return { current: cur, longest }
}

/** abstain sections: entries are reset events, so the streak is the gap */
export function abstainState(section, entries, since) {
  const resets = entries
    .filter((e) => e.sectionId === section.id && !e.deletedAt)
    .map((e) => e.date)
    .sort()
  const start = since || addDays(today(), -365)
  const last = resets.length ? resets[resets.length - 1] : null
  const current = last ? diffDays(last, today()) : diffDays(start, today())

  let longest = current
  let prev = resets.length ? start : null
  for (const r of resets) {
    if (prev) longest = Math.max(longest, diffDays(prev, r))
    prev = r
  }
  return { current: Math.max(0, current), longest: Math.max(0, longest), resets, lastReset: last }
}

/** streak length as it stood on a given day — for the abstain chart */
export function abstainOn(state, key, since) {
  const before = state.resets.filter((r) => r <= key)
  const from = before.length ? before[before.length - 1] : since
  return Math.max(0, diffDays(from, key))
}

/* ── time accounting ────────────────────────────────────────────────── */

export function accountedMinutes(sections, dayTotals) {
  let sum = 0
  for (const s of sections) {
    if (!s.countsToDay) continue
    sum += dayTotals?.[s.id] ?? 0
  }
  return Math.min(sum, MIN_PER_DAY)
}

export const unaccountedMinutes = (sections, dayTotals) =>
  Math.max(0, MIN_PER_DAY - accountedMinutes(sections, dayTotals))

/* ── the Daily Score ────────────────────────────────────────────────── */

/** One weighted number, 0–100. Each section contributes its attainment
 *  capped at 1 — overshooting one target cannot paper over missing
 *  another, which is the whole point of a composite. */
export function dailyScore(sections, dayTotals, entries, key = today()) {
  const parts = []
  let num = 0, den = 0
  for (const s of sections) {
    if (s.archived || !s.weight || !s.target) continue
    let a
    if (s.primitive === 'abstain') {
      const resetToday = entries.some((e) => e.sectionId === s.id && e.date === key && !e.deletedAt)
      a = resetToday ? 0 : 1
    } else {
      a = attainment(s, dayTotals?.[s.id] ?? 0, 1)
    }
    if (a === null) continue
    const capped = Math.max(0, Math.min(1, a))
    parts.push({ section: s, attainment: capped, weight: s.weight })
    num += capped * s.weight
    den += s.weight
  }
  return { score: den ? Math.round((num / den) * 100) : 0, parts }
}

/* ── nudges ─────────────────────────────────────────────────────────── */

/** In-app nudges. Real push notifications need a server — Phase 5 —
 *  but the rules that decide *when* to nudge live here either way.
 *
 *  ctx: { timer, dayEntries } — the running timer drives break reminders,
 *  the day's entries drive follow-up prompts (a meal with no calories yet).
 */
export function nudges(sections, dayTotals, entries, now = new Date(), key = today(), ctx = {}) {
  const out = []
  const mins = now.getHours() * 60 + now.getMinutes()
  if (key !== today()) return out
  const dayEntries = ctx.dayEntries ?? entries.filter((e) => e.date === key && !e.deletedAt)

  const dueNow = (t, window = 240) => {
    const [h, m] = String(t).split(':').map(Number)
    if (!Number.isFinite(h)) return false
    const at = h * 60 + m
    return mins >= at && mins <= at + window
  }

  /* ── a timer that has been running too long ─────────────────────── */
  if (ctx.timer) {
    const s = sections.find((x) => x.id === ctx.timer.sectionId)
    if (s?.breakEvery) {
      const elapsed = Math.floor((now.getTime() - new Date(ctx.timer.startedAt).getTime()) / 60000)
      const blocks = Math.floor(elapsed / s.breakEvery)
      if (blocks >= 1) {
        out.push({
          id: `break:${s.id}:${blocks}`,
          sectionId: s.id,
          kind: 'break',
          text: `${elapsed} minutes on ${s.name} — take a break`,
          detail: `You set a break every ${s.breakEvery} minutes.`,
        })
      }
    }
  }

  for (const s of sections) {
    if (s.archived) continue
    const value = dayTotals?.[s.id] ?? 0
    const target = targetForDays(s, 1)
    const met = target ? meetsTarget(s, value, 1) : false

    /* ── checklist items with their own time ──────────────────────── */
    if (s.primitive === 'checklist') {
      const done = doneVariants(dayEntries.filter((e) => e.sectionId === s.id))
      for (const v of s.variants || []) {
        if (!v.time || done.has(v.id) || !dueNow(v.time, 180)) continue
        out.push({
          id: `item:${s.id}:${v.id}`,
          sectionId: s.id,
          variantId: v.id,
          kind: 'item',
          text: `${v.name} — not logged yet`,
          detail: `${s.name} · due ${v.time}`,
          action: { type: 'tick', sectionId: s.id, variantId: v.id },
        })
      }
    }

    /* ── section-level scheduled reminders ────────────────────────── */
    for (const t of s.remind || []) {
      if (!dueNow(t) || met) continue
      out.push({
        id: `remind:${s.id}:${t}`,
        sectionId: s.id,
        kind: 'due',
        text: s.primitive === 'check' ? `${s.name} — not done yet` : `Time for ${s.name.toLowerCase()}`,
        detail: target ? `${Math.round(value)} of ${Math.round(target)} so far today` : null,
      })
    }

    /* ── variant times on a duration section (meals) ──────────────── */
    if (s.primitive === 'duration' && s.variants?.length) {
      const logged = new Set(dayEntries.filter((e) => e.sectionId === s.id).map((e) => e.meta?.variant))
      for (const v of s.variants) {
        if (!v.time || logged.has(v.id) || !dueNow(v.time, 150)) continue
        out.push({
          id: `meal:${s.id}:${v.id}`,
          sectionId: s.id,
          variantId: v.id,
          kind: 'due',
          text: `${v.name} not logged`,
          detail: `Start the timer, or log it after the fact.`,
          action: { type: 'start', sectionId: s.id, variantId: v.id },
        })
      }
    }

    /* ── a cap already breached ───────────────────────────────────── */
    if (s.target?.dir === 'atMost' && target && value > target) {
      out.push({
        id: `over:${s.id}`,
        sectionId: s.id,
        kind: 'over',
        text: `${s.name} is over its cap`,
        detail: `${Math.round(value)} against a ${Math.round(target)} limit`,
      })
    }
  }

  /* ── follow-ups still unanswered ────────────────────────────────── */
  for (const e of dayEntries) {
    const s = sections.find((x) => x.id === e.sectionId)
    const f = s?.followUp
    if (!f || f.when !== 'log' || e.meta?.[f.field] !== undefined) continue
    const vName = s.variants?.find((v) => v.id === e.meta?.variant)?.name
    out.push({
      id: `followup:${e.id}`,
      sectionId: s.id,
      entryId: e.id,
      kind: 'followup',
      followUp: f,
      text: `${f.label} for ${vName ? vName.toLowerCase() : s.name.toLowerCase()}`,
      detail: e.at ? `Logged at ${e.at.slice(11, 16)}` : null,
    })
  }

  /* ── evening sweep ──────────────────────────────────────────────── */
  if (mins >= 20 * 60) {
    const short = sections.filter(
      (s) => !s.archived && s.target && s.weight > 0 && s.primitive !== 'abstain' &&
        targetForDays(s, 1) && !meetsTarget(s, dayTotals?.[s.id] ?? 0, 1)
    )
    if (short.length) {
      out.push({
        id: 'evening',
        kind: 'evening',
        text: `${short.length} target${short.length === 1 ? '' : 's'} still short today`,
        detail: short.slice(0, 4).map((s) => s.name).join(' · '),
      })
    }
  }

  return out
}

/* ── correlation ────────────────────────────────────────────────────── */

/** Pearson r over paired samples. Returns null under 8 pairs — below
 *  that the number is noise and printing it would be dishonest. */
export function correlate(pairs) {
  const clean = pairs.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && (a !== 0 || b !== 0))
  const n = clean.length
  if (n < 8) return null
  const mx = clean.reduce((s, p) => s + p[0], 0) / n
  const my = clean.reduce((s, p) => s + p[1], 0) / n
  let num = 0, dx = 0, dy = 0
  for (const [a, b] of clean) {
    num += (a - mx) * (b - my)
    dx += (a - mx) ** 2
    dy += (b - my) ** 2
  }
  const den = Math.sqrt(dx * dy)
  return den ? { r: num / den, n } : null
}

/** x from the previous day against y today — where real effects live */
export function laggedPairs(byDay, keys, xId, yId) {
  const out = []
  for (let i = 1; i < keys.length; i++) {
    const x = byDay[keys[i - 1]]?.[xId]
    const y = byDay[keys[i]]?.[yId]
    if (x === undefined || y === undefined) continue
    out.push([x, y])
  }
  return out
}

const strength = (r) => {
  const a = Math.abs(r)
  if (a >= 0.5) return 'strong'
  if (a >= 0.3) return 'moderate'
  return 'weak'
}

/* ── insights ───────────────────────────────────────────────────────── */

/** Rule-based findings in plain language. Every one carries its sample
 *  size, and every one is phrased as association — none of this shows
 *  causation and the copy never pretends otherwise. */
export function insights(sections, byDay, keys, entries) {
  const out = []
  const byId = Object.fromEntries(sections.map((s) => [s.id, s]))
  const has = (id) => Boolean(byId[id])

  /* 1. sleep → next-day output */
  if (has('sleep') && (has('study') || has('projects'))) {
    const good = [], bad = []
    for (let i = 1; i < keys.length; i++) {
      const sleep = byDay[keys[i - 1]]?.sleep
      if (sleep === undefined || sleep === 0) continue
      const d = byDay[keys[i]] || {}
      const output = (d.study ?? 0) + (d.projects ?? 0)
      ;(sleep < 360 ? bad : good).push(output)
    }
    if (bad.length >= 4 && good.length >= 4) {
      const ga = good.reduce((a, v) => a + v, 0) / good.length
      const ba = bad.reduce((a, v) => a + v, 0) / bad.length
      if (ga > 0 && Math.abs(ga - ba) / ga > 0.15) {
        const down = ba < ga
        out.push({
          id: 'sleep-output',
          tone: down ? 'warn' : 'good',
          text: `After a night under 6 hours, your study and project time ${down ? 'falls' : 'rises'} ${Math.round(Math.abs(ga - ba) / ga * 100)}%.`,
          detail: `${bad.length} short nights against ${good.length} normal ones.`,
        })
      }
    }
  }

  /* 2. lagged correlations worth showing */
  const candidates = [
    ['sleep', 'mood', 'Sleep last night'],
    ['sleep', 'energy', 'Sleep last night'],
    ['screen', 'mood', 'Screen time yesterday'],
    ['outside', 'mood', 'Time outside yesterday'],
    ['gym', 'energy', 'Training yesterday'],
  ]
  for (const [x, y, label] of candidates) {
    if (!has(x) || !has(y)) continue
    const c = correlate(laggedPairs(byDay, keys, x, y))
    if (!c || Math.abs(c.r) < 0.28) continue
    out.push({
      id: `corr-${x}-${y}`,
      tone: c.r > 0 ? 'good' : 'warn',
      text: `${label} shows a ${strength(c.r)} ${c.r > 0 ? 'positive' : 'negative'} association with your ${byId[y].name.toLowerCase()} today.`,
      detail: `r = ${c.r.toFixed(2)} over ${c.n} paired days. Association, not cause.`,
    })
  }

  /* 3. four-week trend per weighted section */
  if (keys.length >= 28) {
    const recent = keys.slice(-14)
    const prior = keys.slice(-28, -14)
    for (const s of sections) {
      if (s.archived || !s.weight || s.primitive === 'abstain' || s.primitive === 'measure') continue
      const a = rangeTotal(s, byDay, recent)
      const b = rangeTotal(s, byDay, prior)
      if (!b) continue
      const change = (a - b) / b
      if (Math.abs(change) < 0.25) continue
      const good = s.target?.dir === 'atMost' ? change < 0 : change > 0
      out.push({
        id: `trend-${s.id}`,
        tone: good ? 'good' : 'warn',
        text: `${s.name} is ${change > 0 ? 'up' : 'down'} ${Math.round(Math.abs(change) * 100)}% over the last two weeks.`,
        detail: 'Compared with the fortnight before it.',
      })
    }
  }

  /* 4. best and worst weekday for the heaviest-weighted duration section */
  const anchor = sections.find((s) => s.countsToDay && s.weight >= 3)
  if (anchor && keys.length >= 21) {
    const buckets = Array.from({ length: 7 }, () => [])
    for (const k of keys) {
      const v = byDay[k]?.[anchor.id]
      if (v === undefined) continue
      buckets[parse(k).getDay()].push(v)
    }
    const means = buckets.map((b) => (b.length >= 3 ? b.reduce((a, v) => a + v, 0) / b.length : null))
    const valid = means.map((m, i) => [m, i]).filter(([m]) => m !== null)
    if (valid.length >= 5) {
      const best = valid.reduce((a, b) => (b[0] > a[0] ? b : a))
      const worst = valid.reduce((a, b) => (b[0] < a[0] ? b : a))
      const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      if (best[0] > 0 && worst[0] / best[0] < 0.6) {
        out.push({
          id: 'weekday',
          tone: 'neutral',
          text: `${names[best[1]]} is your strongest day for ${anchor.name.toLowerCase()}; ${names[worst[1]]} is the weakest.`,
          detail: 'Across the selected range.',
        })
      }
    }
  }

  return out.slice(0, 6)
}

/* ── misc ───────────────────────────────────────────────────────────── */

export function weekKeys(key = today()) {
  const ws = weekStart(key)
  return range(ws, addDays(ws, 6))
}

export function deltaOf(now, before, goodDir = 'up') {
  if (!Number.isFinite(before) || before === 0) return { tone: 'flat', arrow: 'flat', text: 'no baseline' }
  const change = ((now - before) / before) * 100
  const arrow = Math.abs(change) < 1.5 ? 'flat' : change > 0 ? 'up' : 'down'
  const good = goodDir === 'down' ? change < 0 : change > 0
  return {
    tone: arrow === 'flat' ? 'flat' : good ? 'good' : 'bad',
    arrow,
    change,
    text: `${change > 0 ? '+' : ''}${Math.round(change)}%`,
  }
}
