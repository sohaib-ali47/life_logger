/* Model — dates, aggregation, targets, streaks, formatting.
 *
 * Day keys ("2026-08-16") are the unit of account, not timestamps:
 * a session started at 01:20 belongs to the previous day when the
 * day boundary is 04:00. Everything downstream keys off that string,
 * so DST and timezone shifts can't move a day's totals.
 */
(function (global) {
  'use strict';

  const MIN_PER_DAY = 1440;

  /* ── dates ───────────────────────────────────────────────────────── */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function keyOf(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  /* Which logical day does this instant belong to? */
  function dayKeyFor(date) {
    const b = Store.settings().dayBoundaryHour || 0;
    const d = new Date(date.getTime());
    d.setHours(d.getHours() - b);
    return keyOf(d);
  }

  function today() { return dayKeyFor(new Date()); }

  function parse(key) {
    const p = key.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function addDays(key, n) {
    const d = parse(key);
    d.setDate(d.getDate() + n);
    return keyOf(d);
  }

  function diffDays(a, b) {
    return Math.round((parse(b) - parse(a)) / 86400000);
  }

  /* inclusive list of day keys, oldest first */
  function range(startKey, endKey) {
    const out = [];
    let k = startKey;
    let guard = 0;
    while (k <= endKey && guard++ < 4000) { out.push(k); k = addDays(k, 1); }
    return out;
  }

  function lastNDays(n, endKey) {
    const end = endKey || today();
    return range(addDays(end, -(n - 1)), end);
  }

  function weekStart(key) {
    const d = parse(key);
    const dow = d.getDay();                       /* 0 = Sun */
    const back = Store.settings().weekStartsMonday ? (dow === 0 ? 6 : dow - 1) : dow;
    return addDays(key, -back);
  }

  function isFuture(key) { return key > today(); }

  /* ── formatting ──────────────────────────────────────────────────── */
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtDay(key, style) {
    const d = parse(key);
    if (style === 'short') return MON[d.getMonth()] + ' ' + d.getDate();
    if (style === 'dow') return DOW[d.getDay()];
    if (style === 'full') return DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear();
    return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
  }

  function relativeDay(key) {
    const d = diffDays(key, today());
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d === -1) return 'Tomorrow';
    return null;
  }

  function fmtMinutes(min, style) {
    const m = Math.round(min);
    if (!m) return '0m';
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (style === 'compact') {
      if (h && r) return h + 'h ' + r + 'm';
      return h ? h + 'h' : r + 'm';
    }
    if (h && r) return h + 'h ' + r + 'm';
    return h ? h + 'h' : r + 'm';
  }

  function fmtClock(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
  }

  function fmtNumber(n) {
    const v = Math.round(n * 10) / 10;
    return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  /* the display string for a category value */
  function fmtValue(cat, value) {
    if (cat.type === 'duration') return fmtMinutes(value);
    if (cat.type === 'rating') return value ? fmtNumber(value) : '—';
    if (cat.unit === 'ml') return value >= 1000 ? fmtNumber(value / 1000) + ' L' : Math.round(value) + ' ml';
    return fmtNumber(value) + (cat.unit === 'meals' ? '' : ' ' + cat.unit);
  }

  function unitLabel(cat) {
    if (cat.type === 'duration') return 'hours';
    if (cat.type === 'rating') return '/10';
    return cat.unit;
  }

  function aggregation(cat) { return cat.type === 'rating' ? 'avg' : 'sum'; }

  /* ── aggregation ─────────────────────────────────────────────────── */

  /* { categoryId: value } for one day */
  function dayTotals(key) {
    const out = {};
    Store.entriesOn(key).forEach(function (e) {
      if (Config.byId(e.categoryId) && Config.byId(e.categoryId).type === 'rating') out[e.categoryId] = e.value;
      else out[e.categoryId] = (out[e.categoryId] || 0) + e.value;
    });
    return out;
  }

  /* { dayKey: { categoryId: value } } for a list of days — one pass */
  function totalsByDay(keys) {
    const index = {};
    keys.forEach(function (k) { index[k] = {}; });
    Store.entries().forEach(function (e) {
      if (!(e.date in index)) return;
      const cat = Config.byId(e.categoryId);
      if (!cat) return;
      if (cat.type === 'rating') index[e.date][e.categoryId] = e.value;
      else index[e.date][e.categoryId] = (index[e.date][e.categoryId] || 0) + e.value;
    });
    return index;
  }

  /* { categoryId: total } across a range; ratings averaged over days present */
  function totalsInRange(keys) {
    const byDay = totalsByDay(keys);
    const sums = {}, counts = {};
    keys.forEach(function (k) {
      const d = byDay[k];
      Object.keys(d).forEach(function (id) {
        sums[id] = (sums[id] || 0) + d[id];
        counts[id] = (counts[id] || 0) + 1;
      });
    });
    const out = {};
    Object.keys(sums).forEach(function (id) {
      const cat = Config.byId(id);
      out[id] = (cat && aggregation(cat) === 'avg') ? sums[id] / counts[id] : sums[id];
    });
    return out;
  }

  /* [{ key, value }] daily series for one category (0 where nothing logged) */
  function series(catId, keys) {
    const byDay = totalsByDay(keys);
    return keys.map(function (k) {
      return { key: k, value: byDay[k][catId] || 0, logged: catId in byDay[k] };
    });
  }

  /* Trailing mean; null until the window is full, so the line never
     invents a value it does not have. `ignoreZeros` is for ratings,
     where an unlogged day is missing data — not a score of zero. */
  function rollingMean(points, window, ignoreZeros) {
    const out = [];
    for (let i = 0; i < points.length; i++) {
      if (i < window - 1) { out.push(null); continue; }
      let s = 0, n = 0;
      for (let j = i - window + 1; j <= i; j++) {
        if (ignoreZeros && !points[j].value) continue;
        s += points[j].value; n++;
      }
      out.push(n ? s / n : null);
    }
    return out;
  }

  /* minutes accounted for on a day (duration categories only) */
  function loggedMinutes(key, byDayIndex) {
    const d = (byDayIndex && byDayIndex[key]) || dayTotals(key);
    let sum = 0;
    Config.duration().forEach(function (c) { sum += d[c.id] || 0; });
    return Math.min(sum, MIN_PER_DAY);
  }

  function unloggedMinutes(key, byDayIndex) {
    return Math.max(0, MIN_PER_DAY - loggedMinutes(key, byDayIndex));
  }

  /* ── targets ─────────────────────────────────────────────────────── */

  function dailyTarget(cat) {
    if (!cat.target) return null;
    return cat.target.period === 'week' ? cat.target.value / 7 : cat.target.value;
  }

  function targetForDays(cat, nDays) {
    const d = dailyTarget(cat);
    return d === null ? null : d * nDays;
  }

  /* 0..n  — 1 means "on target". atMost categories invert. */
  function attainment(cat, actual, nDays) {
    const t = targetForDays(cat, nDays || 1);
    if (!t) return null;
    if (cat.type === 'rating') {
      const tt = cat.target.value;
      return actual ? actual / tt : 0;
    }
    if (cat.target.dir === 'atMost') return actual <= t ? 1 : t / actual;
    return actual / t;
  }

  function meetsTarget(cat, actual, nDays) {
    const t = cat.type === 'rating' ? cat.target.value : targetForDays(cat, nDays || 1);
    if (!t) return false;
    return cat.target.dir === 'atMost' ? actual <= t : actual >= t;
  }

  /* ── streaks & consistency ───────────────────────────────────────── */

  /* A day counts when the category hit its daily-equivalent target.
     Unlogged days break the streak — that's the point of logging. */
  function streak(catId) {
    const cat = Config.byId(catId);
    const keys = lastNDays(400);
    const byDay = totalsByDay(keys);
    let current = 0, longest = 0, run = 0;
    for (let i = 0; i < keys.length; i++) {
      const v = byDay[keys[i]][catId] || 0;
      if (meetsTarget(cat, v, 1)) { run++; longest = Math.max(longest, run); }
      else run = 0;
    }
    /* current run may end today or yesterday (today might not be done yet) */
    const t = today();
    let k = t;
    const todayVal = byDay[t] ? (byDay[t][catId] || 0) : 0;
    if (!meetsTarget(cat, todayVal, 1)) k = addDays(t, -1);
    while (byDay[k] && meetsTarget(cat, byDay[k][catId] || 0, 1)) { current++; k = addDays(k, -1); }
    return { current: current, longest: longest };
  }

  /* days with any entry at all, in a range */
  function daysLogged(keys) {
    const byDay = totalsByDay(keys);
    return keys.filter(function (k) { return Object.keys(byDay[k]).length > 0; }).length;
  }

  function overallStreak() {
    const keys = lastNDays(400);
    const byDay = totalsByDay(keys);
    let current = 0;
    let k = today();
    if (!byDay[k] || !Object.keys(byDay[k]).length) k = addDays(k, -1);
    while (byDay[k] && Object.keys(byDay[k]).length) { current++; k = addDays(k, -1); }
    let longest = 0, run = 0;
    keys.forEach(function (key) {
      if (byDay[key] && Object.keys(byDay[key]).length) { run++; longest = Math.max(longest, run); }
      else run = 0;
    });
    return { current: current, longest: longest };
  }

  /* ── grouping ────────────────────────────────────────────────────── */
  function groupTotals(totals) {
    const out = {};
    Config.GROUPS.forEach(function (g) { out[g.id] = 0; });
    Config.duration().forEach(function (c) { out[c.group] += totals[c.id] || 0; });
    return out;
  }

  /* ── deltas ──────────────────────────────────────────────────────── */
  function pctChange(now, before) {
    if (!before) return now ? null : 0;   /* null = no baseline to compare */
    return ((now - before) / before) * 100;
  }

  global.Model = {
    MIN_PER_DAY, pad, keyOf, dayKeyFor, today, parse, addDays, diffDays, range,
    lastNDays, weekStart, isFuture,
    fmtDay, relativeDay, fmtMinutes, fmtClock, fmtNumber, fmtValue, unitLabel, aggregation,
    dayTotals, totalsByDay, totalsInRange, series, rollingMean,
    loggedMinutes, unloggedMinutes,
    dailyTarget, targetForDays, attainment, meetsTarget,
    streak, overallStreak, daysLogged, groupTotals, pctChange
  };
})(window);
