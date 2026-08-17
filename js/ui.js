/* UI — screens, components, interactions. */
(function (global) {
  'use strict';

  const redraws = [];      /* re-run on resize; reset on every screen render */

  /* ── tiny DOM helper ─────────────────────────────────────────────── */
  function el(tag, props, kids) {
    const n = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style') {
        /* custom properties need setProperty — plain assignment is a no-op */
        for (const p in v) {
          if (p.slice(0, 2) === '--') n.style.setProperty(p, v[p]);
          else n.style[p] = v[p];
        }
      }
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return n;
  }
  function ico(name, size) { return Icons.svg(name, size); }
  function tintOf(cat) { return Config.slotVar(cat); }

  /* big number + its unit, split so the unit can be set smaller */
  function splitValue(cat, value) {
    if (cat.type === 'duration') return { text: Model.fmtMinutes(value, 'compact'), unit: '' };
    if (cat.type === 'rating') return { text: value ? String(value) : '—', unit: '/10' };
    if (cat.unit === 'ml') return value >= 1000
      ? { text: Model.fmtNumber(value / 1000), unit: 'L' }
      : { text: String(Math.round(value)), unit: 'ml' };
    return { text: Model.fmtNumber(value), unit: cat.unit };
  }

  /* every duration category in validated slot order, plus what was never logged */
  function compositionParts(totals, spanMinutes, accounted) {
    return Config.duration().map(function (c) {
      return { name: c.name, value: totals[c.id] || 0, color: tintOf(c) };
    }).concat([{ name: 'Unaccounted', value: Math.max(0, spanMinutes - accounted), color: 'var(--s-none)' }]);
  }

  /* ── toast with undo ─────────────────────────────────────────────── */
  let toastTimer = null;
  function toast(message, actionLabel, onAction) {
    const node = document.getElementById('toast');
    node.textContent = '';
    node.appendChild(el('span', { text: message }));
    if (actionLabel) {
      node.appendChild(el('button', {
        class: 'btn btn--sm', text: actionLabel,
        onclick: function () { node.hidden = true; onAction(); }
      }));
    }
    node.appendChild(el('button', { class: 'iconbtn', 'aria-label': 'Dismiss', onclick: function () { node.hidden = true; } }, [ico('x', 15)]));
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, 6000);
  }

  /* ── modal ───────────────────────────────────────────────────────── */
  function modal(title, bodyNodes, footNodes) {
    const dlg = document.getElementById('modal');
    dlg.textContent = '';
    const head = el('div', { class: 'modal__head' }, [
      el('h2', { id: 'modalTitle', text: title }),
      el('button', { class: 'iconbtn', 'aria-label': 'Close', onclick: function () { dlg.close(); } }, [ico('x', 17)])
    ]);
    dlg.appendChild(el('div', { class: 'modal__body' },
      [head].concat(bodyNodes).concat([el('div', { class: 'modal__foot' }, footNodes || [])])));
    dlg.showModal();
    return dlg;
  }

  /* ── card + chart card (with the table twin) ─────────────────────── */
  function card(opts, kids) {
    const head = el('div', { class: 'card__head' }, [
      el('h2', { class: 'card__title', text: opts.title }),
      opts.tools ? el('div', { class: 'card__tools' }, opts.tools) : null
    ]);
    const body = [head];
    if (opts.sub) body.push(el('div', { class: 'card__sub', text: opts.sub }));
    return el('section', { class: 'card' }, body.concat(kids || []));
  }

  /* opts: {title, sub, render(host)->{columns,rows}, legend, tools, note} */
  function chartCard(opts) {
    const host = el('div', { class: 'chart-host' });
    const tableWrap = el('div', { class: 'tableview', hidden: true });
    let spec = null;
    let showing = false;

    function draw() {
      spec = opts.render(host) || { columns: [], rows: [] };
      if (showing) fillTable();
    }
    function fillTable() {
      tableWrap.textContent = '';
      const t = el('table');
      t.appendChild(el('thead', null, [el('tr', null, spec.columns.map(function (c) { return el('th', { scope: 'col', text: c }); }))]));
      t.appendChild(el('tbody', null, spec.rows.map(function (r) {
        return el('tr', null, r.map(function (c, i) { return el(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null, text: c }); }));
      })));
      tableWrap.appendChild(t);
    }

    const toggle = el('button', {
      class: 'iconbtn', 'aria-label': 'Show data table', title: 'Data table', 'aria-pressed': 'false',
      onclick: function () {
        showing = !showing;
        toggle.setAttribute('aria-pressed', String(showing));
        toggle.setAttribute('aria-label', showing ? 'Show chart' : 'Show data table');
        host.hidden = showing;
        tableWrap.hidden = !showing;
        if (showing) fillTable();
      }
    }, [ico('table', 16)]);

    const tools = (opts.tools || []).concat([toggle]);
    const node = card({ title: opts.title, sub: opts.sub, tools: tools },
      [host, tableWrap, opts.legend || null, opts.note ? el('div', { class: 'card__sub', style: { marginTop: '10px', marginBottom: 0 }, text: opts.note }) : null]
        .filter(Boolean));

    redraws.push(draw);
    /* first draw after layout so clientWidth is real */
    requestAnimationFrame(draw);
    return node;
  }

  function legend(items, onToggle) {
    return el('div', { class: 'legend' }, items.map(function (it) {
      const sw = el('span', { class: 'legend__swatch' + (it.shape === 'line' ? ' legend__swatch--line' : ''), style: { background: it.color } });
      const label = el('span', { text: it.name });
      if (!onToggle) return el('span', { class: 'legend__item' }, [sw, label]);
      return el('button', {
        class: 'legend__item', type: 'button', dataset: { off: String(!!it.off) },
        'aria-pressed': String(!it.off),
        onclick: function () { onToggle(it.id); }
      }, [sw, label]);
    }));
  }

  /* ── stat tile ───────────────────────────────────────────────────── */
  function stat(opts) {
    const kids = [
      el('div', { class: 'stat__label', text: opts.label }),
      el('div', { class: 'stat__value' }, [opts.value, opts.unit ? el('small', { text: opts.unit }) : null].filter(Boolean))
    ];
    if (opts.delta) {
      const d = opts.delta;
      /* colour says good/bad, arrow says which way the number moved —
         they disagree for a category where less is better. */
      const arrow = d.arrow || d.dir;
      kids.push(el('div', { class: 'stat__delta stat__delta--' + d.dir }, [
        ico(arrow === 'up' ? 'arrowup' : arrow === 'down' ? 'arrowdown' : 'dash', 13),
        el('span', { text: d.text })
      ]));
    }
    if (opts.spark) kids.push(el('div', { class: 'stat__spark' }, [opts.spark]));
    return el('div', { class: 'card' }, [el('div', { class: 'stat' }, kids)]);
  }

  function deltaOf(now, before, goodDir, fmt) {
    if (before === null || before === undefined || !isFinite(before) || before === 0) {
      return { dir: 'flat', text: 'no baseline' };
    }
    const pct = ((now - before) / before) * 100;
    const dir = Math.abs(pct) < 1.5 ? 'flat' : (pct > 0 ? 'up' : 'down');
    const good = goodDir === 'down' ? (pct < 0) : (pct > 0);
    const cls = dir === 'flat' ? 'flat' : (good ? 'up' : 'down');
    const text = (pct > 0 ? '+' : '') + Math.round(pct) + '% vs previous';
    return { dir: cls, text: text, raw: pct, arrow: dir };
  }

  /* ── meters ──────────────────────────────────────────────────────── */
  function meter(cat, actual, nDays) {
    const target = cat.type === 'rating' ? cat.target.value : Model.targetForDays(cat, nDays);
    const pct = target ? Math.min(1.25, actual / target) : 0;
    const hit = Model.meetsTarget(cat, actual, nDays);
    const over = cat.target.dir === 'atMost';

    const track = el('div', { class: 'meter__track' }, [
      el('div', {
        class: 'meter__fill',
        style: {
          width: Math.min(100, pct * 100 / 1.25) + '%',
          background: over && !hit ? 'var(--critical)' : tintOf(cat)
        }
      }),
      el('div', { class: 'meter__mark', style: { left: (100 / 1.25) + '%' }, title: 'target' })
    ]);

    return el('div', { style: { '--tint': tintOf(cat) } }, [
      el('div', { class: 'meter__row' }, [
        el('div', { class: 'meter__name' }, [
          el('span', { class: 'meter__key', style: { background: tintOf(cat) } }),
          el('span', { text: cat.name }),
          over ? el('span', { class: 'muted', style: { fontSize: '11px' }, text: '· cap' }) : null
        ].filter(Boolean)),
        el('div', { class: 'meter__val', text: Model.fmtValue(cat, actual) + '  /  ' + Model.fmtValue(cat, target) })
      ]),
      track
    ]);
  }

  /* ══════════════════════════════════════════════════════════════════
     SCREEN · Today
     ══════════════════════════════════════════════════════════════════ */
  function screenToday(view, dayKey) {
    const key = dayKey || Model.today();
    const isToday = key === Model.today();
    const totals = Model.dayTotals(key);
    const entries = Store.entriesOn(key);
    const accounted = Model.loggedMinutes(key);
    const boundary = Store.settings().dayBoundaryHour || 0;

    /* header */
    view.appendChild(el('div', { class: 'head' }, [
      el('div', null, [
        el('div', { class: 'head__eyebrow', text: Model.relativeDay(key) || Model.fmtDay(key, 'dow') }),
        el('h1', { text: Model.fmtDay(key, 'full') })
      ]),
      el('div', { class: 'head__actions' }, [
        el('button', { class: 'iconbtn iconbtn--bordered', 'aria-label': 'Previous day', onclick: function () { location.hash = '#/today/' + Model.addDays(key, -1); } }, [ico('left', 16)]),
        el('button', { class: 'iconbtn iconbtn--bordered', 'aria-label': 'Next day', disabled: Model.isFuture(Model.addDays(key, 1)), onclick: function () { location.hash = '#/today/' + Model.addDays(key, 1); } }, [ico('right', 16)]),
        !isToday ? el('button', { class: 'btn btn--sm', text: 'Today', onclick: function () { location.hash = '#/today'; } }) : null,
        el('button', {
          class: 'btn btn--sm' + (Store.isClosed(key) ? ' btn--primary' : ''),
          onclick: function () {
            Store.setClosed(key, !Store.isClosed(key));
            toast(Store.isClosed(key) ? 'Day closed — blanks now count as real zeros.' : 'Day reopened.');
            App.render();
          }
        }, [ico(Store.isClosed(key) ? 'check' : 'lock', 15), el('span', { text: Store.isClosed(key) ? 'Day closed' : 'Close day' })])
      ].filter(Boolean))
    ]));

    /* ── hero ─────────────────────────────────────────────────────── */
    const blocks = entries.filter(function (e) {
      const c = Config.byId(e.categoryId);
      return c && c.inDay && e.startedAt;
    }).map(function (e) {
      const c = Config.byId(e.categoryId);
      const h = Number(e.startedAt.slice(11, 13)), m = Number(e.startedAt.slice(14, 16));
      let startMin = ((h - boundary) + 24) % 24 * 60 + m;
      const minutes = Math.min(e.value, Model.MIN_PER_DAY - startMin);
      return { startMin: startMin, minutes: Math.max(4, minutes), cat: c, label: Model.pad(h) + ':' + Model.pad(m) };
    }).sort(function (a, b) { return a.startMin - b.startMin; });

    const parts = compositionParts(totals, Model.MIN_PER_DAY, accounted);

    const heroCard = el('section', { class: 'card' }, [
      el('div', { class: 'hero' }, [
        el('div', null, [
          el('div', { class: 'hero__figure' }, [
            Model.fmtNumber(accounted / 60),
            el('span', { class: 'hero__unit', text: 'h accounted' })
          ]),
          el('div', { class: 'hero__label', text: Math.round((accounted / Model.MIN_PER_DAY) * 100) + '% of the day is logged. The rest — ' + Model.fmtMinutes(Model.MIN_PER_DAY - accounted, 'compact') + ' — went somewhere you did not record.' })
        ]),
        el('div', { class: 'hero__side' }, [
          el('div', { class: 'stat' }, [
            el('div', { class: 'stat__label', text: 'Entries' }),
            el('div', { class: 'stat__value', text: String(entries.length) })
          ]),
          el('div', { class: 'stat' }, [
            el('div', { class: 'stat__label', text: 'Streak' }),
            el('div', { class: 'stat__value' }, [String(Model.overallStreak().current), el('small', { text: 'days' })])
          ])
        ])
      ])
    ]);
    view.appendChild(heroCard);

    view.appendChild(chartCard({
      title: 'Day timeline',
      sub: 'Where the blocks actually landed, from ' + Model.pad(boundary) + ':00.',
      render: function (host) {
        if (!blocks.length) { host.textContent = ''; host.appendChild(emptyState('clock', 'Nothing timed yet today.')); return { columns: [], rows: [] }; }
        return Charts.timeline(host, { blocks: blocks });
      },
      legend: legend(Config.duration().map(function (c) { return { name: c.name, color: tintOf(c) }; }))
    }));

    /* ── timer ────────────────────────────────────────────────────── */
    view.appendChild(timerCard(key));

    /* ── log tiles — the primary action, above the analysis ───────── */
    Config.SECTIONS.forEach(function (sec) {
      view.appendChild(el('h2', { class: 'section-title', text: sec.title }));
      view.appendChild(el('div', { class: 'tiles' }, sec.ids.map(function (id) {
        return logTile(Config.byId(id), key, totals[id] || 0);
      })));
    });

    view.appendChild(el('h2', { class: 'section-title', text: 'Composition' }));
    view.appendChild(chartCard({
      title: 'Day composition',
      sub: 'Part-to-whole across the 24 hours.',
      render: function (host) { return Charts.composition(host, { parts: parts, label: 'Day composition' }); },
      legend: legend(parts.map(function (p) { return { name: p.name, color: p.color }; }))
    }));

    /* ── entries ──────────────────────────────────────────────────── */
    view.appendChild(el('h2', { class: 'section-title', text: 'Entries' }));
    view.appendChild(card({
      title: entries.length ? entries.length + ' logged' : 'Nothing logged',
      tools: [el('button', { class: 'btn btn--sm', onclick: function () { openEntryModal(key); } }, [ico('plus', 15), el('span', { text: 'Add' })])]
    }, [
      entries.length
        ? el('ul', { class: 'entries' }, entries.map(function (e) { return entryRow(e); }))
        : emptyState('inbox', 'No entries for this day. Use the tiles above, or add one manually.')
    ]));
  }

  function emptyState(icon, text) {
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty__icon' }, [ico(icon, 19)]),
      el('div', { text: text })
    ]);
  }

  function entryRow(e) {
    const cat = Config.byId(e.categoryId);
    const time = e.startedAt ? e.startedAt.slice(11, 16) : '—';
    return el('li', { class: 'entry', style: { '--tint': tintOf(cat) } }, [
      el('span', { class: 'entry__bar' }),
      el('div', null, [
        el('div', { class: 'entry__name', text: cat.name }),
        e.note ? el('div', { class: 'entry__note', text: e.note }) : null
      ].filter(Boolean)),
      el('div', { class: 'entry__val', text: Model.fmtValue(cat, e.value) }),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
        el('span', { class: 'entry__time', text: time }),
        el('button', {
          class: 'iconbtn entry__del', 'aria-label': 'Delete entry',
          onclick: function () {
            Store.deleteEntry(e.id);
            toast('Entry deleted.', 'Undo', function () { Store.undoDelete(); App.render(); });
            App.render();
          }
        }, [ico('trash', 15)])
      ])
    ]);
  }

  /* ── timer card ──────────────────────────────────────────────────── */
  let tickHandle = null;
  function timerCard(dayKey) {
    const t = Store.timer();
    clearInterval(tickHandle);

    if (t) {
      const cat = Config.byId(t.categoryId);
      const clock = el('div', { class: 'timer__clock', text: '0:00' });
      function tick() { clock.textContent = Model.fmtClock(Date.now() - new Date(t.startedAt.replace(' ', 'T')).getTime()); }
      tick();
      tickHandle = setInterval(tick, 1000);

      return card({ title: 'Running' }, [
        el('div', { class: 'timer', style: { '--tint': tintOf(cat) } }, [
          el('span', { class: 'timer__dot' }),
          clock,
          el('div', { class: 'timer__what' }, [ico(cat.icon, 16), el('span', { text: cat.name })]),
          el('div', { style: { marginLeft: 'auto', display: 'flex', gap: '8px' } }, [
            el('button', { class: 'btn btn--primary', onclick: function () { stopTimer(); } }, [ico('stop', 14), el('span', { text: 'Stop & log' })]),
            el('button', { class: 'btn btn--ghost', text: 'Discard', onclick: function () { Store.clearTimer(); App.render(); } })
          ])
        ])
      ]);
    }

    return card({ title: 'Timer', sub: 'Start one and it logs itself when you stop.' }, [
      el('div', { class: 'timer__pick' }, Config.duration().map(function (c) {
        return el('button', {
          class: 'chip', style: { '--tint': tintOf(c) },
          onclick: function () { Store.startTimer(c.id); App.render(); }
        }, [ico('play', 12), el('span', { text: c.name })]);
      }))
    ]);
  }

  function stopTimer() {
    const t = Store.timer();
    if (!t) return;
    const start = new Date(t.startedAt);
    const mins = Math.max(1, Math.round((Date.now() - start.getTime()) / 60000));
    const key = Model.dayKeyFor(start);
    Store.addEntry({
      categoryId: t.categoryId, date: key, value: mins,
      startedAt: key + 'T' + Model.pad(start.getHours()) + ':' + Model.pad(start.getMinutes()) + ':00',
      source: 'timer'
    });
    Store.clearTimer();
    toast(Config.byId(t.categoryId).name + ' — ' + Model.fmtMinutes(mins, 'compact') + ' logged.');
    App.render();
  }

  /* ── log tile ────────────────────────────────────────────────────── */
  function logTile(cat, dayKey, value) {
    const dailyTarget = cat.type === 'rating' ? cat.target.value : Model.dailyTarget(cat);
    const pct = dailyTarget ? value / dailyTarget : 0;
    const hit = Model.meetsTarget(cat, value, 1);
    const over = cat.target && cat.target.dir === 'atMost';

    function add(amount) {
      const now = new Date();
      const isToday = dayKey === Model.today();
      Store.addEntry({
        categoryId: cat.id, date: dayKey, value: amount,
        startedAt: isToday ? dayKey + 'T' + Model.pad(now.getHours()) + ':' + Model.pad(now.getMinutes()) + ':00' : null
      });
      App.render();
    }

    let control;
    if (cat.type === 'rating') {
      const current = value || 0;
      control = el('div', { class: 'rate' }, Array.from({ length: 10 }, function (_, i) {
        const n = i + 1;
        return el('button', {
          type: 'button', 'aria-pressed': String(current === n), 'aria-label': cat.name + ' ' + n + ' out of 10',
          text: String(n), onclick: function () { add(n); }
        });
      }));
    } else {
      control = el('div', { class: 'tile__quick' }, (cat.quick || []).map(function (q) {
        return el('button', {
          class: 'chip',
          text: cat.type === 'duration' ? Model.fmtMinutes(q, 'compact') : (cat.unit === 'ml' ? q + ' ml' : '+' + q),
          onclick: function () { add(q); }
        });
      }).concat([
        el('button', { class: 'chip chip--icon', 'aria-label': 'Custom amount', onclick: function () { openEntryModal(dayKey, cat.id); } }, [ico('plus', 13)])
      ]));
    }

    const metaText = cat.target
      ? (over ? 'cap ' : 'target ') + Model.fmtValue(cat, dailyTarget) + (cat.target.period === 'week' ? '/day · ' + Model.fmtValue(cat, cat.target.value) + '/wk' : '/day')
      : '';

    return el('div', {
      class: 'tile' + (hit && !over ? ' tile--hit' : ''),
      style: { '--tint': tintOf(cat) }
    }, [
      el('div', { class: 'tile__top' }, [
        el('span', { class: 'tile__icon' }, [ico(cat.icon, 16)]),
        el('div', null, [
          el('div', { class: 'tile__name', text: cat.name }),
          el('div', { class: 'tile__meta', text: metaText })
        ]),
        el('button', {
          class: 'iconbtn tile__open', 'aria-label': 'Open ' + cat.name,
          onclick: function () { location.hash = '#/category/' + cat.id; }
        }, [ico('external', 15)])
      ]),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, [
        el('div', { class: 'tile__figure' }, [
          el('span', { class: 'tile__value', text: splitValue(cat, value).text }),
          el('span', { class: 'tile__unit', text: splitValue(cat, value).unit })
        ]),
        el('div', { style: { marginLeft: 'auto' } }, [Charts.ring(over ? Math.min(1, pct) : pct, 40)])
      ]),
      control
    ]);
  }

  /* ── manual entry modal ──────────────────────────────────────────── */
  function openEntryModal(dayKey, presetCat) {
    const catSel = el('select', { class: 'input' }, Config.CATEGORIES.map(function (c) {
      return el('option', { value: c.id, selected: c.id === presetCat, text: c.name + ' (' + Model.unitLabel(c) + ')' });
    }));
    const dateIn = el('input', { class: 'input', type: 'date', value: dayKey });
    const timeIn = el('input', { class: 'input', type: 'time', value: '' });
    const valIn = el('input', { class: 'input', type: 'number', min: '0', step: 'any', placeholder: 'Amount' });
    const noteIn = el('textarea', { class: 'input', placeholder: 'Note (optional)' });

    const hint = el('div', { class: 'card__sub', style: { marginBottom: 0 } });
    function syncHint() {
      const c = Config.byId(catSel.value);
      hint.textContent = c.type === 'duration' ? 'Minutes.' : c.type === 'rating' ? 'A score from 1 to 10.' : 'Amount in ' + c.unit + '.';
    }
    catSel.addEventListener('change', syncHint);
    syncHint();

    const dlg = modal('Add entry', [
      el('div', { class: 'field' }, [el('label', { text: 'Category' }), catSel]),
      el('div', { class: 'row' }, [
        el('div', { class: 'field' }, [el('label', { text: 'Day' }), dateIn]),
        el('div', { class: 'field' }, [el('label', { text: 'Start time' }), timeIn])
      ]),
      el('div', { class: 'field' }, [el('label', { text: 'Value' }), valIn, hint]),
      el('div', { class: 'field' }, [el('label', { text: 'Note' }), noteIn])
    ], [
      el('button', { class: 'btn', text: 'Cancel', onclick: function () { dlg.close(); } }),
      el('button', {
        class: 'btn btn--primary', text: 'Log it', onclick: function () {
          const v = Number(valIn.value);
          if (!v || v <= 0) { valIn.focus(); return; }
          Store.addEntry({
            categoryId: catSel.value,
            date: dateIn.value || dayKey,
            value: v,
            startedAt: timeIn.value ? (dateIn.value || dayKey) + 'T' + timeIn.value + ':00' : null,
            note: noteIn.value.trim()
          });
          dlg.close();
          App.render();
        }
      })
    ]);
    setTimeout(function () { valIn.focus(); }, 40);
  }

  /* ══════════════════════════════════════════════════════════════════
     SCREEN · Dashboard
     ══════════════════════════════════════════════════════════════════ */
  const dash = { range: '30', hidden: {} };

  function screenDashboard(view) {
    const days = Config.RANGES.find(function (r) { return r.id === dash.range; }).days;
    const keys = Model.lastNDays(days);
    const prevKeys = Model.lastNDays(days, Model.addDays(keys[0], -1));
    const totals = Model.totalsInRange(keys);
    const prevTotals = Model.totalsInRange(prevKeys);
    const byDay = Model.totalsByDay(keys);

    const accounted = keys.reduce(function (a, k) { return a + Model.loggedMinutes(k, byDay); }, 0);
    const prevByDay = Model.totalsByDay(prevKeys);
    const prevAccounted = prevKeys.reduce(function (a, k) { return a + Model.loggedMinutes(k, prevByDay); }, 0);

    const deep = (totals.study || 0) + (totals.projects || 0);
    const prevDeep = (prevTotals.study || 0) + (prevTotals.projects || 0);

    view.appendChild(el('div', { class: 'head' }, [
      el('div', null, [
        el('div', { class: 'head__eyebrow', text: 'Dashboard' }),
        el('h1', { text: 'How you are spending your life' })
      ]),
      el('div', { class: 'head__actions' }, [rangePicker()])
    ]));

    /* KPI row */
    view.appendChild(el('div', { class: 'grid grid--4', style: { marginBottom: '14px' } }, [
      stat({
        label: 'Accounted for', value: Math.round((accounted / (days * Model.MIN_PER_DAY)) * 100) + '%',
        delta: deltaOf(accounted, prevAccounted, 'up'),
        spark: Charts.sparkline(keys.map(function (k) { return Model.loggedMinutes(k, byDay) / 60; }), 110, 26, 'var(--s1)')
      }),
      stat({
        label: 'Sleep', value: Model.fmtNumber((totals.sleep || 0) / 60 / days), unit: 'h/night',
        delta: deltaOf((totals.sleep || 0) / days, (prevTotals.sleep || 0) / days, 'up'),
        spark: Charts.sparkline(Model.series('sleep', keys).map(function (p) { return p.value / 60; }), 110, 26, 'var(--s1)')
      }),
      stat({
        label: 'Deep work', value: Model.fmtNumber(deep / 60), unit: 'h',
        delta: deltaOf(deep, prevDeep, 'up'),
        spark: Charts.sparkline(keys.map(function (k) { return ((byDay[k].study || 0) + (byDay[k].projects || 0)) / 60; }), 110, 26, 'var(--s3)')
      }),
      stat({
        label: 'Scroll & idle', value: Model.fmtNumber((totals.scroll || 0) / 60 / days), unit: 'h/day',
        delta: deltaOf((totals.scroll || 0) / days, (prevTotals.scroll || 0) / days, 'down'),
        spark: Charts.sparkline(Model.series('scroll', keys).map(function (p) { return p.value / 60; }), 110, 26, 'var(--s7)')
      })
    ]));

    /* hero chart */
    const items = Config.duration().map(function (c) {
      return { id: c.id, name: c.name, color: tintOf(c), off: !!dash.hidden[c.id] };
    }).concat([{ id: '__unlogged', name: 'Unaccounted', color: 'var(--s-none)', off: !!dash.hidden.__unlogged }]);

    view.appendChild(chartCard({
      title: 'Daily allocation',
      sub: days > 45 ? 'Average hours per day, bucketed by week. Click a legend item to isolate.' : 'Every day of the range, all 24 hours. Click a bar to open that day.',
      render: function (host) { return Charts.allocation(host, { keys: keys, hidden: dash.hidden }); },
      legend: legend(items, function (id) {
        dash.hidden[id] = !dash.hidden[id];
        App.render();
      })
    }));

    /* composition + ranked */
    const parts = compositionParts(totals, days * Model.MIN_PER_DAY, accounted);

    view.appendChild(el('div', { class: 'grid grid--2' }, [
      chartCard({
        title: 'Where the time goes',
        sub: 'Total across the range, ranked.',
        render: function (host) {
          return Charts.ranked(host, {
            metric: 'Total',
            rows: Config.duration().map(function (c) {
              return {
                name: c.name, value: totals[c.id] || 0, color: tintOf(c),
                display: Model.fmtMinutes(totals[c.id] || 0, 'compact'),
                sub: { name: 'per day', value: Model.fmtMinutes((totals[c.id] || 0) / days, 'compact') },
                href: '#/category/' + c.id
              };
            })
          });
        }
      }),
      chartCard({
        title: 'Life composition',
        sub: 'The coarse split, including what you never logged.',
        render: function (host) { return Charts.composition(host, { parts: parts }); },
        legend: legend(parts.map(function (p) { return { name: p.name, color: p.color }; }))
      })
    ]));

    /* targets */
    view.appendChild(card({ title: 'Targets', sub: 'Actual against target for the whole range. The notch is 100%.' }, [
      el('div', { class: 'meters' }, Config.CATEGORIES.filter(function (c) { return c.target; }).map(function (c) {
        const actual = c.type === 'rating'
          ? (totals[c.id] || 0)
          : (totals[c.id] || 0);
        return meter(c, actual, c.type === 'rating' ? 1 : days);
      }))
    ]));

    /* consistency */
    view.appendChild(el('div', { class: 'grid grid--2' }, [
      chartCard({
        title: 'Consistency',
        sub: 'Hours accounted for, every day of the last 12 weeks. Click a square to open the day.',
        render: function (host) {
          return Charts.heatmap(host, {
            keys: Model.lastNDays(84),
            valueOf: function (k) { return Model.loggedMinutes(k) / 60; },
            metric: 'Accounted',
            format: function (v) { return Model.fmtNumber(v) + ' h'; }
          });
        },
        legend: el('div', { class: 'hm-scale' }, [
          el('span', { text: 'less' }),
          el('i', { style: { background: 'var(--q0)' } }), el('i', { style: { background: 'var(--q2)' } }),
          el('i', { style: { background: 'var(--q4)' } }), el('i', { style: { background: 'var(--q6)' } }),
          el('span', { text: 'more' })
        ])
      }),
      chartCard({
        title: 'Mood',
        sub: 'Daily score with its 7-day mean.',
        render: function (host) {
          return Charts.trend(host, { cat: Config.byId('mood'), points: Model.series('mood', keys), height: 150 });
        },
        legend: legend([
          { name: 'Daily score', color: tintOf(Config.byId('mood')) },
          { name: '7-day mean', color: tintOf(Config.byId('mood')), shape: 'line' }
        ])
      })
    ]));
  }

  function rangePicker() {
    return el('div', { class: 'seg', role: 'group', 'aria-label': 'Date range' }, Config.RANGES.map(function (r) {
      return el('button', {
        type: 'button', text: r.label, 'aria-pressed': String(dash.range === r.id),
        onclick: function () { dash.range = r.id; App.render(); }
      });
    }));
  }

  /* ══════════════════════════════════════════════════════════════════
     SCREEN · Category
     ══════════════════════════════════════════════════════════════════ */
  function screenCategory(view, catId) {
    const cat = Config.byId(catId);
    if (!cat) { location.hash = '#/dashboard'; return; }
    const days = Config.RANGES.find(function (r) { return r.id === dash.range; }).days;
    const keys = Model.lastNDays(days);
    const prevKeys = Model.lastNDays(days, Model.addDays(keys[0], -1));
    const points = Model.series(cat.id, keys);
    const total = points.reduce(function (a, p) { return a + p.value; }, 0);
    const prevTotal = Model.series(cat.id, prevKeys).reduce(function (a, p) { return a + p.value; }, 0);
    const active = points.filter(function (p) { return p.value > 0; });
    const st = Model.streak(cat.id);
    const avg = cat.type === 'rating' ? (active.length ? total / active.length : 0) : total / days;

    view.appendChild(el('div', { class: 'head' }, [
      el('div', null, [
        el('div', { class: 'head__eyebrow' }, [
          el('button', { class: 'btn btn--ghost btn--sm', onclick: function () { location.hash = '#/dashboard'; } }, [ico('left', 14), el('span', { text: 'Dashboard' })])
        ]),
        el('h1', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
          el('span', { class: 'tile__icon', style: { '--tint': tintOf(cat) } }, [ico(cat.icon, 17)]),
          cat.name
        ])
      ]),
      el('div', { class: 'head__actions' }, [rangePicker()])
    ]));

    const hitDays = points.filter(function (p) { return Model.meetsTarget(cat, p.value, 1); }).length;

    view.appendChild(el('div', { class: 'grid grid--4', style: { marginBottom: '14px' } }, [
      stat({ label: 'Total', value: Model.fmtValue(cat, cat.type === 'rating' ? avg : total), delta: deltaOf(total, prevTotal, cat.target && cat.target.dir === 'atMost' ? 'down' : 'up') }),
      stat({ label: cat.type === 'rating' ? 'Days rated' : 'Per day', value: cat.type === 'rating' ? String(active.length) : Model.fmtValue(cat, avg) }),
      stat({ label: 'Target hit', value: hitDays + ' / ' + days, unit: 'days' }),
      stat({ label: 'Streak', value: String(st.current), unit: 'days', delta: { dir: 'flat', text: 'best ' + st.longest } })
    ]));

    view.appendChild(chartCard({
      title: cat.name + ' over time',
      sub: 'Daily ' + (cat.type === 'duration' ? 'hours' : Model.unitLabel(cat)) + ' with the 7-day mean and the daily target.',
      render: function (host) { return Charts.trend(host, { cat: cat, points: points }); },
      legend: legend([
        { name: 'Daily', color: tintOf(cat) },
        { name: '7-day mean', color: tintOf(cat), shape: 'line' }
      ])
    }));

    if (cat.type !== 'rating') {
      const counts = new Array(24).fill(0);
      Store.entriesFor(cat.id).forEach(function (e) {
        if (!e.startedAt || keys.indexOf(e.date) < 0) return;
        counts[Number(e.startedAt.slice(11, 13))] += e.value;
      });
      view.appendChild(el('div', { class: 'grid grid--2' }, [
        chartCard({
          title: 'When you do it',
          sub: 'Total logged by hour of day, across the range.',
          render: function (host) {
            return Charts.hours(host, {
              counts: cat.type === 'duration' ? counts.map(function (v) { return v / 60; }) : counts,
              color: tintOf(cat), metric: 'Total',
              format: function (v) { return cat.type === 'duration' ? Model.fmtNumber(v) + ' h' : Model.fmtNumber(v) + ' ' + cat.unit; }
            });
          }
        }),
        chartCard({
          title: 'Consistency',
          sub: 'Every day of the last 12 weeks.',
          render: function (host) {
            return Charts.heatmap(host, {
              keys: Model.lastNDays(84),
              valueOf: function (k) { return (Model.dayTotals(k)[cat.id] || 0); },
              metric: cat.name,
              format: function (v) { return Model.fmtValue(cat, v); }
            });
          }
        })
      ]));
    }

    const recent = Store.entriesFor(cat.id)
      .filter(function (e) { return keys.indexOf(e.date) >= 0; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; })
      .slice(0, 40);

    view.appendChild(card({ title: 'Recent entries', sub: recent.length + ' in range' }, [
      recent.length ? el('ul', { class: 'entries' }, recent.map(function (e) {
        return el('li', { class: 'entry', style: { '--tint': tintOf(cat) } }, [
          el('span', { class: 'entry__bar' }),
          el('div', null, [
            el('div', { class: 'entry__name', text: Model.fmtDay(e.date) }),
            e.note ? el('div', { class: 'entry__note', text: e.note }) : null
          ].filter(Boolean)),
          el('div', { class: 'entry__val', text: Model.fmtValue(cat, e.value) }),
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
            el('span', { class: 'entry__time', text: e.startedAt ? e.startedAt.slice(11, 16) : '—' }),
            el('button', { class: 'iconbtn entry__del', 'aria-label': 'Delete', onclick: function () {
              Store.deleteEntry(e.id);
              toast('Entry deleted.', 'Undo', function () { Store.undoDelete(); App.render(); });
              App.render();
            } }, [ico('trash', 15)])
          ])
        ]);
      })) : emptyState('inbox', 'Nothing logged for ' + cat.name + ' in this range.')
    ]));
  }

  /* ══════════════════════════════════════════════════════════════════
     SCREEN · Review
     ══════════════════════════════════════════════════════════════════ */
  function screenReview(view) {
    const thisWeekStart = Model.weekStart(Model.today());
    const thisKeys = Model.range(thisWeekStart, Model.today());
    const lastKeys = Model.range(Model.addDays(thisWeekStart, -7), Model.addDays(thisWeekStart, -1));
    const a = Model.totalsInRange(thisKeys);
    const b = Model.totalsInRange(lastKeys);

    view.appendChild(el('div', { class: 'head' }, [
      el('div', null, [
        el('div', { class: 'head__eyebrow', text: 'Review' }),
        el('h1', { text: 'Week of ' + Model.fmtDay(thisWeekStart, 'short') })
      ]),
      el('div', { class: 'head__actions' }, [
        el('span', { class: 'muted', text: thisKeys.length + ' of 7 days elapsed' })
      ])
    ]));

    /* week vs week */
    const rows = Config.CATEGORIES.filter(function (c) { return c.target; }).map(function (c) {
      const cur = a[c.id] || 0, prev = b[c.id] || 0;
      const target = c.type === 'rating' ? c.target.value : Model.targetForDays(c, thisKeys.length);
      const d = deltaOf(cur, prev, c.target.dir === 'atMost' ? 'down' : 'up');
      return { cat: c, cur: cur, prev: prev, target: target, delta: d, hit: Model.meetsTarget(c, cur, c.type === 'rating' ? 1 : thisKeys.length) };
    });

    view.appendChild(card({ title: 'This week against last', sub: 'Pro-rated to the days elapsed, so a Tuesday review is not comparing 2 days to 7.' }, [
      el('div', { class: 'tableview', style: { maxHeight: 'none', marginTop: '4px' } }, [
        (function () {
          const t = el('table');
          t.appendChild(el('thead', null, [el('tr', null,
            ['Category', 'This week', 'Last week', 'Target', 'Change'].map(function (h) { return el('th', { scope: 'col', text: h }); }))]));
          t.appendChild(el('tbody', null, rows.map(function (r) {
            return el('tr', null, [
              el('th', { scope: 'row' }, [
                el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' } }, [
                  el('span', { class: 'meter__key', style: { background: tintOf(r.cat) } }),
                  el('span', { text: r.cat.name })
                ])
              ]),
              el('td', { text: Model.fmtValue(r.cat, r.cur) }),
              el('td', { class: 'muted', text: Model.fmtValue(r.cat, r.prev) }),
              el('td', { class: 'muted', text: Model.fmtValue(r.cat, r.target) }),
              el('td', null, [el('span', { class: 'stat__delta stat__delta--' + r.delta.dir, text: r.delta.text.replace(' vs previous', '') })])
            ]);
          })));
          return t;
        })()
      ])
    ]));

    /* wins & misses */
    const wins = rows.filter(function (r) { return r.hit; });
    const misses = rows.filter(function (r) { return !r.hit; });

    view.appendChild(el('div', { class: 'grid grid--2' }, [
      card({ title: 'On target', sub: wins.length + ' of ' + rows.length }, [
        wins.length ? el('div', { class: 'meters' }, wins.map(function (r) { return meter(r.cat, r.cur, r.cat.type === 'rating' ? 1 : thisKeys.length); }))
          : emptyState('target', 'Nothing on target yet this week.')
      ]),
      card({ title: 'Behind', sub: misses.length + ' of ' + rows.length }, [
        misses.length ? el('div', { class: 'meters' }, misses.map(function (r) { return meter(r.cat, r.cur, r.cat.type === 'rating' ? 1 : thisKeys.length); }))
          : emptyState('sparkle', 'Everything on target. Rare.')
      ])
    ]));

    /* notes digest — the part that turns a log into a memory */
    const notes = [];
    thisKeys.forEach(function (k) {
      Store.entriesOn(k).forEach(function (e) { if (e.note) notes.push({ key: k, e: e }); });
    });
    view.appendChild(card({ title: 'Notes this week', sub: notes.length + ' entries carried a note' }, [
      notes.length ? el('ul', { class: 'entries' }, notes.reverse().map(function (n) {
        const c = Config.byId(n.e.categoryId);
        return el('li', { class: 'entry', style: { '--tint': tintOf(c) } }, [
          el('span', { class: 'entry__bar' }),
          el('div', null, [
            el('div', { class: 'entry__name', text: n.e.note }),
            el('div', { class: 'entry__note', text: c.name + ' · ' + Model.fmtValue(c, n.e.value) })
          ]),
          el('div'),
          el('span', { class: 'entry__time', text: Model.fmtDay(n.key, 'short') })
        ]);
      })) : emptyState('edit', 'No notes yet. A note is what makes a number worth reading back.')
    ]));
  }

  /* ══════════════════════════════════════════════════════════════════
     SCREEN · Data
     ══════════════════════════════════════════════════════════════════ */
  function screenData(view) {
    const all = Store.entries();
    const dayKeys = {};
    all.forEach(function (e) { dayKeys[e.date] = 1; });
    const bytes = new Blob([Store.exportJSON()]).size;

    view.appendChild(el('div', { class: 'head' }, [
      el('div', null, [
        el('div', { class: 'head__eyebrow', text: 'Data' }),
        el('h1', { text: 'Your data, on this device only' })
      ])
    ]));

    view.appendChild(el('div', { class: 'grid grid--2' }, [
      card({ title: 'Storage' }, [
        el('dl', { class: 'kv' }, [
          el('dt', { text: 'Entries' }), el('dd', { text: String(all.length) }),
          el('dt', { text: 'Days with data' }), el('dd', { text: String(Object.keys(dayKeys).length) }),
          el('dt', { text: 'Days closed' }), el('dd', { text: String(Store.get().closedDays.length) }),
          el('dt', { text: 'Backup size' }), el('dd', { text: (bytes / 1024).toFixed(1) + ' KB' }),
          el('dt', { text: 'Stored in' }), el('dd', { text: 'localStorage' })
        ]),
        el('div', { class: 'card__sub', style: { marginTop: '14px', marginBottom: 0 }, text: 'Clearing your browser data deletes this. Export regularly — the file is the only backup.' })
      ]),
      card({ title: 'Backup' }, [
        el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, [
          el('button', { class: 'btn btn--primary', onclick: exportFile }, [ico('download', 15), el('span', { text: 'Export JSON' })]),
          el('button', { class: 'btn', onclick: function () { importFile('replace'); } }, [ico('upload', 15), el('span', { text: 'Import (replace)' })]),
          el('button', { class: 'btn', onclick: function () { importFile('merge'); } }, [ico('upload', 15), el('span', { text: 'Import (merge)' })])
        ]),
        el('div', { class: 'card__sub', style: { marginTop: '14px', marginBottom: 0 }, text: 'The export is plain JSON — readable, diffable, and the migration path to any future version.' })
      ])
    ]));

    /* settings */
    const boundary = el('select', { class: 'input' }, [0, 2, 3, 4, 5, 6].map(function (h) {
      return el('option', { value: String(h), selected: Store.settings().dayBoundaryHour === h, text: Model.pad(h) + ':00' });
    }));
    boundary.addEventListener('change', function () { Store.setSetting('dayBoundaryHour', Number(boundary.value)); App.render(); });

    const weekStart = el('select', { class: 'input' }, [
      el('option', { value: 'mon', selected: Store.settings().weekStartsMonday, text: 'Monday' }),
      el('option', { value: 'sun', selected: !Store.settings().weekStartsMonday, text: 'Sunday' })
    ]);
    weekStart.addEventListener('change', function () { Store.setSetting('weekStartsMonday', weekStart.value === 'mon'); App.render(); });

    view.appendChild(card({ title: 'Settings' }, [
      el('div', { class: 'row' }, [
        el('div', { class: 'field' }, [el('label', { text: 'Day starts at' }), boundary,
          el('div', { class: 'card__sub', style: { marginBottom: 0 }, text: 'A 01:00 session counts toward the previous day.' })]),
        el('div', { class: 'field' }, [el('label', { text: 'Week starts on' }), weekStart])
      ])
    ]));

    view.appendChild(card({ title: 'Demo data' }, [
      el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, [
        el('button', { class: 'btn', onclick: function () {
          const gen = Seed.generate(90);
          Store.replaceAll(gen);
          toast(gen.entries.length + ' demo entries loaded across 90 days.');
          App.render();
        } }, [ico('sparkle', 15), el('span', { text: 'Load 90 days of demo data' })]),
        el('button', { class: 'btn btn--danger', onclick: function () {
          const dlg = modal('Erase everything?', [
            el('p', { class: 'dim', text: 'This deletes every entry on this device. Export first if you want it back.' })
          ], [
            el('button', { class: 'btn', text: 'Cancel', onclick: function () { dlg.close(); } }),
            el('button', { class: 'btn btn--danger', text: 'Erase', onclick: function () { Store.reset(); dlg.close(); App.render(); } })
          ]);
        } }, [ico('trash', 15), el('span', { text: 'Erase all data' })])
      ]),
      el('div', { class: 'card__sub', style: { marginTop: '14px', marginBottom: 0 }, text: 'Demo data replaces what is there. Loading it is how you evaluate the charts before committing real days to them.' })
    ]));
  }

  function exportFile() {
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'life-monitor-' + Model.today() + '.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('Backup downloaded.');
  }

  function importFile(mode) {
    const input = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
    input.addEventListener('change', function () {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const n = Store.importJSON(String(reader.result), mode);
          toast('Imported — ' + n + ' entries now stored.');
          App.render();
        } catch (err) {
          toast('Import failed: ' + err.message);
        }
      };
      reader.readAsText(f);
    });
    document.body.appendChild(input);
    input.click();
    setTimeout(function () { input.remove(); }, 0);
  }

  /* ── exports ─────────────────────────────────────────────────────── */
  global.UI = {
    el, ico, toast, modal, card, chartCard, legend, stat, meter, emptyState, openEntryModal,
    screenToday, screenDashboard, screenCategory, screenReview, screenData,
    redraws: redraws,
    resetRedraws: function () { redraws.length = 0; },
    stopTicking: function () { clearInterval(tickHandle); }
  };
})(window);
