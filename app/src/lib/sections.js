/* Default sections — seed data, not structure. Every field is editable
 * from Setup, and you can add your own.
 *
 * `slot` maps to the validated categorical palette (--s1 … --s8).
 * Sections with countsToDay stack in slot order on the allocation chart,
 * so adjacent stack segments are always adjacent palette slots — the
 * exact pairlist the palette was validated against. Eight slots is the
 * hard cap; a ninth in-day section folds into a neutral band rather than
 * inventing a hue.
 *
 * Screen time deliberately does NOT count toward the 24h: you are on a
 * screen *during* work and leisure, so counting it as its own slice would
 * inflate the accounted total past what the day actually holds.
 */

export const DEFAULT_SECTIONS = [
  /* ── Body ───────────────────────────────────────────────────────── */
  {
    id: 'sleep', name: 'Sleep', primitive: 'duration', icon: 'moon',
    pillar: 'body', slot: 1, weight: 3, countsToDay: true,
    target: { period: 'day', value: 450, dir: 'atLeast' },
    quick: [{ label: '7h', value: 420 }, { label: '7h 30', value: 450 }, { label: '8h', value: 480 }, { label: '8h 30', value: 510 }],
  },
  {
    id: 'eating', name: 'Eating', primitive: 'duration', icon: 'utensils',
    pillar: 'body', slot: 7, weight: 1, countsToDay: true,
    variantLabel: 'Which meal?',
    askOnStart: true,
    variants: [
      { id: 'breakfast', name: 'Breakfast', time: '08:00' },
      { id: 'brunch', name: 'Brunch' },
      { id: 'lunch', name: 'Lunch', time: '13:00' },
      { id: 'dinner', name: 'Dinner', time: '19:30' },
      { id: 'snack', name: 'Snack' },
    ],
    followUp: { when: 'log', field: 'calories', label: 'Calories', type: 'number', unit: 'kcal' },
    target: { period: 'day', value: 90, dir: 'atLeast' },
    quick: [{ label: '15m', value: 15 }, { label: '30m', value: 30 }, { label: '45m', value: 45 }],
  },
  {
    id: 'water', name: 'Water', primitive: 'count', unit: 'ml', icon: 'droplet',
    pillar: 'body', slot: 3, weight: 2,
    target: { period: 'day', value: 2500, dir: 'atLeast' },
    quick: [
      { label: 'Glass', value: 250 },
      { label: 'Mug', value: 330 },
      { label: 'Bottle', value: 500 },
      { label: 'Large', value: 750 },
    ],
    remind: ['10:00', '13:00', '16:00', '19:00'],
  },
  {
    id: 'weight', name: 'Weight', primitive: 'measure', unit: 'kg', icon: 'scale',
    pillar: 'body', slot: 6, weight: 0,
    target: null,
    remind: ['07:30'],
  },
  {
    id: 'supplements', name: 'Supplements', primitive: 'checklist', icon: 'pill',
    pillar: 'body', slot: 8, weight: 1,
    variantLabel: 'What did you take?',
    variants: [
      { id: 'vitamin-d', name: 'Vitamin D' },
      { id: 'omega-3', name: 'Omega 3' },
      { id: 'magnesium', name: 'Magnesium' },
      { id: 'creatine', name: 'Creatine' },
    ],
    target: { period: 'day', value: 4, dir: 'atLeast' },
    remind: ['08:30'],
  },

  /* ── Training ───────────────────────────────────────────────────── */
  {
    id: 'gym', name: 'Gym', primitive: 'session', icon: 'dumbbell',
    pillar: 'training', slot: 2, weight: 3, countsToDay: true,
    variantLabel: 'Which session?',
    askOnStart: true,
    variants: [
      { id: 'push', name: 'Push' },
      { id: 'pull', name: 'Pull' },
      { id: 'legs', name: 'Legs' },
      { id: 'full', name: 'Full body' },
      { id: 'cardio', name: 'Cardio' },
    ],
    exercises: [
      'Bench press', 'Incline dumbbell press', 'Overhead press', 'Lateral raise',
      'Deadlift', 'Barbell row', 'Lat pulldown', 'Bicep curl',
      'Back squat', 'Leg press', 'Romanian deadlift', 'Calf raise',
    ],
    target: { period: 'week', value: 210, dir: 'atLeast' },
    quick: [{ label: '45m', value: 45 }, { label: '1h', value: 60 }, { label: '1h 30', value: 90 }],
  },
  {
    id: 'pushups', name: 'Push-ups', primitive: 'count', unit: 'reps', icon: 'flame',
    pillar: 'training', slot: 5, weight: 2,
    target: { period: 'day', value: 100, dir: 'atLeast' },
    quick: [{ value: 10 }, { value: 20 }, { value: 25 }, { value: 50 }],
  },
  {
    id: 'pullups', name: 'Pull-ups', primitive: 'count', unit: 'reps', icon: 'chevronUp',
    pillar: 'training', slot: 7, weight: 1,
    target: { period: 'day', value: 30, dir: 'atLeast' },
    quick: [{ value: 5 }, { value: 8 }, { value: 10 }, { value: 15 }],
  },

  /* ── Faith ──────────────────────────────────────────────────────── */
  {
    id: 'namaz', name: 'Namaz', primitive: 'checklist', icon: 'lotus',
    pillar: 'faith', slot: 3, weight: 3,
    variantLabel: 'Which prayer?',
    variants: [
      { id: 'fajr', name: 'Fajr', time: '05:15' },
      { id: 'dhuhr', name: 'Dhuhr', time: '13:15' },
      { id: 'asr', name: 'Asr', time: '16:45' },
      { id: 'maghrib', name: 'Maghrib', time: '20:10' },
      { id: 'isha', name: 'Isha', time: '21:45' },
    ],
    target: { period: 'day', value: 5, dir: 'atLeast' },
  },

  /* ── Discipline ─────────────────────────────────────────────────── */
  {
    id: 'nofap', name: 'No-fap', primitive: 'abstain', icon: 'shield',
    pillar: 'discipline', slot: 7, weight: 3,
    /* Scoped and off until asked for: `audience` hides it entirely from
       anyone it does not apply to, and `archived` keeps it off the Today
       screen until you switch it on in Setup. */
    audience: 'male',
    archived: true,
    target: { period: 'streak', value: 30, dir: 'atLeast' },
    followUp: {
      when: 'reset',
      field: 'trigger',
      label: 'What triggered it?',
      type: 'choice',
      options: ['Boredom', 'Stress', 'Tiredness', 'Social media', 'Loneliness', 'Late night', 'Other'],
    },
  },
  {
    id: 'wakeup', name: 'Up by 07:00', primitive: 'check', icon: 'alarm',
    pillar: 'discipline', slot: 2, weight: 2,
    target: { period: 'day', value: 1, dir: 'atLeast' },
    followUp: { when: 'miss', field: 'delayMin', label: 'How late were you?', type: 'number', unit: 'min' },
    remind: ['07:15'],
  },

  /* ── Mind ───────────────────────────────────────────────────────── */
  {
    id: 'study', name: 'Skills', primitive: 'duration', icon: 'book',
    pillar: 'mind', slot: 3, weight: 3, countsToDay: true,
    variantLabel: 'Which skill?',
    askOnStart: true,
    userVariants: true,
    variants: [
      { id: 'system-design', name: 'System design' },
      { id: 'algorithms', name: 'Algorithms' },
      { id: 'finance', name: 'Finance' },
      { id: 'reading', name: 'Reading' },
    ],
    breakEvery: 25,
    target: { period: 'week', value: 480, dir: 'atLeast' },
    quick: [{ label: '25m', value: 25 }, { label: '50m', value: 50 }, { label: '1h 30', value: 90 }],
  },
  {
    id: 'meditation', name: 'Meditation', primitive: 'check', icon: 'sparkle',
    pillar: 'mind', slot: 6, weight: 1,
    target: { period: 'day', value: 1, dir: 'atLeast' },
    remind: ['21:30'],
  },
  {
    id: 'mood', name: 'Mood', primitive: 'scale', icon: 'smile',
    pillar: 'mind', slot: 5, weight: 1,
    target: { period: 'day', value: 7, dir: 'atLeast' },
  },
  {
    id: 'energy', name: 'Energy', primitive: 'scale', icon: 'zap',
    pillar: 'mind', slot: 4, weight: 1,
    target: { period: 'day', value: 7, dir: 'atLeast' },
  },

  /* ── Work ───────────────────────────────────────────────────────── */
  {
    id: 'work', name: 'Finance work', primitive: 'duration', icon: 'briefcase',
    pillar: 'work', slot: 5, weight: 2, countsToDay: true,
    breakEvery: 50,
    target: { period: 'week', value: 2100, dir: 'atLeast' },
    quick: [{ label: '1h', value: 60 }, { label: '2h', value: 120 }, { label: '4h', value: 240 }, { label: '8h', value: 480 }],
  },
  {
    id: 'projects', name: 'Projects', primitive: 'duration', icon: 'layers',
    pillar: 'work', slot: 4, weight: 2, countsToDay: true,
    variantLabel: 'Which project?',
    askOnStart: true,
    userVariants: true,
    variants: [
      { id: 'life-os', name: 'Life OS' },
      { id: 'side-build', name: 'Side build' },
    ],
    breakEvery: 30,
    target: { period: 'week', value: 300, dir: 'atLeast' },
    quick: [{ label: '30m', value: 30 }, { label: '1h', value: 60 }, { label: '1h 30', value: 90 }],
  },

  /* ── Life ───────────────────────────────────────────────────────── */
  {
    id: 'leisure', name: 'Leisure', primitive: 'duration', icon: 'coffee',
    pillar: 'life', slot: 8, weight: 1, countsToDay: true,
    target: { period: 'week', value: 420, dir: 'atLeast' },
    quick: [{ label: '30m', value: 30 }, { label: '1h', value: 60 }, { label: '1h 30', value: 90 }],
  },
  {
    id: 'events', name: 'Events', primitive: 'note', icon: 'inbox',
    pillar: 'life', slot: 6, weight: 0,
    variantLabel: 'Kind',
    userVariants: true,
    variants: [
      { id: 'moment', name: 'Moment' },
      { id: 'idea', name: 'Idea' },
      { id: 'social', name: 'Social' },
      { id: 'admin', name: 'Admin' },
    ],
    target: null,
  },

  /* ── Digital (overlay — never counts toward the 24h) ─────────────── */
  {
    id: 'screen', name: 'Screen time', primitive: 'duration', icon: 'phone',
    pillar: 'digital', slot: 7, weight: 2, countsToDay: false,
    target: { period: 'day', value: 180, dir: 'atMost' },
    quick: [{ label: '15m', value: 15 }, { label: '30m', value: 30 }, { label: '1h', value: 60 }],
    remind: ['22:00'],
  },

  /* ── Outside ────────────────────────────────────────────────────── */
  {
    id: 'outside', name: 'Outside', primitive: 'duration', icon: 'tree',
    pillar: 'outside', slot: 6, weight: 2, countsToDay: true,
    target: { period: 'day', value: 60, dir: 'atLeast' },
    quick: [{ label: '15m', value: 15 }, { label: '30m', value: 30 }, { label: '45m', value: 45 }, { label: '1h', value: 60 }],
  },
]

/* Bump when the shipped defaults change shape. Boot then refreshes the
   built-in sections while leaving anything you created yourself alone. */
export const SECTIONS_VERSION = 3

export const DEFAULT_IDS = new Set(DEFAULT_SECTIONS.map((s) => s.id))

export function withDefaults(section, index = 0) {
  return {
    unit: '',
    quick: [],
    remind: [],
    variants: [],
    weight: 1,
    archived: false,
    countsToDay: false,
    audience: 'all',
    order: index,
    ...section,
  }
}

/* Some sections only apply to some people. A section scoped to an audience
   is not merely hidden from the Today screen — it never appears in Setup
   either, so it is not something to opt out of. */
export const suitsAudience = (section, sex) =>
  !section.audience || section.audience === 'all' || section.audience === sex

export const AUDIENCES = [
  { id: 'male', label: 'Man' },
  { id: 'female', label: 'Woman' },
  { id: 'unspecified', label: 'Prefer not to say' },
]

export const seedSections = () => DEFAULT_SECTIONS.map(withDefaults)
