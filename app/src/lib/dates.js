/* Dates.
 *
 * The unit of account is a day key: "2026-08-16". Never a timestamp.
 * A configurable boundary (default 04:00) decides which day a late-night
 * session belongs to, so a 01:20 gym session lands on the previous day
 * and no total ever moves because of DST or a timezone change.
 */

let BOUNDARY = 4
let WEEK_STARTS_MONDAY = true

export function configure({ dayBoundaryHour, weekStartsMonday }) {
  if (typeof dayBoundaryHour === 'number') BOUNDARY = dayBoundaryHour
  if (typeof weekStartsMonday === 'boolean') WEEK_STARTS_MONDAY = weekStartsMonday
}
export const boundary = () => BOUNDARY

export const pad = (n) => (n < 10 ? `0${n}` : `${n}`)

export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Which logical day does this instant belong to? */
export function dayKeyFor(date = new Date()) {
  const d = new Date(date.getTime())
  d.setHours(d.getHours() - BOUNDARY)
  return keyOf(d)
}

export const today = () => dayKeyFor(new Date())

export function parse(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key, n) {
  const d = parse(key)
  d.setDate(d.getDate() + n)
  return keyOf(d)
}

export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000)

/** inclusive, oldest first */
export function range(startKey, endKey) {
  const out = []
  let k = startKey
  let guard = 0
  while (k <= endKey && guard++ < 4000) {
    out.push(k)
    k = addDays(k, 1)
  }
  return out
}

export const lastNDays = (n, endKey = today()) => range(addDays(endKey, -(n - 1)), endKey)

export function weekStart(key) {
  const dow = parse(key).getDay() // 0 = Sunday
  const back = WEEK_STARTS_MONDAY ? (dow === 0 ? 6 : dow - 1) : dow
  return addDays(key, -back)
}

export const isFuture = (key) => key > today()

/** Local naive ISO — never UTC, so the stored clock time is the wall
    clock you actually saw. Seconds are kept: the exact moment something
    started is what makes the timing patterns readable later. */
export function localStamp(date = new Date()) {
  return `${keyOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** "18:42" for display */
export const clockOf = (stamp) => (stamp ? stamp.slice(11, 16) : '—')

/** minutes elapsed since the day boundary, for the timeline */
export function minutesFromBoundary(stamp) {
  const h = Number(stamp.slice(11, 13))
  const m = Number(stamp.slice(14, 16))
  return (((h - BOUNDARY) + 24) % 24) * 60 + m
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDay(key, style = 'medium') {
  const d = parse(key)
  if (style === 'short') return `${MON[d.getMonth()]} ${d.getDate()}`
  if (style === 'dow') return DOW[d.getDay()]
  if (style === 'full') return `${DOW[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`
}

export function relativeDay(key) {
  const d = diffDays(key, today())
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d === -1) return 'Tomorrow'
  return null
}

export const weekdayNames = () =>
  WEEK_STARTS_MONDAY
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const weekIndex = (key) => {
  const dow = parse(key).getDay()
  return WEEK_STARTS_MONDAY ? (dow === 0 ? 6 : dow - 1) : dow
}

export const MIN_PER_DAY = 1440
