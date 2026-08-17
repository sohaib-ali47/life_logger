/* Charts — hand-rolled SVG. No chart library.
 *
 * House rules (all enforced here, once, for every chart):
 *   · marks ≤24px thick, 4px rounded data-end, square at the baseline
 *   · 2px surface gap between touching fills — never a stroke
 *   · hairline solid gridlines, one step off the surface, recessive
 *   · lines 2px, markers ≥8px with a 2px surface ring
 *   · text always wears ink tokens, never the series colour
 *   · every chart returns a table spec so no value is hover-gated
 */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const GAP = 2;            /* surface gap between touching fills */
  const BAR_MAX = 24;       /* mark thickness cap */
  const RADIUS = 4;         /* rounded data-end */

  /* ── element helpers ─────────────────────────────────────────────── */
  function sv(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    return e;
  }
  function txt(x, y, s, cls, anchor) {
    const t = sv('text', { x: x, y: y, class: cls || 'axis-label', 'text-anchor': anchor || 'middle' });
    t.textContent = s;
    return t;
  }
  function fill(el, cssVar) { el.style.fill = cssVar; return el; }
  function stroke(el, cssVar) { el.style.stroke = cssVar; return el; }

  function root(w, h) {
    const s = sv('svg', {
      class: 'chart', width: w, height: h,
      viewBox: '0 0 ' + w + ' ' + h, role: 'img'
    });
    return s;
  }

  function widthOf(host, min) {
    const w = host.clientWidth || host.parentElement && host.parentElement.clientWidth || 0;
    return Math.max(min || 260, w);
  }

  /* rounded-top bar path (square at the baseline) */
  function barPath(x, y, w, h, roundTop) {
    if (h <= 0) return '';
    const r = roundTop ? Math.min(RADIUS, w / 2, h) : 0;
    if (!r) return 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
    return 'M' + x + ' ' + (y + h) +
           'V' + (y + r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + (-r) +
           'h' + (w - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r +
           'V' + (y + h) + 'Z';
  }
  /* rounded-right bar path (horizontal bars) */
  function hBarPath(x, y, w, h) {
    const r = Math.min(RADIUS, h / 2, w);
    if (w <= 0) return '';
    if (w <= r) return 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z';
    return 'M' + x + ' ' + y + 'h' + (w - r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r +
           'v' + (h - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + (-r) + ' ' + r +
           'H' + x + 'Z';
  }

  function niceScale(max, count) {
    if (!(max > 0)) return { max: 1, ticks: [0, 1] };
    const raw = max / (count || 4);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + step * 1e-6; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    return { max: top, ticks: ticks };
  }

  /* ── shared tooltip ──────────────────────────────────────────────── */
  const Tip = (function () {
    const node = document.getElementById('tip');
    function show(rows, title, foot) {
      node.textContent = '';
      if (title) {
        const t = document.createElement('div');
        t.className = 'tip__title'; t.textContent = title;
        node.appendChild(t);
      }
      rows.forEach(function (r) {
        const row = document.createElement('div');
        row.className = 'tip__row';
        const key = document.createElement('span');
        key.className = 'tip__key';
        if (r.color) key.style.background = r.color; else key.style.background = 'transparent';
        const name = document.createElement('span');
        name.className = 'tip__name'; name.textContent = r.name;
        const val = document.createElement('span');
        val.className = 'tip__val'; val.textContent = r.value;
        row.append(key, name, val);
        node.appendChild(row);
      });
      if (foot) {
        const f = document.createElement('div');
        f.className = 'tip__foot';
        const a = document.createElement('span'); a.textContent = foot[0] || '';
        const b = document.createElement('span'); b.textContent = foot[1] || '';
        f.append(a, b);
        node.appendChild(f);
      }
      node.hidden = false;
    }
    function move(ev) {
      const pad = 14;
      const r = node.getBoundingClientRect();
      let x = ev.clientX + pad, y = ev.clientY + pad;
      if (x + r.width > window.innerWidth - 8) x = ev.clientX - r.width - pad;
      if (y + r.height > window.innerHeight - 8) y = ev.clientY - r.height - pad;
      node.style.left = Math.max(8, x) + 'px';
      node.style.top = Math.max(8, y) + 'px';
    }
    function hide() { node.hidden = true; }
    return { show, move, hide };
  })();

  function bindTip(el, build) {
    function on(ev) { const d = build(); if (!d) return; Tip.show(d.rows, d.title, d.foot); Tip.move(ev); }
    el.addEventListener('pointerenter', on);
    el.addEventListener('pointermove', function (ev) { Tip.move(ev); });
    el.addEventListener('pointerleave', Tip.hide);
    el.addEventListener('focus', function () {
      const d = build(); if (!d) return;
      Tip.show(d.rows, d.title, d.foot);
      const r = el.getBoundingClientRect();
      Tip.move({ clientX: r.left + r.width / 2, clientY: r.top });
    });
    el.addEventListener('blur', Tip.hide);
  }

  /* ══════════════════════════════════════════════════════════════════
     1. Daily allocation — stacked columns, 24h per day
     ══════════════════════════════════════════════════════════════════ */
  function allocation(host, opts) {
    const keys = opts.keys;
    const hidden = opts.hidden || {};
    const cats = Config.duration().filter(function (c) { return !hidden[c.id]; });
    const byDay = Model.totalsByDay(keys);

    /* bucket to weeks past ~6 weeks so bars stay readable */
    const weekly = keys.length > 45;
    const buckets = [];
    if (weekly) {
      let cur = null;
      keys.forEach(function (k) {
        const ws = Model.weekStart(k);
        if (!cur || cur.id !== ws) { cur = { id: ws, label: Model.fmtDay(ws, 'short'), days: [] }; buckets.push(cur); }
        cur.days.push(k);
      });
    } else {
      keys.forEach(function (k) { buckets.push({ id: k, label: Model.fmtDay(k, 'short'), days: [k] }); });
    }

    buckets.forEach(function (b) {
      b.vals = {};
      let acct = 0;
      cats.forEach(function (c) {
        let s = 0;
        b.days.forEach(function (k) { s += byDay[k][c.id] || 0; });
        b.vals[c.id] = s / b.days.length;         /* avg minutes per day */
        acct += b.vals[c.id];
      });
      b.accounted = Math.min(acct, Model.MIN_PER_DAY);
      b.unlogged = Math.max(0, Model.MIN_PER_DAY - acct);
    });

    const W = widthOf(host);
    const padL = 34, padR = 8, padT = 10, padB = 26;
    const plotH = 210;
    const H = plotH + padT + padB;
    const plotW = W - padL - padR;
    const band = plotW / buckets.length;
    const bw = Math.min(BAR_MAX, Math.max(3, band * 0.66));
    const yOf = function (min) { return padT + plotH - (min / Model.MIN_PER_DAY) * plotH; };

    const svg = root(W, H);
    svg.setAttribute('aria-label', 'Daily time allocation');

    /* grid at 0/6/12/18/24h */
    [0, 360, 720, 1080, 1440].forEach(function (m) {
      const y = Math.round(yOf(m)) + .5;
      svg.appendChild(sv('line', { class: m === 0 ? 'axis-line' : 'grid-line', x1: padL, x2: W - padR, y1: y, y2: y }));
      svg.appendChild(txt(padL - 8, y + 3.5, (m / 60) + 'h', 'axis-label', 'end'));
    });

    const showUnlogged = !hidden.__unlogged;
    const g = sv('g');
    svg.appendChild(g);

    buckets.forEach(function (b, i) {
      const x = padL + i * band + (band - bw) / 2;
      const segs = [];
      cats.forEach(function (c) { if (b.vals[c.id] > 0) segs.push({ id: c.id, name: c.name, v: b.vals[c.id], color: Config.slotVar(c) }); });
      if (showUnlogged && b.unlogged > 0) segs.push({ id: '__unlogged', name: 'Unaccounted', v: b.unlogged, color: 'var(--s-none)' });

      let cursor = padT + plotH;          /* build upward from the baseline */
      segs.forEach(function (s, si) {
        const raw = (s.v / Model.MIN_PER_DAY) * plotH;
        const isTop = si === segs.length - 1;
        const h = Math.max(1, raw - (isTop ? 0 : GAP));
        const y = cursor - raw;
        const p = sv('path', { class: 'mark', d: barPath(x, y, bw, h, isTop) });
        fill(p, s.color);
        g.appendChild(p);
        cursor = y;
      });

      /* hit target spans the whole column, wider than the mark */
      const hit = sv('rect', {
        class: 'hit', x: padL + i * band, y: padT, width: band, height: plotH, tabindex: 0, role: 'button',
        'aria-label': b.label + ', ' + Model.fmtMinutes(b.accounted) + ' accounted'
      });
      bindTip(hit, function () {
        const rows = segs.slice().reverse().map(function (s) {
          return { name: s.name, value: Model.fmtMinutes(s.v, 'compact'), color: s.color };
        });
        return {
          title: weekly ? 'Week of ' + Model.fmtDay(b.id, 'short') : Model.fmtDay(b.id),
          rows: rows,
          foot: ['Accounted', Math.round((b.accounted / Model.MIN_PER_DAY) * 100) + '%']
        };
      });
      hit.addEventListener('click', function () { if (!weekly) location.hash = '#/today/' + b.id; });
      svg.appendChild(hit);
    });

    /* x labels — thin them so they never collide */
    const every = Math.max(1, Math.ceil(buckets.length / Math.floor(plotW / 58)));
    buckets.forEach(function (b, i) {
      if (i % every !== 0 && i !== buckets.length - 1) return;
      svg.appendChild(txt(padL + i * band + band / 2, H - 8, b.label));
    });

    host.textContent = '';
    host.appendChild(svg);

    return {
      columns: [weekly ? 'Week of' : 'Day'].concat(cats.map(function (c) { return c.name + ' (h)'; })).concat(['Unaccounted (h)']),
      rows: buckets.map(function (b) {
        return [b.label].concat(cats.map(function (c) { return (b.vals[c.id] / 60).toFixed(1); })).concat([(b.unlogged / 60).toFixed(1)]);
      })
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     2. Composition bar — one 100% stacked row, part-to-whole at a glance
     ══════════════════════════════════════════════════════════════════ */
  function composition(host, opts) {
    const parts = opts.parts.filter(function (p) { return p.value > 0; });
    const total = parts.reduce(function (a, p) { return a + p.value; }, 0) || 1;
    const W = widthOf(host);
    const H = 34;
    const svg = root(W, H);
    svg.setAttribute('aria-label', opts.label || 'Composition');

    let x = 0;
    parts.forEach(function (p, i) {
      const raw = (p.value / total) * W;
      const last = i === parts.length - 1;
      const w = Math.max(1, raw - (last ? 0 : GAP));
      const r = 5;
      const rect = sv('rect', { class: 'mark', x: x, y: 6, width: w, height: 18, rx: Math.min(r, w / 2) });
      fill(rect, p.color);
      svg.appendChild(rect);

      const hit = sv('rect', { class: 'hit', x: x, y: 0, width: raw, height: H, tabindex: 0, 'aria-label': p.name });
      bindTip(hit, function () {
        return {
          title: p.name,
          rows: [{ name: 'Share', value: Math.round((p.value / total) * 100) + '%', color: p.color },
                 { name: opts.unit || 'Total', value: p.display || Model.fmtMinutes(p.value, 'compact'), color: null }]
        };
      });
      svg.appendChild(hit);
      x += raw;
    });

    host.textContent = '';
    host.appendChild(svg);
    return {
      columns: ['Group', 'Share', 'Total'],
      rows: parts.map(function (p) {
        return [p.name, Math.round((p.value / total) * 100) + '%', p.display || Model.fmtMinutes(p.value, 'compact')];
      })
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     3. Trend — daily columns + 7-day rolling mean, one axis
     ══════════════════════════════════════════════════════════════════ */
  function trend(host, opts) {
    const cat = opts.cat;
    const pts = opts.points;
    const scaleDiv = cat.type === 'duration' ? 60 : 1;          /* minutes -> hours */
    const vals = pts.map(function (p) { return p.value / scaleDiv; });
    const avg = Model.rollingMean(pts, 7, cat.type === 'rating')
      .map(function (v) { return v === null ? null : v / scaleDiv; });
    const target = opts.showTarget !== false && cat.target
      ? Model.dailyTarget(cat) / scaleDiv : null;

    /* floor the scale so an empty category still draws a sane axis */
    const floor = cat.type === 'rating' ? 10 : (cat.type === 'duration' ? 1 : 1);
    const scale = niceScale(Math.max.apply(null, vals.concat([target || 0, floor])), 4);
    const W = widthOf(host);
    const padL = 38, padR = 12, padT = 12, padB = 26;
    const plotH = opts.height || 180;
    const H = plotH + padT + padB;
    const plotW = W - padL - padR;
    const band = plotW / pts.length;
    const bw = Math.min(BAR_MAX, Math.max(2, band - GAP * 2));
    const yOf = function (v) { return padT + plotH - (v / scale.max) * plotH; };
    const xOf = function (i) { return padL + i * band + band / 2; };

    const svg = root(W, H);
    svg.setAttribute('aria-label', cat.name + ' trend');

    scale.ticks.forEach(function (t) {
      const y = Math.round(yOf(t)) + .5;
      svg.appendChild(sv('line', { class: t === 0 ? 'axis-line' : 'grid-line', x1: padL, x2: W - padR, y1: y, y2: y }));
      svg.appendChild(txt(padL - 8, y + 3.5, Model.fmtNumber(t), 'axis-label', 'end'));
    });

    /* daily marks */
    pts.forEach(function (p, i) {
      const v = vals[i];
      if (v > 0) {
        const y = yOf(v);
        const path = sv('path', { class: 'mark', d: barPath(xOf(i) - bw / 2, y, bw, padT + plotH - y, true) });
        fill(path, Config.slotVar(cat));
        path.style.opacity = '.55';
        svg.appendChild(path);
      }
    });

    /* target reference */
    if (target) {
      const y = Math.round(yOf(target)) + .5;
      const l = sv('line', { class: 'target-line', x1: padL, x2: W - padR, y1: y, y2: y });
      svg.appendChild(l);
      const lbl = txt(W - padR, y - 6, 'target', 'axis-label', 'end');
      svg.appendChild(lbl);
    }

    /* rolling mean */
    let d = '', started = false;
    avg.forEach(function (v, i) {
      if (v === null) { started = false; return; }
      d += (started ? 'L' : 'M') + xOf(i) + ' ' + yOf(v) + ' ';
      started = true;
    });
    if (d) {
      const line = sv('path', { d: d.trim(), fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      stroke(line, Config.slotVar(cat));
      svg.appendChild(line);
      /* end marker with a 2px surface ring */
      for (let i = avg.length - 1; i >= 0; i--) {
        if (avg[i] === null) continue;
        const ring = sv('circle', { cx: xOf(i), cy: yOf(avg[i]), r: 5.5 });
        ring.style.fill = 'var(--surface)';
        const dot = sv('circle', { cx: xOf(i), cy: yOf(avg[i]), r: 4 });
        fill(dot, Config.slotVar(cat));
        svg.append(ring, dot);
        break;
      }
    }

    /* crosshair + per-x hit bands */
    const cross = sv('line', { class: 'crosshair', y1: padT, y2: padT + plotH, x1: 0, x2: 0, opacity: 0 });
    svg.appendChild(cross);
    pts.forEach(function (p, i) {
      const hit = sv('rect', { class: 'hit', x: padL + i * band, y: padT, width: band, height: plotH, tabindex: 0, 'aria-label': Model.fmtDay(p.key) });
      hit.addEventListener('pointerenter', function () { cross.setAttribute('x1', xOf(i)); cross.setAttribute('x2', xOf(i)); cross.setAttribute('opacity', 1); });
      hit.addEventListener('pointerleave', function () { cross.setAttribute('opacity', 0); });
      bindTip(hit, function () {
        const rows = [{ name: cat.name, value: Model.fmtValue(cat, p.value), color: Config.slotVar(cat) }];
        if (avg[i] !== null) rows.push({ name: '7-day average', value: Model.fmtNumber(avg[i]) + (cat.type === 'duration' ? ' h' : ''), color: null });
        return { title: Model.fmtDay(p.key), rows: rows };
      });
      svg.appendChild(hit);
    });

    const every = Math.max(1, Math.ceil(pts.length / Math.floor(plotW / 56)));
    pts.forEach(function (p, i) {
      if (i % every !== 0 && i !== pts.length - 1) return;
      svg.appendChild(txt(xOf(i), H - 8, Model.fmtDay(p.key, 'short')));
    });

    host.textContent = '';
    host.appendChild(svg);
    return {
      columns: ['Day', cat.name + ' (' + Model.unitLabel(cat) + ')', '7-day average'],
      rows: pts.map(function (p, i) {
        return [Model.fmtDay(p.key, 'short'), Model.fmtNumber(vals[i]), avg[i] === null ? '—' : Model.fmtNumber(avg[i])];
      })
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     4. Ranked horizontal bars — where the time actually went
     ══════════════════════════════════════════════════════════════════ */
  function ranked(host, opts) {
    const rows = opts.rows.slice().sort(function (a, b) { return b.value - a.value; });
    const max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    const W = widthOf(host);
    const labelW = 78, valueW = 62;
    const rowH = 30, barH = 12;
    const H = rows.length * rowH + 4;
    const plotW = Math.max(40, W - labelW - valueW);

    const svg = root(W, H);
    svg.setAttribute('aria-label', opts.label || 'Ranked totals');

    rows.forEach(function (r, i) {
      const y = i * rowH + 4;
      const cy = y + rowH / 2 - 4;
      const name = txt(0, cy + 4, r.name, 'axis-label', 'start');
      name.style.fill = 'var(--ink-2)';
      name.setAttribute('font-size', '12');
      svg.appendChild(name);

      const w = (r.value / max) * plotW;
      const p = sv('path', { class: 'mark', d: hBarPath(labelW, cy - barH / 2 + 2, Math.max(2, w), barH) });
      fill(p, r.color);
      svg.appendChild(p);

      const val = txt(W, cy + 4, r.display, 'axis-label', 'end');
      val.style.fill = 'var(--ink)';
      val.setAttribute('font-size', '12');
      val.setAttribute('font-weight', '600');
      svg.appendChild(val);

      const hit = sv('rect', { class: 'hit', x: 0, y: y, width: W, height: rowH, tabindex: 0, 'aria-label': r.name + ' ' + r.display });
      bindTip(hit, function () {
        return {
          title: r.name,
          rows: [{ name: opts.metric || 'Total', value: r.display, color: r.color }]
            .concat(r.sub ? [{ name: r.sub.name, value: r.sub.value, color: null }] : [])
        };
      });
      if (r.href) hit.addEventListener('click', function () { location.hash = r.href; });
      if (r.href) hit.style.cursor = 'pointer';
      svg.appendChild(hit);
    });

    host.textContent = '';
    host.appendChild(svg);
    return {
      columns: [opts.dimension || 'Category', opts.metric || 'Total'],
      rows: rows.map(function (r) { return [r.name, r.display]; })
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     5. Consistency heatmap — sequential blue, one hue, light→dark
     ══════════════════════════════════════════════════════════════════ */
  function heatmap(host, opts) {
    const keys = opts.keys;
    const valueOf = opts.valueOf;
    const cell = 12, gap = 3, step = cell + gap;
    const rowsN = 7;
    const first = keys[0];
    const firstDow = (function () {
      const d = Model.parse(first).getDay();
      return Store.settings().weekStartsMonday ? (d === 0 ? 6 : d - 1) : d;
    })();
    const cols = Math.ceil((keys.length + firstDow) / rowsN);

    const padL = 26, padT = 16;
    const W = padL + cols * step;
    const H = padT + rowsN * step + 4;
    const svg = root(Math.max(W, 100), H);
    svg.setAttribute('aria-label', opts.label || 'Consistency');

    const dayNames = Store.settings().weekStartsMonday
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    [0, 2, 4].forEach(function (r) {
      svg.appendChild(txt(padL - 6, padT + r * step + cell - 2, dayNames[r], 'axis-label', 'end'));
    });

    const vals = keys.map(valueOf);
    const max = Math.max.apply(null, vals.concat([1]));
    let lastMonth = -1;

    keys.forEach(function (k, i) {
      const idx = i + firstDow;
      const col = Math.floor(idx / rowsN), row = idx % rowsN;
      const x = padL + col * step, y = padT + row * step;
      const v = vals[i];
      const level = v <= 0 ? 0 : Math.min(6, 1 + Math.floor((v / max) * 5.999));
      const rect = sv('rect', { class: 'hm-cell', x: x, y: y, width: cell, height: cell, tabindex: 0, 'aria-label': Model.fmtDay(k) });
      rect.style.fill = 'var(--q' + level + ')';
      bindTip(rect, function () {
        return { title: Model.fmtDay(k), rows: [{ name: opts.metric || 'Logged', value: opts.format ? opts.format(v) : Model.fmtNumber(v), color: 'var(--q' + Math.max(1, level) + ')' }] };
      });
      rect.addEventListener('click', function () { location.hash = '#/today/' + k; });
      svg.appendChild(rect);

      const m = Model.parse(k).getMonth();
      if (row === 0 && m !== lastMonth) {
        lastMonth = m;
        svg.appendChild(txt(x + cell / 2, padT - 6, Model.fmtDay(k, 'short').split(' ')[0], 'axis-label', 'middle'));
      }
    });

    host.textContent = '';
    host.appendChild(svg);
    return {
      columns: ['Day', opts.metric || 'Value'],
      rows: keys.map(function (k, i) { return [Model.fmtDay(k, 'short'), opts.format ? opts.format(vals[i]) : Model.fmtNumber(vals[i])]; })
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     6. Hour-of-day histogram — when you actually do the thing
     ══════════════════════════════════════════════════════════════════ */
  function hours(host, opts) {
    const counts = opts.counts;               /* length 24, minutes per hour slot */
    const scale = niceScale(Math.max.apply(null, counts.concat([1])), 3);
    const W = widthOf(host);
    const padL = 34, padR = 8, padT = 10, padB = 24;
    const plotH = 120, H = plotH + padT + padB, plotW = W - padL - padR;
    const band = plotW / 24;
    const bw = Math.min(BAR_MAX, Math.max(3, band - GAP * 2));
    const yOf = function (v) { return padT + plotH - (v / scale.max) * plotH; };

    const svg = root(W, H);
    svg.setAttribute('aria-label', 'Time of day');
    scale.ticks.forEach(function (t) {
      const y = Math.round(yOf(t)) + .5;
      svg.appendChild(sv('line', { class: t === 0 ? 'axis-line' : 'grid-line', x1: padL, x2: W - padR, y1: y, y2: y }));
      svg.appendChild(txt(padL - 8, y + 3.5, Model.fmtNumber(t), 'axis-label', 'end'));
    });

    counts.forEach(function (v, h) {
      const x = padL + h * band + (band - bw) / 2;
      if (v > 0) {
        const y = yOf(v);
        const p = sv('path', { class: 'mark', d: barPath(x, y, bw, padT + plotH - y, true) });
        fill(p, opts.color || 'var(--s1)');
        svg.appendChild(p);
      }
      const hit = sv('rect', { class: 'hit', x: padL + h * band, y: padT, width: band, height: plotH, tabindex: 0, 'aria-label': h + ':00' });
      bindTip(hit, function () {
        return { title: Model.pad(h) + ':00 – ' + Model.pad((h + 1) % 24) + ':00', rows: [{ name: opts.metric || 'Total', value: opts.format ? opts.format(v) : Model.fmtNumber(v), color: opts.color || 'var(--s1)' }] };
      });
      svg.appendChild(hit);
    });

    [0, 6, 12, 18, 23].forEach(function (h) {
      svg.appendChild(txt(padL + h * band + band / 2, H - 7, Model.pad(h) + ':00'));
    });

    host.textContent = '';
    host.appendChild(svg);
    return {
      columns: ['Hour', opts.metric || 'Total'],
      rows: counts.map(function (v, h) { return [Model.pad(h) + ':00', opts.format ? opts.format(v) : Model.fmtNumber(v)]; })
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     7. Day timeline — a 24h band showing where the blocks landed
     ══════════════════════════════════════════════════════════════════ */
  function timeline(host, opts) {
    const blocks = opts.blocks;               /* {startMin, minutes, cat} from day boundary */
    const W = widthOf(host);
    const H = 42;
    const svg = root(W, H);
    svg.setAttribute('aria-label', 'Day timeline');

    const trackY = 8, trackH = 22;
    const bg = sv('rect', { x: 0, y: trackY, width: W, height: trackH, rx: 6 });
    bg.style.fill = 'var(--s-none)';
    svg.appendChild(bg);

    blocks.forEach(function (b) {
      const x = (b.startMin / Model.MIN_PER_DAY) * W;
      const w = Math.max(2, (b.minutes / Model.MIN_PER_DAY) * W - 1);
      const rect = sv('rect', { class: 'mark', x: x, y: trackY, width: w, height: trackH, rx: Math.min(4, w / 2) });
      fill(rect, Config.slotVar(b.cat));
      svg.appendChild(rect);

      const hit = sv('rect', { class: 'hit', x: Math.max(0, x - 6), y: 0, width: w + 12, height: H, tabindex: 0, 'aria-label': b.cat.name });
      bindTip(hit, function () {
        return {
          title: b.cat.name,
          rows: [{ name: b.label, value: Model.fmtMinutes(b.minutes, 'compact'), color: Config.slotVar(b.cat) }]
        };
      });
      svg.appendChild(hit);
    });

    const boundary = Store.settings().dayBoundaryHour || 0;
    [0, 6, 12, 18, 24].forEach(function (h) {
      const x = (h / 24) * W;
      const label = Model.pad((boundary + h) % 24) + ':00';
      const t = txt(Math.min(W - 14, Math.max(14, x)), H - 2, label);
      svg.appendChild(t);
    });

    host.textContent = '';
    host.appendChild(svg);
    return {
      columns: ['Start', 'Activity', 'Duration'],
      rows: blocks.map(function (b) { return [b.label, b.cat.name, Model.fmtMinutes(b.minutes, 'compact')]; })
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     8. Sparkline + progress ring — figure furniture
     ══════════════════════════════════════════════════════════════════ */
  function sparkline(values, w, h, color) {
    const W = w || 96, H = h || 26;
    const max = Math.max.apply(null, values.concat([1]));
    const svg = root(W, H);
    svg.setAttribute('aria-hidden', 'true');
    const xOf = function (i) { return (i / Math.max(1, values.length - 1)) * (W - 2) + 1; };
    const yOf = function (v) { return H - 2 - (v / max) * (H - 5); };
    let d = '';
    values.forEach(function (v, i) { d += (i ? 'L' : 'M') + xOf(i) + ' ' + yOf(v) + ' '; });
    const area = sv('path', { d: d + 'L' + xOf(values.length - 1) + ' ' + H + ' L' + xOf(0) + ' ' + H + ' Z', 'fill-opacity': .10 });
    fill(area, color || 'var(--s1)');
    const line = sv('path', { d: d.trim(), fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    stroke(line, color || 'var(--s1)');
    svg.append(area, line);
    return svg;
  }

  function ring(pct, size, label) {
    const s = size || 44, sw = 4, r = (s - sw) / 2, c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(1.4, pct || 0));
    const svg = root(s, s);
    svg.classList.add('ring');
    svg.setAttribute('aria-hidden', 'true');
    const t = sv('circle', { class: 'ring__track', cx: s / 2, cy: s / 2, r: r, fill: 'none', 'stroke-width': sw });
    const f = sv('circle', {
      class: 'ring__fill', cx: s / 2, cy: s / 2, r: r, fill: 'none', 'stroke-width': sw, 'stroke-linecap': 'round',
      'stroke-dasharray': c, 'stroke-dashoffset': c * (1 - Math.min(1, p)),
      transform: 'rotate(-90 ' + (s / 2) + ' ' + (s / 2) + ')'
    });
    svg.append(t, f);
    if (label) {
      const tx = txt(s / 2, s / 2 + 3.5, label, 'ring__text');
      svg.appendChild(tx);
    }
    return svg;
  }

  global.Charts = {
    allocation, composition, trend, ranked, heatmap, hours, timeline, sparkline, ring,
    niceScale, Tip
  };
})(window);
