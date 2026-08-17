// All dates are handled as local-time "YYYY-MM-DD" day keys so that an entry
// logged at 11pm belongs to that day, not to the next UTC day.

export function dayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key, delta) {
  const d = parseDayKey(key)
  d.setDate(d.getDate() + delta)
  return dayKey(d)
}

/** Inclusive list of day keys ending today, `count` long, oldest first. */
export function lastNDays(count, endKey = dayKey()) {
  const keys = []
  for (let i = count - 1; i >= 0; i--) keys.push(addDays(endKey, -i))
  return keys
}

/** Monday-anchored week key for a day. */
export function weekStart(key) {
  const d = parseDayKey(key)
  const offset = (d.getDay() + 6) % 7 // Mon = 0
  d.setDate(d.getDate() - offset)
  return dayKey(d)
}

export function lastNWeeks(count, endKey = dayKey()) {
  const current = weekStart(endKey)
  const keys = []
  for (let i = count - 1; i >= 0; i--) keys.push(addDays(current, -7 * i))
  return keys
}

export function formatDay(key, opts = { month: 'short', day: 'numeric' }) {
  return parseDayKey(key).toLocaleDateString(undefined, opts)
}

export function formatDayLong(key) {
  const today = dayKey()
  if (key === today) return 'Today'
  if (key === addDays(today, -1)) return 'Yesterday'
  return parseDayKey(key).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

/** "2h 15m" — the app stores minutes everywhere and formats only at the edge. */
export function formatMinutes(total) {
  const mins = Math.max(0, Math.round(total))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (!h) return `${m}m`
  if (!m) return `${h}h`
  return `${h}h ${m}m`
}
