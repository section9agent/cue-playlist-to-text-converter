(function () {
  'use strict';

  /* ---- Edit these to change the credits, name or donation link ---- */
  const AUTHORS = 'Coded by Claude & Emmanuel Hoachlander';
  const DONATE_TEXT = 'If you enjoy this program, please consider a donation.';
  const DONATE_URL =
    'https://www.paypal.com/donate/?business=section9agent%40hotmail.com' +
    '&no_recurring=0&item_name=Cue%2FPlaylist+to+Text+Converter&currency_code=USD';

  // Libraries the app is built on directly. Version and license come from the generated list.
  const MAIN_CRATES = [
    ['tauri', 'Desktop app framework'],
    ['tauri-plugin-dialog', 'Save dialog'],
    ['tauri-plugin-updater', 'Finds and installs updates'],
    ['tauri-plugin-process', 'Restarts the app after an update'],
    ['tauri-plugin-opener', 'Opens links in your browser']
  ];
  const OTHER = [
    { name: 'Rust', license: 'MIT or Apache-2.0', url: 'https://www.rust-lang.org/', what: 'Programming language the app is written in' },
    { name: 'Your system web view', license: '', url: 'https://tauri.app/', what: 'Microsoft Edge WebView2 on Windows, WebKit on macOS, WebKitGTK on Linux' }
  ];
  const BUILD_TOOLS = [
    ['Node.js', 'https://nodejs.org/'],
    ['Tauri CLI', 'https://github.com/tauri-apps/tauri'],
    ['tauri-action', 'https://github.com/tauri-apps/tauri-action'],
    ['actions/checkout', 'https://github.com/actions/checkout'],
    ['actions/setup-node', 'https://github.com/actions/setup-node'],
    ['dtolnay/rust-toolchain', 'https://github.com/dtolnay/rust-toolchain'],
    ['Swatinem/rust-cache', 'https://github.com/Swatinem/rust-cache']
  ];
  /* ----------------------------------------------------------------- */

  const $ = (id) => document.getElementById(id);
  const U = window.Updates;
  let found = null;

  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) { /* follow the system theme */ }

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function link(text, url) {
    const a = el('a', text);
    a.href = url;
    return a;
  }

  /* Links open in the person's browser, never inside the app window. */
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href && href.indexOf('https://') === 0) {
      e.preventDefault();
      U.openExternal(href);
    } else {
      e.preventDefault();
    }
  });

  /* ---- header, donation ---- */
  $('authors').textContent = AUTHORS;
  $('donateText').textContent = DONATE_TEXT;
  $('donateLink').href = DONATE_URL;

  (async function showVersion() {
    let v = '';
    try {
      const t = window.__TAURI__;
      if (t && t.app && t.app.getVersion) v = await t.app.getVersion();
    } catch (e) { /* not running inside the app */ }
    $('version').textContent = v ? 'Version ' + v : 'Development build';
  })();

  /* ---- credits ---- */
  const data = window.CREDITS || { count: 0, crates: [] };
  const byName = {};
  data.crates.forEach((c) => { if (!byName[c.name]) byName[c.name] = c; });

  function creditRow(name, url, detail, license) {
    const li = el('li');
    li.appendChild(link(name, url));
    if (detail) li.appendChild(el('span', detail, 'muted'));
    if (license) li.appendChild(el('span', license, 'lic'));
    return li;
  }

  MAIN_CRATES.forEach((m) => {
    const c = byName[m[0]];
    if (c) $('mainCredits').appendChild(creditRow(c.name + ' ' + c.version, c.url, m[1], c.license));
    else $('mainCredits').appendChild(creditRow(m[0], 'https://crates.io/crates/' + m[0], m[1], ''));
  });
  OTHER.forEach((o) => $('otherCredits').appendChild(creditRow(o.name, o.url, o.what, o.license)));
  BUILD_TOOLS.forEach((b) => $('buildCredits').appendChild(creditRow(b[0], b[1], '', '')));

  $('libsSummary').textContent = 'All Rust libraries (' + data.crates.length + ')';
  const libs = $('libs');
  data.crates.forEach((c) => libs.appendChild(creditRow(c.name + ' ' + c.version, c.url, '', c.license)));

  const repo = window.APP_INFO && window.APP_INFO.repo;
  if (repo) {
    const url = 'https://github.com/' + repo;
    $('projectLink').href = url;
    $('projectLink').textContent = url;
    $('projectLine').hidden = false;
  }

  /* ---- updates ---- */
  const auto = $('autoUpdate');
  auto.checked = U.autoEnabled();
  auto.addEventListener('change', () => U.setAuto(auto.checked));

  function status(msg, isError) {
    const s = $('updateStatus');
    s.textContent = msg;
    s.className = 'status' + (isError ? ' err' : '');
  }

  function resetUpdateUi() {
    found = null;
    $('installBtn').hidden = true;
    $('progress').hidden = true;
    $('notesBox').hidden = true;
  }

  async function runCheck() {
    resetUpdateUi();
    $('checkNow').disabled = true;
    status('Checking for updates...');
    const r = await U.check();
    $('checkNow').disabled = false;
    if (r.state === 'unavailable') {
      status('Update checks only work in the installed app.');
    } else if (r.state === 'error') {
      status('Could not check for updates: ' + r.message, true);
    } else if (r.state === 'uptodate') {
      status('You have the latest version.');
    } else {
      found = r;
      status('Version ' + r.version + ' is available' + (r.currentVersion ? ' (you have ' + r.currentVersion + ').' : '.'));
      $('installBtn').hidden = false;
      if (r.notes) { $('notes').textContent = r.notes; $('notesBox').hidden = false; }
    }
  }

  $('checkNow').addEventListener('click', runCheck);

  $('installBtn').addEventListener('click', async () => {
    if (!found) return;
    $('installBtn').disabled = true;
    $('checkNow').disabled = true;
    $('progress').hidden = false;
    $('progress').removeAttribute('value');
    status('Starting download...');
    const r = await U.install(found, (p) => {
      if (p.phase === 'download') {
        if (p.total) {
          const pct = Math.min(100, Math.round((p.done / p.total) * 100));
          $('progress').value = pct;
          status('Downloading... ' + pct + '%');
        } else {
          status('Downloading...');
        }
      } else if (p.phase === 'install') {
        $('progress').removeAttribute('value');
        status('Installing. The app will restart.');
      }
    });
    if (!r.ok) {
      $('progress').hidden = true;
      $('installBtn').disabled = false;
      $('checkNow').disabled = false;
      status('The update could not be installed: ' + r.message, true);
    }
  });

  /* "Check for Updates..." in the Help menu asks this window to check right away. */
  if (window.__CHECK_ON_OPEN) runCheck();
  try {
    const t = window.__TAURI__;
    if (t && t.event && t.event.listen) t.event.listen('check-updates', () => runCheck());
  } catch (e) { /* not running inside the app */ }
})();
