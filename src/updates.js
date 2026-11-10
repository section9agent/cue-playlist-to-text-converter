/*
 * Update checking, shared by the main window and the About window.
 * Uses Tauri's updater plugin, which reads the latest GitHub release, checks the
 * download's signature, installs it and restarts the app.
 *
 * Runs in the app window and under Node (tests), where the Tauri API and storage
 * are passed in.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = { createUpdates: factory };
  else root.Updates = factory(function () { return root.__TAURI__ || null; }, safeStorage(root));

  function safeStorage(r) {
    try { if (r.localStorage) return r.localStorage; } catch (e) { /* blocked */ }
    return null;
  }
})(typeof self !== 'undefined' ? self : this, function createUpdates(getTauri, storage) {
  'use strict';

  const AUTO_KEY = 'autoUpdate';

  function readAuto() {
    try { return !storage || storage.getItem(AUTO_KEY) !== 'off'; } catch (e) { return true; }
  }

  function writeAuto(on) {
    try { if (storage) storage.setItem(AUTO_KEY, on ? 'on' : 'off'); } catch (e) { /* ignore */ }
  }

  function api() {
    const t = getTauri();
    return t && t.updater && typeof t.updater.check === 'function' ? t : null;
  }

  function messageOf(err) {
    if (!err) return 'Unknown error';
    return typeof err === 'string' ? err : (err.message || String(err));
  }

  /*
   * Returns one of:
   *   { state: 'unavailable' }                  not running inside the app
   *   { state: 'uptodate' }
   *   { state: 'available', update, version, currentVersion, notes }
   *   { state: 'error', message }
   */
  async function check() {
    const t = api();
    if (!t) return { state: 'unavailable' };
    try {
      const update = await t.updater.check();
      if (!update) return { state: 'uptodate' };
      return {
        state: 'available',
        update: update,
        version: update.version,
        currentVersion: update.currentVersion,
        notes: update.body || ''
      };
    } catch (err) {
      return { state: 'error', message: messageOf(err) };
    }
  }

  /*
   * Downloads and installs an update found by check(), then restarts the app.
   * onProgress gets { phase: 'download', done, total } and { phase: 'install' }.
   * Resolves { ok: true } or { ok: false, message }.
   */
  async function install(found, onProgress) {
    const report = typeof onProgress === 'function' ? onProgress : function () {};
    try {
      let total = 0;
      let done = 0;
      await found.update.downloadAndInstall(function (e) {
        if (!e) return;
        if (e.event === 'Started') {
          total = (e.data && e.data.contentLength) || 0;
          report({ phase: 'download', done: 0, total: total });
        } else if (e.event === 'Progress') {
          done += (e.data && e.data.chunkLength) || 0;
          report({ phase: 'download', done: done, total: total });
        } else if (e.event === 'Finished') {
          report({ phase: 'install' });
        }
      });
      const t = getTauri();
      if (t && t.process && typeof t.process.relaunch === 'function') await t.process.relaunch();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: messageOf(err) };
    }
  }

  /* Opens a web page in the person's browser. Only https links are allowed. */
  async function openExternal(url) {
    if (typeof url !== 'string' || url.indexOf('https://') !== 0) return false;
    const t = getTauri();
    try {
      if (t && t.opener && typeof t.opener.openUrl === 'function') { await t.opener.openUrl(url); return true; }
      if (t && t.core && typeof t.core.invoke === 'function') { await t.core.invoke('plugin:opener|open_url', { url: url }); return true; }
    } catch (e) { /* fall through to the browser fallback */ }
    try {
      if (typeof window !== 'undefined' && window.open) { window.open(url, '_blank', 'noopener'); return true; }
    } catch (e) { /* ignore */ }
    return false;
  }

  return {
    autoEnabled: readAuto,
    setAuto: writeAuto,
    check: check,
    install: install,
    openExternal: openExternal
  };
});
