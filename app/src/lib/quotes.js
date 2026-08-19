/* Motivation, rationed.
 *
 * One line per day, chosen by the date rather than at random, so it does
 * not reshuffle every time you tap something — a quote that changes on
 * every render is wallpaper, not a message. Twenty-four of them, so a
 * month passes before you see a repeat.
 *
 * Deliberately unsentimental: these are about attention and consistency,
 * which is what the app is actually measuring.
 */

export const QUOTES = [
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', by: 'James Clear' },
  { text: 'How we spend our days is, of course, how we spend our lives.', by: 'Annie Dillard' },
  { text: 'It is not that we have a short time to live, but that we waste a lot of it.', by: 'Seneca' },
  { text: 'Discipline equals freedom.', by: 'Jocko Willink' },
  { text: 'What gets measured gets managed.', by: 'Peter Drucker' },
  { text: 'The days are long but the decades are short.', by: 'Sam Altman' },
  { text: 'Amateurs sit and wait for inspiration. The rest of us just get up and go to work.', by: 'Stephen King' },
  { text: 'You will never always be motivated. You have to learn to be disciplined.', by: null },
  { text: 'Small daily improvements are the key to staggering long-term results.', by: null },
  { text: 'The obstacle is the way.', by: 'Marcus Aurelius' },
  { text: 'Confine yourself to the present.', by: 'Marcus Aurelius' },
  { text: 'We suffer more in imagination than in reality.', by: 'Seneca' },
  { text: 'Action is the foundational key to all success.', by: 'Pablo Picasso' },
  { text: 'A year from now you may wish you had started today.', by: 'Karen Lamb' },
  { text: 'Do the hard jobs first. The easy jobs will take care of themselves.', by: 'Dale Carnegie' },
  { text: 'Your future is created by what you do today, not tomorrow.', by: 'Robert Kiyosaki' },
  { text: 'It is better to do a little well than a great deal badly.', by: 'Socrates' },
  { text: 'Consistency is what transforms average into excellence.', by: null },
  { text: 'The successful warrior is the average man, with laser-like focus.', by: 'Bruce Lee' },
  { text: 'What you track, you can change. What you ignore, runs you.', by: null },
  { text: 'Motivation gets you started. Habit keeps you going.', by: 'Jim Rohn' },
  { text: 'He who has a why to live can bear almost any how.', by: 'Friedrich Nietzsche' },
  { text: 'Nothing will work unless you do.', by: 'Maya Angelou' },
  { text: 'Time is the one thing you cannot get more of, only better at spending.', by: null },
]

/** stable for a whole day — indexed by the date, not by chance */
export function quoteFor(dayKey) {
  const digits = String(dayKey).replace(/\D/g, '')
  let sum = 0
  for (let i = 0; i < digits.length; i++) sum += Number(digits[i]) * (i + 1)
  return QUOTES[sum % QUOTES.length]
}

/* ── greetings ──────────────────────────────────────────────────────── */

/** the salutation depends on the clock, because "Good morning" at 23:00
    is the fastest way to look like a template */
export function greeting(date = new Date(), name = null) {
  const h = date.getHours()
  const part =
    h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Winding down'
  return name ? `${part}, ${name}` : part
}

/** first name only — "Good morning, Sohaib Ali" reads like a form letter */
export function firstName(user) {
  const full = user?.user_metadata?.full_name?.trim()
  if (full) return full.split(/\s+/)[0]
  const email = user?.email
  if (!email) return null
  const handle = email.split('@')[0].replace(/[._-]+/g, ' ').trim()
  if (!handle) return null
  return handle.split(/\s+/)[0].replace(/^./, (c) => c.toUpperCase())
}
