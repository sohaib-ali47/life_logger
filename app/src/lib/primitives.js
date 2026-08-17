/* The primitives.
 *
 * Every section in the app is one of these. Adding a section is data, not
 * code — pick a primitive, name it, set a target. That is the whole
 * difference between a system and a pile of hardcoded screens.
 *
 * Three cross-cutting features any primitive can opt into:
 *   variants  — named sub-kinds (lunch/dinner, which project, which prayer)
 *   followUp  — a question asked after the fact (calories, trigger, delay)
 *   breakEvery— a nudge while a timer has been running too long
 */

export const PRIMITIVES = {
  duration: {
    id: 'duration',
    name: 'Duration',
    blurb: 'A block of time. Sleep, gym, eating, study, work, screen.',
    unit: 'min',
    agg: 'sum',
    rangeAgg: 'sum',
    oneADay: false,
    timed: true,
    timeline: true,
    countsToDay: true,
    variants: true,
    chart: 'trend',
  },
  count: {
    id: 'count',
    name: 'Count',
    blurb: 'Units that add up. Water, push-ups, pages, cigarettes.',
    unit: 'x',
    agg: 'sum',
    rangeAgg: 'sum',
    oneADay: false,
    timed: true,
    timeline: false,
    countsToDay: false,
    variants: true,
    chart: 'trend',
  },
  check: {
    id: 'check',
    name: 'Check',
    blurb: 'Did it or did not, once a day. Wake-up time, cold shower.',
    unit: '',
    agg: 'max',
    rangeAgg: 'sum',
    oneADay: true,
    timed: false,
    timeline: false,
    countsToDay: false,
    variants: false,
    chart: 'heatmap',
  },
  checklist: {
    id: 'checklist',
    name: 'Checklist',
    blurb: 'A fixed set of items, each ticked off daily. Prayers, supplements.',
    unit: 'done',
    agg: 'count',
    rangeAgg: 'sum',
    oneADay: false,
    timed: true,
    timeline: false,
    countsToDay: false,
    variants: true,
    requiresVariants: true,
    chart: 'trend',
  },
  abstain: {
    id: 'abstain',
    name: 'Abstain',
    blurb: 'Days clean since the last reset. The streak is the whole point.',
    unit: 'days',
    agg: 'none',
    rangeAgg: 'none',
    oneADay: false,
    timed: true,
    timeline: false,
    countsToDay: false,
    variants: false,
    event: true,
    chart: 'streak',
  },
  scale: {
    id: 'scale',
    name: 'Scale',
    blurb: 'A 1–10 score for the day. Mood, energy, focus, urge intensity.',
    unit: '/10',
    agg: 'last',
    rangeAgg: 'avg',
    oneADay: true,
    timed: false,
    timeline: false,
    countsToDay: false,
    variants: false,
    min: 1,
    max: 10,
    chart: 'trend',
  },
  measure: {
    id: 'measure',
    name: 'Measure',
    blurb: 'A value that moves rather than accumulates. Weight, resting HR.',
    unit: '',
    agg: 'last',
    rangeAgg: 'last',
    oneADay: true,
    timed: false,
    timeline: false,
    countsToDay: false,
    variants: false,
    chart: 'line',
  },
  session: {
    id: 'session',
    name: 'Session',
    blurb: 'A workout — duration plus the exercises, reps and weight you did.',
    unit: 'min',
    agg: 'sum',
    rangeAgg: 'sum',
    oneADay: false,
    timed: true,
    timeline: true,
    countsToDay: true,
    variants: true,
    sets: true,
    chart: 'trend',
  },
  note: {
    id: 'note',
    name: 'Event',
    blurb: 'Anything else worth recording, in your own words, stamped with the time.',
    unit: '',
    agg: 'count',
    rangeAgg: 'sum',
    oneADay: false,
    timed: true,
    timeline: false,
    countsToDay: false,
    variants: true,
    text: true,
    chart: 'heatmap',
  },
}

export const primitiveOf = (section) => PRIMITIVES[section.primitive] ?? PRIMITIVES.count

/** Primitives a user can pick when creating a section. */
export const BUILDABLE = ['duration', 'count', 'check', 'checklist', 'abstain', 'scale', 'measure', 'session', 'note']

export const PILLARS = [
  { id: 'body',       name: 'Body' },
  { id: 'training',   name: 'Training' },
  { id: 'discipline', name: 'Discipline' },
  { id: 'faith',      name: 'Faith' },
  { id: 'mind',       name: 'Mind' },
  { id: 'work',       name: 'Work' },
  { id: 'life',       name: 'Life' },
  { id: 'digital',    name: 'Digital' },
  { id: 'outside',    name: 'Outside' },
]

/* ── quick presets ──────────────────────────────────────────────────
   Stored as { label, value } so a chip can say "Glass" rather than
   "250 ml". Plain numbers from older data still work.               */
export const normaliseQuick = (quick = []) =>
  quick.map((q) => (typeof q === 'object' ? q : { value: q })).filter((q) => q.value > 0)

/* ── variants ────────────────────────────────────────────────────── */
export const variantsOf = (section) => section.variants ?? []
export const variantById = (section, id) => variantsOf(section).find((v) => v.id === id) ?? null
export const variantName = (section, id) => variantById(section, id)?.name ?? null

export const slug = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `v${Date.now().toString(36)}`
