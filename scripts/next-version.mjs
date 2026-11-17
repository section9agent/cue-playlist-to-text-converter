#!/usr/bin/env node
// Picks the version number for a new release.
//   node scripts/next-version.mjs <version in the files>   (existing versions or tags on stdin, one per line)
// Prints the highest existing version plus one patch step, or the version in the files if
// that is already higher (or nothing has been released yet).
import { readFileSync } from 'node:fs';

const parse = (s) => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(s).trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function nextVersion(current, existing) {
  const cur = parse(current);
  if (!cur) throw new Error(`The version in the files is not X.Y.Z: ${current}`);
  const seen = existing.map(parse).filter(Boolean).sort(cmp);
  if (!seen.length) return cur.join('.');
  const top = seen[seen.length - 1];
  if (cmp(cur, top) > 0) return cur.join('.');
  return [top[0], top[1], top[2] + 1].join('.');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('next-version.mjs')) {
  try {
    const existing = readFileSync(0, 'utf8').split(/\r?\n/);
    console.log(nextVersion(process.argv[2] || '', existing));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
