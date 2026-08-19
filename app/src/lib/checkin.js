/* The hourly check-in.
 *
 * The single biggest hole in any time tracker is the hour you forgot to
 * start. So instead of only nudging you to log *now*, this works out how
 * long the day has been unaccounted for and offers to fill the gap
 * retroactively — including "I was still doing the last thing" and "I
 * stopped at 15:20", which is the answer most of the time.
 *
 * It deliberately does not fire while a timer is running (you are already
 * tracking) or in the middle of the night (nobody wants a 03:00 prompt).
 */

import { minutesFromBoundary, localStamp, MIN_PER_DAY } from './dates'

const MIN_GAP = 60          /* under an hour is not worth interrupting for */
const MAX_OFFER = 6 * 60    /* beyond six hours you cannot honestly recall */
const AWAKE_FROM = 8        /* wall-clock hours the prompt is allowed in */
const AWAKE_UNTIL = 24

/**
 * @returns null, or the gap to offer:
 *   { startMin, endMin, minutes, startStamp, last: {section, entry}|null, capped }
 */
export function findGap({ sections, dayEntries, now = new Date(), timer = null, isToday = true }) {
  if (!isToday || timer) return null

  const hour = now.getHours()
  if (hour < AWAKE_FROM || hour >= AWAKE_UNTIL) return null

  const nowMin = minutesFromBoundary(localStamp(now))
  const byId = new Map(sections.map((s) => [s.id, s]))

  /* where the last accounted block of the day ends */
  let endMin = 0
  let last = null
  for (const e of dayEntries) {
    const s = byId.get(e.sectionId)
    if (!s?.countsToDay || !e.at) continue
    const start = minutesFromBoundary(e.at)
    const finish = Math.min(MIN_PER_DAY, start + (e.value || 0))
    if (finish >= endMin) {
      endMin = finish
      last = { section: s, entry: e }
    }
  }

  const rawGap = nowMin - endMin
  if (rawGap < MIN_GAP) return null

  const capped = rawGap > MAX_OFFER
  const startMin = capped ? nowMin - MAX_OFFER : endMin

  return {
    startMin,
    endMin: nowMin,
    minutes: nowMin - startMin,
    last,
    capped,
  }
}

/** one prompt per clock hour, so it asks once and then leaves you alone */
export const checkinId = (now, key) => `checkin:${key}:${now.getHours()}`
