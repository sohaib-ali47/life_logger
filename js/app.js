/* App — bootstrap, routing, theme, keyboard. */
(function (global) {
  'use strict';

  const NAV = [
    { id: 'today',     label: 'Today',     icon: 'calendar', hash: '#/today' },
    { id: 'dashboard', label: 'Dashboard', icon: 'barchart', hash: '#/dashboard' },
    { id: 'review',    label: 'Review',    icon: 'check',    hash: '#/review' },
    { id: 'data',      label: 'Data',      icon: 'database', hash: '#/data' }
  ];

  const view = document.getElementById('view');

  /* ── routing ─────────────────────────────────────────────────────── */
  function route() {
    const raw = (location.hash || '#/today').replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    return { name: parts[0] || 'today', arg: parts[1] || null };
  }

  function render() {
    const r = route();
    UI.stopTicking();
    UI.resetRedraws();
    Charts.Tip.hide();
    view.textContent = '';

    if (r.name === 'dashboard')      UI.screenDashboard(view);
    else if (r.name === 'category')  UI.screenCategory(view, r.arg);
    else if (r.name === 'review')    UI.screenReview(view);
    else if (r.name === 'data')      UI.screenData(view);
    else                             UI.screenToday(view, r.arg);

    const active = r.name === 'category' ? 'dashboard' : r.name;
    Array.prototype.forEach.call(document.querySelectorAll('#nav .navlink'), function (a) {
      if (a.dataset.id === active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = (NAV.find(function (n) { return n.id === active; }) || NAV[0]).label + ' · Life Monitor';
  }

  /* ── nav ─────────────────────────────────────────────────────────── */
  function buildNav() {
    const ul = document.getElementById('nav');
    NAV.forEach(function (n) {
      const a = UI.el('a', { class: 'navlink', href: n.hash, dataset: { id: n.id } }, [
        UI.ico(n.icon, 17), UI.el('span', { text: n.label })
      ]);
      ul.appendChild(UI.el('li', null, [a]));
    });
  }

  /* ── theme ───────────────────────────────────────────────────────── */
  function applyTheme() {
    const t = Store.settings().theme || 'dark';
    document.documentElement.setAttribute('data-theme', t);
    const btn = document.getElementById('themeToggle');
    btn.textContent = '';
    btn.appendChild(UI.ico(t === 'dark' ? 'sun' : 'moon', 17));
  }

  function bindTheme() {
    document.getElementById('themeToggle').addEventListener('click', function () {
      Store.setSetting('theme', Store.settings().theme === 'dark' ? 'light' : 'dark');
      applyTheme();
      /* charts read colours from CSS custom properties, so they repaint
         on their own — only the canvas-free redraw of sizes is needed. */
    });
  }

  /* ── resize ──────────────────────────────────────────────────────── */
  let resizeTimer = null;
  function bindResize() {
    global.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        UI.redraws.forEach(function (fn) { try { fn(); } catch (e) { console.warn(e); } });
      }, 140);
    });
  }

  /* ── keyboard ────────────────────────────────────────────────────── */
  function bindKeys() {
    global.addEventListener('keydown', function (ev) {
      const tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (document.getElementById('modal').open) return;

      const k = ev.key.toLowerCase();
      if (k === 't') { location.hash = '#/today'; }
      else if (k === 'd') { location.hash = '#/dashboard'; }
      else if (k === 'r') { location.hash = '#/review'; }
      else if (k === 'n') { ev.preventDefault(); UI.openEntryModal(route().arg || Model.today()); }
      else if (k === 'w') { quickLog('water', 250); }
      else if (k === 'arrowleft' && route().name === 'today') { location.hash = '#/today/' + Model.addDays(route().arg || Model.today(), -1); }
      else if (k === 'arrowright' && route().name === 'today') {
        const next = Model.addDays(route().arg || Model.today(), 1);
        if (!Model.isFuture(next)) location.hash = '#/today/' + next;
      }
    });
  }

  function quickLog(catId, amount) {
    const now = new Date();
    const key = Model.dayKeyFor(now);
    const entry = Store.addEntry({
      categoryId: catId, date: key, value: amount,
      startedAt: key + 'T' + Model.pad(now.getHours()) + ':' + Model.pad(now.getMinutes()) + ':00'
    });
    UI.toast(Config.byId(catId).name + ' +' + amount + ' logged.', 'Undo', function () {
      Store.deleteEntry(entry.id);
      render();
    });
    render();
  }

  /* ── boot ────────────────────────────────────────────────────────── */
  function boot() {
    Store.load();

    /* First open: seed a demo history so the charts have something to
       say. Wipe it from the Data screen once you start logging for real. */
    if (!Store.settings().seeded && !Store.entries().length) {
      Store.replaceAll(Seed.generate(90));
      Store.setSetting('seeded', true);
    }

    buildNav();
    applyTheme();
    bindTheme();
    bindResize();
    bindKeys();

    global.addEventListener('hashchange', render);
    render();
  }

  global.App = { render: render, route: route };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
