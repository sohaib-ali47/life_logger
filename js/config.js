/* Configuration — categories, groups, defaults.
 *
 * Three log types, one schema:
 *   duration — a block of time consumed      (value = minutes)
 *   counter  — discrete units accumulated    (value = units of `unit`)
 *   rating   — one score describing the day  (value = 1..10)
 *
 * `slot` maps to the validated categorical palette (--s1 .. --s8).
 * Duration categories are stacked in slot order, so adjacent stack
 * segments are always adjacent palette slots — which is the pairlist
 * the palette was validated against.
 */
(function (global) {
  'use strict';

  const SCHEMA_VERSION = 1;

  /* Coarse buckets used for the composition bar and the Review screen. */
  const GROUPS = [
    { id: 'Rest',  name: 'Rest'      },
    { id: 'Body',  name: 'Body'      },
    { id: 'Mind',  name: 'Mind'      },
    { id: 'Build', name: 'Build'     },
    { id: 'Life',  name: 'Life'      },
    { id: 'Leak',  name: 'Leak'      }
  ];

  const CATEGORIES = [
    /* ── time (these fill the 24h day) ─────────────────────────────── */
    { id: 'sleep',    name: 'Sleep',      icon: 'moon',      type: 'duration', unit: 'min', group: 'Rest',  slot: 1, inDay: true,
      target: { period: 'day',  value: 450,  dir: 'atLeast' }, quick: [420, 450, 480, 510] },

    { id: 'gym',      name: 'Gym',        icon: 'activity',  type: 'duration', unit: 'min', group: 'Body',  slot: 2, inDay: true,
      target: { period: 'week', value: 210,  dir: 'atLeast' }, quick: [30, 45, 60, 90] },

    { id: 'study',    name: 'Study',      icon: 'book',      type: 'duration', unit: 'min', group: 'Mind',  slot: 3, inDay: true,
      target: { period: 'week', value: 480,  dir: 'atLeast' }, quick: [25, 50, 90, 120] },

    { id: 'projects', name: 'Projects',   icon: 'layers',    type: 'duration', unit: 'min', group: 'Build', slot: 4, inDay: true,
      target: { period: 'week', value: 300,  dir: 'atLeast' }, quick: [30, 60, 90, 120] },

    { id: 'work',     name: 'Work',       icon: 'briefcase', type: 'duration', unit: 'min', group: 'Build', slot: 5, inDay: true,
      target: { period: 'week', value: 2100, dir: 'atLeast' }, quick: [60, 120, 240, 480] },

    { id: 'leisure',  name: 'Leisure',    icon: 'coffee',    type: 'duration', unit: 'min', group: 'Life',  slot: 6, inDay: true,
      target: { period: 'week', value: 420,  dir: 'atLeast' }, quick: [30, 60, 90, 120] },

    { id: 'scroll',   name: 'Scroll',     icon: 'phone',     type: 'duration', unit: 'min', group: 'Leak',  slot: 7, inDay: true,
      target: { period: 'week', value: 420,  dir: 'atMost'  }, quick: [15, 30, 45, 60] },

    /* ── intake ────────────────────────────────────────────────────── */
    { id: 'water',    name: 'Water',      icon: 'droplet',   type: 'counter',  unit: 'ml',    group: 'Body', slot: 1, inDay: false,
      target: { period: 'day', value: 2500, dir: 'atLeast' }, quick: [250, 330, 500, 750] },

    { id: 'food',     name: 'Meals',      icon: 'utensils',  type: 'counter',  unit: 'meals', group: 'Body', slot: 8, inDay: false,
      target: { period: 'day', value: 3,    dir: 'atLeast' }, quick: [1] },

    /* ── state ─────────────────────────────────────────────────────── */
    { id: 'mood',     name: 'Mood',       icon: 'smile',     type: 'rating',   unit: '/10', group: 'Mind', slot: 5, inDay: false,
      target: { period: 'day', value: 7, dir: 'atLeast' } },

    { id: 'energy',   name: 'Energy',     icon: 'zap',       type: 'rating',   unit: '/10', group: 'Body', slot: 4, inDay: false,
      target: { period: 'day', value: 7, dir: 'atLeast' } }
  ];

  const SECTIONS = [
    { id: 'time',   title: 'Time',   ids: ['sleep', 'gym', 'study', 'projects', 'work', 'leisure', 'scroll'] },
    { id: 'intake', title: 'Intake', ids: ['water', 'food'] },
    { id: 'state',  title: 'State',  ids: ['mood', 'energy'] }
  ];

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    dayBoundaryHour: 4,   /* a 1am gym session belongs to the previous day */
    weekStartsMonday: true,
    seeded: false
  };

  const RANGES = [
    { id: '7',   label: '7d',  days: 7   },
    { id: '30',  label: '30d', days: 30  },
    { id: '90',  label: '90d', days: 90  },
    { id: '365', label: '1y',  days: 365 }
  ];

  global.Config = {
    SCHEMA_VERSION, GROUPS, CATEGORIES, SECTIONS, DEFAULT_SETTINGS, RANGES,
    byId: function (id) { return CATEGORIES.find(function (c) { return c.id === id; }); },
    duration: function () { return CATEGORIES.filter(function (c) { return c.inDay; }); },
    slotVar: function (cat) { return 'var(--s' + cat.slot + ')'; }
  };
})(window);
