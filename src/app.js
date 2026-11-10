(function () {
  'use strict';

  const E = window.TracklistEngine;
  const $ = (id) => document.getElementById(id);

  const els = {
    drop: $('drop'), file: $('file'), fileName: $('fileName'),
    detected: $('detected'), warnCard: $('warnCard'), warnings: $('warnings'),
    optionsCard: $('optionsCard'), template: $('template'), positions: $('positions'),
    splitsWrap: $('splitsWrap'), splitsLabel: $('splitsLabel'), splits: $('splits'),
    includeArtist: $('includeArtist'), splitArtist: $('splitArtist'),
    totalWrap: $('totalWrap'), total: $('total'), plistWrap: $('plistWrap'), plistName: $('plistName'),
    includeDuration: $('includeDuration'),
    releaseCard: $('releaseCard'), release: $('release'),
    tableCard: $('tableCard'), tbody: $('tbody'), count: $('count'),
    outputCard: $('outputCard'), output: $('output'), copyBtn: $('copyBtn'), saveBtn: $('saveBtn'), saveCsvBtn: $('saveCsvBtn'),
    status: $('status'), themeBtn: $('themeBtn')
  };

  const state = { source: null, result: null, tracks: [], parseWarnings: [], baseName: 'tracklist' };

  /* ---------------- theme ---------------- */
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) { /* storage unavailable: follow the system theme */ }
  els.themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
  });

  /* ---------------- loading ---------------- */
  function parseOptions() {
    const o = { splitArtist: els.splitArtist.value };
    const total = E.parseDuration(els.total.value.trim());
    if (total) o.totalSeconds = total;
    if (!els.plistWrap.hidden && els.plistName.value) o.playlistName = els.plistName.value;
    return o;
  }

  function loadBytes(bytes, name) {
    state.source = { bytes: bytes, name: name };
    state.baseName = name.replace(/\.[^.]+$/, '') || 'tracklist';
    els.fileName.textContent = name;
    els.total.value = ''; // a disc length belongs to one disc, never carry it to the next file
    reparse();
  }

  function loadText(text, name) {
    state.source = { bytes: new TextEncoder().encode(text), name: name };
    state.baseName = 'tracklist';
    els.fileName.textContent = 'Pasted text';
    els.total.value = '';
    reparse();
  }

  function reparse() {
    if (!state.source) return;
    try {
      const r = E.parseBytes(state.source.bytes, state.source.name, parseOptions());
      state.result = r;
      state.tracks = r.tracks;
      state.parseWarnings = r.warnings.slice();
      renderAll(true);
    } catch (err) {
      state.result = null;
      state.tracks = [];
      state.parseWarnings = ['Could not read this file: ' + err.message];
      renderAll(true);
    }
  }

  function readFile(file) {
    const reader = new FileReader();
    reader.onload = () => loadBytes(new Uint8Array(reader.result), file.name);
    reader.onerror = () => { state.parseWarnings = ['Could not open that file.']; renderWarnings([]); };
    reader.readAsArrayBuffer(file);
  }

  els.drop.addEventListener('click', () => els.file.click());
  els.drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.file.click(); } });
  els.file.addEventListener('change', () => { if (els.file.files[0]) readFile(els.file.files[0]); els.file.value = ''; });

  window.addEventListener('dragover', (e) => { e.preventDefault(); els.drop.classList.add('over'); });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) els.drop.classList.remove('over'); });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    els.drop.classList.remove('over');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) readFile(f);
    else if (e.dataTransfer && e.dataTransfer.getData('text')) loadText(e.dataTransfer.getData('text'), 'pasted.txt');
  });
  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const cd = e.clipboardData;
    if (!cd) return;
    if (cd.files && cd.files[0]) { readFile(cd.files[0]); e.preventDefault(); return; }
    const text = cd.getData('text');
    if (text && text.trim()) { loadText(text, 'pasted.txt'); e.preventDefault(); }
  });

  /* ---------------- options ---------------- */
  function formatOptions() {
    return {
      template: els.template.value,
      positions: els.positions.value,
      splits: els.splits.value,
      includeArtist: els.includeArtist.value,
      includeDuration: els.includeDuration.checked,
      albumArtist: state.result && state.result.meta ? state.result.meta.artist : ''
    };
  }

  ['template', 'positions', 'splits', 'includeArtist', 'includeDuration'].forEach((k) => {
    els[k].addEventListener('input', () => { updateOptionVisibility(); refreshOutput(); });
    els[k].addEventListener('change', () => { updateOptionVisibility(); refreshOutput(); });
  });
  ['splitArtist', 'plistName'].forEach((k) => els[k].addEventListener('change', reparse));
  els.total.addEventListener('change', reparse);

  function updateOptionVisibility() {
    const pos = els.positions.value;
    els.splitsWrap.hidden = !(pos === 'vinyl' || pos === 'multidisc');
    els.splitsLabel.textContent = pos === 'multidisc' ? 'Tracks per disc' : 'Tracks per side';
    els.splits.placeholder = pos === 'multidisc' ? '12, 10' : '5, 5';
    const r = state.result;
    els.totalWrap.hidden = !(r && r.format === 'cue');
    const lists = r && r.meta && r.meta.playlists;
    els.plistWrap.hidden = !(lists && lists.length > 1);
  }

  /* ---------------- rendering ---------------- */
  function renderAll(fresh) {
    const hasTracks = state.tracks.length > 0;
    const r = state.result;

    if (r) {
      const enc = r.encoding && r.encoding !== 'utf-8' ? ' · read as ' + r.encoding : '';
      els.detected.hidden = false;
      els.detected.innerHTML = 'Detected <b></b> · <span></span>' + enc.replace(/[&<>]/g, '');
      els.detected.querySelector('b').textContent = r.formatName;
      els.detected.querySelector('span').textContent = state.tracks.length + (state.tracks.length === 1 ? ' track' : ' tracks');
    } else {
      els.detected.hidden = true;
    }

    els.optionsCard.hidden = !r;
    els.tableCard.hidden = !hasTracks;
    els.outputCard.hidden = !hasTracks;

    if (r && fresh) {
      const lists = r.meta.playlists;
      if (lists && lists.length > 1) {
        els.plistName.innerHTML = '';
        lists.forEach((n) => {
          const o = document.createElement('option');
          o.value = n; o.textContent = n;
          if (n === r.meta.chosenPlaylist) o.selected = true;
          els.plistName.appendChild(o);
        });
      }
    }
    updateOptionVisibility();
    renderRelease();
    renderTable();
    refreshOutput();
  }

  function renderWarnings(extra) {
    const all = state.parseWarnings.concat(extra || []);
    els.warnings.innerHTML = '';
    all.forEach((w) => {
      const li = document.createElement('li');
      li.textContent = w;
      els.warnings.appendChild(li);
    });
    els.warnCard.hidden = all.length === 0;
  }

  function renderRelease() {
    const m = (state.result && state.result.meta) || {};
    const year = m.date && (m.date.match(/\d{4}/) || [])[0];
    const rows = [['Artist', m.artist], ['Title', m.title], ['Year', year], ['Barcode', m.barcode], ['Genre', m.genre]]
      .filter((r) => r[1]);
    els.release.innerHTML = '';
    els.releaseCard.hidden = rows.length === 0;
    rows.forEach((r) => {
      const dt = document.createElement('dt'); dt.textContent = r[0];
      const dd = document.createElement('dd'); dd.textContent = r[1];
      const dc = document.createElement('dd');
      const b = document.createElement('button');
      b.className = 'ghost mini'; b.textContent = 'Copy';
      b.addEventListener('click', () => copyText(r[1], b));
      dc.appendChild(b);
      els.release.append(dt, dd, dc);
    });
  }

  function renderTable() {
    els.tbody.innerHTML = '';
    updateCount();
    const rows = E.formatTracklist(state.tracks, formatOptions()).rows;
    state.tracks.forEach((t, i) => {
      const tr = document.createElement('tr');
      const pos = document.createElement('td');
      pos.className = 'pos'; pos.textContent = rows[i] ? rows[i].position : '';
      tr.appendChild(pos);
      tr.appendChild(cell(t, 'artist', 'Artist'));
      tr.appendChild(cell(t, 'title', 'Title'));
      tr.appendChild(cell(t, 'seconds', 'm:ss'));
      const act = document.createElement('td');
      act.className = 'act';
      const del = document.createElement('button');
      del.textContent = '×'; del.title = 'Remove this track'; del.setAttribute('aria-label', 'Remove track ' + (i + 1));
      del.addEventListener('click', () => { state.tracks.splice(i, 1); renderAll(false); });
      act.appendChild(del);
      tr.appendChild(act);
      els.tbody.appendChild(tr);
    });
  }

  // "(12 tracks, 45:10 total)" next to the Tracks heading, kept current as cells are edited
  function updateCount() {
    const n = state.tracks.length;
    if (!n) { els.count.textContent = ''; return; }
    const csv = E.formatCsv(state.tracks, formatOptions());
    let s = n + (n === 1 ? ' track' : ' tracks');
    if (csv.missing === n) s += ', no lengths';
    else {
      s += ', ' + E.formatDuration(csv.totalSeconds) + ' total';
      if (csv.missing) s += ' (' + csv.missing + ' without a length)';
    }
    els.count.textContent = '(' + s + ')';
  }

  function cell(t, field, placeholder) {
    const td = document.createElement('td');
    if (field === 'seconds') td.className = 'dur';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = placeholder;
    inp.value = field === 'seconds' ? E.formatDuration(t.seconds) : t[field];
    inp.addEventListener('input', () => {
      if (field === 'seconds') {
        const v = inp.value.trim();
        t.seconds = v === '' ? null : E.parseDuration(v);
      } else {
        t[field] = inp.value;
      }
      refreshOutput();
      refreshPositions();
    });
    td.appendChild(inp);
    return td;
  }

  function refreshPositions() {
    const rows = E.formatTracklist(state.tracks, formatOptions()).rows;
    const cells = els.tbody.querySelectorAll('td.pos');
    cells.forEach((c, i) => { c.textContent = rows[i] ? rows[i].position : ''; });
  }

  function refreshOutput() {
    if (!state.tracks.length) { els.output.value = ''; renderWarnings([]); return; }
    const out = E.formatTracklist(state.tracks, formatOptions());
    els.output.value = out.text;
    renderWarnings(out.warnings);
    refreshPositions();
    updateCount();
    els.status.textContent = '';
    els.status.className = 'status';
  }

  /* ---------------- copy and save ---------------- */
  function say(msg, isError) {
    els.status.textContent = msg;
    els.status.className = 'status' + (isError ? ' err' : '');
  }

  async function copyText(text, btn) {
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; }
    } catch (e) { ok = false; }
    if (!ok) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
    }
    if (btn) {
      const old = btn.textContent;
      btn.textContent = ok ? 'Copied' : 'Press Ctrl+C';
      setTimeout(() => { btn.textContent = old; }, 1300);
    }
    return ok;
  }

  els.copyBtn.addEventListener('click', async () => {
    const ok = await copyText(els.output.value, els.copyBtn);
    if (!ok) { els.output.removeAttribute('readonly'); els.output.select(); els.output.setAttribute('readonly', ''); }
    say(ok ? 'Copied to the clipboard.' : 'Could not reach the clipboard. The text is selected, press Ctrl+C (Cmd+C on Mac).', !ok);
  });

  async function saveFile(text, name, ext, mime) {
    const T = window.__TAURI__;
    try {
      if (T && T.dialog && T.core) {
        const path = await T.dialog.save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
        if (!path) return false;
        await T.core.invoke('save_text', { path: path, contents: text });
        say('Saved to ' + path);
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }));
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        say('Saved ' + name);
      }
      return true;
    } catch (err) {
      say('Could not save the file: ' + (err && err.message ? err.message : err), true);
      return false;
    }
  }

  els.saveBtn.addEventListener('click', () => {
    const ext = els.template.value === 'tab' ? 'tsv' : 'txt';
    saveFile(els.output.value, state.baseName + '-tracklist.' + ext, ext, 'text/plain');
  });

  // CSV: Track Number, Artist, Song Name, Track Length and a Total Run Time row.
  // A leading byte order mark makes Excel read accented characters correctly.
  els.saveCsvBtn.addEventListener('click', async () => {
    const csv = E.formatCsv(state.tracks, formatOptions());
    const saved = await saveFile('﻿' + csv.text, state.baseName + '.csv', 'csv', 'text/csv');
    if (saved && csv.warnings.length) say(els.status.textContent + ' ' + csv.warnings[csv.warnings.length - 1]);
  });
  // ---- Update check at startup (can be turned off in Help > About) ----
  (function startupUpdateCheck() {
    const U = window.Updates;
    const banner = document.getElementById('updateBanner');
    if (!U || !banner || !U.autoEnabled()) return;
    let found = null;
    const text = document.getElementById('updateText');
    const installBtn = document.getElementById('updateInstall');
    const laterBtn = document.getElementById('updateLater');
    laterBtn.addEventListener('click', () => { banner.hidden = true; });
    installBtn.addEventListener('click', async () => {
      if (!found) return;
      installBtn.disabled = true; laterBtn.disabled = true;
      text.textContent = 'Downloading the update...';
      const r = await U.install(found, (p) => {
        if (p.phase === 'download' && p.total) text.textContent = 'Downloading the update... ' + Math.min(100, Math.round((p.done / p.total) * 100)) + '%';
        else if (p.phase === 'install') text.textContent = 'Installing. The app will restart.';
      });
      if (!r.ok) {
        text.textContent = 'The update could not be installed: ' + r.message;
        installBtn.disabled = false; laterBtn.disabled = false;
      }
    });
    setTimeout(async () => {
      try {
        const r = await U.check();
        if (r.state !== 'available') return; // stay quiet when up to date or offline
        found = r;
        text.textContent = 'Version ' + r.version + ' is available.';
        banner.hidden = false;
      } catch (e) { /* ignore */ }
    }, 3000);
  })();
})();
