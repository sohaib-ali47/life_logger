import { CATEGORIES, categoryOf } from './categories'
import { addDays, dayKey, formatDay, lastNDays, lastNWeeks, weekStart } from './dates'

/** Total minutes per day across the window, zero-filled so gaps read as gaps. */
export function dailyTotals(entries, days) {
  const keys = lastNDays(days)
  const window = new Set(keys)
  const totals = new Map(keys.map((k) => [k, 0]))
  for (const e of entries) {
    if (window.has(e.day)) totals.set(e.day, totals.get(e.day) + e.minutes)
  }
  return keys.map((key) => ({
    key,
    label: formatDay(key),
    minutes: totals.get(key),
  }))
}

/** Minutes per category over the window, ranked high→low, zeroes dropped. */
export function categoryTotals(entries, days) {
  const window = new Set(lastNDays(days))
  const totals = new Map(CATEGORIES.map((c) => [c.id, 0]))
  for (const e of entries) {
    if (window.has(e.day)) totals.set(e.category, (totals.get(e.category) ?? 0) + e.minutes)
  }
  const grand = [...totals.values()].reduce((a, b) => a + b, 0)
  return CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    color: c.color,
    minutes: totals.get(c.id),
    share: grand ? totals.get(c.id) / grand : 0,
  }))
    .filter((row) => row.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
}

/** Minutes per Monday-anchored week, for the long-arc trend. */
export function weeklyTotals(entries, weeks) {
  const keys = lastNWeeks(weeks)
  const totals = new Map(keys.map((k) => [k, 0]))
  for (const e of entries) {
    const w = weekStart(e.day)
    if (totals.has(w)) totals.set(w, totals.get(w) + e.minutes)
  }
  return keys.map((key) => ({
    key,
    label: formatDay(key),
    minutes: totals.get(key),
  }))
}

/** Consecutive days with at least one entry, counting back from today. */
export function currentStreak(entries) {
  const logged = new Set(entries.map((e) => e.day))
  let cursor = dayKey()
  // A day with nothing logged yet shouldn't break a streak that's still alive.
  if (!logged.has(cursor)) cursor = addDays(cursor, -1)
  let streak = 0
  while (logged.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function summary(entries, days) {
  const daily = dailyTotals(entries, days)
  const total = daily.reduce((sum, d) => sum + d.minutes, 0)
  const activeDays = daily.filter((d) => d.minutes > 0).length
  const ranked = categoryTotals(entries, days)
  const top = ranked[0]
  return {
    total,
    activeDays,
    // Average across days actually logged — dividing by the window would
    // read as "you did less" simply because the window got longer.
    average: activeDays ? total / activeDays : 0,
    topCategory: top ? categoryOf(top.id).label : null,
    topCategoryMinutes: top ? top.minutes : 0,
    streak: currentStreak(entries),
  }
}
