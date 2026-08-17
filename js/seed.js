/* Seed — plausible demo history so the graphs have something to say
 * on first open. Deterministic (fixed-seed LCG) so the demo looks the
 * same every time, with realistic weekday/weekend structure, a couple
 * of skipped days, and a rough sleep→mood coupling to make the
 * correlation view honest rather than decorative.
 */
(function (global) {
  'use strict';

  function rng(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function localISO(dayKey, hour, minute) {
    let key = dayKey, h = hour;
    while (h >= 24) { h -= 24; key = Model.addDays(key, 1); }
    return key + 'T' + Model.pad(h) + ':' + Model.pad(Math.round(minute)) + ':00';
  }

  function generate(days) {
    const n = days || 90;
    const r = rng(20260816);
    const keys = Model.lastNDays(n);
    const entries = [];
    const closed = [];

    function push(catId, dayKey, value, hour, minute, note) {
      if (value <= 0) return;
      entries.push({
        id: Store.uid(),
        categoryId: catId,
        date: dayKey,
        value: Math.round(value),
        startedAt: hour === null ? null : localISO(dayKey, hour, minute || 0),
        note: note || '',
        tags: [],
        source: 'seed',
        createdAt: new Date().toISOString(),
        deletedAt: null
      });
    }

    const studyNotes = ['system design', 'algorithms', 'reading — deep work', 'course module', 'notes review', ''];
    const gymNotes = ['push', 'pull', 'legs', 'run', 'mobility', ''];
    const projNotes = ['life monitor', 'side build', 'refactor', 'shipping', ''];

    keys.forEach(function (key, idx) {
      const dow = Model.parse(key).getDay();          /* 0 Sun .. 6 Sat */
      const weekend = dow === 0 || dow === 6;
      const isToday = idx === keys.length - 1;
      const week = Math.floor(idx / 7);

      /* a few days simply never got logged — the honest failure mode */
      if (!isToday && r() < 0.07) return;

      /* a slow upward drift so the trend lines have a story */
      const drift = Math.min(1, week / 12);

      /* ── sleep ─────────────────────────────────────────────────── */
      const sleepH = 6.1 + r() * 2.1 + (weekend ? 0.6 : 0) + drift * 0.3;
      const bedH = 22 + Math.floor(r() * 3);          /* 22:00 – 00:xx */
      const bedM = Math.floor(r() * 60);
      push('sleep', key, sleepH * 60, bedH, bedM);

      /* ── work ──────────────────────────────────────────────────── */
      if (!weekend) {
        const workH = 6.5 + r() * 2.6;
        push('work', key, workH * 60, 9, Math.floor(r() * 30));
      } else if (r() < 0.18) {
        push('work', key, (1 + r() * 2) * 60, 11, 0, 'catch-up');
      }

      /* ── gym: 3–4 sessions a week, more consistent over time ───── */
      const gymChance = (weekend ? 0.45 : 0.42) + drift * 0.14;
      if (r() < gymChance) {
        const morning = r() < 0.4;
        push('gym', key, 38 + r() * 42, morning ? 7 : 18, Math.floor(r() * 40),
             gymNotes[Math.floor(r() * gymNotes.length)]);
      }

      /* ── study ─────────────────────────────────────────────────── */
      if (r() < 0.62 + drift * 0.2) {
        const mins = (weekend ? 45 : 30) + r() * (weekend ? 90 : 75) + drift * 25;
        push('study', key, mins, weekend ? 10 : 19, 30 + Math.floor(r() * 25),
             studyNotes[Math.floor(r() * studyNotes.length)]);
      }

      /* ── projects ──────────────────────────────────────────────── */
      if (r() < (weekend ? 0.72 : 0.45) + drift * 0.15) {
        const mins = 35 + r() * (weekend ? 145 : 85);
        push('projects', key, mins, weekend ? 13 : 20, 30 + Math.floor(r() * 25),
             projNotes[Math.floor(r() * projNotes.length)]);
      }

      /* ── leisure ───────────────────────────────────────────────── */
      if (r() < 0.8) push('leisure', key, 35 + r() * (weekend ? 150 : 70), weekend ? 16 : 21, Math.floor(r() * 40));

      /* ── scroll: the leak, worse on tired days and weekends ────── */
      const tired = sleepH < 6.8 ? 1 : 0;
      const scrollMin = 22 + r() * 70 + (weekend ? 35 : 0) + tired * 28 - drift * 18;
      push('scroll', key, Math.max(8, scrollMin), 12, 30);
      if (r() < 0.7) push('scroll', key, 12 + r() * 45, 22, Math.floor(r() * 50));

      /* ── water ─────────────────────────────────────────────────── */
      const glasses = 4 + Math.floor(r() * 5 + drift * 1.5);
      for (let g = 0; g < glasses; g++) {
        const size = [250, 330, 500][Math.floor(r() * 3)];
        push('water', key, size, 8 + Math.floor(g * (13 / glasses)), Math.floor(r() * 55));
      }

      /* ── meals ─────────────────────────────────────────────────── */
      const meals = r() < 0.22 ? 2 : 3;
      [8, 13, 19].slice(0, meals).forEach(function (h) {
        push('food', key, 1, h, Math.floor(r() * 45));
      });

      /* ── mood & energy: loosely follow sleep and the leak ──────── */
      if (r() < 0.86) {
        const base = 4.4 + (sleepH - 6.5) * 1.15 - (scrollMin > 100 ? 0.7 : 0) + drift * 0.9;
        const mood = Math.max(2, Math.min(10, Math.round(base + (r() - 0.5) * 2)));
        const energy = Math.max(2, Math.min(10, Math.round(base + (r() - 0.5) * 2.4 - (weekend ? -0.4 : 0.2))));
        push('mood', key, mood, null);
        push('energy', key, energy, null);
      }

      if (!isToday) closed.push(key);
    });

    return { entries: entries, closedDays: closed };
  }

  global.Seed = { generate };
})(window);
