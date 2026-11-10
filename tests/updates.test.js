const test = require('node:test');
const assert = require('node:assert/strict');
const { createUpdates } = require('../src/updates.js');

function mem(initial) {
  const m = Object.assign({}, initial);
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m };
}

test('auto update is on by default and can be turned off and on', () => {
  const st = mem();
  const u = createUpdates(() => null, st);
  assert.equal(u.autoEnabled(), true);
  u.setAuto(false);
  assert.equal(st.m.autoUpdate, 'off');
  assert.equal(u.autoEnabled(), false);
  u.setAuto(true);
  assert.equal(u.autoEnabled(), true);
});

test('broken storage keeps auto update on and does not throw', () => {
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  const u = createUpdates(() => null, bad);
  assert.equal(u.autoEnabled(), true);
  u.setAuto(false);
});

test('check reports unavailable outside the app', async () => {
  const u = createUpdates(() => null, mem());
  assert.deepEqual(await u.check(), { state: 'unavailable' });
});

test('check reports up to date, available and error', async () => {
  let result = null;
  const t = { updater: { check: async () => { if (result instanceof Error) throw result; return result; } } };
  const u = createUpdates(() => t, mem());
  result = null;
  assert.equal((await u.check()).state, 'uptodate');
  result = { version: '0.2.0', currentVersion: '0.1.0', body: 'Notes' };
  const r = await u.check();
  assert.equal(r.state, 'available');
  assert.equal(r.version, '0.2.0');
  assert.equal(r.notes, 'Notes');
  result = new Error('offline');
  const e = await u.check();
  assert.equal(e.state, 'error');
  assert.equal(e.message, 'offline');
});

test('install reports progress, then relaunches', async () => {
  const calls = [];
  const update = {
    downloadAndInstall: async (cb) => {
      cb({ event: 'Started', data: { contentLength: 100 } });
      cb({ event: 'Progress', data: { chunkLength: 40 } });
      cb({ event: 'Progress', data: { chunkLength: 60 } });
      cb({ event: 'Finished' });
    }
  };
  const t = { updater: { check() {} }, process: { relaunch: async () => calls.push('relaunch') } };
  const u = createUpdates(() => t, mem());
  const seen = [];
  const r = await u.install({ update }, (p) => seen.push(p));
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(calls, ['relaunch']);
  assert.deepEqual(seen.map((p) => p.phase + ':' + (p.done || 0)), ['download:0', 'download:40', 'download:100', 'install:0']);
});

test('a failed install does not relaunch and returns the message', async () => {
  const calls = [];
  const t = { updater: { check() {} }, process: { relaunch: async () => calls.push('relaunch') } };
  const u = createUpdates(() => t, mem());
  const r = await u.install({ update: { downloadAndInstall: async () => { throw 'signature mismatch'; } } });
  assert.equal(r.ok, false);
  assert.equal(r.message, 'signature mismatch');
  assert.deepEqual(calls, []);
});

test('openExternal only opens https links', async () => {
  const opened = [];
  const t = { opener: { openUrl: async (x) => opened.push(x) } };
  const u = createUpdates(() => t, mem());
  assert.equal(await u.openExternal('http://example.com'), false);
  assert.equal(await u.openExternal('javascript:alert(1)'), false);
  assert.equal(await u.openExternal('file:///etc/passwd'), false);
  assert.equal(await u.openExternal('https://example.com/x'), true);
  assert.deepEqual(opened, ['https://example.com/x']);
});
