/*
 * Tracklist engine: parses cue sheets and playlists, formats a Discogs-ready tracklist.
 * Pure JavaScript with no dependencies. Runs in the app window and under Node (tests).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TracklistEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Text decoding                                                       */
  /* ------------------------------------------------------------------ */

  function decodeBytes(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
      return { text: new TextDecoder('utf-8').decode(b.subarray(3)), encoding: 'utf-8' };
    }
    if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) {
      return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'utf-16le' };
    }
    if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) {
      return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'utf-16be' };
    }
    // UTF-16 without a BOM: every other byte is zero for Latin text
    if (b.length >= 8) {
      let evenZero = 0, oddZero = 0;
      const n = Math.min(b.length, 400);
      for (let i = 0; i < n; i++) {
        if (b[i] === 0) { if (i % 2 === 0) evenZero++; else oddZero++; }
      }
      if (oddZero > n / 4 && evenZero === 0) return { text: new TextDecoder('utf-16le').decode(b), encoding: 'utf-16le' };
      if (evenZero > n / 4 && oddZero === 0) return { text: new TextDecoder('utf-16be').decode(b), encoding: 'utf-16be' };
    }
    try {
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'utf-8' };
    } catch (e) {
      // Old M3U and CUE files are usually Windows-1252
      return { text: new TextDecoder('windows-1252').decode(b), encoding: 'windows-1252' };
    }
  }

  /* ------------------------------------------------------------------ */
  /* Small helpers                                                       */
  /* ------------------------------------------------------------------ */

  const AUDIO_EXT = /\.(mp3|flac|wav|wave|aiff?|aifc|ogg|oga|opus|m4a|m4b|aac|wma|ape|wv|mpc|mp2|mp4|webm|dsf|dff|alac|tta|mka|ac3|dts|cda|mid|midi)$/i;

  function clean(s) {
    return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  function parseDuration(str) {
    if (str == null) return null;
    const m = String(str).trim().match(/^(?:(\d{1,3}):)?(\d{1,3}):(\d{2})(?:[.,]\d+)?$/);
    if (!m) return null;
    const h = m[1] ? parseInt(m[1], 10) : 0;
    const mm = parseInt(m[2], 10);
    const ss = parseInt(m[3], 10);
    if (ss > 59) return null;
    if (m[1] && mm > 59) return null;
    return h * 3600 + mm * 60 + ss;
  }

  function formatDuration(sec) {
    if (sec == null || !isFinite(sec) || sec < 0) return '';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const ss = String(s).padStart(2, '0');
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + ss;
    return m + ':' + ss;
  }

  function secondsOrNull(n) {
    n = Number(n);
    if (!isFinite(n) || n < 0) return null;
    return Math.round(n);
  }

  function track(fields) {
    return Object.assign({
      srcPos: '', artist: '', title: '', seconds: null, album: '',
      needsSplit: false, fromFilename: false
    }, fields);
  }

  function nameFromLocation(loc) {
    let s = String(loc == null ? '' : loc).trim();
    if (/^file:\/\//i.test(s)) s = s.replace(/^file:\/\/(localhost)?\/?/i, '');
    else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = s.split(/[?#]/)[0];
    if (/%[0-9a-f]{2}/i.test(s)) {
      try { s = decodeURIComponent(s); } catch (e) { /* keep as is */ }
    }
    let base = s.split(/[\\/]/).pop() || '';
    base = base.replace(AUDIO_EXT, '');
    // Underscores in file names almost always stand in for spaces
    base = base.replace(/_/g, ' ');
    return clean(base);
  }

  function fileTrack(loc, extra) {
    return track(Object.assign({ title: nameFromLocation(loc), fromFilename: true, needsSplit: true }, extra || {}));
  }

  /* ------------------------------------------------------------------ */
  /* Minimal tolerant XML parser                                         */
  /* ------------------------------------------------------------------ */

  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, e) {
      const k = e.toLowerCase();
      if (k === 'amp') return '&';
      if (k === 'lt') return '<';
      if (k === 'gt') return '>';
      if (k === 'quot') return '"';
      if (k === 'apos') return "'";
      try {
        return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
      } catch (err) { return m; }
    });
  }

  function parseXml(src) {
    const tokenRe = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE(?:[^>\[]|\[[\s\S]*?\])*>|<\/\s*([^\s>]+)\s*>|<([^\s\/>!?][^\s\/>]*)((?:\s+[^\s=\/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+|<)/g;
    const attrRe = /([^\s=\/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    const rootNode = { name: '#root', attrs: {}, children: [], text: '' };
    const stack = [rootNode];
    let m;
    while ((m = tokenRe.exec(src)) !== null) {
      const top = stack[stack.length - 1];
      if (m[1] !== undefined) {
        top.text += m[1];
      } else if (m[2] !== undefined) {
        const name = m[2].toLowerCase().replace(/^[^:]*:/, '');
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].name === name) { stack.length = i; break; }
        }
      } else if (m[3] !== undefined) {
        const node = { name: m[3].toLowerCase().replace(/^[^:]*:/, ''), attrs: {}, children: [], text: '' };
        let a;
        attrRe.lastIndex = 0;
        const attrSrc = m[4] || '';
        while ((a = attrRe.exec(attrSrc)) !== null) {
          const v = a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '';
          node.attrs[a[1].toLowerCase().replace(/^[^:]*:/, '')] = decodeEntities(v);
        }
        top.children.push(node);
        if (!m[5]) stack.push(node);
      } else if (m[6] !== undefined) {
        top.text += decodeEntities(m[6]);
      }
    }
    return rootNode;
  }

  function kids(node, name) { return node ? node.children.filter(function (c) { return c.name === name; }) : []; }
  function kid(node, name) { return kids(node, name)[0] || null; }
  function kidText(node, name) { const k = kid(node, name); return k ? clean(k.text) : ''; }
  function deep(node, name, out) {
    out = out || [];
    if (!node) return out;
    node.children.forEach(function (c) {
      if (c.name === name) out.push(c);
      deep(c, name, out);
    });
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Format detection                                                    */
  /* ------------------------------------------------------------------ */

  const FORMAT_NAMES = {
    cue: 'CUE sheet',
    m3u: 'M3U / M3U8 playlist',
    pls: 'PLS playlist',
    xspf: 'XSPF playlist',
    jspf: 'JSPF playlist',
    wpl: 'Windows Media (WPL / ZPL / SMIL) playlist',
    asx: 'ASX playlist',
    b4s: 'Winamp B4S playlist',
    mpcpl: 'MPC-HC playlist',
    plist: 'iTunes / Apple Music library XML',
    delimited: 'CSV / TSV table',
    text: 'Plain text tracklist'
  };

  function extOf(name) {
    const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function detectFormat(text, filename) {
    const ext = extOf(filename);
    const head = text.slice(0, 4000);
    const trimmed = head.replace(/^\s+/, '');

    if (ext === 'cue') return 'cue';
    if (ext === 'm3u' || ext === 'm3u8') return 'm3u';
    if (ext === 'pls') return 'pls';
    if (ext === 'xspf') return 'xspf';
    if (ext === 'jspf') return 'jspf';
    if (ext === 'wpl' || ext === 'zpl' || ext === 'smil' || ext === 'smi') return 'wpl';
    if (ext === 'asx' || ext === 'wax' || ext === 'wvx') return 'asx';
    if (ext === 'b4s') return 'b4s';
    if (ext === 'mpcpl') return 'mpcpl';
    if (ext === 'csv' || ext === 'tsv' || ext === 'tab') return 'delimited';

    // Sniff the content
    if (/^MPCPLAYLIST/i.test(trimmed)) return 'mpcpl';
    if (/^#EXTM3U/i.test(trimmed)) return 'm3u';
    if (/^\[playlist\]/i.test(trimmed)) return 'pls';
    if (/<WasabiPlaylist/i.test(head)) return 'b4s';
    if (/<asx[\s>]/i.test(head)) return 'asx';
    if (/<plist[\s>]/i.test(head)) return 'plist';
    if (/<playlist[\s>][\s\S]*xspf|xmlns\s*=\s*"http:\/\/xspf\.org/i.test(head)) return 'xspf';
    if (/<smil[\s>]/i.test(head)) return 'wpl';
    if (/^\s*[\[{]/.test(trimmed) && /"playlist"|"track"/.test(head)) return 'jspf';
    if (/^\s*(REM|PERFORMER|TITLE|FILE|CATALOG|CDTEXTFILE)\b/im.test(head) && /^\s*TRACK\s+\d+/im.test(text)) return 'cue';
    if (ext === 'xml') {
      if (/<plist/i.test(head)) return 'plist';
      if (/<playlist/i.test(head)) return 'xspf';
    }

    const lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); }).slice(0, 60);
    if (lines.length) {
      const pathy = lines.filter(function (l) { return !/^#/.test(l) && (AUDIO_EXT.test(l.trim()) || /^[a-z][a-z0-9+.-]*:\/\//i.test(l.trim())); }).length;
      if (pathy >= lines.length * 0.6) return 'm3u';
      const tabs = lines.filter(function (l) { return /\t/.test(l); }).length;
      if (tabs >= lines.length * 0.8 && lines.length > 1) return 'delimited';
    }
    return 'text';
  }

  /* ------------------------------------------------------------------ */
  /* CUE                                                                 */
  /* ------------------------------------------------------------------ */

  function cueValue(rest) {
    rest = rest.trim();
    if (rest[0] === '"') {
      const end = rest.indexOf('"', 1);
      return end === -1 ? rest.slice(1) : rest.slice(1, end);
    }
    return rest.split(/\s+/)[0] || '';
  }

  function cueFrames(str) {
    const m = String(str).match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(m[3], 10) / 75;
  }

  function parseCue(text, opts, ctx) {
    const meta = {};
    const entries = []; // audio and non-audio tracks, in order
    let current = null;
    let fileIndex = -1;
    let fileCount = 0;

    text.split(/\r?\n/).forEach(function (raw) {
      const line = raw.replace(/^﻿/, '').trim();
      if (!line) return;
      const m = line.match(/^(\S+)\s*(.*)$/);
      if (!m) return;
      const cmd = m[1].toUpperCase();
      const rest = m[2];
      switch (cmd) {
        case 'REM': {
          const r = rest.match(/^(\S+)\s*(.*)$/);
          if (!r) break;
          const key = r[1].toUpperCase();
          const val = cueValue(r[2]);
          if (current) {
            if (key === 'DATE' || key === 'YEAR') current.date = val;
          } else if (key === 'DATE' || key === 'YEAR') meta.date = val;
          else if (key === 'GENRE') meta.genre = val;
          else if (key === 'DISCID') meta.discId = val;
          else if (key === 'COMMENT' && !meta.comment) meta.comment = val;
          break;
        }
        case 'CATALOG':
          meta.barcode = cueValue(rest);
          break;
        case 'FILE':
          fileIndex++;
          fileCount++;
          break;
        case 'TRACK': {
          const t = rest.match(/^(\d+)\s+(\S+)/);
          current = {
            number: t ? parseInt(t[1], 10) : entries.length + 1,
            type: t ? t[2].toUpperCase() : 'AUDIO',
            title: '', performer: '', fileIndex: fileIndex, index01: null
          };
          entries.push(current);
          break;
        }
        case 'TITLE':
          if (current) current.title = cueValue(rest); else meta.title = cueValue(rest);
          break;
        case 'PERFORMER':
          if (current) current.performer = cueValue(rest); else meta.artist = cueValue(rest);
          break;
        case 'INDEX': {
          const i = rest.match(/^(\d+)\s+(\S+)/);
          if (i && current && parseInt(i[1], 10) === 1) current.index01 = cueFrames(i[2]);
          break;
        }
        default:
          break;
      }
    });

    const audio = entries.filter(function (e) { return e.type === 'AUDIO'; });
    if (audio.length < entries.length) ctx.warnings.push('Skipped ' + (entries.length - audio.length) + ' non-audio track(s) (data tracks).');

    let unknownDurations = 0;
    const tracks = audio.map(function (e, i) {
      let seconds = null;
      const next = audio[i + 1];
      if (next && next.fileIndex === e.fileIndex && e.index01 != null && next.index01 != null) {
        seconds = Math.round(next.index01 - e.index01);
      } else if (!next && fileCount === 1 && e.index01 != null && opts.totalSeconds) {
        seconds = Math.round(opts.totalSeconds - e.index01);
        if (seconds < 0) seconds = null;
      }
      if (seconds == null) unknownDurations++;
      return track({
        srcPos: String(e.number),
        artist: clean(e.performer || ''),
        title: clean(e.title) || ('Track ' + e.number),
        seconds: seconds
      });
    });

    if (fileCount > 1 && audio.length > 1) {
      ctx.warnings.push('This cue sheet points at separate audio files, so track lengths cannot be worked out from it. Fill in the durations by hand, or use an extended M3U that has them.');
    } else if (unknownDurations > 0 && tracks.length) {
      ctx.warnings.push('A cue sheet does not say how long the last track is. Enter the total length of the disc in the options and it will be calculated.');
    }
    return { tracks: tracks, meta: meta };
  }

  /* ------------------------------------------------------------------ */
  /* M3U / M3U8                                                          */
  /* ------------------------------------------------------------------ */

  function splitExtinf(rest) {
    // "#EXTINF:123 tvg-name="a, b",Label": split at the first comma outside quotes
    let inQuote = false;
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if (ch === '"') inQuote = !inQuote;
      else if (ch === ',' && !inQuote) return [rest.slice(0, i), rest.slice(i + 1)];
    }
    return [rest, ''];
  }

  function parseM3u(text) {
    const meta = {};
    const tracks = [];
    let pending = null;

    text.split(/\r?\n/).forEach(function (raw) {
      const line = raw.replace(/^﻿/, '').trim();
      if (!line) return;
      if (line[0] === '#') {
        const up = line.toUpperCase();
        if (up.indexOf('#EXTINF:') === 0) {
          const parts = splitExtinf(line.slice(8));
          const head = parts[0].trim().match(/^(-?\d+(?:\.\d+)?)/);
          pending = pending || {};
          pending.seconds = head && parseFloat(head[1]) >= 0 ? secondsOrNull(head[1]) : null;
          pending.label = clean(parts[1]);
        } else if (up.indexOf('#EXTART:') === 0) {
          pending = pending || {};
          pending.artist = clean(line.slice(8));
        } else if (up.indexOf('#EXTALB:') === 0) {
          if (!meta.title) meta.title = clean(line.slice(8));
        } else if (up.indexOf('#PLAYLIST:') === 0) {
          if (!meta.title) meta.title = clean(line.slice(10));
        } else if (up.indexOf('#EXTGENRE:') === 0) {
          if (!meta.genre) meta.genre = clean(line.slice(10));
        }
        return;
      }
      const p = pending || {};
      pending = null;
      if (p.label) {
        tracks.push(track({
          artist: p.artist || '',
          title: p.label,
          seconds: p.seconds == null ? null : p.seconds,
          needsSplit: !p.artist
        }));
      } else {
        tracks.push(fileTrack(line, { seconds: p.seconds == null ? null : p.seconds, artist: p.artist || '' }));
      }
    });
    return { tracks: tracks, meta: meta };
  }

  /* ------------------------------------------------------------------ */
  /* PLS                                                                 */
  /* ------------------------------------------------------------------ */

  function parsePls(text) {
    const rows = {};
    text.split(/\r?\n/).forEach(function (raw) {
      const m = raw.replace(/^﻿/, '').trim().match(/^(File|Title|Length)(\d+)\s*=\s*(.*)$/i);
      if (!m) return;
      const n = parseInt(m[2], 10);
      rows[n] = rows[n] || {};
      rows[n][m[1].toLowerCase()] = m[3];
    });
    const tracks = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
      const r = rows[n];
      const secs = r.length != null && parseFloat(r.length) >= 0 ? secondsOrNull(r.length) : null;
      if (r.title && clean(r.title)) return track({ title: clean(r.title), seconds: secs, needsSplit: true });
      return fileTrack(r.file || '', { seconds: secs });
    });
    return { tracks: tracks, meta: {} };
  }

  /* ------------------------------------------------------------------ */
  /* XML based playlists                                                 */
  /* ------------------------------------------------------------------ */

  function msToSeconds(v) {
    if (v == null || v === '') return null;
    const n = parseFloat(v);
    return isFinite(n) && n >= 0 ? Math.round(n / 1000) : null;
  }

  function parseXspf(text) {
    const root = parseXml(text);
    const pl = deep(root, 'playlist')[0];
    const meta = {};
    if (pl) {
      meta.title = kidText(pl, 'title');
      meta.artist = kidText(pl, 'creator');
    }
    const tracks = deep(root, 'track').map(function (t) {
      const loc = kidText(t, 'location');
      const title = kidText(t, 'title');
      const artist = kidText(t, 'creator');
      const base = title
        ? track({ title: title, artist: artist, needsSplit: !artist })
        : fileTrack(loc, { artist: artist });
      base.album = kidText(t, 'album');
      base.seconds = msToSeconds(kidText(t, 'duration'));
      base.srcPos = kidText(t, 'tracknum');
      return base;
    });
    return { tracks: tracks, meta: meta };
  }

  function parseJspf(text) {
    const data = JSON.parse(text);
    const pl = data.playlist || data;
    const meta = { title: clean(pl.title || ''), artist: clean(pl.creator || '') };
    const list = Array.isArray(pl.track) ? pl.track : [];
    const tracks = list.map(function (t) {
      const loc = Array.isArray(t.location) ? t.location[0] : t.location;
      const artist = clean(t.creator || '');
      const base = t.title
        ? track({ title: clean(t.title), artist: artist, needsSplit: !artist })
        : fileTrack(loc || '', { artist: artist });
      base.album = clean(t.album || '');
      base.seconds = msToSeconds(t.duration);
      base.srcPos = t.trackNum != null ? String(t.trackNum) : '';
      return base;
    });
    return { tracks: tracks, meta: meta };
  }

  function parseWpl(text) {
    const root = parseXml(text);
    const head = deep(root, 'head')[0];
    const meta = {};
    if (head) {
      meta.title = kidText(head, 'title');
      meta.artist = kidText(head, 'author');
    }
    const tracks = deep(root, 'media').map(function (m) {
      const a = m.attrs;
      const artist = clean(a.trackartist || '');
      const base = a.tracktitle
        ? track({ title: clean(a.tracktitle), artist: artist, needsSplit: !artist })
        : fileTrack(a.src || '', { artist: artist });
      base.album = clean(a.albumtitle || '');
      base.seconds = msToSeconds(a.duration);
      if (!meta.title && a.albumtitle) meta.title = clean(a.albumtitle);
      if (!meta.artist && a.albumartist) meta.artist = clean(a.albumartist);
      return base;
    });
    return { tracks: tracks, meta: meta };
  }

  function parseAsx(text) {
    const root = parseXml(text);
    const asx = deep(root, 'asx')[0];
    const meta = {};
    if (asx) meta.title = kidText(asx, 'title');
    const tracks = deep(root, 'entry').map(function (e) {
      const ref = kid(e, 'ref');
      const loc = ref ? (ref.attrs.href || '') : '';
      const title = kidText(e, 'title');
      const artist = kidText(e, 'author');
      const base = title
        ? track({ title: title, artist: artist, needsSplit: !artist })
        : fileTrack(loc, { artist: artist });
      const d = kid(e, 'duration');
      if (d && d.attrs.value) {
        const v = d.attrs.value;
        base.seconds = /:/.test(v) ? parseDuration(v.replace(/^(\d+):(\d+)$/, '$1:$2')) : secondsOrNull(v);
        if (base.seconds == null) {
          const hms = v.match(/^(\d+):(\d{2}):(\d{2})/);
          if (hms) base.seconds = parseInt(hms[1], 10) * 3600 + parseInt(hms[2], 10) * 60 + parseInt(hms[3], 10);
        }
      }
      return base;
    });
    return { tracks: tracks, meta: meta };
  }

  function parseB4s(text) {
    const root = parseXml(text);
    const pl = deep(root, 'wasabiplaylist')[0];
    const meta = {};
    if (pl && pl.attrs.playlist_name) meta.title = clean(pl.attrs.playlist_name);
    const tracks = deep(root, 'entry').map(function (e) {
      const name = kidText(e, 'name');
      const loc = e.attrs.playstring || '';
      const base = name ? track({ title: name, needsSplit: true }) : fileTrack(loc);
      const len = kidText(e, 'length');
      base.seconds = len !== '' && parseFloat(len) >= 0 ? secondsOrNull(len) : null;
      return base;
    });
    return { tracks: tracks, meta: meta };
  }

  function parseMpcpl(text) {
    const tracks = [];
    text.split(/\r?\n/).forEach(function (raw) {
      const m = raw.replace(/^﻿/, '').trim().match(/^(\d+),filename,(.*)$/i);
      if (m) tracks.push(fileTrack(m[2]));
    });
    return { tracks: tracks, meta: {} };
  }

  /* ---- iTunes / Apple Music library XML (plist) ---- */

  function plistValue(node) {
    if (!node) return null;
    switch (node.name) {
      case 'dict': {
        const o = {};
        for (let i = 0; i + 1 < node.children.length; i += 2) {
          if (node.children[i].name === 'key') o[clean(node.children[i].text)] = plistValue(node.children[i + 1]);
          else i--; // resync on malformed input
        }
        return o;
      }
      case 'array': return node.children.map(plistValue);
      case 'integer': return parseInt(node.text, 10);
      case 'real': return parseFloat(node.text);
      case 'true': return true;
      case 'false': return false;
      default: return node.text;
    }
  }

  function parsePlist(text, opts, ctx) {
    const root = parseXml(text);
    const top = deep(root, 'plist')[0];
    const dict = top && top.children.find(function (c) { return c.name === 'dict'; });
    const data = dict ? plistValue(dict) : null;
    if (!data || !data.Tracks) throw new Error('This XML file does not contain an iTunes / Apple Music track list.');

    const library = data.Tracks;
    const lists = (data.Playlists || []).filter(function (p) {
      return !p.Master && !p['Distinguished Kind'] && Array.isArray(p['Playlist Items']) && p['Playlist Items'].length;
    });
    const meta = { playlists: lists.map(function (p) { return p.Name; }) };

    let items;
    if (lists.length) {
      let chosen = lists[0];
      if (opts.playlistName) {
        const hit = lists.find(function (p) { return p.Name === opts.playlistName; });
        if (hit) chosen = hit;
      }
      meta.title = chosen.Name;
      meta.chosenPlaylist = chosen.Name;
      if (lists.length > 1 && !opts.playlistName) {
        ctx.warnings.push('This library has ' + lists.length + ' playlists. Showing "' + chosen.Name + '". Pick another one in the options.');
      }
      items = chosen['Playlist Items'].map(function (it) { return library[String(it['Track ID'])]; }).filter(Boolean);
    } else {
      items = Object.keys(library).map(function (k) { return library[k]; });
      items.sort(function (a, b) {
        return (a['Disc Number'] || 0) - (b['Disc Number'] || 0) || (a['Track Number'] || 0) - (b['Track Number'] || 0);
      });
    }
    const tracks = items.map(function (t) {
      const pos = t['Track Number'] ? ((t['Disc Count'] > 1 && t['Disc Number']) ? t['Disc Number'] + '-' + t['Track Number'] : String(t['Track Number'])) : '';
      return track({
        srcPos: pos,
        artist: clean(t.Artist || ''),
        title: clean(t.Name || ''),
        album: clean(t.Album || ''),
        seconds: msToSeconds(t['Total Time'])
      });
    });
    if (items.length && items[0]['Album Artist']) meta.artist = clean(items[0]['Album Artist']);
    if (items.length && items[0].Album && !meta.title) meta.title = clean(items[0].Album);
    return { tracks: tracks, meta: meta };
  }

  /* ------------------------------------------------------------------ */
  /* CSV / TSV                                                           */
  /* ------------------------------------------------------------------ */

  function parseDelimitedRows(text, delim) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += ch;
      } else if (ch === '"' && field === '') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field); field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }

  const COLUMN_SYNONYMS = {
    pos: ['position', 'pos', 'track', 'trackno', 'tracknumber', 'tracknum', 'no', 'number', 'nr', 'num', 'index'],
    artist: ['artist', 'trackartist', 'performer', 'artists'],
    title: ['title', 'name', 'song', 'trackname', 'tracktitle', 'songtitle', 'songname'],
    duration: ['duration', 'time', 'length', 'totaltime', 'runtime', 'durationms', 'lengthms', 'ms', 'seconds'],
    album: ['album', 'release'],
    albumArtist: ['albumartist', 'releaseartist'],
    disc: ['disc', 'discnumber', 'disk', 'cd', 'discno']
  };

  function normHeader(h) { return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  function parseDelimited(text, opts, ctx) {
    const first = text.split(/\r?\n/).find(function (l) { return l.trim(); }) || '';
    const counts = { '\t': 0, ',': 0, ';': 0, '|': 0 };
    first.replace(/[\t,;|]/g, function (c) { counts[c]++; return c; });
    const delim = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    const rows = parseDelimitedRows(text, counts[delim] ? delim : '\t');
    if (!rows.length) return { tracks: [], meta: {} };

    const headers = rows[0].map(normHeader);
    const map = {};
    Object.keys(COLUMN_SYNONYMS).forEach(function (field) {
      // Prefer exact column order of synonyms so "Track Number" beats "Track Count"
      for (let s = 0; s < COLUMN_SYNONYMS[field].length; s++) {
        const idx = headers.indexOf(COLUMN_SYNONYMS[field][s]);
        if (idx !== -1 && !Object.keys(map).some(function (k) { return map[k] === idx; })) { map[field] = idx; return; }
      }
    });
    if (map.title == null) {
      ctx.warnings.push('No title column was found in this table, so it was read as plain text instead.');
      return parseTextTracklist(text, ctx);
    }
    const msColumn = map.duration != null && /ms|millis/.test(headers[map.duration]);
    const meta = {};
    const tracks = [];
    rows.slice(1).forEach(function (r) {
      const title = clean(r[map.title]);
      if (!title) return;
      let secs = null;
      if (map.duration != null) {
        const raw = clean(r[map.duration]);
        if (/:/.test(raw)) secs = parseDuration(raw);
        else if (/^\d+(\.\d+)?$/.test(raw)) secs = msColumn ? msToSeconds(raw) : secondsOrNull(raw);
      }
      let pos = map.pos != null ? clean(r[map.pos]) : '';
      const disc = map.disc != null ? clean(r[map.disc]) : '';
      if (pos && disc && disc !== '1' && /^\d+$/.test(pos)) pos = disc + '-' + pos;
      const artist = map.artist != null ? clean(r[map.artist]) : '';
      tracks.push(track({
        srcPos: pos, artist: artist, title: title, seconds: secs,
        album: map.album != null ? clean(r[map.album]) : '',
        needsSplit: !artist
      }));
      if (!meta.title && map.album != null && clean(r[map.album])) meta.title = clean(r[map.album]);
      if (!meta.artist && map.albumArtist != null && clean(r[map.albumArtist])) meta.artist = clean(r[map.albumArtist]);
    });
    return { tracks: tracks, meta: meta };
  }

  /* ------------------------------------------------------------------ */
  /* Plain text                                                          */
  /* ------------------------------------------------------------------ */

  const POS_RE = /^[\[(]?(?:(?:cd|disc|disk|dvd)\s*)?(\d{1,2}[-.]\d{1,3}|[A-Za-z]{1,2}\d{1,3}[a-z]?|\d{1,3})[\])]?(?:\s*[.):\-–—]\s+|\s*[.):]\s*|\s+)(?=\S)/i;
  const HEADING_RE = /^(?:(cd|disc|disk|dvd)|(side))\s*([0-9]+|[A-Za-z])\s*[:.]?$/i;
  const DURATION_TAIL_RE = /[\[(]?\s*\b(\d{1,3}(?::\d{1,2}){1,2})\s*[\])]?\s*$/;

  function parseTextTracklist(text, ctx) {
    const rawLines = text.split(/\r?\n/).map(function (l) { return clean(l); }).filter(Boolean);
    const items = [];
    let disc = '', side = '';

    rawLines.forEach(function (line) {
      const h = line.match(HEADING_RE);
      if (h) {
        if (h[1]) { disc = h[3]; side = ''; } else { side = h[3].toUpperCase(); disc = ''; }
        return;
      }
      let seconds = null;
      const d = line.match(DURATION_TAIL_RE);
      let body = line;
      if (d) {
        const secs = parseDuration(d[1]);
        if (secs != null) {
          seconds = secs;
          body = line.slice(0, d.index).replace(/[\s\-–—|,]+$/, '').trim();
        }
      }
      const p = body.match(POS_RE);
      items.push({
        withPos: p ? { pos: p[1], rest: body.slice(p[0].length).trim() } : null,
        body: body, seconds: seconds, disc: disc, side: side
      });
    });

    const positioned = items.filter(function (i) { return i.withPos && i.withPos.rest; });
    // Only trust leading numbers as positions when they look like a track sequence
    // (starts at 0 or 1, then counts up or restarts), so "99 Luftballons" stays a title.
    const nums = positioned.map(function (i) {
      const m = i.withPos.pos.match(/(\d+)\D*$/);
      return m ? parseInt(m[1], 10) : NaN;
    });
    let steps = 0;
    for (let k = 1; k < nums.length; k++) {
      if (nums[k] === nums[k - 1] + 1 || nums[k] === 1 || nums[k] === 0) steps++;
    }
    const sequenceOk = nums.length > 0 && nums[0] <= 1 && (nums.length === 1 || steps >= Math.ceil((nums.length - 1) * 0.7));
    const usePos = items.length > 0 && positioned.length >= Math.ceil(items.length * 0.6) && sequenceOk;

    const tracks = items.map(function (i) {
      let title = i.body, pos = '';
      if (usePos && i.withPos && i.withPos.rest) {
        title = i.withPos.rest;
        pos = i.withPos.pos;
        if (/^\d+$/.test(pos)) {
          if (i.disc) pos = i.disc + '-' + pos;
          else if (i.side) pos = i.side + pos;
        }
      }
      return track({ srcPos: pos, title: title, seconds: i.seconds, needsSplit: true });
    }).filter(function (t) { return t.title; });
    return { tracks: tracks, meta: {} };
  }

  /* ------------------------------------------------------------------ */
  /* Post processing                                                     */
  /* ------------------------------------------------------------------ */

  const SPLIT_RE = /^(.+?)\s+[-–—]\s+(.+)$/;
  const LEAD_NUM_RE = /^[\[(]?(\d{1,3})(?:[-.]\d{1,3})?[\])]?(?:\s*[-._)]\s*|\s+)(?=\S)/;

  function finalize(result, opts) {
    const tracks = result.tracks;

    // Strip leading track numbers from file names, but only when most names have them
    const fromName = tracks.filter(function (t) { return t.fromFilename; });
    if (fromName.length) {
      const numbered = fromName.filter(function (t) { return LEAD_NUM_RE.test(t.title); }).length;
      if (numbered >= Math.ceil(fromName.length * 0.6) && (fromName.length > 1 || /^0\d|^\d+\s*[-._)]/.test(fromName[0].title))) {
        fromName.forEach(function (t) {
          const m = t.title.match(LEAD_NUM_RE);
          if (m) {
            if (!t.srcPos) t.srcPos = m[1];
            t.title = t.title.slice(m[0].length);
          }
        });
      }
    }

    // Split "Artist - Title" when most labels look like that (or when told to)
    const mode = opts.splitArtist || 'auto';
    const cand = tracks.filter(function (t) { return t.needsSplit; });
    if (cand.length && mode !== 'no') {
      const matching = cand.filter(function (t) { return SPLIT_RE.test(t.title); }).length;
      if (mode === 'yes' || matching >= Math.ceil(cand.length * 0.6)) {
        cand.forEach(function (t) {
          const m = t.title.match(SPLIT_RE);
          if (m) { t.artist = clean(m[1]); t.title = clean(m[2]); }
        });
      }
    }
    tracks.forEach(function (t) {
      t.title = clean(t.title);
      t.artist = clean(t.artist);
      // Discogs positions are 1, 2, 3 and A1, B2, 1-5: drop zero padding
      t.srcPos = clean(t.srcPos).replace(/(^|\D)0+(\d)/g, '$1$2');
      delete t.needsSplit;
    });
    result.tracks = tracks.filter(function (t) { return t.title; });
    return result;
  }

  /* ------------------------------------------------------------------ */
  /* Public parse API                                                    */
  /* ------------------------------------------------------------------ */

  function parseText(text, filename, opts) {
    opts = opts || {};
    text = String(text).replace(/^﻿/, '');
    const ctx = { warnings: [] };
    const format = opts.format || detectFormat(text, filename);
    let result;
    switch (format) {
      case 'cue': result = parseCue(text, opts, ctx); break;
      case 'm3u': result = parseM3u(text); break;
      case 'pls': result = parsePls(text); break;
      case 'xspf': result = parseXspf(text); break;
      case 'jspf': result = parseJspf(text); break;
      case 'wpl': result = parseWpl(text); break;
      case 'asx': result = parseAsx(text); break;
      case 'b4s': result = parseB4s(text); break;
      case 'mpcpl': result = parseMpcpl(text); break;
      case 'plist': result = parsePlist(text, opts, ctx); break;
      case 'delimited': result = parseDelimited(text, opts, ctx); break;
      default: result = parseTextTracklist(text, ctx);
    }
    result = finalize(result, opts);
    Object.keys(result.meta).forEach(function (k) {
      if (result.meta[k] === '' || result.meta[k] == null) delete result.meta[k];
    });
    if (!result.tracks.length) ctx.warnings.push('No tracks were found in this file.');
    return {
      format: format,
      formatName: FORMAT_NAMES[format] || format,
      tracks: result.tracks,
      meta: result.meta,
      warnings: ctx.warnings
    };
  }

  function parseBytes(bytes, filename, opts) {
    const d = decodeBytes(bytes);
    const r = parseText(d.text, filename, opts);
    r.encoding = d.encoding;
    return r;
  }

  /* ------------------------------------------------------------------ */
  /* Output formatting                                                   */
  /* ------------------------------------------------------------------ */

  function parseSplits(str) {
    return String(str || '').split(/[\s,;]+/).map(function (s) { return parseInt(s, 10); }).filter(function (n) { return n > 0; });
  }

  function sideLetter(n) {
    // 0 -> A ... 25 -> Z, 26 -> AA (rare)
    let s = '';
    n = n + 1;
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  function buildPositions(tracks, opts, warnings) {
    const mode = opts.positions || 'sequential';
    const splits = Array.isArray(opts.splits) ? opts.splits : parseSplits(opts.splits);
    const out = [];
    if (mode === 'none') return tracks.map(function () { return ''; });
    if (mode === 'source') {
      return tracks.map(function (t, i) { return t.srcPos || String(i + 1); });
    }
    if (mode === 'vinyl' || mode === 'multidisc') {
      if (!splits.length) {
        if (mode === 'vinyl') warnings.push('Enter how many tracks are on each side (for example "5, 5") to number tracks as A1, A2, B1...');
        else warnings.push('Enter how many tracks are on each disc (for example "12, 10") to number tracks as 1-1, 1-2, 2-1...');
        return tracks.map(function (t, i) { return String(i + 1); });
      }
      let group = 0, used = 0;
      tracks.forEach(function (t, i) {
        while (group < splits.length && used >= splits[group]) { group++; used = 0; }
        if (group >= splits.length) {
          // More tracks than the counts cover: carry on in a new group
          if (used === 0 && i > 0 && out.length === i) group = Math.max(group, splits.length);
        }
        used++;
        out.push(mode === 'vinyl' ? sideLetter(group) + used : (group + 1) + '-' + used);
      });
      const covered = splits.reduce(function (a, b) { return a + b; }, 0);
      if (covered !== tracks.length) {
        warnings.push('The counts you entered add up to ' + covered + ' but there are ' + tracks.length + ' tracks.');
      }
      return out;
    }
    return tracks.map(function (t, i) { return String(i + 1); });
  }

  function csvQuote(s) {
    s = String(s == null ? '' : s);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function formatTracklist(tracks, opts) {
    opts = opts || {};
    const warnings = [];
    const positions = buildPositions(tracks, opts, warnings);

    // Discogs: leave track artists off when they are all the release artist; if used, every track needs one
    const artists = tracks.map(function (t) { return t.artist || ''; });
    const distinct = Array.from(new Set(artists.filter(Boolean)));
    const anyArtist = distinct.length > 0;
    const albumArtist = clean(opts.albumArtist || '');
    let showArtist;
    const artistMode = opts.includeArtist || 'auto';
    if (artistMode === 'never') showArtist = false;
    else if (artistMode === 'always') showArtist = anyArtist;
    else showArtist = anyArtist && (distinct.length > 1 || (artists.some(function (a) { return !a; })));
    if (artistMode === 'auto' && anyArtist && distinct.length === 1 && !artists.some(function (a) { return !a; })) showArtist = false;

    if (showArtist) {
      const missing = artists.filter(function (a) { return !a; }).length;
      if (missing) {
        warnings.push(missing + ' track(s) have no artist. Discogs needs an artist on every track once any track has one' + (albumArtist ? '; the release artist was used for those.' : '.'));
      }
    }

    const withDuration = opts.includeDuration !== false;
    const rows = tracks.map(function (t, i) {
      return {
        position: positions[i],
        artist: showArtist ? (t.artist || albumArtist) : '',
        title: t.title,
        duration: withDuration ? formatDuration(t.seconds) : ''
      };
    });

    const template = opts.template || 'dash';
    let lines;
    if (template === 'tab') {
      lines = rows.map(function (r) { return [r.position, r.artist, r.title, r.duration].join('\t'); });
    } else {
      const sep = template === 'dot' ? '. ' : ' - ';
      lines = rows.map(function (r) {
        const label = r.artist ? r.artist + ' - ' + r.title : r.title;
        let s = r.position ? r.position + sep + label : label;
        if (r.duration) s += ' ' + r.duration;
        return s;
      });
    }
    return { text: lines.join('\n'), rows: rows, warnings: warnings, showArtist: showArtist };
  }

  /*
   * CSV export: Track Number, Artist, Song Name, Track Length, then a last row with the
   * total run time. Every track gets an artist (the release artist fills any gaps) and
   * a length column, whatever the text output options are.
   */
  function formatCsv(tracks, opts) {
    opts = opts || {};
    const warnings = [];
    const positions = buildPositions(tracks, opts, warnings).map(function (p, i) { return p || String(i + 1); });
    const albumArtist = clean(opts.albumArtist || '');
    let total = 0;
    let missing = 0;
    const lines = [['Track Number', 'Artist', 'Song Name', 'Track Length'].map(csvQuote).join(',')];
    tracks.forEach(function (t, i) {
      if (t.seconds == null) missing++; else total += Math.round(t.seconds);
      lines.push([positions[i], t.artist || albumArtist, t.title, formatDuration(t.seconds)].map(csvQuote).join(','));
    });
    const noLengths = tracks.length === 0 || missing === tracks.length;
    const totalCell = noLengths ? '' : formatDuration(total);
    lines.push(['', '', 'Total Run Time', totalCell].map(csvQuote).join(','));
    if (missing && missing < tracks.length) {
      warnings.push(missing + ' track(s) have no length, so the total run time leaves them out.');
    }
    return { text: lines.join('\r\n') + '\r\n', totalSeconds: total, missing: missing, warnings: warnings };
  }

  return {
    decodeBytes: decodeBytes,
    detectFormat: detectFormat,
    parseText: parseText,
    parseBytes: parseBytes,
    parseDuration: parseDuration,
    formatDuration: formatDuration,
    formatTracklist: formatTracklist,
    formatCsv: formatCsv,
    parseSplits: parseSplits,
    FORMAT_NAMES: FORMAT_NAMES
  };
});
