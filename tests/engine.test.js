'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../src/engine.js');

const sample = (name) => fs.readFileSync(path.join(__dirname, '..', 'samples', name));
const parse = (name, opts) => E.parseBytes(sample(name), name, opts);
const titles = (r) => r.tracks.map((t) => t.title);
const secs = (r) => r.tracks.map((t) => t.seconds);

test('duration helpers', () => {
  assert.equal(E.parseDuration('3:45'), 225);
  assert.equal(E.parseDuration('03:45'), 225);
  assert.equal(E.parseDuration('1:02:03'), 3723);
  assert.equal(E.parseDuration('3:75'), null);
  assert.equal(E.parseDuration('abc'), null);
  assert.equal(E.formatDuration(225), '3:45');
  assert.equal(E.formatDuration(3723), '1:02:03');
  assert.equal(E.formatDuration(59.6), '1:00');
  assert.equal(E.formatDuration(null), '');
});

test('cue: titles, artists, durations from INDEX 01 and album meta', () => {
  const r = parse('album.cue');
  assert.equal(r.format, 'cue');
  assert.deepEqual(titles(r), ['Opening', 'Second Light', 'Closing']);
  // 03:46:00 -> 226s, 08:10:37 -> 490.49s
  assert.deepEqual(secs(r), [226, 264, null]);
  assert.equal(r.tracks[2].artist, 'Example Artist feat. Guest');
  assert.equal(r.meta.artist, 'Example Artist');
  assert.equal(r.meta.title, 'Sample Album');
  assert.equal(r.meta.date, '1998');
  assert.equal(r.meta.barcode, '0123456789012');
  assert.equal(r.meta.genre, 'Electronic');
  assert.ok(r.warnings.some((w) => /last track/i.test(w)));
});

test('cue: total length fills in the last track', () => {
  const r = parse('album.cue', { totalSeconds: 13 * 60 });
  assert.equal(r.tracks[2].seconds, Math.round(780 - (8 * 60 + 10 + 37 / 75)));
  assert.equal(r.warnings.length, 0);
});

test('cue: separate files per track gives a clear warning', () => {
  const cue = 'PERFORMER "A"\nTITLE "T"\nFILE "1.wav" WAVE\n TRACK 01 AUDIO\n  TITLE "One"\n  INDEX 01 00:00:00\nFILE "2.wav" WAVE\n TRACK 02 AUDIO\n  TITLE "Two"\n  INDEX 01 00:00:00\n';
  const r = E.parseText(cue, 'x.cue');
  assert.deepEqual(secs(r), [null, null]);
  assert.ok(r.warnings.some((w) => /separate audio files/.test(w)));
});

test('cue: data tracks are skipped, unquoted values and CRLF work', () => {
  const cue = 'FILE disc.bin BINARY\r\n  TRACK 01 MODE1/2352\r\n    INDEX 01 00:00:00\r\n  TRACK 02 AUDIO\r\n    TITLE Song\r\n    PERFORMER Someone\r\n    INDEX 01 05:00:00\r\n';
  const r = E.parseText(cue, 'x.cue');
  assert.equal(r.tracks.length, 1);
  assert.equal(r.tracks[0].title, 'Song');
  assert.equal(r.tracks[0].artist, 'Someone');
  assert.equal(r.tracks[0].srcPos, '2');
});

test('m3u: extended entries, commas in titles, -1 durations', () => {
  const r = parse('album.m3u');
  assert.deepEqual(titles(r), ['Opening', 'Second Light', 'Closing, Part 1']);
  assert.deepEqual(r.tracks.map((t) => t.artist), ['Example Artist', 'Other Act', 'Third Act']);
  assert.deepEqual(secs(r), [225, 264, null]);
  assert.equal(r.meta.title, 'Sample Mix');
});

test('m3u: attributes with quoted commas', () => {
  const r = E.parseText('#EXTM3U\n#EXTINF:100 tvg-name="A, B" group="x",Artist - Song\nsong.mp3\n', 'x.m3u');
  assert.equal(r.tracks[0].title, 'Song');
  assert.equal(r.tracks[0].artist, 'Artist');
  assert.equal(r.tracks[0].seconds, 100);
});

test('m3u8: plain file paths, numbering and artist taken from file names', () => {
  const r = parse('filenames-only.m3u8');
  assert.deepEqual(titles(r), ['Opening', 'Second Light', 'Closing']);
  assert.ok(r.tracks.every((t) => t.artist === 'Example Artist'));
  assert.deepEqual(r.tracks.map((t) => t.srcPos), ['1', '2', '3']);
});

test('file names that start with a number are kept when most are not numbered', () => {
  const r = E.parseText('Artist - 99 Problems.mp3\nArtist - Another.mp3\nArtist - Third.mp3\n', 'x.m3u');
  assert.equal(r.tracks[0].title, '99 Problems');
});

test('pls', () => {
  const r = parse('album.pls');
  assert.deepEqual(titles(r), ['Opening', 'Second Light', 'Closing']);
  assert.deepEqual(secs(r), [225, 264, null]);
  assert.equal(r.tracks[0].artist, 'Example Artist');
});

test('xspf: entities, durations in ms, file name fallback', () => {
  const r = parse('album.xspf');
  assert.deepEqual(titles(r), ['Opening', 'Second Light & Shade', 'Closing']);
  assert.deepEqual(secs(r), [225, 264, null]);
  assert.equal(r.meta.title, 'Sample Album');
  assert.equal(r.meta.artist, 'Example Artist');
  assert.equal(r.tracks[0].album, 'Sample Album');
});

test('jspf', () => {
  const r = parse('album.jspf');
  assert.equal(r.format, 'jspf');
  assert.deepEqual(titles(r), ['Opening', 'Second Light', 'Closing']);
  assert.deepEqual(secs(r), [225, 264, null]);
});

test('wpl', () => {
  const r = parse('album.wpl');
  assert.deepEqual(titles(r), ['Opening', 'Second Light', 'Closing']);
  assert.deepEqual(secs(r), [225, 264, null]);
  assert.equal(r.meta.title, 'Sample Album');
  assert.equal(r.tracks[2].title, 'Closing'); // from "03 Closing.mp3"
});

test('asx', () => {
  const r = parse('album.asx');
  assert.deepEqual(titles(r), ['Opening', 'Second Light', 'Closing']);
  assert.deepEqual(secs(r), [225, 264, null]);
});

test('b4s', () => {
  const r = parse('album.b4s');
  assert.deepEqual(titles(r), ['Opening', 'Second Light', 'Closing']);
  assert.deepEqual(secs(r), [225, 264, null]);
  assert.equal(r.meta.title, 'Sample Album');
});

test('mpcpl', () => {
  const r = parse('album.mpcpl');
  assert.deepEqual(titles(r), ['Opening', 'Second Light', 'Closing']);
});

test('plist: picks a real playlist, can be switched by name', () => {
  const a = parse('library.xml');
  assert.equal(a.format, 'plist');
  assert.equal(a.meta.chosenPlaylist, 'Road Trip');
  assert.deepEqual(titles(a), ['Closing', 'Opening']);
  assert.deepEqual(a.meta.playlists, ['Road Trip', 'Sample Album']);
  const b = parse('library.xml', { playlistName: 'Sample Album' });
  assert.deepEqual(titles(b), ['Opening', 'Second Light']);
  assert.deepEqual(secs(b), [225, 264]);
});

test('tsv from Apple Music', () => {
  const r = parse('apple-music.tsv');
  assert.equal(r.format, 'delimited');
  assert.deepEqual(titles(r), ['Opening', 'Second Light', 'Closing']);
  assert.deepEqual(secs(r), [225, 264, 301]);
  assert.deepEqual(r.tracks.map((t) => t.srcPos), ['1', '2', '3']);
  assert.equal(r.meta.title, 'Sample Album');
});

test('csv with quoted commas and quotes', () => {
  const r = parse('album.csv');
  assert.deepEqual(titles(r), ['Opening, Pt. 1', 'Second Light', 'The "Closing"']);
  assert.deepEqual(r.tracks.map((t) => t.srcPos), ['A1', 'A2', 'B1']);
});

test('plain text: positions, artists and durations in several shapes', () => {
  const r = parse('tracklist.txt');
  assert.deepEqual(titles(r), ['Opening', 'Second Light', 'Closing']);
  assert.deepEqual(r.tracks.map((t) => t.artist), ['Example Artist', 'Example Artist', 'Other Act']);
  assert.deepEqual(secs(r), [225, 264, 301]);
});

test('plain text: side headings and hour-long durations', () => {
  const r = parse('vinyl.txt');
  assert.deepEqual(r.tracks.map((t) => t.srcPos), ['A1', 'A2', 'B1', 'B2']);
  assert.equal(r.tracks[3].seconds, 4203);
});

test('plain text: titles that start with numbers are not mistaken for positions', () => {
  const r = E.parseText('99 Luftballons\nU2 - One\nSomething Else\n', 'x.txt');
  assert.deepEqual(titles(r), ['99 Luftballons', 'U2 - One', 'Something Else']);
  assert.deepEqual(r.tracks.map((t) => t.srcPos), ['', '', '']);
});

test('splitArtist no keeps the full label', () => {
  const r = E.parseText('#EXTM3U\n#EXTINF:10,Song - Remix\na.mp3\n', 'x.m3u', { splitArtist: 'no' });
  assert.equal(r.tracks[0].title, 'Song - Remix');
  assert.equal(r.tracks[0].artist, '');
});

test('encodings: UTF-8 BOM, UTF-16 with BOM, Windows-1252', () => {
  const text = '#EXTM3U\n#EXTINF:60,Beyoncé - Déjà Vu\na.mp3\n';
  const utf8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]);
  assert.equal(E.parseBytes(utf8, 'a.m3u').tracks[0].title, 'Déjà Vu');
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  assert.equal(E.parseBytes(utf16, 'a.m3u').tracks[0].artist, 'Beyoncé');
  const latin = Buffer.from(text, 'latin1');
  const r = E.parseBytes(latin, 'a.m3u');
  assert.equal(r.encoding, 'windows-1252');
  assert.equal(r.tracks[0].title, 'Déjà Vu');
});

test('format detection from content when the extension says nothing', () => {
  assert.equal(E.detectFormat('#EXTM3U\n', 'list.txt'), 'm3u');
  assert.equal(E.detectFormat('[playlist]\nFile1=a\n', 'list.txt'), 'pls');
  assert.equal(E.detectFormat('PERFORMER "a"\nFILE "a" WAVE\n TRACK 01 AUDIO\n', 'x.txt'), 'cue');
  assert.equal(E.detectFormat('<?xml version="1.0"?><asx version="3.0"></asx>', 'x.xml'), 'asx');
  assert.equal(E.detectFormat('a.mp3\nb.flac\n', 'x.txt'), 'm3u');
  assert.equal(E.detectFormat('1. A - B 3:00\n', 'x.txt'), 'text');
});

test('empty input produces a warning, not a crash', () => {
  const r = E.parseText('', 'x.m3u');
  assert.equal(r.tracks.length, 0);
  assert.ok(r.warnings.length > 0);
});

/* ------------------------------ output ------------------------------ */

const sampleTracks = () => [
  { artist: 'Example Artist', title: 'Opening', seconds: 225 },
  { artist: 'Example Artist', title: 'Second Light', seconds: 264 },
  { artist: 'Example Artist', title: 'Closing', seconds: 301 }
];

test('output: default style, artist left off when all tracks share one', () => {
  const o = E.formatTracklist(sampleTracks(), {});
  assert.equal(o.text, '1 - Opening 3:45\n2 - Second Light 4:24\n3 - Closing 5:01');
  assert.equal(o.showArtist, false);
});

test('output: artist shown when requested or when artists differ', () => {
  const always = E.formatTracklist(sampleTracks(), { includeArtist: 'always' });
  assert.equal(always.text.split('\n')[0], '1 - Example Artist - Opening 3:45');
  const mixed = sampleTracks();
  mixed[2].artist = 'Other Act';
  const o = E.formatTracklist(mixed, {});
  assert.equal(o.text.split('\n')[2], '3 - Other Act - Closing 5:01');
});

test('output: missing artists warn and fall back to release artist', () => {
  const t = sampleTracks();
  t[1].artist = '';
  t[2].artist = 'Other Act';
  const o = E.formatTracklist(t, { albumArtist: 'Example Artist' });
  assert.equal(o.rows[1].artist, 'Example Artist');
  assert.ok(o.warnings.some((w) => /no artist/.test(w)));
});

test('output: styles and duration toggle', () => {
  const dot = E.formatTracklist(sampleTracks(), { template: 'dot', includeDuration: false });
  assert.equal(dot.text.split('\n')[0], '1. Opening');
  const tab = E.formatTracklist(sampleTracks(), { template: 'tab' });
  assert.equal(tab.text.split('\n')[1], '2\t\tSecond Light\t4:24');
});

test('csv export: header, rows and a total run time row', () => {
  const o = E.formatCsv(sampleTracks(), {});
  assert.equal(
    o.text,
    'Track Number,Artist,Song Name,Track Length\r\n' +
    '1,Example Artist,Opening,3:45\r\n' +
    '2,Example Artist,Second Light,4:24\r\n' +
    '3,Example Artist,Closing,5:01\r\n' +
    ',,Total Run Time,13:10\r\n'
  );
  assert.equal(o.totalSeconds, 790);
  assert.equal(o.warnings.length, 0);
});

test('csv export: quoting, release artist fallback, positions follow the options', () => {
  const t = [
    { artist: '', title: 'Say "Hi", ok', seconds: 5 },
    { artist: 'Other Act', title: 'Plain', seconds: 65 }
  ];
  const o = E.formatCsv(t, { albumArtist: 'Main Artist', positions: 'vinyl', splits: '1, 1' });
  const lines = o.text.trim().split('\r\n');
  assert.equal(lines[1], 'A1,Main Artist,"Say ""Hi"", ok",0:05');
  assert.equal(lines[2], 'B1,Other Act,Plain,1:05');
  assert.equal(lines[3], ',,Total Run Time,1:10');
});

test('csv export: totals over an hour, missing lengths, and no positions', () => {
  const t = [
    { artist: 'A', title: 'Long', seconds: 3600 },
    { artist: 'A', title: 'Short', seconds: 125 },
    { artist: 'A', title: 'Unknown', seconds: null }
  ];
  const o = E.formatCsv(t, { positions: 'none' });
  const lines = o.text.trim().split('\r\n');
  assert.equal(lines[1], '1,A,Long,1:00:00');
  assert.equal(lines[3], '3,A,Unknown,');
  assert.equal(lines[4], ',,Total Run Time,1:02:05');
  assert.equal(o.missing, 1);
  assert.ok(o.warnings.some((w) => /no length/.test(w)));
  const none = E.formatCsv([{ artist: 'A', title: 'x', seconds: null }], {});
  assert.equal(none.text.trim().split('\r\n')[2], ',,Total Run Time,');
  assert.equal(E.formatCsv([], {}).text, 'Track Number,Artist,Song Name,Track Length\r\n,,Total Run Time,\r\n');
});

test('output: vinyl sides and multi-disc numbering', () => {
  const six = Array.from({ length: 6 }, (_, i) => ({ artist: '', title: 'T' + (i + 1), seconds: 60 }));
  const v = E.formatTracklist(six, { positions: 'vinyl', splits: '2, 2, 2' });
  assert.deepEqual(v.rows.map((r) => r.position), ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  const d = E.formatTracklist(six, { positions: 'multidisc', splits: [4, 2] });
  assert.deepEqual(d.rows.map((r) => r.position), ['1-1', '1-2', '1-3', '1-4', '2-1', '2-2']);
  assert.equal(d.warnings.length, 0);
  const bad = E.formatTracklist(six, { positions: 'vinyl', splits: '2, 2' });
  assert.ok(bad.warnings.some((w) => /add up to 4/.test(w)));
  const none = E.formatTracklist(six, { positions: 'vinyl', splits: '' });
  assert.ok(none.warnings.length > 0);
});

test('output: source positions and none', () => {
  const t = [{ artist: '', title: 'x', seconds: null, srcPos: 'B3' }, { artist: '', title: 'y', seconds: null, srcPos: '' }];
  assert.deepEqual(E.formatTracklist(t, { positions: 'source' }).rows.map((r) => r.position), ['B3', '2']);
  assert.equal(E.formatTracklist(t, { positions: 'none' }).text, 'x\ny');
});
