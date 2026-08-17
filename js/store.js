/* Store — persistence, schema, migrations, undo, import/export.
 *
 * localStorage is the v1 backing store; every read/write goes through
 * this module so swapping to IndexedDB later is a one-file change.
 * Entries are soft-deleted (deletedAt) so an accidental tap is undoable
 * and history stays auditable.
 */
(function (global) {
  'use strict';

  const KEY = 'lifemonitor.v1';
  const listeners = [];
  let state = null;
  let saveTimer = null;
  let lastDeleted = null;

  /* ── id ──────────────────────────────────────────────────────────── */
  function uid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  /* ── shape ───────────────────────────────────────────────────────── */
  function blank() {
    return {
      schemaVersion: Config.SCHEMA_VERSION,
      settings: Object.assign({}, Config.DEFAULT_SETTINGS),
      entries: [],
      closedDays: [],
      timer: null
    };
  }

  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return blank();
    const v = raw.schemaVersion || 0;
    /* v0 -> v1: nothing shipped before v1; future migrations chain here. */
    if (v < 1) raw.schemaVersion = 1;
    const s = blank();
    s.schemaVersion = Config.SCHEMA_VERSION;
    s.settings = Object.assign({}, Config.DEFAULT_SETTINGS, raw.settings || {});
    s.entries = Array.isArray(raw.entries) ? raw.entries : [];
    s.closedDays = Array.isArray(raw.closedDays) ? raw.closedDays : [];
    s.timer = raw.timer || null;
    return s;
  }

  /* ── io ──────────────────────────────────────────────────────────── */
  function load() {
    let raw = null;
    try { raw = JSON.parse(global.localStorage.getItem(KEY)); }
    catch (err) { console.warn('Store: unreadable save, starting fresh.', err); }
    state = migrate(raw);
    return state;
  }

  function persist() {
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (err) { console.error('Store: save failed (quota or private mode).', err); }
  }

  function commit(silent) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 120);
    if (!silent) listeners.forEach(function (fn) { fn(state); });
  }

  function subscribe(fn) { listeners.push(fn); return function () {
    const i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1);
  }; }

  /* ── reads ───────────────────────────────────────────────────────── */
  function get() { return state; }
  function settings() { return state.settings; }
  function entries() { return state.entries.filter(function (e) { return !e.deletedAt; }); }
  function entriesOn(dayKey) {
    return entries().filter(function (e) { return e.date === dayKey; })
      .sort(function (a, b) { return (a.startedAt || '') < (b.startedAt || '') ? -1 : 1; });
  }
  function entriesFor(categoryId) {
    return entries().filter(function (e) { return e.categoryId === categoryId; });
  }

  /* ── writes ──────────────────────────────────────────────────────── */
  function addEntry(patch) {
    const cat = Config.byId(patch.categoryId);
    if (!cat) throw new Error('Unknown category: ' + patch.categoryId);

    /* ratings are one-per-day: overwrite rather than accumulate */
    if (cat.type === 'rating') {
      const existing = entries().find(function (e) {
        return e.categoryId === cat.id && e.date === patch.date;
      });
      if (existing) {
        existing.value = patch.value;
        existing.note = patch.note || existing.note || '';
        commit();
        return existing;
      }
    }

    const entry = {
      id: uid(),
      categoryId: patch.categoryId,
      date: patch.date,
      value: Number(patch.value) || 0,
      startedAt: patch.startedAt || null,
      note: patch.note || '',
      tags: patch.tags || [],
      source: patch.source || 'manual',
      createdAt: new Date().toISOString(),
      deletedAt: null
    };
    state.entries.push(entry);
    commit();
    return entry;
  }

  function updateEntry(id, patch) {
    const e = state.entries.find(function (x) { return x.id === id; });
    if (!e) return null;
    Object.assign(e, patch);
    commit();
    return e;
  }

  function deleteEntry(id) {
    const e = state.entries.find(function (x) { return x.id === id; });
    if (!e) return null;
    e.deletedAt = new Date().toISOString();
    lastDeleted = id;
    commit();
    return e;
  }

  function undoDelete() {
    if (!lastDeleted) return false;
    const e = state.entries.find(function (x) { return x.id === lastDeleted; });
    lastDeleted = null;
    if (!e) return false;
    e.deletedAt = null;
    commit();
    return true;
  }

  /* ── closed days: the zero-vs-null mechanism ─────────────────────── */
  function isClosed(dayKey) { return state.closedDays.indexOf(dayKey) > -1; }
  function setClosed(dayKey, on) {
    const i = state.closedDays.indexOf(dayKey);
    if (on && i < 0) state.closedDays.push(dayKey);
    if (!on && i > -1) state.closedDays.splice(i, 1);
    commit();
  }

  /* ── timer ───────────────────────────────────────────────────────── */
  function startTimer(categoryId) {
    state.timer = { categoryId: categoryId, startedAt: new Date().toISOString() };
    commit();
  }
  function clearTimer() { state.timer = null; commit(); }
  function timer() { return state.timer; }

  /* ── settings ────────────────────────────────────────────────────── */
  function setSetting(k, v) { state.settings[k] = v; commit(); }

  /* ── portability ─────────────────────────────────────────────────── */
  function exportJSON() {
    return JSON.stringify({
      app: 'life-monitor',
      schemaVersion: state.schemaVersion,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      entries: state.entries,
      closedDays: state.closedDays
    }, null, 2);
  }

  function importJSON(text, mode) {
    const raw = JSON.parse(text);
    if (!raw || !Array.isArray(raw.entries)) throw new Error('Not a Life Monitor backup.');
    const incoming = migrate(raw);
    if (mode === 'merge') {
      const seen = {};
      state.entries.forEach(function (e) { seen[e.id] = true; });
      incoming.entries.forEach(function (e) { if (!seen[e.id]) state.entries.push(e); });
      incoming.closedDays.forEach(function (d) { if (state.closedDays.indexOf(d) < 0) state.closedDays.push(d); });
    } else {
      state.entries = incoming.entries;
      state.closedDays = incoming.closedDays;
      state.settings = Object.assign({}, state.settings, incoming.settings);
    }
    commit();
    return state.entries.length;
  }

  function replaceAll(next) {
    state.entries = next.entries || [];
    state.closedDays = next.closedDays || [];
    commit();
  }

  function reset() {
    state = blank();
    persist();
    listeners.forEach(function (fn) { fn(state); });
  }

  global.Store = {
    load, get, settings, subscribe, commit,
    entries, entriesOn, entriesFor,
    addEntry, updateEntry, deleteEntry, undoDelete, canUndo: function () { return !!lastDeleted; },
    isClosed, setClosed,
    startTimer, clearTimer, timer,
    setSetting, exportJSON, importJSON, replaceAll, reset, uid
  };
})(window);
